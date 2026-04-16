export interface TemplateField {
  id: string;
  name: string;
  type: 'text' | 'multi-line' | 'checkbox' | 'date' | 'time' | 'attachment';
  placeholder?: string;
  required?: boolean;
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'work' | 'study' | 'personal';
  fields: TemplateField[];
  defaultContent?: Record<string, any>;
}

export interface NoteFromTemplate {
  id: string;
  templateId: string;
  title: string;
  content: Record<string, any>;
  attachments: Attachment[];
  reminders: Reminder[];
  createdAt: Date;
  updatedAt: Date;
}