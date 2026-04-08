import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { getUser } from '../api'

// 思维导图渲染组件
function MindMapView({ data, level = 0 }) {
    if (!data) return null
    const colors = ['#6C63FF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
    const color = colors[level % colors.length]
    return (
        <div style={{ paddingLeft: level > 0 ? 14 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0' }}>
                {level > 0 && <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />}
                <span style={{
                    fontSize: level === 0 ? 15 : level === 1 ? 13 : 12,
                    fontWeight: level <= 1 ? 600 : 400,
                    color: level === 0 ? '#1e293b' : level === 1 ? '#374151' : '#64748b'
                }}>{data.title}</span>
            </div>
            {level === 0 && <div style={{ height: 1, background: `linear-gradient(90deg, ${color}, transparent)`, margin: '3px 0 6px' }} />}
            {data.children && data.children.map((child, i) => <MindMapView key={i} data={child} level={level + 1} />)}
        </div>
    )
}


// 会员升级弹窗
function UpgradeModal({ show, onClose, navigate }) {
    if (!show) return null
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#fff', borderRadius: 20, width: '100%', maxWidth: 340,
                overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                animation: 'modalIn 0.3s ease'
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                    padding: '28px 24px', textAlign: 'center'
                }}>
                    <div style={{ fontSize: 42 }}>🔒</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 8 }}>免费次数已用完</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>
                        开通高级会员，享受无限次 AI 功能
                    </div>
                </div>
                <div style={{ padding: '20px' }}>
                    <button onClick={() => { onClose(); navigate('/profile'); }} style={{
                        width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
                        background: 'linear-gradient(135deg, #f59e0b, #eab308)',
                        color: '#fff', fontSize: 15, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: '0 6px 20px rgba(245,158,11,0.35)'
                    }}>
                        👑 去开通会员
                    </button>
                    <button onClick={onClose} style={{
                        width: '100%', padding: '10px 0', marginTop: 8, border: 'none',
                        background: 'transparent', color: '#94a3b8', fontSize: 13,
                        cursor: 'pointer', fontFamily: 'inherit'
                    }}>稍后再说</button>
                </div>
            </div>
        </div>
    )
}

