import {useState, useEffect, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

function BackupMenu() {
  const [restoring, setRestoring] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleBackup = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/notes/backup/all', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      if (!res.ok) {
        throw new Error('下载失败')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notes_backup_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      alert('备份成功！文件已下载')
    } catch (err) {
      alert('备份失败：请先登录后重试')
    } finally {
      setMenuOpen(false)
    }
  }

  const handleRestore = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!window.confirm('确定要从备份恢复笔记吗？')) return

    try {
      setRestoring(true)
      const token = localStorage.getItem('token')
      const text = await file.text()
      const backupData = JSON.parse(text)
      const res = await fetch('/api/notes/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ backupData })
      })
      const data = await res.json()
      alert(data.message)
      window.location.reload()
    } catch (err) {
      alert('恢复失败：文件格式错误')
    } finally {
      setRestoring(false)
      setMenuOpen(false)
      e.target.value = ''
    }
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* 紫色三点按钮 */}
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={restoring}
        className="backup-menu-trigger"
      >
        ⋮
      </button>

      {/* 下拉菜单 */}
      {menuOpen && (
        <div className="backup-menu-panel">
          <button type="button" className="backup-menu-item" onClick={handleBackup}>
            🔐 备份全部笔记
          </button>
          <div className="backup-menu-sep" />
          <label className="backup-menu-item">
            {restoring ? '♻️ 恢复中...' : '♻️ 从备份恢复'}
            <input
              type="file"
              accept=".json"
              onChange={handleRestore}
              style={{ display: 'none' }}
              disabled={restoring}
            />
          </label>
        </div>
      )}
    </div>
  )
}


export default function Notes() {
    const [notes, setNotes] = useState([])
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('全部')
    const [showAdd, setShowAdd] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')
    const navigate = useNavigate()

    const categories = ['全部', '未分类', '工作', '学习', '生活', '灵感', '待办']

    useEffect(() => { loadNotes() }, [category, search])

    async function loadNotes() {
        try {
            const params = {}
            if (category !== '全部') params.category = category
            if (search) params.search = search
            const res = await api.get('/notes', { params })
            if (res.code === 200) setNotes(res.data)
        } catch { }
    }

    async function createNote() {
        if (!newTitle && !newContent) return
        try {
            const res = await api.post('/notes', {
                title: newTitle || '无标题',
                content: newContent,
                category: '未分类'
            })
            if (res.code === 200) {
                setShowAdd(false)
                setNewTitle('')
                setNewContent('')
                navigate(`/notes/${res.data.id}`)
            }
        } catch { }
    }

    return (
        <div className="notes-page">
            <div className="page-header-bar" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 className="page-title-text">我的笔记</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{notes.length} 条</span>
                    <BackupMenu />
                </div>
            </div>

            <div className="search-bar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input placeholder="搜索笔记..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="filter-tags">
                {categories.map(c => (
                    <button key={c} className={`filter-tag ${category === c ? 'active' : ''}`}
                        onClick={() => setCategory(c)}>{c}</button>
                ))}
            </div>

            {notes.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📝</div>
                    <div className="empty-state-text">暂无笔记，点击 + 创建</div>
                </div>
            ) : (
                notes.map(note => (
                    <div key={note.id} className="note-card" onClick={() => navigate(`/notes/${note.id}`)}>
                        <div className="note-card-title">{note.title || '无标题'}</div>
                        <div className="note-card-summary">{note.summary || note.content?.substring(0, 80)}</div>
                        <div className="note-card-footer">
                            <div className="note-card-tags">
                                <span className="tag-badge">{note.category}</span>
                                {note.is_voice ? <span className="tag-badge tag-badge-voice">🎤</span> : null}
                            </div>
                            <span className="note-card-time">{new Date(note.updated_at || note.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))
            )}

            <button className="fab" onClick={() => setShowAdd(true)}>+</button>

            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 className="modal-title" style={{ margin: 0 }}>新建笔记</h3>
                            <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">标题</label>
                            <input className="form-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="笔记标题" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">内容</label>
                            <textarea className="form-input" rows={4} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="输入笔记内容..." style={{ resize: 'vertical', minHeight: 100 }} />
                        </div>
                        <button className="btn btn-primary" onClick={createNote}>创建笔记</button>
                    </div>
                </div>
            )}
        </div>
    )
}
