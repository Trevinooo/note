const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// 讯飞语音听写（流式版）API 配置
const XFYUN_CONFIG = {
    appId: '38a1552b',
    apiKey: 'bfd80a763c26a91c43483305cec7cf3a',
    apiSecret: 'NmFmZGFhODAwOGY5MzczOWJhNzE5MDli',
};

/**
 * GET /api/voice/ws-url
 * 生成讯飞语音听写（流式版）WebAPI 的鉴权 WebSocket URL
 * 
 * 鉴权方式：HMAC-SHA256 签名
 * 参考：https://www.xfyun.cn/doc/asr/voicedictation/API.html
 */
router.get('/ws-url', (req, res) => {
    try {
        const host = 'iat-api.xfyun.cn';
        const path = '/v2/iat';
        const date = new Date().toUTCString(); // RFC1123 格式

        // 1. 构造 signature_origin
        const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;

        // 2. HMAC-SHA256 签名
        const signatureSha = crypto
            .createHmac('sha256', XFYUN_CONFIG.apiSecret)
            .update(signatureOrigin)
            .digest('base64');

        // 3. 构造 authorization_origin
        const authorizationOrigin = `api_key="${XFYUN_CONFIG.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;

        // 4. Base64 编码
        const authorization = Buffer.from(authorizationOrigin).toString('base64');

        // 5. 构造最终 URL
        const wsUrl = `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;

        res.json({
            code: 200,
            data: {
                url: wsUrl,
                appId: XFYUN_CONFIG.appId
            }
        });
    } catch (err) {
        console.error('生成讯飞 WS URL 失败:', err);
        res.status(500).json({ code: 500, message: '生成语音识别地址失败' });
    }
});

module.exports = router;
