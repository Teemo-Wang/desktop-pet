/**
 * Conservative, deterministic P1-2 cognition collector.
 * It never calls Agent Core or AIService, so collection cannot recurse.
 */
(function (root, factory) {
  const CognitionService = root && root.TeemoCognitionService
    ? root.TeemoCognitionService
    : require('./TeemoCognitionService');
  const Collector = factory(CognitionService);
  if (root) root.TeemoCognitionCollector = Collector;
  if (typeof window !== 'undefined') window.TeemoCognitionCollector = Collector;
  if (typeof module === 'object' && module.exports) module.exports = Collector;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoCognitionService) {
  const LONG_TERM = /(?:以后都|以后默认|一直(?:都)?|我通常|我一般|我比较喜欢|长期|记住(?:我|这一点|这个)?)/;
  const RECENT = /(?:最近|近期|这段时间|目前|刚开始|现在(?:在|开始)?)/;
  const TEMPORARY = /(?:这次|本次|今天|暂时|先|试一下|试试|这一版|这版)/;
  const PROJECT = /(?:这个项目|本项目|当前项目|该项目|这个银行卡项目|项目里|项目中|项目要求|项目需要)/;
  const PROJECT_DOMAIN = /(?:风格|色彩|颜色|配色|材质|排版|版式|视觉|方案|版本|构图|背景|比例|卡通|简约|复杂|品牌|尺寸|角色|画面|主色|留白|科技)/;
  const EXPLICIT_PROJECT_GLOBAL = /(?:我一直|我平时(?:都)?|我通常|我一般|所有项目|全部项目|每个项目|跨项目|以后我?所有项目|记住以后我(?:一直|通常|平时|都)|以后都|以后默认)/;
  const CORRECTION = /(?:不是|更正|纠正|改成|不再|现在不|只适用于|仅适用于|不要再|之前说错)/;
  const SIGNAL = /(?:喜欢|偏好|习惯|通常|默认|避免|不要|不喜欢|想试|尝试|只适用于|仅适用于|目标|关注|研究|使用|工作方式|视觉|风格|配色|颜色|尺寸|品牌|限制|要求|记住)/;

  function extractText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .filter(item => item && (item.type === 'text' || typeof item.text === 'string'))
      .map(item => String(item.text || ''))
      .join('\n');
  }

  function categoryFor(text, correction) {
    if (correction) return 'correction';
    if (/(?:目标|计划|想要达成)/.test(text)) return 'goal';
    if (/(?:习惯|通常|工作方式|流程|工具)/.test(text)) return 'workflow';
    if (/(?:禁止|限制|要求|必须|不要)/.test(text)) return 'constraint';
    return 'preference';
  }

  function correctionAnchor(text) {
    const anchor = String(text || '')
      .replace(/(?:不是|更正一下|纠正一下|之前说错了|记住|以后|现在|我|只适用于|仅适用于|这个项目|本项目|当前项目|该项目|不要再|不再|不喜欢|喜欢|偏好|了)/g, '')
      .replace(/[，。！？,.!?；;：:\s]/g, '')
      .slice(0, 80);
    return /^(?:这个|这一点|此项|它)$/.test(anchor) ? '' : anchor;
  }

  class TeemoCognitionCollector {
    constructor(options = {}) {
      this.cognitionService = options.cognitionService || null;
      this.repeatThreshold = Number.isInteger(options.repeatThreshold) && options.repeatThreshold > 1
        ? options.repeatThreshold
        : 3;
    }

    async collectTurn(input = {}) {
      const service = input.cognitionService || this.cognitionService;
      if (!service) return { ok: false, skipped: 'disabled' };
      // 两个 renderer 共享同一个本地 Cognition 文件；每轮采集前读取最新状态。
      if (typeof service.reload === 'function') service.reload();
      if (typeof service.isEnabled === 'function' && !service.isEnabled()) {
        return { ok: true, skipped: 'disabled' };
      }
      const text = extractText(input.userMessage).trim();
      if (!text || !SIGNAL.test(text)) return { ok: true, skipped: 'no_signal' };
      if (TeemoCognitionService.isSensitiveText(text)) return { ok: true, skipped: 'sensitive' };

      const projectId = input.projectId ? String(input.projectId) : null;
      const isCorrection = CORRECTION.test(text);
      const isLongTerm = LONG_TERM.test(text);
      const isTemporary = TEMPORARY.test(text);
      const isExplicitProjectGlobal = EXPLICIT_PROJECT_GLOBAL.test(text);
      let scope = 'recent';
      if (projectId && (PROJECT.test(text) || /只适用于|仅适用于/.test(text))) scope = 'project';
      else if (projectId && PROJECT_DOMAIN.test(text) && !isExplicitProjectGlobal) scope = 'project';
      else if ((isLongTerm || isExplicitProjectGlobal) && !isTemporary) scope = 'global';
      else if (RECENT.test(text) || isTemporary || SIGNAL.test(text)) scope = 'recent';

      let observationContent = text;
      if (isCorrection) {
        const anchor = correctionAnchor(text);
        if (anchor) {
          service.supersedeSimilar(anchor, {
            scopes: scope === 'project' ? ['global', 'recent', 'project'] : ['global', 'recent'],
            projectId,
          });
        } else if (scope === 'project' && /(?:只适用于|仅适用于)/.test(text)) {
          const candidates = service.listObservations()
            .filter(item => item.scope !== 'project' && (!input.sessionId || item.sourceSessionId === input.sessionId))
            .sort((a, b) => String(b.lastObservedAt || '').localeCompare(String(a.lastObservedAt || '')));
          // P1-2 does not pretend to understand ambiguous pronouns. Migrate
          // only when the current session has exactly one active candidate.
          if (candidates.length === 1) {
            const referenced = candidates[0];
            observationContent = `${referenced.content}（仅适用于当前项目）`;
            service.supersedeObservation(referenced.id);
          }
        }
      }

      const result = service.recordObservation({
        category: categoryFor(text, isCorrection),
        scope,
        content: observationContent,
        confidence: isLongTerm || isExplicitProjectGlobal || isCorrection ? 0.95 : (scope === 'project' ? 0.85 : 0.7),
        projectId,
        sourceSessionId: input.sessionId || null,
      });
      if (!result.ok) return result;

      const observation = result.observation;
      let promoted = false;
      if (scope === 'project') {
        service.updateProjectFromObservation(projectId, observation);
      } else if (scope === 'global') {
        service.promoteToProfile(observation);
        promoted = true;
      } else {
        service.updateRecentFromObservation(observation);
        if (!isTemporary && !isCorrection && observation.evidenceCount >= this.repeatThreshold) {
          service.promoteToProfile(observation);
          promoted = true;
        }
      }

      return { ok: true, observation, promoted, scope };
    }
  }

  TeemoCognitionCollector.extractText = extractText;
  return TeemoCognitionCollector;
});
