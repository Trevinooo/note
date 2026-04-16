// config/templates.config.ts
import { NoteTemplate } from '../types/template.types';

export const TEMPLATES_CONFIG: NoteTemplate[] = [
  {
    id: 'meeting-template-001',
    name: '会议记录模板',
    description: '规范记录会议要点、待办任务',
    icon: '📝',
    category: 'work',
    fields: [
      { id: 'subject', name: '会议主题', type: 'text', required: true },
      { id: 'datetime', name: '时间', type: 'datetime', required: true },
      { id: 'location', name: '地点', type: 'text' },
      { id: 'attendees', name: '参会人', type: 'text' },
      { id: 'discussionPoints', name: '讨论要点', type: 'multi-line' },
      { id: 'resolutions', name: '决议事项', type: 'multi-line' },
      { id: 'tasks', name: '待办任务', type: 'checkbox' },
      { id: 'nextMeeting', name: '下次会议', type: 'date' }
    ]
  },
  {
    id: 'reading-template-001',
    name: '读书笔记模板',
    description: '结构化记录书籍要点与感悟',
    icon: '📚',
    category: 'study',
    fields: [
      { id: 'bookTitle', name: '书名', type: 'text', required: true },
      { id: 'author', name: '作者', type: 'text' },
      { id: 'readingDate', name: '阅读日期', type: 'date' },
      { id: 'keyPoints', name: '核心观点', type: 'multi-line' },
      { id: 'quotes', name: '金句摘录', type: 'multi-line' },
      { id: 'reflections', name: '个人感悟', type: 'multi-line' },
      { id: 'actions', name: '行动启发', type: 'text' }
    ]
  },
  {
    id: 'daily-template-001',
    name: '每日复盘/工作计划模板',
    description: '高效记录、提升效率',
    icon: '✅',
    category: 'personal',
    fields: [
      { id: 'date', name: '日期', type: 'date', required: true },
      { id: 'completed', name: '今日完成', type: 'checkbox' },
      { id: 'incomplete', name: '未完成事项', type: 'text' },
      { id: 'problems', name: '遇到的问题', type: 'multi-line' },
      { id: 'tomorrowPlan', name: '明日计划', type: 'text' },
      { id: 'efficiency', name: '效率自评', type: 'text' }
    ]
  }
];