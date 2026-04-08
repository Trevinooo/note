const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 获取笔记列表
router.get('/', (req, res) => {
    try {
        const { category, search } = req.query;
        let sql = 'SELECT * FROM notes WHERE user_id = ?';
        const params = [req.user.id];
        if (category && category !== '全部') {
            sql += ' AND category = ?';
            params.push(category);
        }
        if (search) {
            sql += ' AND (title LIKE ? OR content LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        sql += ' ORDER BY updated_at DESC';
        const notes = db.prepare(sql).all(...params);
        res.json({ code: 200, data: notes });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 创建笔记
router.post('/', (req, res) => {
    try {
        const { title, content, category, tags, is_voice } = req.body;
        const result = db.prepare(
            'INSERT INTO notes (user_id, title, content, category, tags, is_voice) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(req.user.id, title || '', content || '', category || '未分类', tags || '', is_voice ? 1 : 0);
        const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: note });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 获取单条笔记
router.get('/:id', (req, res) => {
    try {
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!note) return res.json({ code: 404, message: '笔记不存在' });
        res.json({ code: 200, data: note });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 更新笔记
router.put('/:id', (req, res) => {
    try {
        const { title, content, category, tags, summary } = req.body;
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!note) return res.json({ code: 404, message: '笔记不存在' });
        db.prepare(
            'UPDATE notes SET title=?, content=?, category=?, tags=?, summary=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
        ).run(title ?? note.title, content ?? note.content, category ?? note.category, tags ?? note.tags, summary ?? note.summary, req.params.id);
        const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
        res.json({ code: 200, message: '更新成功', data: updated });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 删除笔记
router.delete('/:id', (req, res) => {
    try {
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!note) return res.json({ code: 404, message: '笔记不存在' });
        db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
