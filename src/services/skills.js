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

  const SKILLS = [
    {
      id: 'color-palette',
      name: '配色方案',
      icon: '🎨',
      desc: '根据主题生成专业配色方案',
      category: 'design',
      inputs: [
        { key: 'theme', label: '主题/品牌', placeholder: '如：科技活力、温暖治愈', type: 'text' },
        { key: 'mood', label: '风格氛围', placeholder: '如：现代简约、年轻活泼', type: 'text' },
      ],
      prompt: (input) => `请基于「${input.theme}」主题、「${input.mood}」风格，生成一套配色方案：\n- 主色（含 HEX）\n- 辅助色（2-3个）\n- 中性色\n- 配色使用建议\n\n要求符合哈啰品牌调性，输出格式简洁。`
    },
    {
      id: 'copy-polish',
      name: '文案润色',
      icon: '✍️',
      desc: '将文案改写得更吸引人',
      category: 'content',
      inputs: [
        { key: 'text', label: '原文案', placeholder: '粘贴需要润色的文案...', type: 'textarea' },
        { key: 'style', label: '风格', placeholder: '如：活泼/专业/温暖', type: 'text' },
      ],
      prompt: (input) => `请将以下文案润色为「${input.style || '活泼有趣'}」风格，保持核心信息但更吸引人：\n\n${input.text}\n\n输出 3 个版本供选择。`
    },
    {
      id: 'asset-naming',
      name: '素材命名',
      icon: '📁',
      desc: '生成规范的设计素材文件名',
      category: 'design',
      inputs: [
        { key: 'desc', label: '素材描述', placeholder: '如：新车上线 banner @2x', type: 'text' },
        { key: 'project', label: '项目', placeholder: '如：哈啰新车', type: 'text' },
      ],
      prompt: (input) => `请为以下设计素材生成符合规范的文件名：\n- 素材：${input.desc}\n- 项目：${input.project}\n\n命名规范：英文小写+下划线，包含项目缩写、用途、尺寸、版本号。输出 3 个建议。`
    },
    {
      id: 'design-review',
      name: '设计评审',
      icon: '🔍',
      desc: '基于设计原则给出改进建议',
      category: 'design',
      inputs: [
        { key: 'desc', label: '设计描述', placeholder: '描述你的设计或粘贴说明...', type: 'textarea' },
      ],
      prompt: (input) => `作为资深设计评审师，请基于以下设计给出专业评审意见：\n\n${input.desc}\n\n请从这几个维度分析：\n- 视觉层级\n- 色彩搭配\n- 字体可读性\n- 留白与对齐\n- 改进建议（按优先级）`
    },
    {
      id: 'banner-idea',
      name: 'Banner 创意',
      icon: '🖼️',
      desc: '生成 Banner 设计创意方向',
      category: 'design',
      inputs: [
        { key: 'topic', label: '主题', placeholder: '如：新车上线、618 活动', type: 'text' },
        { key: 'size', label: '尺寸', placeholder: '如：750×360px', type: 'text' },
      ],
      prompt: (input) => `请为「${input.topic}」生成 3 个 Banner 设计创意方向（尺寸 ${input.size}），每个方向包含：\n- 核心视觉概念\n- 主元素（角色/产品/场景）\n- 配色倾向\n- 文案建议\n- 适配哈啰品牌`
    },
    {
      id: 'icon-meaning',
      name: '图标语义',
      icon: '⚙️',
      desc: '推荐功能对应的图标方向',
      category: 'design',
      inputs: [
        { key: 'func', label: '功能描述', placeholder: '如：行程历史、骑行记录', type: 'text' },
      ],
      prompt: (input) => `请为「${input.func}」功能推荐 3 个图标设计方向：\n- 隐喻元素\n- 视觉特征\n- 与现有 iOS/Material 系统图标的差异化建议\n- 是否需要徽章/状态指示`
    },
  ];

  class SkillService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.customSkills = this._load();
      this.listeners = new Set();
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

    /** 获取所有技能（内置 + 用户自定义） */
    getAll() {
      // 自定义技能放前面，更易发现
      return [...this.customSkills.map(s => ({ ...s, custom: true })), ...SKILLS];
    }

    get(id) {
      return this.customSkills.find(s => s.id === id) || SKILLS.find(s => s.id === id);
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
