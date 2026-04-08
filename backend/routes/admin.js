const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

// ========== 统计 ==========
router.get('/stats', (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
        const premiumUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'premium'").get().c;
        const normalUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get().c;
        const adminUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
        const totalNotes = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
        const totalSchedules = db.prepare('SELECT COUNT(*) as c FROM schedules').get().c;
        const todayNotes = db.prepare("SELECT COUNT(*) as c FROM notes WHERE DATE(created_at) = DATE('now')").get().c;
        const todaySchedules = db.prepare("SELECT COUNT(*) as c FROM schedules WHERE DATE(created_at) = DATE('now')").get().c;

        // 最近7天笔记趋势
        const noteTrend = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM notes 
      WHERE created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY date
    `).all();

        // 笔记分类统计
        const categoryStats = db.prepare(`
      SELECT category, COUNT(*) as count FROM notes GROUP BY category ORDER BY count DESC
    `).all();

        // 用户角色分布
        const roleStats = [
            { role: '普通用户', count: normalUsers },
            { role: '高级用户', count: premiumUsers },
            { role: '管理员', count: adminUsers },
        ];

        res.json({
            code: 200,
            data: {
                totalUsers, premiumUsers, normalUsers, adminUsers,
                totalNotes, totalSchedules, todayNotes, todaySchedules,
                noteTrend, categoryStats, roleStats
            }
        });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// ========== 用户管理 ==========
router.get('/users', (req, res) => {
    try {
        const { role } = req.query;
        let sql = 'SELECT id, username, role, nickname, avatar, created_at FROM users';
        const params = [];
        if (role) { sql += ' WHERE role = ?'; params.push(role); }
        sql += ' ORDER BY created_at DESC';
        const users = db.prepare(sql).all(...params);
        res.json({ code: 200, data: users });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.put('/users/:id', (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
        if (!user) return res.json({ code: 404, message: '用户不存在' });
        const { role, nickname } = req.body;
        db.prepare('UPDATE users SET role=?, nickname=? WHERE id=?').run(role ?? user.role, nickname ?? user.nickname, req.params.id);
        res.json({ code: 200, message: '更新成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.delete('/users/:id', (req, res) => {
    try {
        if (parseInt(req.params.id) === req.user.id) {
            return res.json({ code: 400, message: '不能删除自己' });
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.put('/users/:id/password', (req, res) => {
    try {
        const hash = bcrypt.hashSync(req.body.password || '123456', 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
        res.json({ code: 200, message: '密码已重置' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// ========== 标签管理 ==========
router.get('/tags', (req, res) => {
    try {
        const tags = db.prepare('SELECT * FROM tags ORDER BY usage_count DESC').all();
        res.json({ code: 200, data: tags });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.post('/tags', (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.json({ code: 400, message: '标签名不能为空' });
        const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color || '#6C63FF');
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: tag });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.put('/tags/:id', (req, res) => {
    try {
        const { name, color } = req.body;
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
        if (!tag) return res.json({ code: 404, message: '标签不存在' });
        db.prepare('UPDATE tags SET name=?, color=? WHERE id=?').run(name ?? tag.name, color ?? tag.color, req.params.id);
        res.json({ code: 200, message: '更新成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.delete('/tags/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// ========== 模板管理 ==========
router.get('/templates', (req, res) => {
    try {
        const templates = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
        res.json({ code: 200, data: templates });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.post('/templates', (req, res) => {
    try {
        const { name, category, content } = req.body;
        if (!name) return res.json({ code: 400, message: '模板名不能为空' });
        const result = db.prepare('INSERT INTO templates (name, category, content) VALUES (?, ?, ?)').run(name, category || '通用', content || '');
        const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: t });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.put('/templates/:id', (req, res) => {
    try {
        const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
        if (!t) return res.json({ code: 404, message: '模板不存在' });
        const { name, category, content, status } = req.body;
        db.prepare('UPDATE templates SET name=?, category=?, content=?, status=? WHERE id=?')
            .run(name ?? t.name, category ?? t.category, content ?? t.content, status ?? t.status, req.params.id);
        res.json({ code: 200, message: '更新成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.delete('/templates/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// ========== 系统设置 ==========
router.get('/settings', (req, res) => {
    try {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json({ code: 200, data: settings });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

router.put('/settings', (req, res) => {
    try {
        const updates = req.body;
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        const updateMany = db.transaction((items) => {
            for (const [k, v] of Object.entries(items)) {
                stmt.run(k, v);
            }
        });
        updateMany(updates);
        res.json({ code: 200, message: '设置已保存' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// ========== 笔记统计（管理员只看数量不看内容）==========
router.get('/notes-stats', (req, res) => {
    try {
        const total = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
        const byUser = db.prepare(`
      SELECT u.username, u.nickname, COUNT(n.id) as note_count 
      FROM users u LEFT JOIN notes n ON u.id = n.user_id 
      GROUP BY u.id ORDER BY note_count DESC
    `).all();
        const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM notes GROUP BY category ORDER BY count DESC').all();
        res.json({ code: 200, data: { total, byUser, byCategory } });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
