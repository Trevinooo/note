const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require('docx');
const ExcelJS = require('exceljs');
const sharp = require('sharp');

const router = express.Router();
router.use(authMiddleware);

function sanitizeFileName(name) {
    return (name || 'note').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'note';
}

function formatDateForFile(dateLike) {
    const d = new Date(dateLike || Date.now());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

function renderLines(text = '') {
    return String(text).split('\n').map(line => line.trimEnd());
}

function resolveCjkFontPath() {
    const candidates = [
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Supplemental/NISC18030.ttf',
        '/System/Library/Fonts/Supplemental/Songti.ttc',
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
}

function escapeXml(text = '') {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function wrapTextLines(text = '', maxChars = 42) {
    const srcLines = String(text).split('\n');
    const output = [];
    for (const line of srcLines) {
        if (!line) {
            output.push('');
            continue;
        }
        let cur = '';
        for (const ch of line) {
            if (cur.length >= maxChars) {
                output.push(cur);
                cur = '';
            }
            cur += ch;
        }
        if (cur) output.push(cur);
    }
    return output;
}

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

// 导出笔记
router.get('/:id/export', async (req, res) => {
    try {
        const { format = 'pdf', imageFormat = 'png' } = req.query;
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!note) return res.json({ code: 404, message: '笔记不存在' });

        const safeTitle = sanitizeFileName(note.title || '无标题');
        const datePart = formatDateForFile(note.updated_at || note.created_at);
        const titleText = note.title || '无标题';
        const contentText = note.content || '';
        const summaryText = note.summary || '无';
        const categoryText = note.category || '未分类';
        const tagsText = note.tags || '无';

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const chunks = [];
            const cjkFont = resolveCjkFontPath();
            if (cjkFont) doc.font(cjkFont);
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const filename = `${safeTitle}-${datePart}.pdf`;
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
                res.send(buffer);
            });

            doc.fontSize(18).text(titleText, { underline: true });
            doc.moveDown(0.8);
            doc.fontSize(11).text(`分类：${categoryText}`);
            doc.text(`标签：${tagsText}`);
            doc.text(`更新时间：${note.updated_at || note.created_at || ''}`);
            doc.moveDown(0.8);
            doc.fontSize(13).text('摘要');
            doc.fontSize(11).text(summaryText || '无');
            doc.moveDown(0.8);
            doc.fontSize(13).text('正文');
            doc.fontSize(11).text(contentText || '（空）', { lineGap: 4 });
            doc.end();
            return;
        }

        if (format === 'word') {
            const doc = new Document({
                sections: [{
                    children: [
                        new Paragraph({
                            text: titleText,
                            heading: HeadingLevel.HEADING_1
                        }),
                        new Paragraph({ children: [new TextRun(`分类：${categoryText}`)] }),
                        new Paragraph({ children: [new TextRun(`标签：${tagsText}`)] }),
                        new Paragraph({ children: [new TextRun(`更新时间：${note.updated_at || note.created_at || ''}`)] }),
                        new Paragraph({ text: '' }),
                        new Paragraph({ text: '摘要', heading: HeadingLevel.HEADING_2 }),
                        ...renderLines(summaryText).map(line => new Paragraph({ text: line || ' ' })),
                        new Paragraph({ text: '' }),
                        new Paragraph({ text: '正文', heading: HeadingLevel.HEADING_2 }),
                        ...renderLines(contentText).map(line => new Paragraph({ text: line || ' ' })),
                    ]
                }]
            });
            const buffer = await Packer.toBuffer(doc);
            const filename = `${safeTitle}-${datePart}.docx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            return res.send(buffer);
        }

        if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('笔记');
            sheet.columns = [
                { header: '字段', key: 'field', width: 18 },
                { header: '内容', key: 'value', width: 80 },
            ];
            sheet.addRows([
                { field: '标题', value: titleText },
                { field: '分类', value: categoryText },
                { field: '标签', value: tagsText },
                { field: '更新时间', value: note.updated_at || note.created_at || '' },
                { field: '摘要', value: summaryText },
                { field: '正文', value: contentText },
            ]);
            sheet.getRow(1).font = { bold: true };
            sheet.getColumn('value').alignment = { wrapText: true, vertical: 'top' };
            const buffer = await workbook.xlsx.writeBuffer();
            const filename = `${safeTitle}-${datePart}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            return res.send(Buffer.from(buffer));
        }

        if (format === 'image') {
            const normalizedImageFormat = String(imageFormat).toLowerCase() === 'jpg' ? 'jpg' : 'png';
            const width = 1200;
            const height = 1600;
            const cjkFont = resolveCjkFontPath();
            const fontFamily = cjkFont ? 'PingFang SC, Heiti SC, Microsoft YaHei, sans-serif' : 'Arial, sans-serif';
            const summaryLines = wrapTextLines(summaryText || '无', 44).slice(0, 8);
            const contentLines = wrapTextLines(contentText || '（空）', 44).slice(0, 24);
            const summaryTspans = summaryLines.map((line, idx) =>
                `<tspan x="52" dy="${idx === 0 ? 0 : 28}">${escapeXml(line || ' ')}</tspan>`
            ).join('');
            const contentTspans = contentLines.map((line, idx) =>
                `<tspan x="52" dy="${idx === 0 ? 0 : 28}">${escapeXml(line || ' ')}</tspan>`
            ).join('');
            const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="52" y="86" font-size="44" font-family="${fontFamily}" font-weight="700" fill="#111827">${escapeXml(titleText)}</text>
  <text x="52" y="140" font-size="24" font-family="${fontFamily}" fill="#374151">分类：${escapeXml(categoryText)}    标签：${escapeXml(tagsText)}</text>
  <text x="52" y="176" font-size="22" font-family="${fontFamily}" fill="#6b7280">更新时间：${escapeXml(note.updated_at || note.created_at || '')}</text>
  <text x="52" y="244" font-size="28" font-family="${fontFamily}" font-weight="700" fill="#111827">摘要</text>
  <text x="52" y="286" font-size="24" font-family="${fontFamily}" fill="#1f2937">${summaryTspans}</text>
  <text x="52" y="582" font-size="28" font-family="${fontFamily}" font-weight="700" fill="#111827">正文</text>
  <text x="52" y="624" font-size="24" font-family="${fontFamily}" fill="#1f2937">${contentTspans}</text>
</svg>`.trim();

            let buffer;
            if (normalizedImageFormat === 'jpg') {
                buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
            } else {
                buffer = await sharp(Buffer.from(svg)).png().toBuffer();
            }
            const mime = normalizedImageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
            const ext = normalizedImageFormat === 'jpg' ? 'jpg' : 'png';
            const filename = `${safeTitle}-${datePart}.${ext}`;
            res.setHeader('Content-Type', mime);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            return res.send(buffer);
        }

        return res.json({ code: 400, message: '不支持的导出格式' });
    } catch (e) {
        return res.json({ code: 500, message: e.message });
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
