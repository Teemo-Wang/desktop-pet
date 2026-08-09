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
  const WEAK_FOLLOW_UP_PATTERNS = [
    /这个怎么样/i,
    /再?优化一下/i,
    /哪(?:一)?版更好/i,
    /上一版.{0,6}(?:更好|好一点)/i,
    /(?:评价|看看|调整|改进|比较|选择)一下/i,
  ];
  const VISUAL_REVIEW_PATTERN = /(?:评价|优化|改进|比较|选择|哪版|怎么样|好看|问题|建议)/i;
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

  function currentUserText(options = {}) {
    const messages = Array.isArray(options.messages) ? options.messages : [];
    const content = options.userMessage != null
      ? textOf(options.userMessage)
      : [...messages].reverse().find(message => message && message.role === 'user')?.content;
    return textOf(content).toLowerCase();
  }

  function supportingContextText(options = {}) {
    const messages = Array.isArray(options.messages) ? options.messages : [];
    let latestUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].role === 'user') {
        latestUserIndex = index;
        break;
      }
    }
    const conversationText = messages
      .filter((_message, index) => index !== latestUserIndex)
      .map(message => textOf(message && message.content))
      .join('\n');
    const skillText = typeof options.skillContext === 'string'
      ? options.skillContext
      : messages.filter(message => message && message.role === 'system').map(message => textOf(message.content)).join('\n');
    const projectText = collectProjectText(options.projectContext).join('\n');
    return [conversationText, skillText, projectText].filter(Boolean).join('\n').toLowerCase();
  }

  function requestText(options = {}) {
    return [currentUserText(options), supportingContextText(options)].filter(Boolean).join('\n');
  }

  function hasCreativeSignal(text) {
    return EXPLICIT_PATTERNS.some(pattern => pattern.test(text))
      || CREATIVE_KEYWORDS.some(keyword => text.includes(keyword));
  }

  function isCreativeRelevant(options = {}) {
    const userText = currentUserText(options);
    if (!userText) return false;
    if (hasCreativeSignal(userText)) return true;
    if (hasVisualAttachment(options.messages) && VISUAL_REVIEW_PATTERN.test(userText)) return true;
    const weakFollowUp = WEAK_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(userText));
    return weakFollowUp && hasCreativeSignal(supportingContextText(options));
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
    const mandatory = [
      `【Teemo Creative Judgment · Profile ${profile.profileVersion} · ${lens.name} Lens】`,
      '角色：提供独立、专业、克制、可解释的设计质量判断；用户偏好是输入，不是专业结论。',
      '约束优先级（不可覆盖）：当前用户明确要求 > 当前项目约束 > 已加载 Skill 规范 > Creative Judgment。必须在约束内优化，不得改写用户、项目或 Skill 约束。',
      '判断边界（不可丢失）：必须区分“用户偏好匹配”和“专业设计判断”；发生冲突时说明依据并给出约束内建议。',
      '事实边界（不可丢失）：信息不足时明确“当前判断基于有限信息”，不得编造缺失的项目事实，也不得假装看过不可见内容。',
    ];
    const optional = [
      '判断原则：',
    ];
    profile.principles.forEach(item => optional.push(`- ${item.name}：${item.summary}`));
    optional.push(
      `领域关注：${lens.focus.join('、')}。`,
      `评价维度（基础权重，仅用于结构化判断，不输出伪精确分数）：${profile.dimensions.map(item => `${item.name}${item.weight}`).join('、')}。`,
      '响应：给出可执行建议；不适用维度不扣分，不输出伪精确分数。',
    );
    const selected = [...mandatory];
    let used = mandatory.join('\n').length;
    if (used > maxChars) throw new Error('Creative mandatory policy exceeds context budget');
    optional.forEach(line => {
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
      const state = typeof service.getState === 'function' ? service.getState() : null;
      if (state && state.readError) {
        return { enabled: false, relevant: false, stateError: { ...state.readError }, systemMessage: null };
      }
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
