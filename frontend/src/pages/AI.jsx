import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getUser } from '../api'

// 思维导图渲染组件
function MindMapView({ data, level = 0 }) {
    if (!data) return null
    const colors = ['#6C63FF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
    const color = colors[level % colors.length]

    return (
        <div style={{ paddingLeft: level > 0 ? 16 : 0 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0'
            }}>
                {level > 0 && (
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: color,
                        flexShrink: 0
                    }} />
                )}
                <span style={{
                    fontSize: level === 0 ? 16 : level === 1 ? 14 : 13,
                    fontWeight: level <= 1 ? 600 : 400,
                    color: level === 0 ? '#1e293b' : level === 1 ? '#374151' : '#64748b'
                }}>
                    {data.title}
                </span>
            </div>
            {level === 0 && <div style={{ height: 1, background: `linear-gradient(90deg, ${color}, transparent)`, margin: '4px 0 8px' }} />}
            {data.children && data.children.map((child, i) => (
                <MindMapView key={i} data={child} level={level + 1} />
            ))}
        </div>
    )
}

// 知识图谱渲染组件
function KnowledgeGraphView({ data }) {
    if (!data || !data.nodes) return null
    const W = 340, H = 300
    const nodes = data.nodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / data.nodes.length
        const r = Math.min(W, H) * 0.35
        return { ...n, x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle) }
    })
    const catColors = { '概念': '#6C63FF', '方法': '#10b981', '工具': '#f59e0b', '人物': '#ef4444', '事件': '#3b82f6' }

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280 }}>
            {data.edges && data.edges.map((e, i) => {
                const s = nodes.find(n => n.id === e.source)
                const t = nodes.find(n => n.id === e.target)
                if (!s || !t) return null
                const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
                return (
                    <g key={`e${i}`}>
                        <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                            stroke="#d4dff7" strokeWidth={1.5} />
                        <text x={mx} y={my - 4} fontSize={7} fill="#94a3b8" textAnchor="middle">
                            {e.label}
                        </text>
                    </g>
                )
            })}
            {nodes.map((n, i) => {
                const r = 12 + (n.size || 1) * 5
                const color = catColors[n.category] || '#6C63FF'
                return (
                    <g key={`n${i}`}>
                        <circle cx={n.x} cy={n.y} r={r} fill={color + '20'} stroke={color} strokeWidth={1.5} />
                        <text x={n.x} y={n.y + 1} fontSize={8} fill="#1e293b" textAnchor="middle" dominantBaseline="middle">
                            {n.label?.length > 6 ? n.label.substring(0, 6) + '..' : n.label}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

// 会员升级弹窗
function UpgradeModal({ show, onClose }) {
    const navigate = useNavigate()
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
                    padding: '32px 24px', textAlign: 'center'
                }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>🔒</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>免费次数已用完</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.6 }}>
                        普通用户最多使用 5 次 AI 功能<br />
                        开通高级会员，享受无限次使用
                    </div>
                </div>
                <div style={{ padding: '24px' }}>
                    <div style={{ marginBottom: 16, textAlign: 'center' }}>
                        {['✨ 智能摘要', '🏷️ 智能分类', '📋 提取待办', '📅 日程规划', '🧠 思维导图', '🔗 知识图谱'].map((item, i) => (
                            <span key={i} style={{
                                display: 'inline-block', padding: '4px 10px', margin: 3,
                                borderRadius: 16, fontSize: 12, fontWeight: 500,
                                background: '#f0f4ff', color: '#6C63FF'
                            }}>{item}</span>
                        ))}
                    </div>
                    <button onClick={() => { onClose(); navigate('/profile'); }} style={{
                        width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
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
                    }}>
                        稍后再说
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function AI() {
    const [input, setInput] = useState('')
    const [result, setResult] = useState('')
    const [loading, setLoading] = useState(false)
    const [activeAction, setActiveAction] = useState('')
    const [uploadedFile, setUploadedFile] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [mindmapData, setMindmapData] = useState(null)
    const [graphData, setGraphData] = useState(null)
    const [showUpgrade, setShowUpgrade] = useState(false)
    const fileInputRef = useRef(null)

    const actions = [
        { key: 'summarize', icon: '✨', title: '智能摘要', desc: 'AI 生成精准摘要', color: '#6C63FF' },
        { key: 'classify', icon: '🏷️', title: '智能分类', desc: '语义自动识别类别', color: '#10b981' },
        { key: 'todos', icon: '📋', title: '提取待办', desc: '提取待办生成日程', color: '#f59e0b' },
        { key: 'plan', icon: '📅', title: '日程规划', desc: '多场景智能规划', color: '#8b5cf6' },
        { key: 'mindmap', icon: '🧠', title: '思维导图', desc: '一键生成思维导图', color: '#ec4899' },
        { key: 'knowledge', icon: '🔗', title: '知识图谱', desc: '分析笔记间关联', color: '#0ea5e9' },
    ]

    async function handleFileUpload(e) {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        setUploadedFile(null)

        const reader = new FileReader()
        reader.onload = async () => {
            try {
                const base64 = reader.result.split(',')[1]
                const res = await api.post('/ai/upload-base64', {
                    filename: file.name,
                    fileData: base64
                }, { timeout: 60000 })
                if (res.code === 200) {
                    setInput(res.data.text)
                    setUploadedFile({ name: res.data.filename, length: res.data.length })
                } else {
                    alert(res.message || '文件上传失败')
                }
            } catch { alert('文件上传失败') }
            setUploading(false)
        }
        reader.onerror = () => { alert('文件读取失败'); setUploading(false) }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    async function executeAction(action) {
        if (action !== 'knowledge' && !input.trim()) { alert('请先上传文件或输入内容'); return }
        setLoading(true)
        setActiveAction(action)
        setResult('')
        setMindmapData(null)
        setGraphData(null)
        try {
            let res
            if (action === 'summarize') {
                res = await api.post('/ai/summarize', { content: input })
                if (res.code === 200) setResult(res.data.summary)
                else if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                else setResult('❌ ' + res.message)
            } else if (action === 'classify') {
                res = await api.post('/ai/classify', { content: input })
                if (res.code === 200) setResult(`📂 分类结果：${res.data.category}`)
                else if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                else setResult('❌ ' + res.message)
            } else if (action === 'todos') {
                res = await api.post('/ai/extract-todos', { content: input })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                if (res.code === 200) {
                    const todos = res.data.todos
                    if (todos.length > 0) {
                        for (const todo of todos) {
                            await api.post('/schedules', { title: todo.title, start_time: todo.start_time, source: 'ai_extract' })
                        }
                        setResult(`✅ 已提取 ${todos.length} 个待办并同步到日程：\n\n${todos.map(t =>
                            `• ${t.title}${t.scene ? ` [${t.scene}]` : ''}${t.start_time ? ` ⏰${t.start_time}` : ''}`
                        ).join('\n')}`)
                    } else { setResult(res.data.raw || '未识别到待办事项') }
                } else { setResult('❌ ' + res.message) }
            } else if (action === 'plan') {
                res = await api.post('/ai/plan-schedule', { content: input })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                if (res.code === 200) {
                    const plans = res.data.plans
                    if (plans.length > 0) {
                        for (const p of plans) {
                            await api.post('/schedules', { title: `${p.title}`, start_time: p.start_time, source: 'ai_extract' })
                        }
                        setResult(`📅 已规划 ${plans.length} 项日程并同步：\n\n${plans.map(p =>
                            `${p.priority === '高' ? '🔴' : p.priority === '中' ? '🟡' : '🟢'} ${p.title}\n   ⏰ ${p.start_time || '待定'} · ${p.duration || ''} · ${p.scene || ''}`
                        ).join('\n\n')}`)
                    } else { setResult(res.data.raw || '未能生成日程规划') }
                } else { setResult('❌ ' + res.message) }
            } else if (action === 'mindmap') {
                res = await api.post('/ai/mindmap', { content: input })
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                if (res.code === 200 && res.data.mindmap) {
                    setMindmapData(res.data.mindmap)
                    setResult('✅ 思维导图生成成功')
                } else {
                    setResult(res.data?.raw || res.message || '❌ 生成失败')
                }
            } else if (action === 'knowledge') {
                res = await api.post('/ai/knowledge-graph')
                if (res.code === 403 && res.data?.needUpgrade) { setShowUpgrade(true); setLoading(false); return }
                if (res.code === 200 && res.data.graph) {
                    setGraphData(res.data.graph)
                    setResult(`✅ 知识图谱已生成（${res.data.graph.nodes?.length || 0} 个节点，${res.data.graph.edges?.length || 0} 条关系）`)
                } else {
                    setResult(res.message || '❌ 生成失败')
                }
            }
        } catch {
            setResult('❌ 请求失败，请检查 AI 配置')
        }
        setLoading(false)
    }

    return (
        <div className="ai-page">
            <div className="page-header-bar">
                <h1 className="page-title-text">AI 智能助手</h1>
            </div>

            {/* 文件上传 + 文本输入 */}
            <div style={{
                background: 'white', borderRadius: 16, padding: 16, marginBottom: 16,
                border: '1px solid #e2e8f0', textAlign: 'left'
            }}>
                <div onClick={() => fileInputRef.current?.click()} style={{
                    border: '2px dashed #d4dff7', borderRadius: 14, padding: '16px 12px',
                    textAlign: 'center', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #f8f9ff, #f0f4ff)', marginBottom: 12,
                    overflow: 'hidden'
                }}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt"
                        onChange={handleFileUpload} style={{ display: 'none' }} />
                    {uploading ? (
                        <div><div className="spinner" style={{ margin: '0 auto 8px', width: 24, height: 24 }} /><div style={{ fontSize: 13, color: '#6C63FF' }}>解析中...</div></div>
                    ) : uploadedFile ? (
                        <div style={{ overflow: 'hidden' }}>
                            <span style={{ fontSize: 20 }}>📄</span>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 8px' }}>{uploadedFile.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>已提取 {uploadedFile.length} 字 · 点击重新上传</div>
                        </div>
                    ) : (
                        <div><span style={{ fontSize: 24 }}>📁</span><div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>上传文件</div><div style={{ fontSize: 11, color: '#94a3b8' }}>PDF / Word / TXT</div></div>
                    )}
                </div>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                    placeholder="上传文件自动提取文本，或手动输入内容..."
                    style={{
                        width: '100%', minHeight: 80, maxHeight: 160, border: '1px solid #e2e8f0',
                        borderRadius: 12, padding: 12, fontSize: 14, fontFamily: 'inherit',
                        resize: 'vertical', outline: 'none', boxSizing: 'border-box'
                    }} />
            </div>

            {/* 功能选择 2x3 网格 */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 10, textAlign: 'left' }}>
                    🎯 选择 AI 功能
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {actions.map(a => (
                        <button key={a.key} onClick={() => !loading && executeAction(a.key)} disabled={loading}
                            style={{
                                background: 'white', border: `1px solid ${activeAction === a.key ? a.color : '#e2e8f0'}`,
                                borderRadius: 12, padding: '12px 6px', cursor: loading ? 'wait' : 'pointer',
                                textAlign: 'center', transition: 'all 0.2s', fontFamily: 'inherit',
                                opacity: loading && activeAction !== a.key ? 0.5 : 1,
                                boxShadow: activeAction === a.key ? `0 2px 12px ${a.color}20` : 'none'
                            }}>
                            <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{a.title}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{a.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 处理中 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 24, background: 'white', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    <div style={{ color: '#6C63FF', fontSize: 14, fontWeight: 500 }}>AI 正在处理中...</div>
                </div>
            )}

            {/* 思维导图结果 */}
            {mindmapData && !loading && (
                <div style={{
                    background: 'white', borderRadius: 14, padding: 16,
                    border: '1px solid #e2e8f0', marginBottom: 12, textAlign: 'left'
                }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🧠 思维导图
                    </div>
                    <MindMapView data={mindmapData} />
                </div>
            )}

            {/* 知识图谱结果 */}
            {graphData && !loading && (
                <div style={{
                    background: 'white', borderRadius: 14, padding: 16,
                    border: '1px solid #e2e8f0', marginBottom: 12, textAlign: 'left'
                }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🔗 知识图谱
                    </div>
                    <KnowledgeGraphView data={graphData} />
                    {graphData.nodes && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['概念', '方法', '工具', '人物', '事件'].map(cat => {
                                const color = { '概念': '#6C63FF', '方法': '#10b981', '工具': '#f59e0b', '人物': '#ef4444', '事件': '#3b82f6' }[cat]
                                return <span key={cat} style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: color + '15', color, fontWeight: 500
                                }}>{cat}</span>
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 文字结果 */}
            {result && !loading && !mindmapData && !graphData && (
                <div className="ai-result" style={{ textAlign: 'left' }}>
                    <div className="ai-result-title">
                        {activeAction === 'summarize' ? '✨ 智能摘要' :
                            activeAction === 'classify' ? '🏷️ 分类结果' :
                                activeAction === 'todos' ? '📋 提取结果' : '📅 日程规划'}
                    </div>
                    <div className="ai-result-content">{result}</div>
                </div>
            )}

            {/* 会员升级弹窗 */}
            <UpgradeModal show={showUpgrade} onClose={() => setShowUpgrade(false)} />
        </div>
    )
}
