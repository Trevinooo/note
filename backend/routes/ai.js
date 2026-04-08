const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();
router.use(authMiddleware);

// AI 使用次数限制
const AI_FREE_LIMIT = 5;

// 检查 AI 使用权限
function checkAIQuota(req, res) {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        res.json({ code: 401, message: '用户不存在' });
        return false;
    }
    // 高级用户和管理员不限制
    if (user.role === 'premium' || user.role === 'admin') return true;
    // 普通用户检查次数
    const count = db.prepare('SELECT COUNT(*) as c FROM ai_usage WHERE user_id = ?').get(req.user.id).c;
    if (count >= AI_FREE_LIMIT) {
        res.json({ code: 403, message: '免费次数已用完，请开通会员', data: { needUpgrade: true, used: count, limit: AI_FREE_LIMIT } });
        return false;
    }
    return true;
}

// 记录 AI 使用
function recordAIUsage(userId, action) {
    db.prepare('INSERT INTO ai_usage (user_id, action) VALUES (?, ?)').run(userId, action);
}

// 获取 AI 使用次数
router.get('/usage', (req, res) => {
    try {
        const count = db.prepare('SELECT COUNT(*) as c FROM ai_usage WHERE user_id = ?').get(req.user.id).c;
        const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        res.json({
            code: 200,
            data: {
                used: count,
                limit: (user && (user.role === 'premium' || user.role === 'admin')) ? -1 : AI_FREE_LIMIT,
                role: user ? user.role : 'user'
            }
        });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 文件上传配置
const upload = multer({
    dest: path.join(__dirname, '../uploads/'),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('仅支持 PDF、Word、TXT 文件'));
        }
    }
});

// 文件上传 & 文本提取（不计入 AI 使用次数）
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ code: 400, message: '请上传文件' });
        const ext = path.extname(req.file.originalname).toLowerCase();
        let text = '';

        if (ext === '.txt') {
            text = fs.readFileSync(req.file.path, 'utf-8');
        } else if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text || '';
        } else if (ext === '.docx' || ext === '.doc') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: req.file.path });
            text = result.value;
        }

        fs.unlinkSync(req.file.path);
        text = String(text || '');
        if (!text.trim()) {
            return res.json({ code: 400, message: '未能从文件中提取到文本内容' });
        }

        res.json({
            code: 200,
            data: {
                text: text.substring(0, 10000),
                filename: req.file.originalname,
                length: text.length
            }
        });
    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ code: 500, message: '文件解析失败: ' + e.message });
    }
});

// Base64 文件上传（兼容 Capacitor 原生 HTTP）
router.post('/upload-base64', async (req, res) => {
    let tmpPath = null;
    try {
        const { filename, fileData } = req.body;
        if (!filename || !fileData) return res.json({ code: 400, message: '请上传文件' });

        const ext = path.extname(filename).toLowerCase();
        if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
            return res.json({ code: 400, message: '仅支持 PDF、Word、TXT 文件' });
        }

        // 将 base64 解码写入临时文件
        const buffer = Buffer.from(fileData, 'base64');
        tmpPath = path.join(__dirname, '../uploads/', `tmp_${Date.now()}${ext}`);
        fs.writeFileSync(tmpPath, buffer);

        let text = '';
        if (ext === '.txt') {
            text = fs.readFileSync(tmpPath, 'utf-8');
        } else if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(tmpPath);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text || '';
        } else if (ext === '.docx' || ext === '.doc') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: tmpPath });
            text = result.value;
        }

        fs.unlinkSync(tmpPath);
        tmpPath = null;
        text = String(text || '');
        if (!text.trim()) {
            return res.json({ code: 400, message: '未能从文件中提取到文本内容' });
        }

        res.json({
            code: 200,
            data: {
                text: text.substring(0, 10000),
                filename: filename,
                length: text.length
            }
        });
    } catch (e) {
        if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        res.json({ code: 500, message: '文件解析失败: ' + e.message });
    }
});

