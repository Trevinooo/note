const fetch = require('node-fetch');
const db = require('../db');

function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : '';
}

// 获取 AI 配置：只使用系统级配置（管理员在后台设置）
function getAIConfig(userId) {
    return {
        provider: getSetting('ai_provider') || 'deepseek',
        apiKey: getSetting('ai_api_key'),
        model: getSetting('ai_model') || 'deepseek-chat',
        baseUrl: getSetting('ai_base_url') || 'https://api.deepseek.com',
    };
}

async function callAI(prompt, systemPrompt, userId) {
    const config = getAIConfig(userId);

    if (!config.apiKey) {
        return { success: false, message: '未配置 AI API Key，请在"我的"页面中配置你的 API Key' };
    }

    // 延迟函数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Coze v3 异步 API 调用（POST /v3/chat → 轮询 /v3/chat/retrieve → /v3/chat/message/list）
    async function callCozeAPI(config, headers, prompt, userId) {
        // 1. 发起对话
        const chatUrl = `${config.baseUrl}/v3/chat`;
        const chatBody = {
            bot_id: config.model,
            user_id: String(userId),
            stream: false,
            auto_save_history: true,
            additional_messages: [
                { role: 'user', content: prompt, content_type: 'text' }
            ]
        };

        const chatRes = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(chatBody),
            timeout: 30000
        });
        const chatData = await chatRes.json();

        if (chatData.code !== 0 || !chatData.data) {
            return { success: false, message: chatData.msg || 'Coze 发起对话失败' };
        }

        const chatId = chatData.data.id;
        const conversationId = chatData.data.conversation_id;

        // 2. 轮询等待完成
        const retrieveUrl = `${config.baseUrl}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`;
        let status = chatData.data.status;
        let retries = 0;
        const maxRetries = 30; // 最多等待 60 秒

        while (status !== 'completed' && status !== 'failed' && retries < maxRetries) {
            await sleep(2000);
            const pollRes = await fetch(retrieveUrl, { method: 'GET', headers, timeout: 10000 });
            const pollData = await pollRes.json();
            if (pollData.code !== 0) {
                return { success: false, message: pollData.msg || 'Coze 轮询失败' };
            }
            status = pollData.data?.status;
            retries++;
        }

        if (status === 'failed') {
            return { success: false, message: 'Coze 对话处理失败' };
        }
        if (status !== 'completed') {
            return { success: false, message: 'Coze 对话超时' };
        }

        // 3. 获取消息列表
        const msgUrl = `${config.baseUrl}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`;
        const msgRes = await fetch(msgUrl, { method: 'GET', headers, timeout: 10000 });
        const msgData = await msgRes.json();

        if (msgData.code !== 0 || !msgData.data) {
            return { success: false, message: msgData.msg || 'Coze 获取消息失败' };
        }

        const answer = msgData.data.find(m => m.role === 'assistant' && m.type === 'answer');
        if (answer && answer.content) {
            return { success: true, content: answer.content };
        }

        return { success: false, message: 'Coze 未返回有效回答' };
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        };

        // Coze 需要特殊处理：异步 API + 轮询
        if (config.provider === 'coze') {
            return await callCozeAPI(config, headers, prompt, userId);
        }

        // OpenAI 兼容接口
        const url = `${config.baseUrl}/v1/chat/completions`;
        const body = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt || '你是一个智能笔记助手。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            timeout: 60000
        });
        const data = await response.json();

        if (data.choices && data.choices[0]) {
            return { success: true, content: data.choices[0].message.content };
        }
        return { success: false, message: data.error?.message || 'AI 返回异常' };
    } catch (e) {
        return { success: false, message: `AI 调用失败: ${e.message}` };
    }
}

async function summarize(content, userId) {
    return callAI(
        `请为以下内容生成一个简洁的摘要（不超过150字）：\n\n${content}`,
        '你是一个笔记摘要助手，请用简洁的中文生成摘要。',
        userId
    );
}

async function classify(content, userId) {
    return callAI(
        `请为以下内容选择一个最合适的分类标签，只返回标签名称（如：工作、学习、生活、灵感、待办）：\n\n${content}`,
        '你是一个笔记分类助手，只返回分类标签名称，不要其他内容。',
        userId
    );
}

async function extractTodos(content, userId) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return callAI(
        `当前日期和时间是：${todayStr} ${timeStr}。请从以下内容中提取所有待办事项，以JSON数组格式返回，每项包含 title（标题）和 start_time（建议时间，格式YYYY-MM-DD HH:mm，如果内容中提到"今天"则使用日期${todayStr}，如果提到"明天"则使用明天的日期，如无法确定日期则使用${todayStr}作为默认日期）和 scene（场景：学习/工作/生活）：\n\n${content}`,
        '你是一个待办事项提取助手，请以JSON数组格式返回结果。只输出JSON，不要其他内容。注意：所有时间必须使用完整的 YYYY-MM-DD HH:mm 格式。',
        userId
    );
}

