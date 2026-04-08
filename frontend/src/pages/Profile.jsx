import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getUser, clearAuth, setAuth, updateUser } from '../api'

export default function Profile() {
    const navigate = useNavigate()
    const [user, setUserState] = useState(getUser())
    const [tags, setTags] = useState([])
    const [noteCount, setNoteCount] = useState(0)
    const [scheduleCount, setScheduleCount] = useState(0)
    const [aiUsage, setAiUsage] = useState({ used: 0, limit: 5, role: 'user' })


    // 充值弹窗
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)
    const [upgrading, setUpgrading] = useState(false)
    const [upgradeMsg, setUpgradeMsg] = useState('')

    useEffect(() => {
        loadData()
        loadAIUsage()
    }, [])

    async function loadData() {
        try {
            const [notesRes, schedulesRes, tagsRes] = await Promise.all([
                api.get('/notes'),
                api.get('/schedules'),
                api.get('/tags')
            ])
            if (notesRes.code === 200) setNoteCount(notesRes.data.length)
            if (schedulesRes.code === 200) setScheduleCount(schedulesRes.data.length)
            if (tagsRes.code === 200) setTags(tagsRes.data)
        } catch { }
    }

    async function loadAIUsage() {
        try {
            const res = await api.get('/ai/usage')
            if (res.code === 200) setAiUsage(res.data)
        } catch { }
    }

    async function handleUpgrade() {
        setUpgrading(true)
        setUpgradeMsg('')
        try {
            const res = await api.post('/auth/upgrade')
            if (res.code === 200 && res.data) {
                setAuth(res.data.token, res.data.user)
                updateUser(res.data.user)
                setUserState(res.data.user)
                setAiUsage(prev => ({ ...prev, limit: -1, role: 'premium' }))
                setUpgradeMsg('🎉 充值成功！已升级为高级用户')
                setTimeout(() => {
                    setShowUpgradeModal(false)
                    setUpgradeMsg('')
                }, 2000)
            } else {
                setUpgradeMsg(res.message || '充值失败')
            }
        } catch {
            setUpgradeMsg('❌ 网络错误，请重试')
        }
        setUpgrading(false)
    }

    function handleLogout() {
        clearAuth()
        navigate('/login')
    }

    // 修改资料弹窗
    const [showEditModal, setShowEditModal] = useState(false)
    const [editUsername, setEditUsername] = useState('')
    const [editNickname, setEditNickname] = useState('')
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [editMsg, setEditMsg] = useState('')
    const [editSaving, setEditSaving] = useState(false)

    function openEditModal() {
        setEditUsername(user?.username || '')
        setEditNickname(user?.nickname || '')
        setOldPassword('')
        setNewPassword('')
        setEditMsg('')
        setShowEditModal(true)
    }

    async function handleSaveProfile() {
        setEditSaving(true)
        setEditMsg('')
        try {
            const body = { username: editUsername, nickname: editNickname }
            if (newPassword) { body.oldPassword = oldPassword; body.newPassword = newPassword }
            const res = await api.put('/auth/profile', body)
            if (res.code === 200 && res.data) {
                setAuth(res.data.token, res.data.user)
                updateUser(res.data.user)
                setUserState(res.data.user)
                setEditMsg('✅ 修改成功')
                setTimeout(() => { setShowEditModal(false); setEditMsg('') }, 1500)
            } else {
                setEditMsg('❌ ' + (res.message || '修改失败'))
            }
        } catch {
            setEditMsg('❌ 网络错误')
        }
        setEditSaving(false)
    }

    const roleMap = { user: '普通用户', premium: '高级用户', admin: '管理员' }
    const isPremium = user?.role === 'premium' || user?.role === 'admin'

    return (
        <div className="profile-page">
            <div className="profile-header">
                <div className="profile-avatar">
                    {(user?.nickname || user?.username || 'U')[0].toUpperCase()}
                </div>
                <div className="profile-name">{user?.nickname || user?.username}</div>
                <div className="profile-role">{roleMap[user?.role] || '普通用户'}</div>
            </div>

            {/* 会员状态卡片 */}
            <div className="profile-section" style={{
                background: isPremium
                    ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)'
                    : 'linear-gradient(135deg, #f8f9ff 0%, #eef2ff 100%)',
                border: isPremium ? '1px solid #f59e0b' : '1px solid #d4dff7',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {isPremium && (
                    <div style={{
                        position: 'absolute', top: -20, right: -20,
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(245,158,11,0.15)'
                    }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>{isPremium ? '👑' : '🌟'}</span>
                    <div>
                        <div style={{
                            fontSize: 16, fontWeight: 700,
                            color: isPremium ? '#92400e' : '#1e293b'
                        }}>
                            {isPremium ? '高级会员' : '普通用户'}
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: isPremium ? '#a16207' : '#64748b',
                            marginTop: 2
                        }}>
                            {isPremium ? '无限次 AI 功能使用' : `AI 功能已使用 ${aiUsage.used}/${aiUsage.limit} 次`}
                        </div>
                    </div>
                </div>

                {!isPremium && (
                    <>
                        {/* 进度条 */}
                        <div style={{
                            height: 6, borderRadius: 3, background: 'rgba(108,99,255,0.15)',
                            marginBottom: 12, overflow: 'hidden'
                        }}>
                            <div style={{
                                height: '100%', borderRadius: 3,
                                background: aiUsage.used >= aiUsage.limit
                                    ? 'linear-gradient(90deg, #ef4444, #f87171)'
                                    : 'linear-gradient(90deg, #6C63FF, #00D2FF)',
                                width: `${Math.min(100, (aiUsage.used / aiUsage.limit) * 100)}%`,
                                transition: 'width 0.5s ease'
                            }} />
                        </div>
                        <button onClick={() => setShowUpgradeModal(true)} style={{
                            width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                            background: 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                            color: '#fff', fontSize: 14, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            boxShadow: '0 4px 15px rgba(108,99,255,0.3)',
                            transition: 'all 0.3s ease'
                        }}>
                            ✨ 开通高级会员
                        </button>
                    </>
                )}
            </div>

            <div className="profile-section">
                <div className="profile-section-title">数据统计</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div style={{ textAlign: 'center', padding: 16, background: '#f8f9ff', borderRadius: 12 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#6C63FF' }}>{noteCount}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>笔记数</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 16, background: '#f0fdf4', borderRadius: 12 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{scheduleCount}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>日程数</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 16, background: '#fef3c7', borderRadius: 12 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{aiUsage.used}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>AI 使用</div>
                    </div>
                </div>
            </div>

            <div className="profile-section">
                <div className="profile-section-title">我的标签</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {tags.map(tag => (
                        <span key={tag.id} className="tag-badge" style={{ background: tag.color + '20', color: tag.color, padding: '4px 12px', fontSize: 13 }}>
                            {tag.name}
                        </span>
                    ))}
                    {tags.length === 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}>暂无标签</span>}
                </div>
            </div>

            <div className="profile-section">
                <div className="profile-section-title">账号信息</div>
                <div className="profile-item">
                    <span className="profile-item-label">用户名</span>
                    <span className="profile-item-value">{user?.username}</span>
                </div>
                <div className="profile-item">
                    <span className="profile-item-label">角色</span>
                    <span className="profile-item-value">{roleMap[user?.role] || '普通用户'}</span>
                </div>
                <div className="profile-item">
                    <span className="profile-item-label">注册时间</span>
                    <span className="profile-item-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span>
                </div>
            </div>

            {/* 修改资料按钮 */}
            <button onClick={openEditModal} style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 15px rgba(108,99,255,0.3)',
                transition: 'all 0.3s ease', marginBottom: 8
            }}>
                ✏️ 修改用户名 / 密码
            </button>

            <button className="logout-btn" onClick={handleLogout}>退出登录</button>

            {/* 修改资料弹窗 */}
            {showEditModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: 20, animation: 'fadeIn 0.3s ease'
                }} onClick={() => !editSaving && setShowEditModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360,
                        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        animation: 'modalIn 0.3s ease'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                            padding: '24px', textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 36, marginBottom: 6 }}>✏️</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>修改资料</div>
                        </div>

                        <div style={{ padding: '20px' }}>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>用户名</div>
                                <input className="form-input" style={{ margin: 0, fontSize: 14 }}
                                    value={editUsername} onChange={e => setEditUsername(e.target.value)}
                                    placeholder="输入新用户名" />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>昵称</div>
                                <input className="form-input" style={{ margin: 0, fontSize: 14 }}
                                    value={editNickname} onChange={e => setEditNickname(e.target.value)}
                                    placeholder="输入昵称" />
                            </div>
                            <div style={{
                                height: 1, background: '#e2e8f0', margin: '16px 0',
                            }} />
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                                如需修改密码，请填写以下内容（不修改则留空）
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>原密码</div>
                                <input className="form-input" type="password" style={{ margin: 0, fontSize: 14 }}
                                    value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                                    placeholder="输入原密码" />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>新密码</div>
                                <input className="form-input" type="password" style={{ margin: 0, fontSize: 14 }}
                                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                    placeholder="输入新密码" />
                            </div>

                            {editMsg && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                                    background: editMsg.includes('✅') ? '#ecfdf5' : '#fef2f2',
                                    color: editMsg.includes('✅') ? '#059669' : '#dc2626',
                                    fontSize: 13, textAlign: 'center', fontWeight: 500
                                }}>
                                    {editMsg}
                                </div>
                            )}

                            <button onClick={handleSaveProfile} disabled={editSaving} style={{
                                width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
                                background: editSaving ? '#d4d4d4' : 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                                color: '#fff', fontSize: 15, fontWeight: 700,
                                cursor: editSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                boxShadow: editSaving ? 'none' : '0 4px 15px rgba(108,99,255,0.3)',
                                transition: 'all 0.3s ease'
                            }}>
                                {editSaving ? '保存中...' : '💾 保存修改'}
                            </button>

                            <button onClick={() => setShowEditModal(false)} style={{
                                width: '100%', padding: '10px 0', marginTop: 8, border: 'none',
                                background: 'transparent', color: '#94a3b8', fontSize: 13,
                                cursor: 'pointer', fontFamily: 'inherit'
                            }}>
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 充值弹窗 */}
            {showUpgradeModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: 20, animation: 'fadeIn 0.3s ease'
                }} onClick={() => !upgrading && setShowUpgradeModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360,
                        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        animation: 'modalIn 0.3s ease'
                    }}>
                        {/* 顶部金色横幅 */}
                        <div style={{
                            background: 'linear-gradient(135deg, #f59e0b, #eab308, #fbbf24)',
                            padding: '28px 24px 24px', textAlign: 'center', position: 'relative'
                        }}>
                            <div style={{
                                position: 'absolute', top: -30, right: -30,
                                width: 100, height: 100, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.15)'
                            }} />
                            <div style={{ fontSize: 42, marginBottom: 8 }}>👑</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#78350f' }}>开通高级会员</div>
                            <div style={{ fontSize: 13, color: '#92400e', marginTop: 6 }}>解锁无限 AI 功能</div>
                        </div>

                        <div style={{ padding: '24px' }}>
                            {/* 权益对比 */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
                                    会员权益
                                </div>
                                {[
                                    { icon: '✨', text: '智能摘要', free: '5次', vip: '无限' },
                                    { icon: '🏷️', text: '智能分类', free: '5次', vip: '无限' },
                                    { icon: '📋', text: '提取待办', free: '5次', vip: '无限' },
                                    { icon: '📅', text: '日程规划', free: '5次', vip: '无限' },
                                    { icon: '🧠', text: '思维导图', free: '5次', vip: '无限' },
                                ].map((item, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', padding: '8px 0',
                                        borderBottom: i < 5 ? '1px solid #f1f5f9' : 'none',
                                        fontSize: 13
                                    }}>
                                        <span style={{ width: 28 }}>{item.icon}</span>
                                        <span style={{ flex: 1, color: '#374151' }}>{item.text}</span>
                                        <span style={{
                                            color: '#94a3b8', fontSize: 12, width: 50, textAlign: 'center',
                                            textDecoration: 'line-through'
                                        }}>{item.free}</span>
                                        <span style={{
                                            color: '#f59e0b', fontSize: 12, fontWeight: 600, width: 50, textAlign: 'center'
                                        }}>{item.vip}</span>
                                    </div>
                                ))}
                            </div>

                            {/* 价格 */}
                            <div style={{
                                textAlign: 'center', padding: '16px', borderRadius: 14,
                                background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                marginBottom: 16
                            }}>
                                <div style={{ fontSize: 12, color: '#92400e', marginBottom: 4 }}>永久会员</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 14, color: '#b45309' }}>¥</span>
                                    <span style={{ fontSize: 36, fontWeight: 800, color: '#b45309' }}>9.9</span>
                                </div>

                            </div>

                            {upgradeMsg && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                                    background: upgradeMsg.includes('成功') ? '#ecfdf5' : '#fef2f2',
                                    color: upgradeMsg.includes('成功') ? '#059669' : '#dc2626',
                                    fontSize: 13, textAlign: 'center', fontWeight: 500
                                }}>
                                    {upgradeMsg}
                                </div>
                            )}

                            <button onClick={handleUpgrade} disabled={upgrading} style={{
                                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                                background: upgrading ? '#d4d4d4' : 'linear-gradient(135deg, #f59e0b, #eab308)',
                                color: upgrading ? '#9ca3af' : '#fff', fontSize: 16, fontWeight: 700,
                                cursor: upgrading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                boxShadow: upgrading ? 'none' : '0 6px 20px rgba(245,158,11,0.35)',
                                transition: 'all 0.3s ease'
                            }}>
                                {upgrading ? '处理中...' : '🎉 立即开通'}
                            </button>

                            <button onClick={() => setShowUpgradeModal(false)} style={{
                                width: '100%', padding: '10px 0', marginTop: 8, border: 'none',
                                background: 'transparent', color: '#94a3b8', fontSize: 13,
                                cursor: 'pointer', fontFamily: 'inherit'
                            }}>
                                暂不开通
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
