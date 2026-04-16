// components/templates/MeetingTemplate.tsx
import React, { useState } from 'react';
import { VoiceAlarm } from '../VoiceAlarm'; // 与任务一接轨
import { FileAttachment } from '../FileAttachment'; // 与任务二接轨
import { ShareButton } from '../ShareButton'; // 与任务三接轨

interface MeetingNoteData {
  subject: string;
  datetime: string;
  location: string;
  attendees: string[];
  discussionPoints: string[];
  resolutions: string[];
  tasks: Task[];
  nextMeeting: string;
}

interface Task {
  id: string;
  content: string;
  completed: boolean;
  reminder?: any;
}

const MeetingTemplate: React.FC = () => {
  const [meetingData, setMeetingData] = useState<MeetingNoteData>({
    subject: '',
    datetime: new Date().toISOString(),
    location: '',
    attendees: [],
    discussionPoints: [''],
    resolutions: [''],
    tasks: [],
    nextMeeting: ''
  });

  // 与任务一接轨：语音创建待办
  const handleVoiceTask = async (taskContent: string) => {
    try {
      // 调用语音闹钟API
      const reminder = await VoiceAlarm.create({
        text: taskContent,
        autoParseTime: true,
        noteId: 'current-note-id'
      });
      
      // 添加到任务列表
      const newTask: Task = {
        id: Date.now().toString(),
        content: taskContent,
        completed: false,
        reminder: reminder
      };
      
      setMeetingData(prev => ({
        ...prev,
        tasks: [...prev.tasks, newTask]
      }));
    } catch (error) {
      console.error('创建语音待办失败:', error);
    }
  };

  // 与任务二接轨：插入文件/图片
  const handleInsertFile = async (file: File) => {
    const attachment = await FileAttachment.upload(file, 'current-note-id');
    // 将附件插入到当前光标位置
    insertIntoContent(attachment);
  };

  // 与任务三接轨：共享笔记
  const handleShare = () => {
    ShareButton.share({
      noteId: 'current-note-id',
      title: meetingData.subject,
      content: meetingData,
      includeReminders: true, // 同步关联日程
      targetUsers: [] // 选择共享对象
    });
  };

  return (
    <div className="meeting-template">
      <div className="template-toolbar">
        <button onClick={() => handleVoiceTask('')} className="voice-task-btn">
          🎤 语音添加待办
        </button>
        <button onClick={() => handleInsertFile} className="insert-file-btn">
          📎 插入文件/图片
        </button>
        <button onClick={handleShare} className="share-btn">
          🔗 共享笔记
        </button>
      </div>
      
      <div className="meeting-form">
        <input
          type="text"
          placeholder="会议主题"
          value={meetingData.subject}
          onChange={e => setMeetingData({...meetingData, subject: e.target.value})}
        />
        
        <input
          type="datetime-local"
          value={meetingData.datetime}
          onChange={e => setMeetingData({...meetingData, datetime: e.target.value})}
        />
        
        <div className="discussion-points">
          <h4>讨论要点</h4>
          {meetingData.discussionPoints.map((point, idx) => (
            <textarea
              key={idx}
              value={point}
              onChange={e => {
                const newPoints = [...meetingData.discussionPoints];
                newPoints[idx] = e.target.value;
                setMeetingData({...meetingData, discussionPoints: newPoints});
              }}
              placeholder={`要点 ${idx + 1}`}
            />
          ))}
          <button onClick={() => setMeetingData(prev => ({
            ...prev,
            discussionPoints: [...prev.discussionPoints, '']
          }))}>+ 添加要点</button>
        </div>
        
        <div className="tasks-section">
          <h4>待办任务（支持语音输入）</h4>
          {meetingData.tasks.map(task => (
            <div key={task.id} className="task-item">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => {/* 更新任务状态 */}}
              />
              <span className={task.completed ? 'completed' : ''}>
                {task.content}
              </span>
              {task.reminder && (
                <span className="reminder-badge">
                  ⏰ {new Date(task.reminder.time).toLocaleString()}
                </span>
              )}
            </div>
          ))}
          
          {/* 语音输入区域 - 与任务一接轨 */}
          <div className="voice-input-area"
               onMouseDown={() => VoiceAlarm.startRecording(handleVoiceTask)}>
            🎙️ 长按语音输入待办事项
          </div>
        </div>
      </div>
    </div>
  );
};