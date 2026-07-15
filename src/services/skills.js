/**
 * Skill 服务
 * 设计师常用技能集合，每个 skill 是 prompt 模板 + 输入参数
 * 支持内置 skills + 用户自定义 skills（持久化到 ~/.hellobike-pet/skills.json）
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'skills.json');

  // skill1：当前机器人的默认回复与操作规则（SKILL.md 样式）
  const RULES_MD = `---
name: 机器人回复规则
description: 哈啰设计助手机器人的默认回复与操作规则
icon: 📋
---

# 哈啰设计助手 · 机器人回复规则

## 一、身份与语气
- 你是哈啰两轮设计中心的「实名 AI 助理」，替设计师回复同事的钉钉消息。
- 简洁、专业、友好；能直接答的就直接答，不要把能答的问题推给"已记录，会尽快跟进"。
- 关于你自己的问题（你是谁、能做什么、用什么模型）如实回答。
- 只有真正需要设计师本人拍板的事（对外时间承诺、方案审批、排期、需求变更）才说"已记录，会尽快跟进"。

## 二、意图路由（先判断再行动）
收到消息先判断意图，再执行对应动作：
- search：找素材 / 询问"有没有、有几张、有哪些"某类素材
- select：从候选里选择（第一个 / 第二个 / 都不对）
- edit：对当前选中素材做单张修改
- batch_edit：对整组素材批量修改
- send：把当前结果图直接发给对方
- export：定稿 / 导出最终文件
- chat：以上都不是（寒暄、与素材无关、需人确认）

## 三、找素材
1. 从整句里提炼核心关键词（节日/主题/活动/产品/素材类型），去掉寒暄修饰词。
2. 调 DesignHub 搜索，做相关性过滤（名称/标签/分类命中关键词），不硬塞无关图。
3. 返回匹配度最高的前 2 项预览图 + 名称，追问"是你需要的吗？可回复第一个/第二个/都不对"。
4. 没找到就如实说明，并给 DesignHub 搜索链接，不虚构结果。
5. 数量类问题（几张/多少）先用文字答"一共 N 张"，再附最匹配的两张。
6. **自行车图片素材专项**：
   - 有**具体车型号或别名**（如 A70、A55、云朵车、好运车、小蓝车…）→ 直接用它搜 DesignHub，把匹配到的**原图下载并发回**；
   - 只是泛泛找「自行车/单车图片」→ 引导到「哈啰车型图库」语雀页按型号查找：https://hellobike.yuque.com/oo30cw/rhhzxr/sexlg9989qy5bdan ；
   - 搜不到或未登录素材库时，也回退到上面的图库链接。

## 四、改图（DesignHub AI 智能改图）
1. **能力来源**：改图统一调用「素材库 DesignHub」的 AI 智能改图能力（接口 /ai/generate-variant，用登录的 dhToken 鉴权），**不是**机器人自建的改图 API，也不直连底层生成模型。行为与在 DesignHub 网页点「AI 智能改图」一致。
   - 调用链路：改图指令 → generateVariant → material:generate-variant(IPC) → dhGenerateVariant → DesignHub /ai/generate-variant。
2. 参考图：对方本条带图优先，其次当前选中素材 / 上一版结果。
3. 默认保持原图的画面比例与尺寸、版式布局、字体层级、配色，以及未提及元素不变；新内容自适应原区域，避免溢出变形。
4. DesignHub 自有素材用相对路径作参考图，避免后端拉取超时。
5. 改完把结果图直接发回，追问"继续调整还是导出？"。

## 五、多轮迭代与版本
- "颜色再深一点 / 再大一点 / 换个色"等跟进指令，基于**上一版结果**继续改，不从原图重来。
- 每次修改保存为新版本，不覆盖前一版，便于回退。

## 六、整组批量
- "整组/全部/所有/都改"等意图，对记住的整组素材逐张改，成功的一起发回，失败的单独列出（部分成功也要如实说明）。

## 七、导出与发送
- "导出 / 直接发给我"时，把本地已有的最新版本图直接发回，不让对方去别处下载。

## 八、上下文记忆
- 同一会话内持续记住：当前任务类型、选中素材、当前版本、历史版本、是否在等确认。
- 用户中断后再来，能识别未完成任务并延续。
- 不同任务用独立 task_id，避免素材/要求串联；无法判断当前指令属于哪个任务时先确认。

## 九、异常与兜底
- DesignHub 不可用 / 无结果 / 无权限 / 下载失败 / 生成失败等，都要明确说明原因并给出可继续的路径，不陷入无回复。
- 禁止在失败时返回虚假的成功结果。
`;

  const SKILLS = [
    {
      id: 'skill1',
      name: '机器人回复规则',
      icon: '📋',
      desc: '当前机器人的默认回复与操作规则（可查看；上传 .md 可新增，删除仅限自定义规则）',
      category: 'rule',
      inputs: [
        { key: 'query', label: '想让我按规则处理什么？', placeholder: '例如：帮我找端午素材 / 把这张图标题改成"送TA免费骑"', type: 'textarea' },
      ],
      prompt: (input) => `请严格遵循以上「机器人回复规则」，处理下面的请求，并按规则的语气与流程回复：\n\n${input.query || ''}`,
      systemPrompt: RULES_MD,
    },
  ];

  const RULES_FILE = path.join(DIR, 'skill1-rules.md');

  class SkillService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.customSkills = this._load();
      this.rules = this._loadRules();   // skill1 的可编辑规则（覆盖默认）
      this.listeners = new Set();
      // 暴露为全局，供 AI 对话层读取当前规则
      window.skillService = this;
    }

    /** 读取已保存的规则；没有则用内置默认 */
    _loadRules() {
      try {
        if (fs.existsSync(RULES_FILE)) {
          const t = fs.readFileSync(RULES_FILE, 'utf-8');
          if (t && t.trim()) return t;
        }
      } catch (e) { console.warn('[SkillService] load rules failed:', e); }
      return RULES_MD;
    }

    /** 当前生效的规则文本（Markdown） */
    getRules() { return this.rules || RULES_MD; }

    /** 保存/更新规则，持久化并通知刷新 */
    saveRules(text) {
      this.rules = (text && text.trim()) ? text : RULES_MD;
      try { fs.writeFileSync(RULES_FILE, this.rules, 'utf-8'); }
      catch (e) { console.warn('[SkillService] save rules failed:', e); }
      this.listeners.forEach(fn => { try { fn(); } catch (e) {} });
      return this.rules;
    }

    /** 恢复默认规则 */
    resetRules() { return this.saveRules(RULES_MD); }

    /**
     * 参考规范：所有"规范类"自定义技能（category==='rule'）的正文拼接。
     * 供机器人回复时作为【参考】注入——不并入 skill1 的核心回复规则，独立存在、可增删改。
     * @returns {string} Markdown 文本；无则返回空串
     */
    getReferenceRules() {
      const parts = [];
      for (const s of this.customSkills) {
        if (s && s.category === 'rule' && s.systemPrompt && s.systemPrompt.trim()) {
          parts.push(`### ${s.icon || '📐'} ${s.name}\n\n${s.systemPrompt.trim()}`);
        }
      }
      return parts.join('\n\n---\n\n');
    }

    /**
     * 按用户消息匹配最相关的技能（供对话时自动读取并应用）。
     * 匹配优先级：
     *   ① 消息里直接点到技能名，或名称去掉"规范/技能/规则/指南/手册"后的核心词 → 命中；
     *   ② 否则按技能名分词与消息的重合度打分，取最高分（需达阈值）。
     * 排除 skill1（那是全局回复规则，本就默认生效）。
     * @param {string} text 用户消息
     * @returns {object|null} 命中的技能（含 name / systemPrompt），无则 null
     */
    findRelevantSkill(text) {
      const t = String(text || '').toLowerCase();
      if (!t.trim()) return null;
      const skills = this.getAll().filter(s => s && s.id !== 'skill1' && s.systemPrompt && String(s.systemPrompt).trim());
      // ① 名称 / 核心词直接命中（用户明确点名，最可靠）
      for (const s of skills) {
        const name = String(s.name || '').toLowerCase().trim();
        if (!name) continue;
        const core = name.replace(/(规范|技能|规则|指南|手册|模板)$/g, '').trim();
        if (t.includes(name) || (core.length >= 2 && t.includes(core))) return s;
      }
      // ② 名称分词重合度打分
      let best = null, bestScore = 0;
      for (const s of skills) {
        const tokens = String(s.name || '').toLowerCase().split(/[\s\/、,，·|]+/).filter(w => w.length >= 2);
        let score = 0;
        for (const w of tokens) if (t.includes(w)) score++;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      return bestScore >= 1 ? best : null;
    }

    /**
     * 本地确定性匹配：命中某条规范的触发词即返回其标准回复（不依赖模型，快且稳）。
     * 优先用捕获时保存的结构化 ruleMatchers；旧规范缺 matcher 时从正文即时推导。
     * @param {string} text - 对方最新消息
     * @returns {string} 命中则返回回复正文，否则空串
     */
    matchReferenceRuleLocally(text) {
      const t = String(text || '').toLowerCase();
      if (!t.trim()) return '';
      for (const s of this.customSkills) {
        if (!s || s.category !== 'rule') continue;
        const matchers = (Array.isArray(s.ruleMatchers) && s.ruleMatchers.length)
          ? s.ruleMatchers
          : this._deriveMatchers(s.systemPrompt);   // 旧规范兜底推导
        for (const m of matchers) {
          if (!m || !Array.isArray(m.keywords) || !m.reply) continue;
          const hit = m.keywords.some(k => k && t.includes(String(k).toLowerCase()));
          if (hit) return String(m.reply);
        }
      }
      return '';
    }

    /**
     * 从规范正文即时推导 matcher（供缺少结构化 matcher 的旧规范兜底）。
     * 规则里含链接 + "询问/关于/涉及 X 相关" 时，取 X 的词作触发词、链接作回复。
     * @param {string} md
     * @returns {Array<{keywords:string[], reply:string}>}
     */
    _deriveMatchers(md) {
      const out = [];
      if (!md) return out;
      const sections = String(md).split(/\n---\n/).map(s => s.trim()).filter(Boolean);
      for (const sec of sections) {
        const urlM = sec.match(/https?:\/\/[^\s)）】]+/);
        if (!urlM) continue;
        const kws = new Set();
        // 英文词（logo/banner 等）——先去掉链接，避免把域名/路径片段(cn/brand/assets)当触发词导致误命中
        const secNoUrl = sec.replace(/https?:\/\/[^\s)）】]+/g, ' ');
        (secNoUrl.match(/[A-Za-z][A-Za-z0-9]{1,}/g) || []).forEach(w => {
          if (w.length >= 2) kws.add(w.toLowerCase());
        });
        // "询问/关于/涉及/问到/咨询 X 相关/的问题"
        const cond = sec.match(/(?:询问|关于|涉及|问到|咨询)([^，。,\.\n]{1,24}?)(?:相关|的问题|问题|时|，|。|$)/);
        if (cond) {
          cond[1].split(/[或、和\/,，]/).forEach(x => {
            const v = x.trim();
            if (v.length >= 2 && v.length <= 8) kws.add(v.toLowerCase());
          });
        }
        if (kws.size) out.push({ keywords: [...kws], reply: `相关资源可以到这里获取：${urlM[0]}` });
      }
      return out;
    }

    /**
     * 更新某个自定义技能的规则正文（systemPrompt），用于用户手动调整。
     * @param {string} id
     * @param {string} text
     * @returns {boolean} 是否更新成功
     */
    updateCustomSystemPrompt(id, text) {
      const idx = this.customSkills.findIndex(s => s.id === id);
      if (idx < 0) return false;
      this.customSkills[idx].systemPrompt = String(text || '');
      this._persist();
      return true;
    }

    _load() {
      try {
        if (!fs.existsSync(FILE)) return [];
        const arr = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        console.warn('[SkillService] load failed:', e);
        return [];
      }
    }

    _persist() {
      try {
        fs.writeFileSync(FILE, JSON.stringify(this.customSkills, null, 2), 'utf-8');
        this.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
      } catch (e) {
        console.warn('[SkillService] save failed:', e);
      }
    }

    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    /** 给内置 skill1 注入当前生效的规则文本 */
    _withRules(s) {
      if (s && s.id === 'skill1') return { ...s, systemPrompt: this.getRules() };
      return s;
    }

    /** 获取所有技能（内置 + 用户自定义） */
    getAll() {
      // skill1 规则置顶，其后自定义技能
      const builtin = SKILLS.map(s => this._withRules(s));
      return [...builtin, ...this.customSkills.map(s => ({ ...s, custom: true }))];
    }

    get(id) {
      const custom = this.customSkills.find(s => s.id === id);
      if (custom) return custom;
      return this._withRules(SKILLS.find(s => s.id === id));
    }

    /**
     * 上传 / 创建用户自定义 skill
     * @param {object} skill - { id?, name, icon, desc, inputs, prompt }
     *   - prompt 必须是字符串模板，里面用 {{key}} 占位
     */
    upload(skill) {
      if (!skill || !skill.name) throw new Error('skill 必须含 name');
      const id = skill.id || ('custom_' + Date.now().toString(36));
      const promptTpl = skill.prompt || '';
      const item = {
        id,
        name: String(skill.name).slice(0, 30),
        icon: skill.icon || '⭐',
        desc: String(skill.desc || '').slice(0, 80),
        category: skill.category || 'custom',
        inputs: Array.isArray(skill.inputs) ? skill.inputs.map(inp => ({
          key: String(inp.key || '').slice(0, 30),
          label: String(inp.label || inp.key || '').slice(0, 30),
          placeholder: String(inp.placeholder || '').slice(0, 80),
          type: inp.type === 'textarea' ? 'textarea' : 'text',
        })) : [],
        // 存的是模板字符串，用时再 render
        promptTpl,
        // 可选：md 文件来的 skill 用 systemPrompt 承载文档正文
        systemPrompt: skill.systemPrompt || '',
        // 规范类技能的结构化触发器：[{keywords:[...], reply:'...'}]，用于机器人回复时本地快速匹配
        ruleMatchers: Array.isArray(skill.ruleMatchers) ? skill.ruleMatchers : [],
        custom: true,
        createdAt: Date.now(),
      };
      // 已存在则覆盖
      const idx = this.customSkills.findIndex(s => s.id === id);
      if (idx >= 0) this.customSkills[idx] = item;
      else this.customSkills.unshift(item);
      this._persist();
      return item;
    }

    /**
     * 从 SKILL.md 文本解析并上传
     * @param {string} mdText
     * @param {string} [filename] - 文件名（用于兜底命名）
     * @returns {object} 创建的 skill
     */
    uploadFromMarkdown(mdText, filename) {
      if (!mdText || typeof mdText !== 'string') throw new Error('文件内容为空');
      const parsed = this._parseMarkdown(mdText, filename);
      return this.upload(parsed);
    }

    /**
     * 解析 SKILL.md：front matter（YAML 子集）+ 正文
     * 支持的 front matter 字段：name, description, icon, allowed-tools, inputs（可选）
     */
    _parseMarkdown(mdText, filename) {
      const result = {
        name: '',
        desc: '',
        icon: '📜',
        inputs: [{ key: 'query', label: '你的需求', placeholder: '描述这次想让 skill 做什么...', type: 'textarea' }],
        prompt: '请基于以上 skill 指令，完成用户需求：\n\n{{query}}',
        systemPrompt: '',
      };

      // 提取 front matter
      let body = mdText;
      const fm = mdText.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
      if (fm) {
        body = mdText.slice(fm[0].length);
        const front = this._parseFrontMatter(fm[1]);
        if (front.name) result.name = String(front.name);
        if (front.description) result.desc = String(front.description);
        if (front.icon) result.icon = String(front.icon);
      }

      // 兜底命名：文件名（去掉扩展名）
      if (!result.name && filename) {
        result.name = filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
      }
      if (!result.name) result.name = '未命名 Skill';

      // desc 兜底：取正文第一段非标题文本（去 # 等）
      if (!result.desc) {
        const firstLine = body.split('\n').find(l => l.trim() && !l.startsWith('#'));
        result.desc = (firstLine || '').slice(0, 80);
      }

      // 整段正文作为 system prompt（保留 markdown 结构供 AI 理解）
      result.systemPrompt = body.trim();

      return result;
    }

    /**
     * 极简 YAML 子集解析：仅支持 key: value 与多行字符串引号
     * 不支持嵌套对象/数组（不需要）
     */
    _parseFrontMatter(yamlText) {
      const obj = {};
      const lines = yamlText.split('\n');
      for (const line of lines) {
        const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
        if (!m) continue;
        let key = m[1].trim();
        let val = m[2].trim();
        // 去除引号
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        obj[key] = val;
      }
      return obj;
    }

    /**
     * 导出单个技能为 SKILL.md 文本（front matter + 正文），可被"上传 .md"重新导入。
     * 适合把规范类技能分享给团队成员。
     * @param {string} id
     * @returns {{filename:string, content:string}|null}
     */
    exportMarkdown(id) {
      const s = this.get(id);
      if (!s) return null;
      // 正文：规范/文档类用 systemPrompt；模板类回退用 prompt 文本
      let body = s.systemPrompt || '';
      if (!body) {
        if (typeof s.prompt === 'string') body = s.prompt;
        else if (s.promptTpl) body = s.promptTpl;
      }
      // 若正文本身已含 front matter，直接原样导出，避免重复包裹
      if (/^---\s*\n[\s\S]*?\n---/.test(body.trim())) {
        const safeName0 = String(s.name || 'skill').replace(/[\/\\:*?"<>|]/g, '_');
        return { filename: `SKILL-${safeName0}.md`, content: body.trim() + '\n' };
      }
      const esc = (v) => String(v == null ? '' : v).replace(/\n/g, ' ');
      const fm = `---\nname: ${esc(s.name)}\ndescription: ${esc(s.desc)}\nicon: ${s.icon || '📜'}\n---\n\n`;
      const safeName = String(s.name || 'skill').replace(/[\/\\:*?"<>|]/g, '_');
      return { filename: `SKILL-${safeName}.md`, content: fm + (body || '').trim() + '\n' };
    }

    /** 删除自定义 skill（内置不可删） */
    remove(id) {
      const before = this.customSkills.length;
      this.customSkills = this.customSkills.filter(s => s.id !== id);
      if (this.customSkills.length !== before) this._persist();
    }

    /** 用 input 渲染 prompt 模板（支持 {{key}} 占位） */
    _renderTemplate(tpl, input) {
      return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
        const v = input[k];
        return v == null ? '' : String(v);
      });
    }

    /**
     * 执行 skill
     * @param {string} skillId
     * @param {object} input - 用户输入
     * @returns {Promise<string>} AI 输出
     */
    async execute(skillId, input) {
      const skill = this.get(skillId);
      if (!skill) throw new Error('技能不存在');

      let prompt;
      if (skill.custom && skill.promptTpl) {
        prompt = this._renderTemplate(skill.promptTpl, input);
      } else if (typeof skill.prompt === 'function') {
        prompt = skill.prompt(input);
      } else {
        prompt = String(skill.prompt || '');
      }

      // md 上传的 skill 用其正文作为 system prompt，更贴合 SKILL.md 协议
      const systemContent = skill.systemPrompt
        ? skill.systemPrompt
        : '你是哈啰出行两轮事业部的资深设计师助手，输出专业、简洁、可执行。';

      return await window.aiService.send([
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt }
      ]);
    }
  }

  window.SkillService = SkillService;
})();
