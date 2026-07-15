/**
 * 规范捕获服务 RuleCaptureService
 *
 * 场景：对话中使用者 / 同事「明确要求以后遵循某一套规范/规则/标准」时，
 *       自动把其中的规则条目完整抽取出来，新增为一个用户自定义 Skill（持久化）。
 *
 * 设计：
 *  1. 先用关键词做初筛（looksLikeRuleRequest），避免每条消息都消耗一次 AI 调用；
 *  2. 命中后用 AI 判定 + 结构化抽取（_extract），把规则整理成 Markdown；
 *  3. 调 SkillService.upload() 落库，systemPrompt 承载完整规则正文；
 *  4. 通过 onCapture 事件通知 UI（与 UI 解耦）。
 *
 * 无模型 / mock 模式下走本地兜底（_localFallback），直接把消息正文存为规则。
 */
(function() {
  // 按来源区分的两个规范合集：私聊(自己主动新增) 与 群聊(同事对话沉淀)，分开存放避免互相污染
  const COLLECTIONS = {
    self:  { id: 'rule_collection_self',  name: '我的规范',     icon: '📘', desc: '我主动沉淀的规范，可持续追加' },
    group: { id: 'rule_collection_group', name: '同事沉淀规范', icon: '📗', desc: '群聊中同事对话沉淀的规范，可持续追加' },
  };

  class RuleCaptureService {
    /**
     * @param {object} skillService - SkillService 实例（必填）
     * @param {object} [aiService]  - AIService 实例，缺省取 window.aiService
     */
    constructor(skillService, aiService) {
      if (!skillService) throw new Error('RuleCaptureService 需要 skillService');
      this.skills = skillService;
      this.ai = aiService || window.aiService;
      this.listeners = new Set();
      // 会话内去重：同一段规范文本短时间内只捕获一次，避免重复建 skill
      this._recent = new Map();   // 规范文本指纹 -> 时间戳
      window.ruleCaptureService = this;
    }

    /**
     * 订阅"已捕获规范"事件；回调签名 (skill, meta)，
     * meta = { mode:'append'|'new', ruleName }
     * 返回取消订阅函数
     */
    onCapture(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit(skill, meta) { this.listeners.forEach(fn => { try { fn(skill, meta || {}); } catch (e) { /* 忽略监听器异常 */ } }); }

    /**
     * 关键词初筛：判断这条消息是否像"要求遵循某规范"
     * 需同时命中「触发动词」与「规范类名词」，尽量减少误触发。
     * @param {string} text
     * @returns {boolean}
     */
    looksLikeRuleRequest(text) {
      if (!text || typeof text !== 'string') return false;
      const t = text.trim();
      if (t.length < 12) return false;   // 太短基本不是完整规范

      // 1) 显式规范措辞：触发词 + 规范类名词
      const trigger = /(遵循|遵守|严格按照|请按照|务必按照|按此规范|以下规范|以下规则|以下要求|这套规范|这份规范|规范如下|规则如下|要求如下|统一(?:要求|规范|标准)|一律|必须(?:遵守|遵循|按))/;
      const noun = /(规范|规则|标准|要求|约定|准则|守则|指南|规约|SOP|流程)/;
      if (trigger.test(t) && noun.test(t)) return true;

      // 2) 条件式常驻指令：当/每当/凡是/只要/如果/若/一旦 …… 就/则/将/请/需/应/统一/一律/直接/默认/发送/回复/使用/遵循/按
      //    覆盖"当有同事询问X时，将Y发送给他"这类自然表达的规则
      const conditional = /(当|每当|凡是|只要|如果|若|一旦)[^。\n]{2,80}?(就|则|将|请|需|应|统一|一律|直接|默认|发送|回复|使用|遵循|按|回答|告诉)/;
      if (conditional.test(t)) return true;

      // 3) 常驻性指令：以后/后续/今后/之后/往后/从现在起 …… 都/请/要/需/统一/一律/直接/默认
      const standing = /(以后|后续|今后|之后|往后|下次起|从现在起|从今天起)[^。\n]{0,50}(都|请|要|需|统一|一律|直接|默认|记住|遵循|按)/;
      if (standing.test(t)) return true;

      return false;
    }

    /**
     * 显式"手动沉淀"意图：同事/使用者明确要求把规范存/记成技能
     * 命中示例：把这套规范记下来 / 存成技能 / 沉淀成 skill / 收藏这个规则
     * @param {string} text
     * @returns {boolean}
     */
    looksLikeManualSave(text) {
      const t = String(text || '');
      // 1) 存/记/沉淀/收藏 …… 规范/规则/技能
      if (/(记(?:住|下|录)|存(?:一?下|成|起来|档)?|沉淀|收藏|保存|加入)[^。\n]{0,12}(规范|规则|标准|要求|约定|技能|skill)/i.test(t)) return true;
      // 2) 规范/规则 …… 记/存/沉淀/收藏
      if (/(规范|规则|标准|要求|约定)[^。\n]{0,12}(记(?:住|下|录)|存(?:一?下|成|起来|档)?|沉淀|收藏|保存|存成技能)/.test(t)) return true;
      // 3) 新增/添加/新建/录入/登记 …… 规则/规范/条目（如"按照上面的规范新增规则"）
      if (/(新增|添加|新建|加(?:一?条)?|录入|登记|记录|沉淀)[^。\n]{0,8}(规则|规范|条目|要求|约定)/.test(t)) return true;
      // 4) 按照/根据/把/将 …… 规范/规则 …… 新增/添加/记/存/录入
      if (/(按照?|根据|把|将)[^。\n]{0,20}(规范|规则|标准|要求|约定)[^。\n]{0,10}(新增|添加|新建|记|存|录入|沉淀|保存|加入)/.test(t)) return true;
      return false;
    }

    /**
     * 从一段文本尝试捕获规范并创建 Skill（供聊天/钉钉等入口非阻塞调用）
     * @param {string} text - 使用者/同事的原始消息
     * @param {object} [opts]
     * @param {boolean} [opts.force] - 跳过关键词初筛，直接交给 AI 抽取（手动沉淀场景用）
     * @returns {Promise<{created:boolean, mode?:'append'|'new', skill?:object, reason?:string}>}
     */
    async captureFromText(text, opts) {
      const force = !!(opts && opts.force);
      const context = (opts && opts.context) || '';
      // 来源：'group'=群聊同事沉淀 / 'self'=自己私聊主动新增（默认）
      const source = (opts && opts.source === 'group') ? 'group' : 'self';
      if (!force && !this.looksLikeRuleRequest(text)) return { created: false, reason: 'no-trigger' };
      // 短时去重（含上下文，避免"记下来"这类空指令彼此撞指纹）
      const fp = this._fingerprint(text + '|' + context);
      const now = Date.now();
      const last = this._recent.get(fp);
      if (last && (now - last) < 5 * 60 * 1000) return { created: false, reason: 'duplicate' };

      let parsed;
      try {
        parsed = await this._extract(text, context);
      } catch (e) {
        console.warn('[ruleCapture] 抽取失败:', e && (e.message || e));
        return { created: false, reason: 'extract-failed' };
      }
      if (!parsed || !parsed.isRule || !parsed.rules) return { created: false, reason: 'not-rule' };

      this._recent.set(fp, now);
      const ruleName = parsed.name || '自定义规范';
      // 结构化 matcher：命中触发词即可本地直接回复，不依赖模型（更快更稳）
      const matcher = this._normMatcher(parsed.matcher, parsed.rules);

      // 默认：追加到同一个「规范合集」技能；仅当消息明确要求新建时才单独建 skill
      if (this._wantsNewSkill(text)) {
        const skill = this.skills.upload({
          name: ruleName,
          icon: parsed.icon || '📐',
          desc: parsed.desc || '从对话中捕获的规范',
          category: 'rule',
          inputs: [
            { key: 'query', label: '按此规范帮我处理什么？', placeholder: '描述你的需求…', type: 'textarea' },
          ],
          prompt: '请严格遵循以上规范，处理下面的请求，并说明关键决策依据：\n\n{{query}}',
          systemPrompt: parsed.rules,
          ruleMatchers: matcher ? [matcher] : [],
        });
        this._emit(skill, { mode: 'new', ruleName });
        return { created: true, mode: 'new', skill };
      }

      const skill = this._appendToCollection(parsed, matcher, source);
      this._emit(skill, { mode: 'append', ruleName, source });
      return { created: true, mode: 'append', source, skill };
    }

    /**
     * 规范化 AI 给出的 matcher：{ keywords:[...], reply:'...' }
     * 无效时返回 null；缺 reply 但有链接时用规则正文兜底一个回复
     * @param {*} m - AI 输出的 matcher
     * @param {string} [rules] - 规则正文（兜底提取链接）
     * @returns {{keywords:string[], reply:string}|null}
     */
    _normMatcher(m, rules) {
      let keywords = [];
      let reply = '';
      if (m && Array.isArray(m.keywords)) keywords = m.keywords.map(k => String(k || '').trim()).filter(Boolean).slice(0, 8);
      if (m && m.reply) reply = String(m.reply).trim();
      if (!reply && rules) {
        // 兜底：规则里有链接则拼一句标准引导
        const url = String(rules).match(/https?:\/\/[^\s)）】]+/);
        if (url) reply = `相关资源可以到这里获取：${url[0]}`;
      }
      if (!keywords.length || !reply) return null;
      return { keywords, reply };
    }

    /**
     * 是否明确要求"新建 / 单独建"一个技能
     * 命中示例：新建一个skill / 单独建个技能 / 另存为新规范 / 新开一个技能
     * @param {string} text
     * @returns {boolean}
     */
    _wantsNewSkill(text) {
      const t = String(text || '');
      return /(新建|新增|单独|另(?:建|存|外)|另开|新开|重新|创建|建(?:一)?个)[^。\n]{0,8}(skill|技能|规范技能|规则技能)/i.test(t);
    }

    /**
     * 把一条规范追加到「规范合集」技能中（不存在则先创建）。
     * @param {{name?:string, rules:string}} parsed
     * @returns {object} 更新后的合集 skill
     */
    _appendToCollection(parsed, matcher, source) {
      const col = COLLECTIONS[source] || COLLECTIONS.self;
      const existing = this.skills.get(col.id);
      const when = new Date().toLocaleString('zh-CN');
      // 单条规范片段：用二级标题分节，便于合集里区分多条规范来源
      const section = `## ${parsed.name || '规范'}（${when}）\n\n${String(parsed.rules).trim()}`;

      let systemPrompt;
      if (existing && existing.systemPrompt && existing.systemPrompt.trim()) {
        systemPrompt = existing.systemPrompt.trim() + '\n\n---\n\n' + section;
      } else {
        systemPrompt = `# ${col.name}\n\n> ${col.desc}。执行时作为系统规则遵循。\n\n---\n\n${section}`;
      }

      // 累积 matcher：保留已有的，追加本次新抽取的
      const prevMatchers = (existing && Array.isArray(existing.ruleMatchers)) ? existing.ruleMatchers : [];
      const ruleMatchers = matcher ? prevMatchers.concat([matcher]) : prevMatchers;

      return this.skills.upload({
        id: col.id,
        name: col.name,
        icon: col.icon,
        desc: col.desc,
        category: 'rule',
        inputs: [
          { key: 'query', label: '按这些规范帮我处理什么？', placeholder: '描述你的需求…', type: 'textarea' },
        ],
        prompt: `请严格遵循以上「${col.name}」中的相关规范，处理下面的请求，并说明关键决策依据：\n\n{{query}}`,
        systemPrompt,
        ruleMatchers,
      });
    }

    /** 文本指纹（去重用）：压缩空白后取前 120 字 */
    _fingerprint(text) {
      return String(text).replace(/\s+/g, '').slice(0, 120);
    }

    /**
     * AI 判定 + 结构化抽取；mock / 无模型时走本地兜底
     * @param {string} text - 当前这条消息
     * @param {string} [context] - 最近对话上下文（"把刚才那条规范记下来"时规则正文在此）
     * @returns {Promise<{isRule:boolean, name?:string, icon?:string, desc?:string, rules?:string}>}
     */
    async _extract(text, context) {
      const ai = this.ai || window.aiService;
      if (!ai || ai.useMock) return this._localFallback(text, context);

      const sys = [
        '你是"规范抽取助手"。判断【用户指令 + 相关对话上下文】里是否存在一套需要长期遵循的规范/规则/标准/约定。',
        '若用户指令是"把刚才那条规范记下来/存成技能"之类，请从相关对话上下文里找到对应的规则内容。',
        '如果存在：请把所有规则条目【完整、无遗漏】地整理成结构化 Markdown（保留分类、编号、要点、涉及的链接/色值/尺寸等关键信息），并起一个简短的技能名。',
        '若该规范属于"当被问到某类问题时就回复固定内容/发某链接"这种简单映射，请额外给出 matcher：keywords 为最能触发的核心词（2-6个，尽量含具体词如 logo/banner/品牌），reply 为可直接原样发给对方的完整回复话术（含链接与友好语气）。若不是简单映射则 matcher 填 null。',
        '只输出一个 JSON 对象，禁止输出多余文字或代码块标记。',
        '格式：{"isRule":true,"name":"简短技能名(≤20字)","icon":"单个emoji","desc":"一句话简介(≤40字)","rules":"# 规范标题\\n\\n完整规则的markdown正文","matcher":{"keywords":["核心触发词"],"reply":"命中时可直接发给对方的标准回复"}}。',
        '如果只是普通提问 / 闲聊 / 找不到可长期遵循的规范，则输出：{"isRule":false}。',
      ].join('\n');

      const userContent = context
        ? `【用户指令】${text}\n\n【相关对话上下文】\n${context}`
        : text;

      const out = await ai.send([
        { role: 'system', content: sys },
        { role: 'user', content: userContent },
      ]);
      const parsed = this._parseJSON(out);
      // AI 判为规范但没给出 rules 正文时，用原文/上下文兜底，保证"规则全都输入其中"
      if (parsed && parsed.isRule && !parsed.rules) {
        parsed.rules = this._localFallback(text, context).rules;
      }
      return parsed;
    }

    /** 容错解析 AI 返回的 JSON（去 ```json 包裹 + 截取首尾花括号） */
    _parseJSON(raw) {
      if (!raw) return { isRule: false };
      let s = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a < 0 || b < 0 || b < a) return { isRule: false };
      try { return JSON.parse(s.slice(a, b + 1)); }
      catch (e) { console.warn('[ruleCapture] JSON 解析失败:', e && e.message); return { isRule: false }; }
    }

    /**
     * 本地兜底（无 AI）：直接把消息正文作为规则正文，从触发句里提取一个技能名。
     * @param {string} text
     * @returns {{isRule:boolean, name:string, icon:string, desc:string, rules:string}}
     */
    _localFallback(text, context) {
      const t = String(text).trim();
      // 规则正文：优先用当前消息；若当前是"记下来"这类空指令，则用上下文
      const body = (t.length >= 12 && !/^(把|将|帮我|请)?.{0,6}(刚才|上面|上条|那条|这条)/.test(t))
        ? t
        : (context ? String(context).trim() : t);
      let name = '自定义规范';
      const src = body || t;
      const m = src.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,12})(规范|规则|标准|要求|约定|准则|守则|指南|规约|SOP)/);
      if (m) name = (m[1] + m[2]).slice(0, 20);
      const when = new Date().toLocaleString('zh-CN');
      return {
        isRule: true,
        name,
        icon: '📐',
        desc: '从对话中捕获的规范',
        rules: `# ${name}\n\n> 来源：对话中提出的规范要求（${when}）\n\n${body}`,
      };
    }
  }

  window.RuleCaptureService = RuleCaptureService;
})();
