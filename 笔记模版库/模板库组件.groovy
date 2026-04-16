// components/TemplateLibrary.tsx
import React, { useState, useEffect } from 'react';
import { NoteTemplate } from '../types/template.types';
import { templatesAPI } from '../api/templates';
import TemplateCard from './TemplateCard';
import TemplatePreview from './TemplatePreview';

const TemplateLibrary: React.FC = () => {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await templatesAPI.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  };

  const handleUseTemplate = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const handleConfirmTemplate = async (customizedContent: any) => {
    try {
      // 调用创建笔记接口，与云同步（任务五）接轨
      const note = await templatesAPI.createNoteFromTemplate({
        templateId: selectedTemplate!.id,
        content: customizedContent
      });
      
      // 触发全局事件，通知其他模块刷新
      window.dispatchEvent(new CustomEvent('noteCreated', { detail: note }));
      
      setShowPreview(false);
      // 跳转到笔记编辑页
      window.location.href = `/notes/${note.id}`;
    } catch (error) {
      console.error('创建笔记失败:', error);
    }
  };

  return (
    <div className="template-library">
      <div className="template-header">
        <h2>笔记模板库</h2>
        <button className="custom-template-btn">+ 自定义模板</button>
      </div>
      
      <div className="template-categories">
        <button className="category-btn active">全部</button>
        <button className="category-btn">工作</button>
        <button className="category-btn">学习</button>
        <button className="category-btn">个人</button>
      </div>
      
      <div className="template-grid">
        {templates.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            onUse={() => handleUseTemplate(template)}
          />
        ))}
      </div>
      
      {showPreview && selectedTemplate && (
        <TemplatePreview
          template={selectedTemplate}
          onConfirm={handleConfirmTemplate}
          onCancel={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};