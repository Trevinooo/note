const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// 获取日程列表
router.get('/', (req, res) => {
    try {
        const { status, date } = req.query;
        let sql = 'SELECT * FROM schedules WHERE user_id = ?';
        const params = [req.user.id];
        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (date) {
            sql += ' AND DATE(start_time) = ?';
            params.push(date);
        }
        sql += ' ORDER BY start_time ASC';
        const schedules = db.prepare(sql).all(...params);
        res.json({ code: 200, data: schedules });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 创建日程
router.post('/', (req, res) => {
    try {
        const { title, description, start_time, end_time, remind_at, source } = req.body;
        if (!title) return res.json({ code: 400, message: '标题不能为空' });
        const result = db.prepare(
            'INSERT INTO schedules (user_id, title, description, start_time, end_time, remind_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(req.user.id, title, description || '', start_time || null, end_time || null, remind_at || null, source || 'manual');
        const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: schedule });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 更新日程
router.put('/:id', (req, res) => {
    try {
        const s = db.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!s) return res.json({ code: 404, message: '日程不存在' });
        const { title, description, start_time, end_time, remind_at, status } = req.body;
        db.prepare(
            'UPDATE schedules SET title=?, description=?, start_time=?, end_time=?, remind_at=?, status=? WHERE id=?'
        ).run(title ?? s.title, description ?? s.description, start_time ?? s.start_time, end_time ?? s.end_time, remind_at ?? s.remind_at, status ?? s.status, req.params.id);
        const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
        res.json({ code: 200, message: '更新成功', data: updated });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 删除日程
router.delete('/:id', (req, res) => {
    try {
        const s = db.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!s) return res.json({ code: 404, message: '日程不存在' });
        db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
