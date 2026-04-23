//cd backend && npm test -- ai.routes.test.js
/*
可以按这个口径汇报，偏“结果 + 风险控制 + 可落地”：

本次我给 ai.js 补了一套接口级自动化测试，核心目标是验证 AI 路由在真实 HTTP 调用下的稳定性，而不是只测单个函数。
测试覆盖了五个维度：鉴权与配额、AI 生成结果解析、语音抽取日程落库、用户设置读写、文件上传解析。
重点校验了多个边界场景：比如未登录拦截、免费额度耗尽拦截、AI 返回非 JSON 的兜底处理、低置信度日程过滤、重复日程去重等。
测试采用“真实 Express 路由 + 数据库 + AI 服务 stub”的方式，既保证了接口链路真实性，也避免外部模型波动导致不稳定。
每个子用例都做了数据清理，确保 可重复执行、互不干扰，适合后续接入 CI 持续回归。
当前这组用例通过后，可以有效降低 AI 功能改动引入回归的风险，特别是对“解析失败、数据落库、权限配额”这三类线上高风险点有直接保护。
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createServer } = require('node:http');

const db = require('../db');
const aiRouter = require('../routes/ai');
const aiService = require('../services/aiService');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * AI 路由接口测试
 *
 * 覆盖目标：
 * 1) 鉴权与配额：未登录拦截、免费额度查询、额度耗尽拦截。
 * 2) 生成类接口：summarize/classify/extract-todos/plan-schedule/mindmap/knowledge-graph。
 * 3) 语音抽取日程：参数校验、成功落库、低置信与空标题过滤、重复数据去重。
 * 4) 用户设置与提醒：AI 设置读写、24 小时提醒过滤。
 * 5) 文件能力：upload-base64 的 txt 解析与非法后缀拦截。
 *
 * 说明：
 * - 使用真实 Express 路由 + 测试数据库，AI 服务方法采用 stub，避免外部模型调用不稳定。
 * - 每个子测试会清理用户相关数据，确保用例独立且可重复执行。
 */
const originalAiService = {
  summarize: aiService.summarize,
  classify: aiService.classify,
  extractTodos: aiService.extractTodos,
  planSchedule: aiService.planSchedule,
  extractScheduleFromTranscript: aiService.extractScheduleFromTranscript,
  generateMindMap: aiService.generateMindMap,
  generateKnowledgeGraph: aiService.generateKnowledgeGraph,
};

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/ai', aiRouter);
  return app;
}

function authHeader(userId, role = 'user') {
  const token = jwt.sign({ id: userId, role }, JWT_SECRET);
  return { Authorization: `Bearer ${token}` };
}

async function request(baseUrl, method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response.json();
}