export default function NoteDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [note, setNote] = useState(null)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [summary, setSummary] = useState('')
    const [category, setCategory] = useState('')
    const [saving, setSaving] = useState(false)
    const [aiLoading, setAiLoading] = useState('')
    const [showUpgrade, setShowUpgrade] = useState(false)

    // 扩展 AI 结果
    const [aiResult, setAiResult] = useState('')
    const [mindmapData, setMindmapData] = useState(null)
    const [graphData, setGraphData] = useState(null)

    useEffect(() => { loadNote() }, [id])

    async function loadNote() {
        try {
            const res = await api.get(`/notes/${id}`)
            if (res.code === 200) {
                setNote(res.data)
                setTitle(res.data.title)
                setContent(res.data.content)
                setSummary(res.data.summary || '')
                setCategory(res.data.category || '未分类')
            }
        } catch { }
    }

    async function saveNote() {
        setSaving(true)
        try {
            await api.put(`/notes/${id}`, { title, content, summary, category })
        } catch { }
        setSaving(false)
    }

    async function deleteNote() {
        if (!confirm('确认删除？')) return
        try {
            await api.delete(`/notes/${id}`)
            navigate('/notes')
        } catch { }
    }

    // 通用 AI 功能处理
    async function handleAI(action) {
        setAiLoading(action)
        setAiResult('')
        setMindmapData(null)
        setGraphData(null)

        try {
            let res
            if (action === 'summarize') {
                res = await api.post('/ai/summarize', { content })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setAiLoading(''); return }
                if (res.code === 200) {
                    setSummary(res.data.summary)
                    await api.put(`/notes/${id}`, { summary: res.data.summary })
                    setAiResult('✅ 摘要已生成并保存')
                } else { setAiResult('❌ ' + (res.message || '操作失败')) }
            } else if (action === 'classify') {
                res = await api.post('/ai/classify', { content })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setAiLoading(''); return }
                if (res.code === 200) {
                    setCategory(res.data.category)
                    await api.put(`/notes/${id}`, { category: res.data.category })
                    setAiResult(`📂 已分类为：${res.data.category}`)
                } else { setAiResult('❌ ' + (res.message || '操作失败')) }
            } else if (action === 'todos') {
                res = await api.post('/ai/extract-todos', { content })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setAiLoading(''); return }
                if (res.code === 200 && res.data.todos.length > 0) {
                    for (const todo of res.data.todos) {
                        await api.post('/schedules', { title: todo.title, start_time: todo.start_time, source: 'ai_extract' })
                    }
                    setAiResult(`✅ 已提取 ${res.data.todos.length} 个待办到日程`)
                } else { setAiResult(res.message || '未找到待办事项') }
            } else if (action === 'plan') {
                res = await api.post('/ai/plan-schedule', { content })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setAiLoading(''); return }
                if (res.code === 200 && res.data.plans?.length > 0) {
                    for (const p of res.data.plans) {
                        await api.post('/schedules', { title: p.title, start_time: p.start_time, source: 'ai_extract' })
                    }
                    setAiResult(`📅 已规划 ${res.data.plans.length} 项日程并同步\n\n${res.data.plans.map(p =>
                        `${p.priority === '高' ? '🔴' : p.priority === '中' ? '🟡' : '🟢'} ${p.title} · ${p.duration || ''}`
                    ).join('\n')}`)
                } else { setAiResult(res.data?.raw || res.message || '未能生成日程规划') }
            } else if (action === 'mindmap') {
                res = await api.post('/ai/mindmap', { content })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setAiLoading(''); return }
                if (res.code === 200 && res.data.mindmap) {
                    setMindmapData(res.data.mindmap)
                    setAiResult('✅ 思维导图已生成')
                } else { setAiResult(res.data?.raw || res.message || '❌ 生成失败') }
            }
        } catch {
            setAiResult('❌ AI 调用失败')
        }
        setAiLoading('')
    }

    if (!note) return <div className="loading"><div className="spinner" /></div>

    const aiActions = [
        { key: 'summarize', icon: '✨', label: '智能摘要', color: '#6C63FF' },
        { key: 'classify', icon: '🏷️', label: '智能分类', color: '#10b981' },
        { key: 'todos', icon: '📋', label: '提取待办', color: '#f59e0b' },
        { key: 'plan', icon: '📅', label: '日程规划', color: '#8b5cf6' },
        { key: 'mindmap', icon: '🧠', label: '思维导图', color: '#ec4899' },
    ]

    return (
        <div className="note-detail">
            <div className="note-detail-header">
                <button className="back-btn" onClick={() => navigate('/notes')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-sm btn-outline" onClick={saveNote} disabled={saving}>
                    {saving ? '保存中...' : '💾 保存'}
                </button>
                <button className="btn btn-sm" style={{ background: '#fef2f2', color: '#ef4444', border: 'none' }} onClick={deleteNote}>🗑️</button>
            </div>

            <input className="note-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="笔记标题" />

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <span className="tag-badge">{category}</span>
                {note.is_voice ? <span className="tag-badge" style={{ background: '#fef3c7', color: '#d97706' }}>🎤 语音记录</span> : null}
            </div>

            <textarea className="note-content-area" value={content} onChange={e => setContent(e.target.value)} placeholder="写下你的想法..." />

            {/* 六个 AI 功能 - 圆润卡片网格 */}
            <div style={{ marginTop: 16, marginBottom: 12 }}>
                <div style={{
                    fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6
                }}>
                    <span style={{ fontSize: 16 }}>🤖</span> AI 智能功能
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {aiActions.map(a => (
                        <button key={a.key} onClick={() => !aiLoading && handleAI(a.key)} disabled={!!aiLoading}
                            style={{
                                background: aiLoading === a.key
                                    ? `linear-gradient(135deg, ${a.color}15, ${a.color}08)`
                                    : 'white',
                                border: `1.5px solid ${aiLoading === a.key ? a.color : '#e8ecf1'}`,
                                borderRadius: 14, padding: '10px 6px',
                                cursor: aiLoading ? 'wait' : 'pointer',
                                textAlign: 'center', transition: 'all 0.25s ease',
                                fontFamily: 'inherit',
                                opacity: aiLoading && aiLoading !== a.key ? 0.45 : 1,
                                boxShadow: aiLoading === a.key ? `0 3px 12px ${a.color}20` : '0 1px 4px rgba(0,0,0,0.04)',
                                transform: aiLoading === a.key ? 'scale(0.97)' : 'scale(1)'
                            }}>
                            <div style={{ fontSize: 20, marginBottom: 3 }}>
                                {aiLoading === a.key ? '⏳' : a.icon}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{a.label}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* AI 处理中动画 */}
            {aiLoading && (
                <div style={{
                    textAlign: 'center', padding: 18,
                    background: 'linear-gradient(135deg, #f8f9ff, #f0f4ff)',
                    borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 12
                }}>
                    <div className="spinner" style={{ margin: '0 auto 10px', width: 22, height: 22 }} />
                    <div style={{ color: '#6C63FF', fontSize: 13, fontWeight: 500 }}>AI 分析中...</div>
                </div>
            )}

            {/* 思维导图结果 */}
            {mindmapData && !aiLoading && (
                <div style={{
                    background: 'white', borderRadius: 16, padding: 16,
                    border: '1px solid #e2e8f0', marginBottom: 12, textAlign: 'left',
                    boxShadow: '0 2px 8px rgba(108,99,255,0.08)'
                }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🧠 思维导图
                    </div>
                    <MindMapView data={mindmapData} />
                </div>
            )}


            {/* AI 文字结果 */}
            {aiResult && !aiLoading && !mindmapData && !graphData && (
                <div style={{
                    background: aiResult.startsWith('❌') ? '#fef2f2' : 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                    borderRadius: 14, padding: 14,
                    border: `1px solid ${aiResult.startsWith('❌') ? '#fecaca' : '#bbf7d0'}`,
                    marginBottom: 12, fontSize: 13, lineHeight: 1.6,
                    color: aiResult.startsWith('❌') ? '#dc2626' : '#15803d',
                    whiteSpace: 'pre-wrap'
                }}>
                    {aiResult}
                </div>
            )}

            {/* 摘要展示 */}
            {summary && (
                <div className="summary-box">
                    <div className="summary-box-title">AI 摘要</div>
                    {summary}
                </div>
            )}

            {/* 会员升级弹窗 */}
            <UpgradeModal show={showUpgrade} onClose={() => setShowUpgrade(false)} navigate={navigate} />
        </div>
    )
}
