/**
 * Builds a compact, relevance-gated Creative Profile system context.
 * It never reads Cognition, projects, skills, or future inspiration storage.
 */
(function (root, factory) {
  const Builder = factory();
  if (root) root.TeemoCreativeContextBuilder = Builder;
  if (typeof window !== 'undefined') window.TeemoCreativeContextBuilder = Builder;
  if (typeof module === 'object' && module.exports) module.exports = Builder;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CREATIVE_KEYWORDS = [
    '设计', '视觉', '海报', 'banner', 'kv', 'logo', 'ui', 'ux', '排版', '字体', '配色', '品牌', '构图',
    '3d', '材质', '渲染', 'blender', '动效', '动画', 'motion', 'ip', '卡片', '封面', 'icon', '图标',
    '界面', '视觉方案', '设计方案', '版式', '留白', '光影', '营销图', '主视觉', '字体设计',
  ];
  const EXPLICIT_PATTERNS = [
    /从.{0,8}设计角度.{0,8}(?:评价|看看|分析|判断)/i,
    /(?:这张图|这个方案|这版|这个作品).{0,12}(?:哪里|什么).{0,8}(?:优化|问题|改进)/i,
    /(?:两个|这些|几版).{0,10}方案.{0,8}(?:哪个好|怎么选|更好)/i,
    /(?:评价|评审|优化|分析).{0,10}(?:这个|这张|这版).{0,8}(?:设计|方案|视觉)/i,
  ];
  const DOMAIN_KEYWORDS = {
    brand: ['品牌', 'logo', '标志', 'vi', '识别', '品牌系统', 'ip'],
    marketing: ['营销', '海报', 'banner', 'kv', '主视觉', '活动', 'cta', '转化', '传播'],
    ui: ['ui', 'ux', '界面', '交互', '组件', '页面', '操作路径', '状态反馈'],
    '3d': ['3d', 'blender', '模型', '建模', '材质', '渲染', '光影', '轮廓'],
    motion: ['motion', '动效', '动画', '转场', '缓动', '节奏', '运动'],
  };

  function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(item => item && item.type === 'text').map(item => String(item.text || '')).join('\n');
  }

  function hasVisualAttachment(messages) {
    return (messages || []).some(message => Array.isArray(message && message.content) && message.content.some(item => (
      item && (item.type === 'image_url' || item.type === 'video_url')
    )));
  }

  function collectProjectText(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(item => collectProjectText(item, out));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => collectProjectText(item, out));
    return out;
  }

  function requestText(options = {}) {
    const messages = Array.isArray(options.messages) ? options.messages : [];
    const userText = options.userMessage != null
      ? textOf(options.userMessage)
      : [...messages].reverse().find(message => message && message.role === 'user')?.content;
    const skillText = typeof options.skillContext === 'string'
      ? options.skillContext
      : messages.filter(message => message && message.role === 'system').map(message => textOf(message.content)).join('\n');
    const projectText = collectProjectText(options.projectContext).join('\n');
    return [textOf(userText), skillText, projectText].filter(Boolean).join('\n').toLowerCase();
  }

  function isCreativeRelevant(options = {}) {
    const text = requestText(options);
    if (!text) return false;
    if (EXPLICIT_PATTERNS.some(pattern => pattern.test(text))) return true;
    if (CREATIVE_KEYWORDS.some(keyword => text.includes(keyword))) return true;
    return hasVisualAttachment(options.messages) && /(?:评价|优化|改进|方案|好看|问题|建议|选择)/i.test(text);
  }

  function detectDomain(options = {}) {
    const text = requestText(options);
    let best = 'general';
    let bestScore = 0;
    Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords]) => {
      const score = keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
      if (score > bestScore) {
        best = domain;
        bestScore = score;
      }
    });
    return best;
  }

  function compactContext(profile, lens, maxChars) {
    const lines = [
      `【Teemo Creative Judgment · Profile ${profile.profileVersion} · ${lens.name} Lens】`,
      '角色：提供独立、专业、克制、可解释的设计质量判断；用户偏好是输入，不是专业结论。',
      '约束优先级：当前用户明确要求 > 当前项目约束 > 已加载 Skill 规范 > Creative Judgment。必须在约束内优化，不得改写约束。',
      '判断原则：',
    ];
    profile.principles.forEach(item => lines.push(`- ${item.name}：${item.summary}`));
    lines.push(
      `领域关注：${lens.focus.join('、')}。`,
      `评价维度（基础权重，仅用于结构化判断，不输出伪精确分数）：${profile.dimensions.map(item => `${item.name}${item.weight}`).join('、')}。`,
      '响应：必要时区分“用户偏好匹配”和“专业设计判断”，说明冲突依据并给出可执行建议；不适用维度不扣分。',
      '信息不足时明确“当前判断基于有限信息”，不得假装看过不可见的图片或伪造项目事实。',
    );
    const selected = [];
    let used = 0;
    lines.forEach(line => {
      const next = `${line}\n`;
      if (used + next.length > maxChars) return;
      selected.push(line);
      used += next.length;
    });
    return selected.join('\n');
  }

  class TeemoCreativeContextBuilder {
    constructor(options = {}) {
      this.profileService = options.profileService || null;
      this.maxChars = Number.isInteger(options.maxChars) && options.maxChars >= 800 ? options.maxChars : 1400;
    }

    build(options = {}) {
      const service = options.profileService || this.profileService;
      if (!service) return { enabled: false, relevant: false, systemMessage: null };
      if (typeof service.reload === 'function') service.reload();
      const enabled = typeof service.isEnabled !== 'function' || service.isEnabled();
      const relevant = enabled && isCreativeRelevant(options);
      if (!relevant) return { enabled, relevant: false, systemMessage: null };
      const profile = service.getProfile();
      const domain = detectDomain(options);
      const lens = profile.domainLenses[domain] || profile.domainLenses.general;
      const maxChars = Number.isInteger(options.maxChars) && options.maxChars >= 800 ? options.maxChars : this.maxChars;
      const content = compactContext(profile, lens, maxChars);
      return {
        enabled,
        relevant: true,
        profileVersion: profile.profileVersion,
        domain: lens.id,
        budget: { maxChars, usedChars: content.length },
        systemMessage: content ? { role: 'system', content } : null,
      };
    }
  }

  TeemoCreativeContextBuilder.isCreativeRelevant = isCreativeRelevant;
  TeemoCreativeContextBuilder.detectDomain = detectDomain;
  return TeemoCreativeContextBuilder;
});
