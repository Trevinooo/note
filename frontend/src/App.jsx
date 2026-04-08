import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Home from './pages/Home'
import Notes from './pages/Notes'
import NoteDetail from './pages/NoteDetail'
import Schedule from './pages/Schedule'
import Profile from './pages/Profile'
import BottomNav from './components/BottomNav'
import { isLoggedIn } from './api'
import './index.css'

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}

function AppLayout() {
  const [activeTab, setActiveTab] = useState('home')
  const location = useLocation()
  // 笔记详情页隐藏底部导航
  const isNoteDetail = /^\/notes\/\d+/.test(location.pathname)
  return (
    <div className="app-container">
      <div className={`app-content ${isNoteDetail ? 'no-bottom-nav' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:id" element={<NoteDetail />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
      {!isNoteDetail && <BottomNav active={activeTab} onChange={setActiveTab} />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        } />
      </Routes>
    </HashRouter>
  )
}
