import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getUser } from '../api'

let Capacitor = null
try { Capacitor = window.Capacitor } catch { }
const isNative = Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()

export default function Home() {
    const [recording, setRecording] = useState(false)
    const [pressing, setPressing] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [liveText, setLiveText] = useState('')
    const [recentNotes, setRecentNotes] = useState([])
    const navigate = useNavigate()
    const user = getUser()
    const touchRef = useRef(false)
    const pressTimer = useRef(null)
    const isLongPress = useRef(false)

    // WebSocket & 音频
    const wsRef = useRef(null)
    const mediaStreamRef = useRef(null)
    const audioContextRef = useRef(null)
    const processorRef = useRef(null)
    const listenerRef = useRef(null)
    const resultRef = useRef({})      // sn -> text
    const appIdRef = useRef('')
    const frameStatusRef = useRef(0)  // 0=first, 1=middle, 2=last
    const sendTimerRef = useRef(null)
    const audioQueueRef = useRef([])  // base64 音频队列

    useEffect(() => { loadRecent() }, [])

    async function loadRecent() {
        try {
            const res = await api.get('/notes')
            if (res.code === 200) setRecentNotes(res.data.slice(0, 3))
        } catch { }
    }

    // ====== ArrayBuffer -> base64 ======
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    // ====== Float32 -> Int16 PCM ======
    function float32ToInt16(float32Array) {
        const int16 = new Int16Array(float32Array.length)
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]))
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        return int16
    }

    // ====== 重采样 ======
    function downsample(buffer, fromRate, toRate) {
        if (fromRate === toRate) return buffer
        const ratio = fromRate / toRate
        const newLength = Math.round(buffer.length / ratio)
        const result = new Float32Array(newLength)
        for (let i = 0; i < newLength; i++) {
            result[i] = buffer[Math.min(Math.round(i * ratio), buffer.length - 1)]
        }
        return result
    }

    // ====== 解析 IAT 返回结果 ======
    function parseIATResult(resp) {
        if (resp.code !== 0) return null
        const data = resp.data
        if (!data || !data.result) return null
        const result = data.result
        let text = ''
        if (result.ws) {
            for (const ws of result.ws) {
                if (ws.cw) {
                    for (const cw of ws.cw) {
                        text += cw.w
                    }
                }
            }
        }
        return { sn: result.sn, text, ls: result.ls, status: data.status }
    }

    // ====== 发送音频帧到 WebSocket ======
    function sendAudioFrame(ws, audioBase64, status) {
        if (ws.readyState !== WebSocket.OPEN) return

        const frame = { data: { status, format: 'audio/L16;rate=16000', encoding: 'raw', audio: audioBase64 } }

        // 第一帧需要带 common 和 business 参数
        if (status === 0) {
            frame.common = { app_id: appIdRef.current }
            frame.business = {
                language: 'zh_cn',
                domain: 'iat',
                accent: 'mandarin',
                vad_eos: 3000,
                dwa: 'wpgs'  // 动态修正
            }
        }

        ws.send(JSON.stringify(frame))
    }

    // ====== 核心：讯飞语音听写 ======
    const doRecognize = useCallback(async () => {
        setRecording(true)
        setTranscript('')
        setLiveText('')
        resultRef.current = {}
        frameStatusRef.current = 0
        audioQueueRef.current = []

        try {
            // 1. 获取鉴权 URL
            const urlRes = await api.get('/voice/ws-url')
            if (urlRes.code !== 200 || !urlRes.data?.url) {
                throw new Error('无法获取语音服务地址')
            }
            appIdRef.current = urlRes.data.appId

            // 2. 连接 WebSocket
            const ws = new WebSocket(urlRes.data.url)
            wsRef.current = ws

            ws.onopen = () => {
                console.log('✅ 讯飞 WebSocket 已连接')
                // 开始采集音频
                if (isNative) {
                    startNativeCapture(ws)
                } else {
                    startBrowserCapture(ws)
                }
            }

            ws.onmessage = (event) => {
                try {
                    const resp = JSON.parse(event.data)
                    const parsed = parseIATResult(resp)
                    if (parsed && parsed.text) {
                        resultRef.current[parsed.sn] = parsed.text
                        const allText = Object.keys(resultRef.current)
                            .sort((a, b) => Number(a) - Number(b))
                            .map(k => resultRef.current[k])
                            .join('')
                        setLiveText(allText)
                    }
                    if (resp.code !== 0) {
                        console.error('讯飞错误:', resp.code, resp.message)
                    }
                    // 最终结果
                    if (resp.data && resp.data.status === 2) {
                        console.log('讯飞识别结束')
                    }
                } catch (e) {
                    console.error('解析结果失败:', e)
                }
            }

            ws.onerror = (e) => {
                console.error('WebSocket 错误:', e)
            }

            ws.onclose = (event) => {
                console.log('WebSocket 关闭:', event.code)
                finishRecognition()
            }
        } catch (err) {
            console.error('语音识别错误:', err)
            setRecording(false)
            setTranscript('⚠️ ' + (err.message || '语音识别启动失败'))
        }
    }, [])

    // ====== 原生 Android 音频采集 ======
    async function startNativeCapture(ws) {
        const VoicePlugin = Capacitor.Plugins.VoiceRecognition
        if (!VoicePlugin) { setTranscript('⚠️ 语音插件不可用'); return }

        // 监听原生音频数据
        listenerRef.current = await VoicePlugin.addListener('audioData', (event) => {
            if (event.data) {
                audioQueueRef.current.push(event.data) // base64 PCM
            }
        })

        // 启动原生采集
        const result = await VoicePlugin.startCapture()
        if (!result.success) {
            setTranscript('⚠️ ' + (result.error || '音频采集失败'))
            return
        }

        // 定时发送音频帧
        startSendLoop(ws)
    }

    // ====== 浏览器 getUserMedia 音频采集 ======
    async function startBrowserCapture(ws) {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        })
        mediaStreamRef.current = stream

        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0)
            const resampled = downsample(inputData, audioContext.sampleRate, 16000)
            const pcm = float32ToInt16(resampled)
            // 转 base64 放入队列
            audioQueueRef.current.push(arrayBufferToBase64(pcm.buffer))
        }

        source.connect(processor)
        processor.connect(audioContext.destination)

        // 定时发送音频帧
        startSendLoop(ws)
    }

    // ====== 40ms 间隔发送音频 ======
    function startSendLoop(ws) {
        sendTimerRef.current = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                clearInterval(sendTimerRef.current)
                return
            }
            if (audioQueueRef.current.length > 0) {
                const audioData = audioQueueRef.current.shift()
                const status = frameStatusRef.current === 0 ? 0 : 1
                sendAudioFrame(ws, audioData, status)
                if (frameStatusRef.current === 0) frameStatusRef.current = 1
            }
        }, 40)
    }

    // ====== 停止录音 ======
    function stopRecording(errorMsg) {
        // 停止发送定时器
        if (sendTimerRef.current) {
            clearInterval(sendTimerRef.current)
            sendTimerRef.current = null
        }

        // 原生模式
        if (isNative) {
            const VoicePlugin = Capacitor?.Plugins?.VoiceRecognition
            if (VoicePlugin) VoicePlugin.stopCapture().catch(() => { })
            if (listenerRef.current) { listenerRef.current.remove(); listenerRef.current = null }
        } else {
            // 浏览器模式
            if (processorRef.current) { try { processorRef.current.disconnect() } catch { } processorRef.current = null }
            if (audioContextRef.current) { try { audioContextRef.current.close() } catch { } audioContextRef.current = null }
            if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
        }

        // 发送结束帧
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            sendAudioFrame(wsRef.current, '', 2) // status=2 表示最后一帧
            setTimeout(() => {
                if (wsRef.current) { try { wsRef.current.close() } catch { } wsRef.current = null }
            }, 3000)
        } else {
            wsRef.current = null
            finishRecognition(errorMsg)
        }

        setPressing(false)
        setRecording(false)
    }

    // ====== 完成识别 ======
    function finishRecognition(errorMsg) {
        setRecording(false)
        setPressing(false)

        if (errorMsg) { setTranscript('⚠️ ' + errorMsg); return }

        const allText = Object.keys(resultRef.current)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => resultRef.current[k])
            .join('')

        if (allText.trim()) {
            setTranscript(allText)
            saveNote(allText)
        } else {
            setTranscript('未识别到语音内容，请重试')
        }
    }

    // ====== 交互事件 ======
    function handleTouchStart() {
        touchRef.current = true
        isLongPress.current = false
        setPressing(true)
        pressTimer.current = setTimeout(() => { isLongPress.current = true; doRecognize() }, 400)
    }

    function handleTouchEnd(e) {
        e.preventDefault()
        clearTimeout(pressTimer.current)
        touchRef.current = false
        setPressing(false)
        if (recording) {
            stopRecording()
        } else if (!isLongPress.current) {
            doRecognize()
            setTimeout(() => { if (wsRef.current) stopRecording() }, 10000)
        }
    }

    function handleMouseDown() {
        if (touchRef.current) return
        isLongPress.current = false
        setPressing(true)
        pressTimer.current = setTimeout(() => { isLongPress.current = true; doRecognize() }, 400)
    }

    function handleMouseUp() {
        if (touchRef.current) return
        clearTimeout(pressTimer.current)
        setPressing(false)
        if (recording) {
            stopRecording()
        } else if (!isLongPress.current) {
            doRecognize()
            setTimeout(() => { if (wsRef.current) stopRecording() }, 10000)
        }
    }

    async function saveNote(content) {
        if (!content?.trim()) return
        try {
            const title = content.substring(0, 20) + (content.length > 20 ? '...' : '')
            const res = await api.post('/notes', { title, content, is_voice: true })
            if (res.code === 200) { setTranscript(''); loadRecent() }
        } catch { }
    }

    return (
        <div className="home-page">
            <p className="home-greeting">你好，{user?.nickname || user?.username || '用户'} 👋</p>
            <h1 className="home-title">QuickNote 速记通</h1>

            <div className={`voice-btn-wrapper ${recording ? 'recording' : ''} ${pressing ? 'pressing' : ''}`}>
                <div className="voice-glow-ring"></div>
                <div className="voice-orb-outer"></div>
                <div className="voice-orb-middle"></div>
                <div className="voice-orb-inner"></div>
                <div className="pulse-ring"></div>
                <div className="pulse-ring" style={{ animationDelay: '0.6s' }}></div>
                <div className="pulse-ring" style={{ animationDelay: '1.2s' }}></div>
                <button
                    className={`voice-btn ${recording ? 'recording' : ''} ${pressing ? 'pressing' : ''}`}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => { if (pressing && !recording) { clearTimeout(pressTimer.current); setPressing(false) } }}
                    onContextMenu={e => e.preventDefault()}
                    style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" fill="currentColor" fillOpacity={recording ? "0.3" : "0"} />
                        <path d="M19 10v2a7 7 0 01-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                </button>
            </div>

            <div className="voice-wave-bars" style={{ opacity: recording ? 1 : 0 }}>
                {[...Array(7)].map((_, i) => <div key={i} className="voice-wave-bar"></div>)}
            </div>

            {recording ? (
                <>
                    <p className="recording-text">✦ 正在聆听，请说话...</p>
                    {liveText && <p className="recording-transcript">{liveText}</p>}
                </>
            ) : (
                <>
                    <p className="voice-hint">长按说话 · 松开结束</p>
                    <p className="voice-hint-sub">点按可快速录制</p>
                </>
            )}

            {transcript && !recording && (
                <div style={{
                    marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.75)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 14, fontSize: 14, color: '#5a4a3a', width: '100%',
                    border: '1px solid rgba(255,255,255,0.6)', textAlign: 'left',
                    boxShadow: '0 4px 16px rgba(180,140,120,0.1)'
                }}>
                    <div style={{ fontSize: 12, color: '#9b7dbd', fontWeight: 600, marginBottom: 6 }}>🎤 语音识别结果</div>
                    {transcript}
                </div>
            )}

            {recentNotes.length > 0 && (
                <div className="home-recent">
                    <h3 className="home-recent-title">最近笔记</h3>
                    {recentNotes.map(note => (
                        <div key={note.id} className="note-card" onClick={() => navigate(`/notes/${note.id}`)}>
                            <div className="note-card-title">{note.title || '无标题'}</div>
                            <div className="note-card-summary">{note.content?.substring(0, 60)}</div>
                            <div className="note-card-footer">
                                <div className="note-card-tags">
                                    <span className="tag-badge">{note.category}</span>
                                    {note.is_voice ? <span className="tag-badge" style={{ background: '#fef3c7', color: '#d97706' }}>🎤 语音</span> : null}
                                </div>
                                <span className="note-card-time">{new Date(note.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
