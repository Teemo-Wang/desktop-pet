/** Compact Challenge behavior overlay; P2-2 remains the professional judgment source. */
(function (root, factory) {
  const CreativeBuilder = root && root.TeemoCreativeContextBuilder
    ? root.TeemoCreativeContextBuilder
    : require('./TeemoCreativeContextBuilder');
  const Builder = factory(CreativeBuilder);
  if (root) root.TeemoChallengeContextBuilder = Builder;
  if (typeof window !== 'undefined') window.TeemoChallengeContextBuilder = Builder;
  if (typeof module === 'object' && module.exports) module.exports = Builder;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoCreativeContextBuilder) {
  const INTENSITY_POLICY = {
    light: '轻度：指出 1–2 个关键风险；只有开放式探索才提供最多 2 个方向。',
    standard: '标准：指出 2–3 个核心问题；开放式探索提供 2–3 个真正不同方向。',
    strong: '强：指出 3–5 个关键风险；开放式探索提供 3 个不同方向。保持专业、具体，不攻击或贬低用户。',
  };

  function buildContent(intensity, maxChars) {
    const mandatory = [
      `【Teemo Challenge Overlay · ${intensity}】`,
      '角色边界：这是基于证据的设计压力测试，不是为了反对而反对；专业、明确、克制，不进行人格扮演。',
      '约束优先级（不可覆盖）：当前用户明确要求 > 当前项目硬约束 > 已加载 Skill 规范 > Creative Profile / Challenge Judgment。不得自行违反任何明确约束。',
      '证据边界（不可丢失）：只使用当前文本、可见附件、Project、Skill、Cognition、Creative 与会话事实；不编造未知项目事实、不可见图片内容、用户反馈、业务指标或 A/B 结果。信息不足时降低确定性。',
      '方向差异（不可丢失）：仅在开放式探索时提供 2–3 个方向；任意两个方向至少在构图/信息架构、视觉语言/材质、叙事隐喻、品牌记忆、字体图形、动效交互、传播策略中的 2 个轴上实质不同，不得只换颜色或措辞。',
    ];
    const optional = [
      INTENSITY_POLICY[intensity] || INTENSITY_POLICY.standard,
      '窄任务规则：明确的小修改应直接完成，最多附带相关风险；不要强行扩展成多套方案。',
      '输出依据：给出结论、关键依据、权衡与可执行建议，不输出隐藏推理。',
    ];
    const selected = [...mandatory];
    let used = mandatory.join('\n').length;
    if (used > maxChars) return null;
    optional.forEach(line => {
      if (used + line.length + 1 > maxChars) return;
      selected.push(line);
      used += line.length + 1;
    });
    return selected.join('\n');
  }

  class TeemoChallengeContextBuilder {
    constructor(options = {}) {
      this.sessionState = options.sessionState || null;
      this.profileService = options.profileService || null;
      this.maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : 900;
    }

    parseCommand(options = {}) {
      return this.sessionState && typeof this.sessionState.parseCommand === 'function'
        ? this.sessionState.parseCommand(options)
        : { type: 'none', intensity: null };
    }

    build(options = {}) {
      if (!this.sessionState) return { enabled: false, relevant: false, systemMessage: null };
      const service = options.profileService || this.profileService;
      const resolution = this.sessionState.resolveRun(options);
      if (!service) return { enabled: false, relevant: false, resolution, systemMessage: null };
      if (typeof service.reload === 'function') service.reload();
      const state = typeof service.getState === 'function' ? service.getState() : null;
      const enabled = typeof service.isEnabled !== 'function' || service.isEnabled();
      if (!enabled || (state && state.readError)) {
        this.sessionState.setMode(options.sessionId, 'balanced', { intensity: 'standard', source: 'default' });
        return {
          enabled: false,
          relevant: false,
          resolution,
          error: state && state.readError ? { ...state.readError } : null,
          systemMessage: null,
        };
      }
      const relevant = options.creativeContext
        ? Boolean(options.creativeContext.relevant)
        : TeemoCreativeContextBuilder.isCreativeRelevant(options);
      if (resolution.effectiveMode !== 'challenge' || !relevant) {
        return { enabled: true, relevant, resolution, systemMessage: null };
      }
      const maxChars = Number.isInteger(options.maxChars) && options.maxChars > 0 ? options.maxChars : this.maxChars;
      const content = buildContent(resolution.effectiveIntensity, maxChars);
      if (!content) {
        return {
          enabled: true,
          relevant: true,
          resolution: { ...resolution, effectiveMode: 'balanced' },
          error: { code: 'CHALLENGE_CONTEXT_BUDGET_TOO_SMALL' },
          systemMessage: null,
        };
      }
      return {
        enabled: true,
        relevant: true,
        mode: 'challenge',
        intensity: resolution.effectiveIntensity,
        oneShot: resolution.oneShot,
        command: resolution.command.type,
        resolution,
        budget: { maxChars, usedChars: content.length },
        systemMessage: { role: 'system', content },
      };
    }
  }

  return TeemoChallengeContextBuilder;
});