test('AI routes should work as expected', async (t) => {
  const username = `ai_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const insertUser = db
    .prepare('INSERT INTO users (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)');
  const userResult = insertUser.run(username, 'hash_for_test', 'user', 'AI Tester');
  const userId = Number(userResult.lastInsertRowid);

  aiService.summarize = async () => ({ success: true, content: 'summary content' });
  aiService.classify = async () => ({ success: true, content: '工作' });
  aiService.extractTodos = async () => ({
    success: true,
    content: '```json\n["todo-a","todo-b"]\n```',
  });
  aiService.planSchedule = async () => ({ success: true, content: 'not-json' });
  aiService.extractScheduleFromTranscript = async () => ({
    success: true,
    content: JSON.stringify([
      { title: '晨会', start_time: '2099-01-01 09:00:00', confidence: 0.91 },
      { title: '低置信', start_time: '2099-01-01 10:00:00', confidence: 0.2 },
      { title: '', start_time: '2099-01-01 11:00:00', confidence: 0.9 },
    ]),
  });
  aiService.generateMindMap = async () => ({ success: true, content: 'bad-json' });
  aiService.generateKnowledgeGraph = async () => ({
    success: true,
    content: JSON.stringify({ nodes: [{ id: 'n1' }], edges: [] }),
  });

  const app = buildApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const cleanupUserData = () => {
    db.prepare('DELETE FROM ai_usage WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM schedules WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
  };

  t.after(() => {
    cleanupUserData();
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    Object.assign(aiService, originalAiService);
    server.close();
  });

  cleanupUserData();

  // 鉴权校验：未携带 token 时应返回 401。
  await t.test('auth middleware should reject missing token', async () => {
    const res = await fetch(`${baseUrl}/api/ai/usage`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 401);
  });

  // 配额查询：普通用户默认免费额度为 5 次。
  await t.test('GET /usage should return default free quota', async () => {
    const body = await request(baseUrl, 'GET', '/api/ai/usage', null, authHeader(userId));
    assert.equal(body.code, 200);
    assert.equal(body.data.used, 0);
    assert.equal(body.data.limit, 5);
    assert.equal(body.data.role, 'user');
  });

  // 参数校验：总结接口 content 为空时返回 400。
  await t.test('POST /summarize should validate empty content', async () => {
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/summarize',
      { content: '' },
      authHeader(userId)
    );
    assert.equal(body.code, 400);
  });

  // 正常链路：总结成功返回结果，并写入 ai_usage 使用记录。
  await t.test('POST /summarize should succeed and record usage', async () => {
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/summarize',
      { content: '要总结的内容' },
      authHeader(userId)
    );
    assert.equal(body.code, 200);
    assert.equal(body.data.summary, 'summary content');
    const usage = db.prepare('SELECT COUNT(*) as c FROM ai_usage WHERE user_id = ?').get(userId).c;
    assert.equal(usage, 1);
  });

  // 免费额度耗尽后，AI 能力应被拦截并返回升级提示。
  await t.test('quota limit should block free users', async () => {
    cleanupUserData();
    const insertUsage = db.prepare('INSERT INTO ai_usage (user_id, action) VALUES (?, ?)');
    for (let i = 0; i < 5; i += 1) {
      insertUsage.run(userId, 'summarize');
    }
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/classify',
      { content: '分类内容' },
      authHeader(userId)
    );
    assert.equal(body.code, 403);
    assert.equal(body.data.needUpgrade, true);
  });

  // extract-todos：校验对 ```json 包裹字符串的清洗与 JSON 解析。
  await t.test('POST /extract-todos should parse JSON markdown blocks', async () => {
    cleanupUserData();
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/extract-todos',
      { content: '待办' },
      authHeader(userId)
    );
    assert.equal(body.code, 200);
    assert.deepEqual(body.data.todos, ['todo-a', 'todo-b']);
  });

  // plan-schedule：当 AI 返回非 JSON 时应回退 raw，避免接口报错。
  await t.test('POST /plan-schedule should fallback to raw when JSON parse fails', async () => {
    cleanupUserData();
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/plan-schedule',
      { content: '计划内容' },
      authHeader(userId)
    );
    assert.equal(body.code, 200);
    assert.deepEqual(body.data.plans, []);
    assert.equal(body.data.raw, 'not-json');
  });

  // extract-schedules：转写文本为空时应直接返回 400。
  await t.test('POST /extract-schedules should validate transcript', async () => {
    cleanupUserData();
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/extract-schedules',
      { transcript: '' },
      authHeader(userId)
    );
    assert.equal(body.code, 400);
  });

  // extract-schedules：验证创建、跳过（低置信/空标题）与二次请求去重逻辑。
  await t.test('POST /extract-schedules should create schedules and skip invalid items', async () => {
    cleanupUserData();
    const payload = { transcript: '明天晨会', note_id: '' };
    const first = await request(baseUrl, 'POST', '/api/ai/extract-schedules', payload, authHeader(userId));
    assert.equal(first.code, 200);
    assert.equal(first.data.created.length, 1);
    assert.equal(first.data.skipped.length, 2);

    const second = await request(baseUrl, 'POST', '/api/ai/extract-schedules', payload, authHeader(userId));
    assert.equal(second.code, 200);
    assert.equal(second.data.created.length, 0);
    assert.ok(second.data.skipped.some((s) => s.reason === 'dedup'));
  });

  // mindmap：非 JSON 返回时应提供 raw 兜底。
  await t.test('POST /mindmap should fallback to raw when JSON parse fails', async () => {
    cleanupUserData();
    const body = await request(
      baseUrl,
      'POST',
      '/api/ai/mindmap',
      { content: '思维导图内容' },
      authHeader(userId)
    );
    assert.equal(body.code, 200);
    assert.equal(body.data.mindmap, null);
    assert.equal(body.data.raw, 'bad-json');
  });

  // knowledge-graph：少于 2 条笔记应拦截；满足条件后可正常返回图谱。
  await t.test('POST /knowledge-graph should require at least two notes', async () => {
    cleanupUserData();
    const tooFew = await request(
      baseUrl,
      'POST',
      '/api/ai/knowledge-graph',
      {},
      authHeader(userId)
    );
    assert.equal(tooFew.code, 400);

    const insertNote = db.prepare('INSERT INTO notes (user_id, title, content, category) VALUES (?, ?, ?, ?)');
    insertNote.run(userId, 'n1', 'c1', '未分类');
    insertNote.run(userId, 'n2', 'c2', '未分类');

    const ok = await request(baseUrl, 'POST', '/api/ai/knowledge-graph', {}, authHeader(userId));
    assert.equal(ok.code, 200);
    assert.deepEqual(ok.data.graph.nodes, [{ id: 'n1' }]);
  });

  // settings：先读系统默认，再验证用户级配置写入与读取覆盖。
  await t.test('GET/PUT /settings should read and save user settings', async () => {
    cleanupUserData();
    const before = await request(baseUrl, 'GET', '/api/ai/settings', null, authHeader(userId));
    assert.equal(before.code, 200);
    assert.equal(before.data.sys_ai_provider, 'deepseek');

    const saved = await request(
      baseUrl,
      'PUT',
      '/api/ai/settings',
      { ai_provider: 'mock-provider', ai_model: 'mock-model' },
      authHeader(userId)
    );
    assert.equal(saved.code, 200);

    const after = await request(baseUrl, 'GET', '/api/ai/settings', null, authHeader(userId));
    assert.equal(after.code, 200);
    assert.equal(after.data.ai_provider, 'mock-provider');
    assert.equal(after.data.ai_model, 'mock-model');
  });

  // reminders：仅返回未来 24 小时内、状态为 pending 的提醒项。
  await t.test('GET /reminders should return pending reminders in next 24h', async () => {
    cleanupUserData();
    db.prepare(
      `INSERT INTO schedules (user_id, title, start_time, remind_at, status, source)
       VALUES (?, ?, datetime('now', 'localtime', '+2 hours'), datetime('now', 'localtime', '+1 hours'), 'pending', 'manual')`
    ).run(userId, 'soon');
    db.prepare(
      `INSERT INTO schedules (user_id, title, start_time, remind_at, status, source)
       VALUES (?, ?, datetime('now', 'localtime', '+2 hours'), datetime('now', 'localtime', '+1 hours'), 'done', 'manual')`
    ).run(userId, 'done-item');

    const body = await request(baseUrl, 'GET', '/api/ai/reminders', null, authHeader(userId));
    assert.equal(body.code, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].title, 'soon');
  });

  // upload-base64：验证 txt 提取成功，以及非法扩展名被拒绝。
  await t.test('POST /upload-base64 should parse txt and reject bad extension', async () => {
    cleanupUserData();
    const fileData = Buffer.from('hello quicknote', 'utf-8').toString('base64');
    const ok = await request(
      baseUrl,
      'POST',
      '/api/ai/upload-base64',
      { filename: 'a.txt', fileData },
      authHeader(userId)
    );
    assert.equal(ok.code, 200);
    assert.equal(ok.data.text, 'hello quicknote');

    const bad = await request(
      baseUrl,
      'POST',
      '/api/ai/upload-base64',
      { filename: 'a.exe', fileData },
      authHeader(userId)
    );
    assert.equal(bad.code, 400);
  });
});
