const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 获取标签列表
router.get('/', (req, res) => {
    try {
        const tags = db.prepare('SELECT * FROM tags ORDER BY usage_count DESC').all();
        res.json({ code: 200, data: tags });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 创建标签
router.post('/', (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.json({ code: 400, message: '标签名不能为空' });
        const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
        if (existing) return res.json({ code: 400, message: '标签已存在' });
        const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color || '#6C63FF');
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: tag });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 更新标签
router.put('/:id', (req, res) => {
    try {
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
        if (!tag) return res.json({ code: 404, message: '标签不存在' });
        const { name, color } = req.body;
        db.prepare('UPDATE tags SET name=?, color=? WHERE id=?').run(name ?? tag.name, color ?? tag.color, req.params.id);
        const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
        res.json({ code: 200, message: '更新成功', data: updated });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 删除标签
router.delete('/:id', (req, res) => {
    try {
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
        if (!tag) return res.json({ code: 404, message: '标签不存在' });
        db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
