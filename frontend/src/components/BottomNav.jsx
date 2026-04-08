import { useNavigate, useLocation } from 'react-router-dom'

const tabs = [
    { key: 'home', path: '/', label: '首页', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
    { key: 'notes', path: '/notes', label: '笔记', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
    { key: 'schedule', path: '/schedule', label: '日程', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
    { key: 'profile', path: '/profile', label: '我的', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
]

export default function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()
    const currentPath = location.pathname

    return (
        <nav className="bottom-nav">
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    className={`bottom-nav-item ${currentPath === tab.path ? 'active' : ''}`}
                    onClick={() => navigate(tab.path)}
                >
                    {tab.icon}
                    <span>{tab.label}</span>
                </button>
            ))}
        </nav>
    )
}
