import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { setAuth, getServerUrl, setServerUrl } from '../api'

export default function Login() {
    const [isRegister, setIsRegister] = useState(false)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [nickname, setNickname] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showServerConfig, setShowServerConfig] = useState(false)
    const [serverInput, setServerInput] = useState(getServerUrl())
    const [serverSaved, setServerSaved] = useState(false)
    const navigate = useNavigate()

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const url = isRegister ? '/auth/register' : '/auth/login'
            const body = isRegister ? { username, password, nickname } : { username, password }
            const res = await api.post(url, body)
            if (res.code === 200) {
                setAuth(res.data.token, res.data.user)
                navigate('/')
            } else {
                setError(res.message)
            }
        } catch (e) {
            setError('网络错误，请检查服务器地址是否正确')
        }
        setLoading(false)
    }

    const handleSaveServer = () => {
        const saved = setServerUrl(serverInput)
        setServerInput(saved)
        setServerSaved(true)
        setTimeout(() => setServerSaved(false), 2000)
    }

    return (
        <div className="login-page">
            {/* 服务器配置按钮 */}
            <button
                onClick={() => setShowServerConfig(!showServerConfig)}
                style={{
                    position: 'absolute', top: 16, right: 16, zIndex: 10,
                    width: 40, height: 40, borderRadius: '50%',
                    background: showServerConfig ? 'rgba(108,99,255,0.15)' : 'rgba(0,0,0,0.06)',
                    border: 'none', fontSize: 20, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all .2s'
                }}
            >⚙️</button>

            {/* 服务器配置面板 */}
            {showServerConfig && (
                <div style={{
                    margin: '0 auto 16px', maxWidth: 340, width: '100%',
                    background: 'rgba(108,99,255,0.06)', borderRadius: 16,
                    padding: 16, border: '1px solid rgba(108,99,255,0.15)'
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🖥️ 服务器地址
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="form-input"
                            style={{ margin: 0, flex: 1, fontSize: 13 }}
                            placeholder="http://192.168.x.x:3001"
                            value={serverInput}
                            onChange={e => setServerInput(e.target.value)}
                        />
                        <button
                            onClick={handleSaveServer}
                            style={{
                                padding: '0 16px', borderRadius: 12, border: 'none',
                                background: serverSaved ? '#10b981' : 'linear-gradient(135deg, #6C63FF, #00D2FF)',
                                color: '#fff', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                                transition: 'all .2s'
                            }}
                        >{serverSaved ? '✓' : '保存'}</button>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                        输入电脑局域网 IP，支持自动补全协议和端口
                    </div>
                </div>
            )}

            <div className="login-card">
                <h1 className="login-title">QuickNote</h1>
                <p className="login-subtitle">{isRegister ? '创建新账号' : '速记通 · 智能笔记'}</p>
                {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">用户名</label>
                        <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} required placeholder="输入用户名" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">密码</label>
                        <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="输入密码" />
                    </div>
                    {isRegister && (
                        <div className="form-group">
                            <label className="form-label">昵称</label>
                            <input className="form-input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="输入昵称（可选）" />
                        </div>
                    )}
                    <button className="btn btn-primary" type="submit" disabled={loading}>
                        {loading ? '处理中...' : (isRegister ? '注册' : '登录')}
                    </button>
                </form>
                <div className="login-toggle">
                    {isRegister ? '已有账号？' : '没有账号？'}
                    <span onClick={() => { setIsRegister(!isRegister); setError(''); }}>
                        {isRegister ? '去登录' : '注册'}
                    </span>
                </div>
            </div>
        </div>
    )
}
