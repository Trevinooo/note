const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
    try {
        const { username, password, nickname } = req.body;
        if (!username || !password) {
            return res.json({ code: 400, message: '用户名和密码不能为空' });
        }
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.json({ code: 400, message: '用户名已存在' });
        }
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)').run(username, hash, nickname || username);
        const user = db.prepare('SELECT id, username, role, nickname, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ code: 200, message: '注册成功', data: { token, user } });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 登录
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ code: 400, message: '用户名和密码不能为空' });
        }
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.json({ code: 400, message: '用户不存在' });
        }
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.json({ code: 400, message: '密码错误' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const { password_hash, ...safeUser } = user;
        res.json({ code: 200, message: '登录成功', data: { token, user: safeUser } });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, role, nickname, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.json({ code: 404, message: '用户不存在' });
        res.json({ code: 200, data: user });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 模拟充值 - 升级为高级用户
router.post('/upgrade', authMiddleware, (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.json({ code: 404, message: '用户不存在' });
        if (user.role === 'premium') return res.json({ code: 200, message: '您已经是高级用户' });
        if (user.role === 'admin') return res.json({ code: 200, message: '管理员无需充值' });

        // 模拟充值：将角色升级为 premium
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('premium', req.user.id);

        // 生成新 token（包含更新后的 role）
        const newToken = jwt.sign({ id: user.id, username: user.username, role: 'premium' }, JWT_SECRET, { expiresIn: '7d' });
        const updatedUser = db.prepare('SELECT id, username, role, nickname, avatar, created_at FROM users WHERE id = ?').get(req.user.id);

        res.json({
            code: 200,
            message: '充值成功！已升级为高级用户',
            data: { token: newToken, user: updatedUser }
        });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

// 修改用户名/密码
router.put('/profile', authMiddleware, (req, res) => {
    try {
        const { username, nickname, oldPassword, newPassword } = req.body;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.json({ code: 404, message: '用户不存在' });

        // 如果要改密码，必须验证旧密码
        if (newPassword) {
            if (!oldPassword) return res.json({ code: 400, message: '请输入原密码' });
            if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
                return res.json({ code: 400, message: '原密码错误' });
            }
            const newHash = bcrypt.hashSync(newPassword, 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
        }

        // 更新用户名
        if (username && username !== user.username) {
            const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
            if (existing) return res.json({ code: 400, message: '用户名已被占用' });
            db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
        }

        // 更新昵称
        if (nickname !== undefined) {
            db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, req.user.id);
        }

        const updatedUser = db.prepare('SELECT id, username, role, nickname, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
        const newToken = jwt.sign({ id: updatedUser.id, username: updatedUser.username, role: updatedUser.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ code: 200, message: '修改成功', data: { token: newToken, user: updatedUser } });
    } catch (e) {
        res.json({ code: 500, message: e.message });
    }
});

module.exports = router;