// 从语音转录文本中提取“时间 + 事件”，用于自动创建闹钟/日程
async function extractScheduleFromTranscript(transcript, userId) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return callAI(
        `当前日期和时间是：${todayStr} ${timeStr}。\n` +
        `请从下面的语音转录文本中提取用户想要“提醒/闹钟/日程”的信息，输出JSON数组。\n` +
        `每一项包含字段：\n` +
        `- title: 事件标题（必填，尽量简短）\n` +
        `- description: 事件描述（可为空字符串）\n` +
        `- start_time: 开始时间（格式YYYY-MM-DD HH:mm；若只提到日期不提时间，默认 09:00；若只提到时间不提日期，默认使用${todayStr}；若提到“今天/明天/后天/下周X”等，请据当前日期推算）\n` +
        `- end_time: 结束时间（同格式；不确定则为null）\n` +
        `- remind_at: 提醒时间（同格式；如果文本里有“提前10分钟/提前半小时”等，请计算；否则默认等于start_time；不确定则为null）\n` +
        `- confidence: 0到1之间的小数，表示你对时间提取的置信度（不确定就低一些）\n` +
        `规则：\n` +
        `1) 如果文本里没有任何明确/可推断的提醒时间，则返回空数组[]。\n` +
        `2) 只输出JSON，不要输出解释、Markdown、代码块。\n\n` +
        `转录文本：\n${transcript}`,
        `你是一个中文时间与事件抽取助手。你只输出严格JSON数组，不要输出任何多余文本。所有时间都必须是 YYYY-MM-DD HH:mm 格式或 null。`,
        userId
    );
}

async function planSchedule(content, userId) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return callAI(
        `当前日期和时间是：${todayStr} ${timeStr}。请根据以下内容，帮我规划一份详细的日程安排。请考虑：
1. 任务优先级和截止时间
2. 合理安排工作、学习、生活的时间
3. 预留休息和缓冲时间

请以JSON数组格式返回，每项包含：
- title（事项标题）
- start_time（建议开始时间，格式YYYY-MM-DD HH:mm，如果内容提到"今天"则使用${todayStr}，提到"明天"则使用明天的日期）
- scene（场景：学习/工作/生活）
- priority（优先级：高/中/低）
- duration（预计时长，如"1小时"）

内容如下：\n\n${content}`,
        `你是一个智能日程规划助手，擅长帮用户科学安排时间。当前日期是${todayStr}，请基于此日期安排日程。只输出JSON数组，不要其他内容。`,
        userId
    );
}

async function generateMindMap(content, userId) {
    return callAI(
        `请将以下笔记内容转化为思维导图结构。以JSON格式返回，格式如下：
{
  "title": "中心主题",
  "children": [
    {
      "title": "分支1",
      "children": [
        { "title": "子项1" },
        { "title": "子项2" }
      ]
    },
    {
      "title": "分支2",
      "children": [
        { "title": "子项3" }
      ]
    }
  ]
}

要求：
1. 提取核心主题作为中心节点
2. 按逻辑层次组织为2-3层结构
3. 每个分支不超过5个子节点
4. 标题简洁明了

笔记内容如下：\n\n${content}`,
        '你是一个思维导图生成助手。请严格按JSON格式返回思维导图结构，只输出JSON，不要其他内容。',
        userId
    );
}

async function generateKnowledgeGraph(notes, userId) {
    const notesSummary = notes.map((n, i) => `[笔记${i + 1}] ${n.title}: ${n.content?.substring(0, 200)}`).join('\n');
    return callAI(
        `请分析以下多篇笔记，提取知识点之间的关联关系，生成知识图谱数据。以JSON格式返回：
{
  "nodes": [
    { "id": "1", "label": "知识点名称", "category": "分类", "size": 1 }
  ],
  "edges": [
    { "source": "1", "target": "2", "label": "关系描述" }
  ]
}

要求：
1. 提取5-15个核心知识点作为节点
2. 节点的size表示重要程度(1-3)
3. 分析知识点之间的逻辑关系(如：包含、依赖、相关、引申等)
4. category为：概念、方法、工具、人物、事件之一

笔记内容：\n\n${notesSummary}`,
        '你是一个知识图谱分析助手。请严格按JSON格式返回知识图谱数据，只输出JSON，不要其他内容。',
        userId
    );
}

module.exports = { callAI, summarize, classify, extractTodos, extractScheduleFromTranscript, planSchedule, generateMindMap, generateKnowledgeGraph };
