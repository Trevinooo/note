import { useState, useEffect, useRef } from 'react'
import api from '../api'

let Capacitor = null
try { Capacitor = window.Capacitor } catch { }
const isNative = Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()

export default function Schedule() {
    const [schedules, setSchedules] = useState([])
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [showAdd, setShowAdd] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newTime, setNewTime] = useState('')
    const [reminders, setReminders] = useState([])
    const [showReminders, setShowReminders] = useState(true)
    const reminderTimer = useRef(null)
    const notifReadyRef = useRef(false)

    // 编辑日程状态
    const [editingSchedule, setEditingSchedule] = useState(null)
    const [editTitle, setEditTitle] = useState('')
    const [editTime, setEditTime] = useState('')

    useEffect(() => {
        loadSchedules()
        checkReminders()
        initLocalNotifications()
        // 每5分钟检查一次提醒
        reminderTimer.current = setInterval(checkReminders, 5 * 60 * 1000)
        return () => clearInterval(reminderTimer.current)
    }, [])

    async function initLocalNotifications() {
        if (!isNative) return
        const LocalNotifications = Capacitor?.Plugins?.LocalNotifications
        if (!LocalNotifications) return
        try {
            const perm = await LocalNotifications.requestPermissions()
            notifReadyRef.current = perm?.display === 'granted' || perm?.display === true
        } catch {
            notifReadyRef.current = false
        }
    }

    async function loadSchedules() {
        try {
            const res = await api.get('/schedules')
            if (res.code === 200) setSchedules(res.data)
        } catch { }
    }

    async function checkReminders() {
        try {
            const res = await api.get('/ai/reminders')
            if (res.code === 200 && res.data.length > 0) {
                setReminders(res.data)
                // 原生端：尽量预约本地通知（插件不存在则自动降级为仅页面横幅）
                tryScheduleLocalNotifications(res.data)
            }
        } catch { }
    }

    function getReminderTime(r) {
        return r?.effective_time || r?.remind_at || r?.start_time || null
    }

    function loadScheduledMap() {
        try {
            return JSON.parse(localStorage.getItem('scheduled_local_notifs') || '{}') || {}
        } catch {
            return {}
        }
    }

    function saveScheduledMap(map) {
        try { localStorage.setItem('scheduled_local_notifs', JSON.stringify(map || {})) } catch { }
    }

    async function tryScheduleLocalNotifications(list) {
        if (!isNative) return
        const LocalNotifications = Capacitor?.Plugins?.LocalNotifications
        if (!LocalNotifications) return
        if (!notifReadyRef.current) return

        const scheduled = loadScheduledMap()
        const now = Date.now()

        const notifs = []
        for (const r of list || []) {
            const t = getReminderTime(r)
            if (!t) continue
            const when = new Date(t).getTime()
            if (!Number.isFinite(when) || when <= now + 5000) continue

            const key = String(r.id)
            if (scheduled[key]) continue

            const id = 100000 + Number(r.id || 0)
            notifs.push({
                id,
                title: '🔔 提醒',
                body: r.title || '日程提醒',
                schedule: { at: new Date(when) }
            })
            scheduled[key] = when
        }

        if (notifs.length === 0) return
        try {
            await LocalNotifications.schedule({ notifications: notifs })
            saveScheduledMap(scheduled)
        } catch { }
    }

    async function createSchedule() {
        if (!newTitle) return
        try {
            await api.post('/schedules', { title: newTitle, start_time: newTime || null })
            setShowAdd(false)
            setNewTitle('')
            setNewTime('')
            loadSchedules()
        } catch { }
    }

    async function toggleStatus(s) {
        try {
            await api.put(`/schedules/${s.id}`, { status: s.status === 'done' ? 'pending' : 'done' })
            loadSchedules()
            checkReminders()
        } catch { }
    }

    async function deleteSchedule(id) {
        try {
            await api.delete(`/schedules/${id}`)
            loadSchedules()
        } catch { }
    }

    // 打开编辑弹窗
    function openEdit(s) {
        setEditingSchedule(s)
        setEditTitle(s.title)
        setEditTime(s.start_time ? s.start_time.substring(0, 16) : '')
    }

    // 保存编辑
    async function saveEdit() {
        if (!editingSchedule || !editTitle) return
        try {
            await api.put(`/schedules/${editingSchedule.id}`, {
                title: editTitle,
                start_time: editTime || null
            })
            setEditingSchedule(null)
            setEditTitle('')
            setEditTime('')
            loadSchedules()
        } catch { }
    }

    // 跳转到今天
    function goToToday() {
        const today = new Date()
        setCurrentMonth(new Date(today.getFullYear(), today.getMonth()))
        setSelectedDate(today)
    }

    function getTimeRemaining(startTime) {
        const now = new Date()
        const target = new Date(startTime)
        const diff = target - now
        if (diff < 0) return '已开始'
        const hours = Math.floor(diff / 3600000)
        const mins = Math.floor((diff % 3600000) / 60000)
        if (hours > 0) return `${hours}小时${mins}分钟后`
        return `${mins}分钟后`
    }

    // 日历
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    const today = new Date()
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

    const calendarDays = []
    for (let i = firstDay - 1; i >= 0; i--) calendarDays.push({ day: daysInPrevMonth - i, other: true })
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push({ day: i, other: false })
    const remaining = 42 - calendarDays.length
    for (let i = 1; i <= remaining; i++) calendarDays.push({ day: i, other: true })

    function isToday(day) {
        return !day.other && day.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
    }
    function isSelected(day) {
        return !day.other && day.day === selectedDate.getDate() && month === selectedDate.getMonth() && year === selectedDate.getFullYear()
    }
    function hasSchedule(day) {
        if (day.other) return false
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
        return schedules.some(s => s.start_time && s.start_time.startsWith(dateStr))
    }

    const selDateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    const daySchedules = schedules.filter(s => s.start_time && s.start_time.startsWith(selDateStr))
    const noDateSchedules = schedules.filter(s => !s.start_time)

    // 渲染单个日程项
    function renderScheduleItem(s) {
        return (
            <div key={s.id} className="schedule-item">
                <div className={`schedule-check ${s.status === 'done' ? 'done' : ''}`} onClick={() => toggleStatus(s)}>
                    {s.status === 'done' ? '✓' : ''}
                </div>
                <div className="schedule-info" onClick={() => openEdit(s)} style={{ cursor: 'pointer' }}>
                    <div className={`schedule-title ${s.status === 'done' ? 'done' : ''}`}>{s.title}</div>
                    {s.start_time && <div className="schedule-time">{s.start_time.substring(11, 16) || '全天'}</div>}
                </div>
                {s.source === 'ai_extract' && <span className="schedule-source-badge">AI</span>}
                <button className="schedule-delete" onClick={() => deleteSchedule(s.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                </button>
            </div>
        )
    }

    return (
        <div className="schedule-page">
            <div className="page-header-bar">
                <h1 className="page-title-text">日程管理</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-today" onClick={goToToday}>今天</button>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowAdd(true)}>+ 新建</button>
                </div>
            </div>

            {/* 智能提醒横幅 */}
            {reminders.length > 0 && showReminders && (
                <div style={{
                    background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                    borderRadius: 14, padding: 14, marginBottom: 16,
                    border: '1px solid #fde68a', textAlign: 'left'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                            🔔 智能提醒 · {reminders.length} 项即将到来
                        </span>
                        <button onClick={() => setShowReminders(false)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 16, color: '#92400e', padding: 0
                        }}>×</button>
                    </div>
                    {reminders.slice(0, 3).map(r => (
                        <div key={r.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                            borderTop: '1px solid #fde68a20'
                        }}>
                            <span style={{
                                fontSize: 11, background: '#f59e0b', color: 'white',
                                padding: '2px 8px', borderRadius: 10, fontWeight: 600, flexShrink: 0
                            }}>
                                {getTimeRemaining(r.start_time)}
                            </span>
                            <span style={{ fontSize: 13, color: '#78350f', fontWeight: 500 }}>{r.title}</span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ background: 'white', borderRadius: 16, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div className="calendar-header">
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} onClick={() => setCurrentMonth(new Date(year, month - 1))}>◀</button>
                    <span className="calendar-month">{year}年{month + 1}月</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} onClick={() => setCurrentMonth(new Date(year, month + 1))}>▶</button>
                </div>
                <div className="calendar-grid">
                    {dayLabels.map(d => <div key={d} className="calendar-day-label">{d}</div>)}
                    {calendarDays.map((d, i) => (
                        <div key={i}
                            className={`calendar-day ${d.other ? 'other-month' : ''} ${isToday(d) ? 'today' : ''} ${isSelected(d) ? 'selected' : ''}`}
                            onClick={() => !d.other && setSelectedDate(new Date(year, month, d.day))}
                        >
                            {d.day}
                            {hasSchedule(d) && <div className="dot" />}
                        </div>
                    ))}
                </div>
            </div>

            <h3 className="schedule-list-title">{selDateStr} 的日程</h3>
            {daySchedules.length === 0 && noDateSchedules.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📅</div>
                    <div className="empty-state-text">暂无日程</div>
                </div>
            ) : (
                <>
                    {daySchedules.map(s => renderScheduleItem(s))}
                    {noDateSchedules.length > 0 && (
                        <>
                            <h3 className="schedule-list-title" style={{ marginTop: 16 }}>未安排时间</h3>
                            {noDateSchedules.map(s => renderScheduleItem(s))}
                        </>
                    )}
                </>
            )}

            {/* 新建日程弹窗 */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 className="modal-title" style={{ margin: 0 }}>新建日程</h3>
                            <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">标题</label>
                            <input className="form-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="日程标题" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">时间（可选）</label>
                            <input className="form-input" type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)} />
                        </div>
                        <button className="btn btn-primary" onClick={createSchedule}>创建</button>
                    </div>
                </div>
            )}

            {/* 编辑日程弹窗 */}
            {editingSchedule && (
                <div className="modal-overlay" onClick={() => setEditingSchedule(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 className="modal-title" style={{ margin: 0 }}>编辑日程</h3>
                            <button className="modal-close" onClick={() => setEditingSchedule(null)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">标题</label>
                            <input className="form-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="日程标题" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">时间</label>
                            <input className="form-input" type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} />
                        </div>
                        <button className="btn btn-primary" onClick={saveEdit}>保存修改</button>
                    </div>
                </div>
            )}
        </div>
    )
}