// AI 生成摘要
router.post('/summarize', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const { content } = req.body;
        if (!content) return res.json({ code: 400, message: '内容不能为空' });
        const result = await aiService.summarize(content, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'summarize');
            res.json({ code: 200, data: { summary: result.content } });
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// AI 智能分类
router.post('/classify', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const { content } = req.body;
        if (!content) return res.json({ code: 400, message: '内容不能为空' });
        const result = await aiService.classify(content, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'classify');
            res.json({ code: 200, data: { category: result.content.trim() } });
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// AI 提取待办事项
router.post('/extract-todos', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const { content } = req.body;
        if (!content) return res.json({ code: 400, message: '内容不能为空' });
        const result = await aiService.extractTodos(content, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'extract-todos');
            try {
                const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const todos = JSON.parse(cleaned);
                res.json({ code: 200, data: { todos } });
            } catch {
                res.json({ code: 200, data: { todos: [], raw: result.content } });
            }
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// AI 智能日程规划
router.post('/plan-schedule', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const { content } = req.body;
        if (!content) return res.json({ code: 400, message: '内容不能为空' });
        const result = await aiService.planSchedule(content, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'plan-schedule');
            try {
                const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const plans = JSON.parse(cleaned);
                res.json({ code: 200, data: { plans } });
            } catch {
                res.json({ code: 200, data: { plans: [], raw: result.content } });
            }
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// AI 生成思维导图
router.post('/mindmap', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const { content } = req.body;
        if (!content) return res.json({ code: 400, message: '内容不能为空' });
        const result = await aiService.generateMindMap(content, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'mindmap');
            try {
                const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const mindmap = JSON.parse(cleaned);
                res.json({ code: 200, data: { mindmap } });
            } catch {
                res.json({ code: 200, data: { mindmap: null, raw: result.content } });
            }
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// AI 生成知识图谱
router.post('/knowledge-graph', async (req, res) => {
    try {
        if (!checkAIQuota(req, res)) return;
        const notes = db.prepare('SELECT id, title, content, category FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
        if (notes.length < 2) return res.json({ code: 400, message: '至少需要2篇笔记才能生成知识图谱' });
        const result = await aiService.generateKnowledgeGraph(notes, req.user.id);
        if (result.success) {
            recordAIUsage(req.user.id, 'knowledge-graph');
            try {
                const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const graph = JSON.parse(cleaned);
                res.json({ code: 200, data: { graph } });
            } catch {
                res.json({ code: 200, data: { graph: null, raw: result.content } });
            }
        } else {
            res.json({ code: 500, message: result.message });
        }
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 获取待提醒日程
router.get('/reminders', (req, res) => {
    try {
        const now = new Date().toISOString();
        const upcoming = db.prepare(`
            SELECT * FROM schedules
            WHERE user_id = ? AND status = 'pending' AND start_time IS NOT NULL
            AND start_time > ? AND start_time <= datetime(?, '+24 hours')
            ORDER BY start_time ASC
        `).all(req.user.id, now, now);
        res.json({ code: 200, data: upcoming });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 获取用户 AI 设置
router.get('/settings', (req, res) => {
    try {
        const rows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(req.user.id);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        if (!settings.ai_provider) {
            const sysRows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('ai_%');
            sysRows.forEach(r => { if (!settings[r.key]) settings[`sys_${r.key}`] = r.value; });
        }
        res.json({ code: 200, data: settings });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 保存用户 AI 设置
router.put('/settings', (req, res) => {
    try {
        const updates = req.body;
        const upsert = db.prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value');
        const updateMany = db.transaction((items) => {
            for (const [k, v] of Object.entries(items)) {
                upsert.run(req.user.id, k, v);
            }
        });
        updateMany(updates);
        res.json({ code: 200, message: 'AI 设置已保存' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
