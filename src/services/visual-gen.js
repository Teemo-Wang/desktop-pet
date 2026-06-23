/**
 * 视觉生成服务
 * 职责：需求类型判断、生图执行、迭代管理、记录持久化
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'visual-records.json');

  // 设计类型关键词映射
  const TYPE_KEYWORDS = {
    banner: ['banner', 'Banner', '横幅', '运营图', '活动图', '首页图', '曝光图'],
    themeCard: ['主题卡', '场景卡', '骑行卡', '卡片设计'],
    icon: ['图标', 'icon', 'Icon', 'tab图标', 'Tab图标'],
    poster: ['海报', '活动海报', 'H5', '落地页', 'KV', '主视觉'],
    illustration: ['插画', '插图', '手绘', 'IP', 'IP形象', '贴纸'],
    revision: ['改图', '修改', '调整', '迭代', '改一下', '换个颜色', '换配色', '改文案', '重新做'],
  };

  // 尺寸预设
  const SIZE_PRESETS = [
    { label: '750×360 (Banner)', value: '750x360' },
    { label: '340×200 (场景卡)', value: '340x200' },
    { label: '96×96 (图标)', value: '96x96' },
    { label: '750×1334 (全屏)', value: '750x1334' },
    { label: '1080×1920 (海报)', value: '1080x1920' },
    { label: '自定义', value: 'custom' },
  ];

  // 风格预设
  const STYLE_PRESETS = [
    { label: '品牌活力', value: 'brand-vitality' },
    { label: '科技简约', value: 'tech-minimal' },
    { label: '夏日清爽', value: 'summer-fresh' },
    { label: '温暖治愈', value: 'warm-healing' },
    { label: '3D 立体', value: '3d-render' },
    { label: '扁平插画', value: 'flat-illustration' },
  ];

  class VisualGenService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.records = this._loadRecords();
    }

    _loadRecords() {
      try {
        if (!fs.existsSync(FILE)) return [];
        const arr = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    _persistRecords() {
      try {
        fs.writeFileSync(FILE, JSON.stringify(this.records.slice(-50), null, 2), 'utf-8');
      } catch (e) {
        console.warn('[VisualGen] save failed:', e);
      }
    }

    /**
     * 判断需求类型（本地关键词 + AI 辅助）
     * @param {string} summaryText - AI 总结文本
     * @returns {Promise<object>} 分类结果
     */
    async classifyDemand(summaryText) {
      const text = String(summaryText || '');

      // 本地关键词快速匹配
      let matchedType = 'non-design';
      let confidence = 0;
      let suggestion = '';
      let recommendedMethod = 2; // 默认推荐 AI 生图

      for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
        for (const kw of keywords) {
          if (text.includes(kw)) {
            matchedType = type;
            confidence = 0.8;
            break;
          }
        }
        if (matchedType !== 'non-design') break;
      }

      // 如果本地未匹配，尝试通过 AI 判断
      if (matchedType === 'non-design' && window.aiService && !window.aiService.useMock) {
        try {
          const result = await this._aiClassify(text);
          if (result) return result;
        } catch (e) {
          console.warn('[VisualGen] AI classify failed:', e);
        }
      }

      // 生成建议文本
      switch (matchedType) {
        case 'banner':
          suggestion = '检测到这是一个营销 Banner 设计需求，可以进入视觉生成。';
          recommendedMethod = 2;
          break;
        case 'themeCard':
          suggestion = '检测到这是一个主题卡设计需求，可以调用主题卡 Skill 生成视觉方向。';
          recommendedMethod = 3;
          break;
        case 'icon':
          suggestion = '检测到这是一个图标设计需求，建议使用 AI 生图或素材库匹配。';
          recommendedMethod = 2;
          break;
        case 'poster':
          suggestion = '检测到这是一个海报/主视觉设计需求，可以进入视觉生成。';
          recommendedMethod = 2;
          break;
        case 'illustration':
          suggestion = '检测到这是一个插画/IP 设计需求，建议使用 AI 生图。';
          recommendedMethod = 2;
          break;
        case 'revision':
          suggestion = '检测到这是一个改图反馈，可以基于上一版结果生成迭代方案。';
          recommendedMethod = 2;
          break;
        default:
          // 检查是否信息不足
          if (text.length < 20) {
            matchedType = 'insufficient';
            suggestion = '检测到该需求信息不足，建议先向业务方确认尺寸、文案或风格。';
          } else {
            suggestion = '';
          }
      }

      // 提取参数
      const extractedParams = this._extractParams(text, matchedType);

      return {
        type: matchedType,
        confidence,
        suggestion,
        recommendedMethod,
        extractedParams,
        needsVisual: matchedType !== 'non-design' && matchedType !== 'insufficient',
      };
    }

    /** 通过 AI 精确分类（非 Mock 模式下调用） */
    async _aiClassify(text) {
      const prompt = `请分析以下需求内容，判断是否包含视觉设计作图任务。仅输出 JSON，不要其他内容：
{"type":"banner|themeCard|icon|poster|illustration|revision|insufficient|non-design","confidence":0.0-1.0,"suggestion":"中文建议","recommendedMethod":1或2或3}

需求内容：
${text.slice(0, 500)}`;

      const reply = await window.aiService.send([
        { role: 'system', content: '你是设计需求分类器，只输出 JSON。type 说明：banner=横幅广告图, themeCard=主题卡/场景卡, icon=图标, poster=海报/主视觉, illustration=插画/IP, revision=改图迭代, insufficient=信息不足, non-design=非设计需求。recommendedMethod：1=素材库, 2=AI生图, 3=Skill生图。' },
        { role: 'user', content: prompt }
      ]);

      try {
        let json = reply.trim();
        json = json.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(json);
        parsed.needsVisual = parsed.type !== 'non-design' && parsed.type !== 'insufficient';
        parsed.extractedParams = this._extractParams(text, parsed.type);
        return parsed;
      } catch (e) {
        return null;
      }
    }

    /** 从文本中提取生图参数 */
    _extractParams(text, type) {
      const params = { size: '', style: '', subject: '', copyText: '' };

      // 尺寸提取
      const sizeMatch = text.match(/(\d{2,4})\s*[×xX*]\s*(\d{2,4})/);
      if (sizeMatch) params.size = `${sizeMatch[1]}x${sizeMatch[2]}`;

      // 主体提取
      if (type === 'banner' || type === 'poster') {
        params.subject = '哈啰骑行场景';
      } else if (type === 'themeCard') {
        params.subject = '骑行主题卡';
      } else if (type === 'icon') {
        params.subject = '功能图标';
      }

      return params;
    }

    /**
     * 执行生图
     * @param {object} options
     * @returns {Promise<object>} 生成结果
     */
    async generate(options) {
      const { method, prompt, negativePrompt, size, style, skillId, demandSummary } = options;

      // 当前为 Mock 实现，后续对接真实 API
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

      const record = {
        id: 'vr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        method,
        prompt: prompt || '',
        negativePrompt: negativePrompt || '',
        size: size || '750x360',
        style: style || '',
        skillId: skillId || null,
        demandSummary: demandSummary || '',
        // Mock 结果：返回占位图
        imageUrl: `https://placehold.co/${(size || '750x360').replace('x', 'x')}/0076FF/ffffff?text=AI+Generated`,
        createdAt: Date.now(),
        iterations: [],
      };

      this.records.unshift(record);
      this._persistRecords();

      return {
        id: record.id,
        imageUrl: record.imageUrl,
        metadata: { method, size, style, prompt },
      };
    }

    /**
     * 迭代生图
     * @param {string} recordId - 上次生成记录 ID
     * @param {string} feedback - 用户反馈
     * @returns {Promise<object>}
     */
    async iterate(recordId, feedback) {
      const record = this.records.find(r => r.id === recordId);
      if (!record) throw new Error('找不到生图记录');

      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

      const iterationUrl = `https://placehold.co/${record.size.replace('x', 'x')}/00B365/ffffff?text=Iteration+${record.iterations.length + 1}`;

      record.iterations.push({
        feedback,
        imageUrl: iterationUrl,
        createdAt: Date.now(),
      });
      this._persistRecords();

      return {
        id: record.id,
        imageUrl: iterationUrl,
        iteration: record.iterations.length,
      };
    }

    /** 获取生图历史 */
    getHistory() {
      return this.records.slice(0, 20);
    }

    /** 获取尺寸预设 */
    getSizePresets() { return SIZE_PRESETS; }

    /** 获取风格预设 */
    getStylePresets() { return STYLE_PRESETS; }
  }

  window.VisualGenService = VisualGenService;
})();
