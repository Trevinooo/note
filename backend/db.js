const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'quicknote.db');
const db = new Database(DB_PATH);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('user','premium','admin')),
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    category TEXT DEFAULT '未分类',
    tags TEXT DEFAULT '',
    is_voice INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    note_id INTEGER,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    start_time DATETIME,
    end_time DATETIME,
    remind_at DATETIME,
    source TEXT DEFAULT 'manual' CHECK(source IN ('manual','ai_extract','ai_plan')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#6C63FF',
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT '通用',
    content TEXT DEFAULT '',
    usage_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','disabled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT DEFAULT '',
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 兼容旧数据库：为 schedules 增加 note_id 并补齐外键
// SQLite 对已存在表追加外键限制支持很弱，这里用“重建表”方式确保约束存在且不丢数据。
const schedulesCols = db.prepare(`PRAGMA table_info('schedules')`).all();
const hasNoteId = schedulesCols.some((c) => c.name === 'note_id');
const schedulesFks = db.prepare(`PRAGMA foreign_key_list('schedules')`).all();
const hasNoteFk = schedulesFks.some((fk) => fk.table === 'notes' && fk.from === 'note_id');
if (!hasNoteId || !hasNoteFk) {
  db.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS schedules__new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      note_id INTEGER,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_time DATETIME,
      end_time DATETIME,
      remind_at DATETIME,
      source TEXT DEFAULT 'manual' CHECK(source IN ('manual','ai_extract','ai_plan')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
    );
    INSERT INTO schedules__new (id, user_id, note_id, title, description, start_time, end_time, remind_at, source, status, created_at)
    SELECT id, user_id, ${hasNoteId ? 'note_id' : 'NULL'}, title, description, start_time, end_time, remind_at, source, status, created_at
    FROM schedules;
    DROP TABLE schedules;
    ALTER TABLE schedules__new RENAME TO schedules;
    COMMIT;
  `);
}

// 初始化默认管理员（如果不存在）
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)').run('admin', hash, 'admin', '系统管理员');
}

// 强制更新 AI 提供商为 DeepSeek（覆盖旧的 Coze 设置）
const forceUpdateSettings = [
  ['ai_provider', 'deepseek'],
  ['ai_model', 'deepseek-chat'],
  ['ai_base_url', 'https://api.deepseek.com'],
  ['ai_api_key', 'sk-b60bf8f2e7d34e5c8ee71d14c025d809'],
];
const replaceSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of forceUpdateSettings) {
  replaceSetting.run(k, v);
}
// 仅在不存在时初始化（不覆盖用户已设置的值）
const defaultSettings = [
  ['app_name', 'QuickNote 速记通'],
];
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of defaultSettings) {
  insertSetting.run(k, v);
}

// 初始化默认标签
const defaultTags = [
  ['工作', '#ef4444'],
  ['学习', '#3b82f6'],
  ['生活', '#10b981'],
  ['灵感', '#f59e0b'],
  ['待办', '#8b5cf6'],
];
const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
for (const [n, c] of defaultTags) {
  insertTag.run(n, c);
}

// 初始化默认模板
const defaultTemplates = [
  ['会议记录', '工作', '## 会议主题\n\n## 参会人员\n\n## 会议内容\n\n## 待办事项\n'],
  ['读书笔记', '学习', '## 书名\n\n## 作者\n\n## 核心观点\n\n## 个人感悟\n'],
  ['日记', '生活', '## 今日心情\n\n## 今日事件\n\n## 明日计划\n'],
  ['项目计划', '工作', '## 项目目标\n\n## 里程碑\n\n## 任务分解\n\n## 风险点\n'],
];
const insertTemplate = db.prepare('INSERT OR IGNORE INTO templates (name, category, content) VALUES (?, ?, ?)');
const templateExists = db.prepare('SELECT COUNT(*) as c FROM templates').get();
if (templateExists.c === 0) {
  for (const [n, cat, cont] of defaultTemplates) {
    insertTemplate.run(n, cat, cont);
  }
}

module.exports = db;
