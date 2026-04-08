const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

// 初始化数据库
require('./db');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API 路由（放在静态文件之前，优先匹配）
app.use('/api/auth', require('./routes/auth'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/voice', require('./routes/voice'));

// 管理后台入口
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin.html'));
});

// 管理后台静态文件
app.use('/admin-assets', express.static(path.join(__dirname, '../')));

// App 端：提供构建后的前端文件
const appDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(appDistPath));

// SPA fallback：所有非 API、非 admin 的请求都返回 index.html
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && req.path !== '/admin') {
        res.sendFile(path.join(appDistPath, 'index.html'));
    }
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 获取本机 IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║    QuickNote 速记通 · 服务已启动      ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  📱 App:   http://${ip}:${PORT}    ║`);
    console.log(`  ║  💻 管理:  http://${ip}:${PORT}/admin ║`);
    console.log(`  ║  🏠 本地:  http://localhost:${PORT}     ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    console.log('  📱 手机访问：连接同一 WiFi，打开上方 App 地址');
    console.log('  💡 安装到桌面：浏览器菜单 → "添加到主屏幕"');
    console.log('');
});
