/**
 * Provider-neutral context builder for Teemo Cognition.
 */
(function (root, factory) {
  const Builder = factory();
  if (root) root.TeemoContextBuilder = Builder;
  if (typeof window !== 'undefined') window.TeemoContextBuilder = Builder;
  if (typeof module === 'object' && module.exports) module.exports = Builder;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(item => item && item.type === 'text').map(item => String(item.text || '')).join('\n');
  }

  function sortRelevant(items) {
    return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
      const confidence = (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
      if (confidence) return confidence;
      return String(b.lastObservedAt || b.updatedAt || '').localeCompare(String(a.lastObservedAt || a.updatedAt || ''));
    });
  }

  function takeWithin(items, budget, formatter) {
    const selected = [];
    let used = 0;
    for (const item of sortRelevant(items)) {
      const line = formatter(item).replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const clipped = line.slice(0, Math.min(420, budget));
      if (used + clipped.length > budget) continue;
      selected.push({ ...item, contextText: clipped });
      used += clipped.length + 1;
    }
    return selected;
  }

  function normalizeSkillContext(value, messages) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    const fromMessages = (messages || [])
      .filter(message => message && message.role === 'system' && /Skill|技能/.test(textOf(message.content)))
      .map(message => textOf(message.content))
      .join('\n');
    return fromMessages.slice(0, 1200);
  }

  function conversationContext(value, messages) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return (messages || [])
      .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
      .slice(-6)
      .map(message => `${message.role}: ${textOf(message.content).replace(/data:[^\s]+/gi, '[附件]').slice(0, 500)}`)
      .join('\n');
  }

  function projectMetadata(value) {
    const project = value && value.project ? value.project : value;
    if (!project || typeof project !== 'object' || Array.isArray(project)) return '';
    return [
      project.name && `项目：${project.name}`,
      project.background && `背景：${project.background}`,
      project.businessGoal && `业务目标：${project.businessGoal}`,
      project.designBrief && `设计 Brief：${project.designBrief}`,
      project.visualDirection && `视觉方向：${project.visualDirection}`,
    ].filter(Boolean).join('\n');
  }

  class TeemoContextBuilder {
    constructor(options = {}) {
      this.cognitionService = options.cognitionService || null;
      this.maxChars = Number.isInteger(options.maxChars) && options.maxChars >= 800 ? options.maxChars : 5200;
    }

    build(options = {}) {
      const service = options.cognitionService || this.cognitionService;
      // Memory Center 可能在另一个 renderer 修改数据；下一次请求总是使用磁盘最新版本。
      if (service && typeof service.reload === 'function') service.reload();
      const cognitionEnabled = !service || typeof service.isEnabled !== 'function' || service.isEnabled();
      const messages = Array.isArray(options.messages) ? options.messages : [];
      const projectId = options.projectId ? String(options.projectId) : null;
      const maxChars = Number.isInteger(options.maxChars) && options.maxChars >= 800 ? options.maxChars : this.maxChars;
      const sectionBudget = {
        profile: Math.floor(maxChars * 0.20),
        recent: Math.floor(maxChars * 0.20),
        project: Math.floor(maxChars * 0.28),
        skill: Math.floor(maxChars * 0.14),
        conversation: Math.floor(maxChars * 0.18),
      };
      const profile = service && cognitionEnabled ? takeWithin(service.getProfile(), sectionBudget.profile, item => item.content) : [];
      const recent = service && cognitionEnabled ? takeWithin(service.getRecentContext(), sectionBudget.recent, item => item.content) : [];
      const projectKnowledge = service && cognitionEnabled && projectId
        ? takeWithin(service.getProjectContext(projectId), sectionBudget.project, item => item.content)
        : [];
      const metadata = projectMetadata(options.projectContext);
      const skill = normalizeSkillContext(options.skillContext, messages).slice(0, sectionBudget.skill);
      const conversation = conversationContext(options.conversationContext, messages).slice(0, sectionBudget.conversation);
      const project = {
        projectId,
        metadata: metadata.slice(0, Math.floor(sectionBudget.project * 0.55)),
        knowledge: projectKnowledge,
      };
      const bundle = {
        cognitionEnabled,
        profile,
        recentContext: recent,
        projectContext: project,
        skillContext: skill,
        conversationContext: conversation,
        priority: ['current_instruction', 'project', 'recent', 'profile'],
        budget: { maxChars, sectionBudget },
      };
      bundle.systemMessage = this.toSystemMessage(bundle);
      return bundle;
    }

    toSystemMessage(bundle) {
      const lines = [
        '【Teemo Cognition 上下文】',
        '优先级：当前用户明确指令 > 当前项目 Context > Recent Context > 长期 Teemo Profile。',
        '项目或近期偏好只影响当前回答，不得据此改写长期 Profile；用户明确纠正优先。',
      ];
      const profile = bundle.profile || [];
      const recent = bundle.recentContext || [];
      const project = bundle.projectContext || {};
      if (profile.length) lines.push('', '长期 Teemo Profile：', ...profile.map(item => `- ${item.contextText || item.content}`));
      if (recent.length) lines.push('', 'Recent Context：', ...recent.map(item => `- ${item.contextText || item.content}`));
      const projectLines = [];
      if (project.metadata) projectLines.push(project.metadata);
      if (Array.isArray(project.knowledge)) projectLines.push(...project.knowledge.map(item => `- ${item.contextText || item.content}`));
      if (projectLines.length) lines.push('', `当前项目 Context${project.projectId ? `（${project.projectId}）` : ''}：`, ...projectLines);
      if (lines.length === 3) return null;
      const content = lines.join('\n').slice(0, bundle.budget.maxChars);
      return { role: 'system', content };
    }
  }

  return TeemoContextBuilder;
});
