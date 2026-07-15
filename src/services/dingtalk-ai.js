/**
 * 钉钉消息 AI 智能层
 * 三大能力：
 *   1. analyzeMessage(conv)  — 结构化解读（核心诉求/需完成工作/截止时间/协作对象/风险点）
 *   2. suggestReply(conv)    — 以「实名 AI 助理」口吻生成回复建议
 *   3. extractTasks(conv)    — 提取可执行任务（JSON），供待办入库
 *
 * 依赖：window.aiService（统一模型接入，未配 Key 时走 mock）
 */
(function() {

  /** 读取 skill1 的可编辑规则（用户在技能中心改过就用改后的） */
  function _rules() {
    try {
      const r = window.skillService && window.skillService.getRules && window.skillService.getRules();
      return (r && r.trim()) ? r : '';
    } catch (e) { return ''; }
  }

  /** 读取"参考规范"（对话中沉淀的独立规范技能），作为机器人回复的参考依据 */
  function _referenceRules() {
    try {
      const r = window.skillService && window.skillService.getReferenceRules && window.skillService.getReferenceRules();
      return (r && r.trim()) ? r : '';
    } catch (e) { return ''; }
  }

  class DingTalkAIService {
    /** 把会话消息拼成上下文文本（只取最近 N 条，保证多轮记忆又不至于无限膨胀） */
    _ctx(conv, limit = 24) {
      const all = conv.messages || [];
      const recent = all.slice(-limit);
      const omitted = all.length - recent.length;
      const msgs = recent.map(m => `${m.sender || '对方'}: ${m.content}`).join('\n');
      const head = omitted > 0 ? `（已省略更早的 ${omitted} 条消息）\n` : '';
      return `【会话】${conv.name}（${conv.type === 'group' ? '群聊' : '单聊'}）\n【消息记录】\n${head}${msgs}`;
    }

    /**
     * 结构化解读：输出 5 要素 JSON
     * @returns {Promise<{coreNeed,work,deadline,collaborators,risks,replyHint}>}
     */
    async analyzeMessage(conv) {
      const prompt = `你是哈啰两轮设计师的 AI 助理。请解读下面这段钉钉对话，提取关键信息。

${this._ctx(conv)}

仅输出严格 JSON（不要 markdown 包裹、不要多余解释），字段如下：
{
  "coreNeed": "对方这条消息的核心诉求，一句话",
  "work": "我方需要完成的具体工作，没有则填 无",
  "deadline": "截止时间，能推断就写具体时间，否则填 未明确",
  "collaborators": "涉及的协作对象（人/角色），没有则填 无",
  "risks": "潜在风险点或需要注意的地方，没有则填 无",
  "replyHint": "建议如何回复的一句话提示"
}`;
      const raw = await window.aiService.send([
        { role:'system', content:'你是高效的消息解读助手，只输出 JSON。' },
        { role:'user', content: prompt },
      ]);
      return _parseObj(raw);
    }

    /**
     * 生成回复建议（实名 AI 助理口吻，不冒充真人）
     * @param {object} conv
     * @param {string} [robotName] - 助理名称，用于落款语气
     * @param {object} [opts] - { allowChitchat:boolean } 是否允许无关话题自由闲聊（偏好设置「允许闲聊」）
     * @returns {Promise<string>}
     */
    async suggestReply(conv, robotName, opts = {}) {
      const lastMsg = (conv.messages || [])[conv.messages.length - 1] || {};
      // 默认允许闲聊；仅当显式传 false 时关闭
      const allowChitchat = opts.allowChitchat !== false;
      // B 类（与哈啰无关）话题的处理方式：允许闲聊 → 通用 AI 自由回答；否则礼貌婉拒
      const bClassRule = allowChitchat
        ? '【B 类处理方式】直接切换成「通用 AI 助手」模式，像正常聊天 AI 一样自由、友好、有帮助地回答，**不受设计/哈啰范围限制**，知无不言。严禁用「这不属于我的职责」「已记录会跟进」或硬把话题拉回设计来敷衍。'
        : '【B 类处理方式】你目前只聚焦哈啰工作相关话题。请用一句友好、简短的话礼貌说明「我主要负责设计和工作相关的事，这类话题帮不上忙哦」，可自然地把话题引回工作，但不要生硬。不要展开回答该无关话题。';
      const prompt = `你是设计师的「实名 AI 助理」${robotName ? '「' + robotName + '」' : ''}，正在替设计师回复同事的钉钉消息。
要求：简洁专业友好。

【话题判断（最优先）】先判断同事这条消息属于哪一类：
- A 类｜与哈啰工作相关：设计规范/尺寸/色值/命名/交付格式、素材、需求、项目协作、公司事务等。
- B 类｜与哈啰工作无关：闲聊、通用知识、生活娱乐、编程技术、情感倾诉、时事百科、脑筋急转弯等。

${bClassRule}

【A 类处理方式】按下面规则回答：
- 凡是你能回答的问题都要直接、具体地回答，不要推诿：设计规范/尺寸/色值/命名规范、交付格式、常见流程与工具用法，以及关于你自己的问题（你是谁、你能做什么、你用的是什么模型等，可如实说明你是基于大模型的设计助理）。
- 只有真正需要设计师本人拍板的事项（对外时间承诺、方案审批、优先级排期、需求变更确认）才礼貌说明「已记录，会尽快跟进」，且不要擅自承诺具体时间点。
- 严禁把本可以直接回答的问题也用「已记录，会尽快跟进」搪塞过去。

不论 A/B 类，都不要冒充设计师本人，必要时可表明自己是助理。

${this._ctx(conv)}

【最新消息】${lastMsg.sender || '对方'}: ${lastMsg.content || ''}

请直接输出回复正文，不要加引号或前缀：`;
      const rules = _rules();
      // 系统提示：设计规则仅约束「哈啰工作相关(A类)」话题
      const scopeNote = allowChitchat
        ? '\n\n【适用范围】以上规则仅适用于与哈啰工作/设计相关的话题；当同事的消息与哈啰无关（闲聊、通用知识、生活、编程等）时，请忽略上述范围限制，切换为通用 AI 助手，正常自由地对话。'
        : '\n\n【适用范围】你只聚焦哈啰工作/设计相关话题；与哈啰无关的话题一律礼貌婉拒，不展开回答。';
      let sys = rules
        ? ('你是哈啰设计团队成员的实名 AI 助理。请在处理「哈啰工作相关」话题时严格遵循以下【机器人回复规则】：\n\n' + rules + scopeNote)
        : (allowChitchat
            ? '你是哈啰设计团队成员的实名 AI 助理。处理哈啰工作相关话题时简洁专业；遇到与哈啰无关的话题时，切换为通用 AI 助手，正常自由地对话，不受设计范围限制。'
            : '你是哈啰设计团队成员的实名 AI 助理，只聚焦哈啰工作/设计相关话题，与哈啰无关的话题礼貌婉拒、不展开回答。');
      // 参考规范：对话中沉淀的独立规范技能，作为回复的参考依据（命中相关话题时优先遵循）
      const refRules = _referenceRules();
      if (refRules) {
        sys += '\n\n【参考规范（团队/同事在对话中沉淀，回复相关话题时请优先参考并遵循）】\n\n' + refRules;
      }
      return await window.aiService.send([
        { role:'system', content: sys },
        { role:'user', content: prompt },
      ]);
    }

    /**
     * 语言润色：把"模板式/机械"的回复，用接入的 AI 模型改写成自然、口语、符合助理人设的表达。
     * 严格保留事实/数字/链接/Markdown 结构，不新增或删除信息。模型失败/超时则原样返回，绝不阻断发送。
     * @param {string} text
     * @param {object} [opts] - { persona }
     * @returns {Promise<string>}
     */
    async polishReply(text, opts = {}) {
      const t = String(text == null ? '' : text).trim();
      if (!t) return text;
      // 未配置模型（mock）时不润色，直接原样返回，避免把 mock 文案套进去
      if (!window.aiService || window.aiService.useMock) return t;
      const persona = opts.persona || '哈啰两轮设计团队的实名 AI 助理「小哈」';
      const sys = `你是${persona}。请把下面这条要发给对方的回复，改写得更自然、口语、友好专业，像真人助理在钉钉上聊天，而不是机械的自动回复。
严格要求：
1. 不改变任何事实、数字、链接、图片占位；所有 http(s) 链接必须原样保留、不得改写或省略。
2. 不新增信息、不遗漏关键信息、不做额外解释。
3. 保留原有的 Markdown/换行结构；简洁，别啰嗦。
只输出改写后的正文，不要加引号、不要前后缀说明。`;
      try {
        const out = await window.aiService.send([
          { role: 'system', content: sys },
          { role: 'user', content: t },
        ]);
        const r = String(out || '').trim();
        // 润色结果必须仍包含原文中的链接，否则视为失真，回退原文
        const urls = t.match(/https?:\/\/[^\s)）】]+/g) || [];
        if (urls.some(u => !r.includes(u))) return t;
        return r || t;
      } catch (e) {
        return t;
      }
    }

    /**
     * 参考规范优先应答：判断沉淀的规范里是否有条目【明确规定了该如何回复当前这条消息】，
     * 若有则直接按规范生成回复（用于在素材检索等专门流程之前做规则短路）。
     * @param {object} conv
     * @param {string} [refRules] - 参考规范文本，缺省时自动读取
     * @returns {Promise<{matched:boolean, reply?:string}>}
     */
    async applyReferenceRules(conv, refRules) {
      const rules = (refRules != null ? refRules : _referenceRules()) || '';
      if (!rules.trim()) return { matched: false };
      const last = (conv.messages || [])[conv.messages.length - 1] || {};
      const prompt = `下面是团队沉淀的【参考规范】。请判断：针对同事最新这条消息，是否有某条规范【明确规定了应当怎么回复 / 怎么处理】。
- 若有：请严格按该规范生成给同事的回复正文（例如该发的链接、该给的标准口径），输出 {"matched":true,"reply":"回复正文"}。
- 若没有任何规范明确适用于这条消息：输出 {"matched":false}。
判定要严格：只有当规范直接命中当前消息的场景时才 matched=true，不要牵强附会。只输出 JSON，不要多余文字或 markdown 包裹。

【参考规范】
${rules}

${this._ctx(conv, 6)}

【最新消息】${last.sender || '对方'}: ${last.content || ''}`;
      const raw = await window.aiService.send([
        { role: 'system', content: '你是严谨的规则匹配器，只在规范明确适用于当前消息时判定 matched=true，只输出 JSON。' },
        { role: 'user', content: prompt },
      ]);
      const obj = _parseObj(raw);
      return { matched: !!(obj && obj.matched), reply: obj && obj.reply ? String(obj.reply) : '' };
    }

    /**
     * AI 意图路由：根据当前任务状态 + 最新消息，判断该执行哪个动作并抽参数
     * @param {object} conv
     * @param {object} ctx - { hasTask, status, hasCandidates, hasResult, taskName }
     * @returns {Promise<{action,keyword,instruction,index,answer}>}
     */
    async decideAction(conv, ctx = {}) {
      const last = (conv.messages || [])[conv.messages.length - 1] || {};
      const stateLines = [
        `是否有进行中的素材任务：${ctx.hasTask ? '是' : '否'}`,
        ctx.hasTask ? `任务状态：${ctx.status || ''}` : '',
        ctx.hasTask ? `任务主题：${ctx.taskName || ''}` : '',
        ctx.hasCandidates ? '刚给用户展示了 2 个候选素材，正等他选择（第一个/第二个/都不对）' : '',
        ctx.hasResult ? '已有改好的结果图，可直接发送或继续修改' : '',
      ].filter(Boolean).join('\n');
      const prompt = `你是哈啰设计素材助手的「意图路由器」。请根据【当前状态】和【用户最新消息】，判断应执行哪个动作，并抽取参数。

【当前状态】
${stateLines}

【最近对话】
${this._ctx(conv, 8)}

【用户最新消息】${last.sender || '对方'}: ${last.content || ''}

可选 action（只能选一个，务必先判断用户的真实意图，不要一看到图片就当改图）：
- analyze：让你【分析/总结/梳理/解读/提取需求/看懂】某张图或某段内容（重点：用户想要"理解"，不是要你改图）。
- search：找素材 / 查询"有没有、有几张、有哪些"某类素材。keyword=检索关键词（只保留节日/主题/活动/产品/素材类型，去掉寒暄和修饰词）
- select：从刚才展示的候选里做选择。index=1 或 2
- edit：对当前选中素材/图片做单张修改（改文案、换配色、改尺寸等）。instruction=具体修改要求
- batch_edit：对整组素材批量修改。instruction=具体修改要求
- send：把当前已改好的结果图直接发给用户
- export：定稿 / 导出最终文件
- chat：以上都不是（寒暄、与素材无关的问题、需要人来确认的事）

判断要点：
- 带了图片但用户说的是"分析/看看/这是什么/有哪些需求" → analyze，不是 edit。
- 带了图片且用户明确要"改/换/调整/加/去掉" → edit / batch_edit。
- 只有找/查某类素材才是 search。

仅输出严格 JSON（不要解释、不要 markdown）：
{"action":"analyze|search|select|edit|batch_edit|send|export|chat","keyword":"","instruction":"","index":0}`;
      try {
        // 意图路由要快：给 15s 短超时，网关慢/网络抖动时快速失败，交由关键词兜底（避免干等 40s 再敷衍）
        const raw = await window.aiService.send([
          { role: 'system', content: '你是意图路由器，只输出严格 JSON。' },
          { role: 'user', content: prompt },
        ], { timeout: 15000 });
        const obj = _parseObj(raw);
        if (!obj || !obj.action) return { action: 'chat' };
        return obj;
      } catch (e) {
        return { action: 'chat' };
      }
    }

    /**
     * 提取可执行任务
     * @returns {Promise<Array<{title,priority,deadline}>>}
     */
    async extractTasks(conv) {
      const prompt = `从下面的钉钉对话中提取「我方需要做的事项/行动项」，包括交付内容、需确认事项、时间节点。按优先级排序。

${this._ctx(conv)}

仅输出严格 JSON 数组，不要任何额外说明或 markdown：
[{"title":"...","priority":"high|medium|low","deadline":"YYYY-MM-DD HH:mm 或 null"}]
没有可提取的事项时返回 []`;
      const raw = await window.aiService.send([
        { role:'system', content:'你是高效的待办提取助手，只输出 JSON 数组。' },
        { role:'user', content: prompt },
      ]);
      return _parseArr(raw);
    }
  }

  /** 解析 AI 返回的 JSON 对象（容错 markdown 包裹） */
  function _parseObj(raw) {
    if (!raw) return {};
    let t = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s === -1 || e === -1 || e < s) return {};
    try { return JSON.parse(t.slice(s, e + 1)) || {}; } catch (err) { return {}; }
  }

  /** 解析 AI 返回的 JSON 数组（容错 markdown 包裹） */
  function _parseArr(raw) {
    if (!raw) return [];
    let t = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const s = t.indexOf('['), e = t.lastIndexOf(']');
    if (s === -1 || e === -1 || e < s) return [];
    try {
      const arr = JSON.parse(t.slice(s, e + 1));
      return Array.isArray(arr) ? arr.filter(x => x && typeof x.title === 'string' && x.title.trim()) : [];
    } catch (err) { return []; }
  }

  window.DingTalkAIService = DingTalkAIService;
})();
