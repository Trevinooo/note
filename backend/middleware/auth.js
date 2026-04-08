const jwt = require('jsonwebtoken');

const JWT_SECRET = 'quicknote_secret_2024';

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ code: 401, message: '未登录' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ code: 403, message: '无权限' });
    }
    next();
}

module.exports = { authMiddleware, adminMiddleware, JWT_SECRET };
