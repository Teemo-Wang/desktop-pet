/*
 * TeemoAgentCore
 * Model-neutral Agent Run/Step loop. Concrete tools are supplied exclusively
 * through TeemoToolRegistry; filesystem, shell, Git and network tools are absent.
 */
(function (root, factory) {
  const AgentCore = factory();
  // Electron renderer exposes CommonJS and window at the same time.
  if (root) root.TeemoAgentCore = AgentCore;
  if (typeof window !== 'undefined') window.TeemoAgentCore = AgentCore;
  if (typeof module === 'object' && module.exports) module.exports = AgentCore;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TERMINAL = new Set(['completed', 'cancelled', 'failed']);

  function makeId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  function abortError() {
    const error = new Error('Agent Run 已取消');
    error.name = 'AbortError';
    error.code = 'AGENT_CANCELLED';
    return error;
  }

  function parseAction(value) {
    if (value && typeof value === 'object' && typeof value.type === 'string') return value;
    if (typeof value !== 'string') return { type: 'direct_response', content: String(value ?? '') };
    const text = value.trim();
    const candidates = [text, text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        // A complete JSON value is an attempted Agent Action. Never silently
        // treat malformed Action JSON as prose, otherwise a broken schema can
        // accidentally pass through the loop.
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { type: 'agent_error', code: 'INVALID_ACTION', message: 'Agent Action 必须是对象' };
        }
        if (typeof parsed.type !== 'string' || !parsed.type.trim()) {
          return { type: 'agent_error', code: 'INVALID_ACTION', message: 'Agent Action 缺少有效 type' };
        }
        return parsed;
      } catch (_) { /* normal prose is a direct response */ }
    }
    return { type: 'direct_response', content: value };
  }

  function normalizeAction(value) {
    const action = parseAction(value);
    if (action.type === 'agent_error') return action;
    if (action.type === 'final_response') return { type: 'final_response', content: String(action.content ?? '') };
    if (action.type === 'direct_response') return { type: 'direct_response', content: String(action.content ?? '') };
    if (action.type === 'tool_request') {
      if (typeof action.tool !== 'string' || !action.tool.trim()) {
        return { type: 'agent_error', code: 'INVALID_ACTION', message: 'tool_request 缺少有效 tool' };
      }
      if (action.arguments != null && (typeof action.arguments !== 'object' || Array.isArray(action.arguments))) {
        return { type: 'agent_error', code: 'INVALID_ACTION', message: 'tool_request.arguments 必须是对象' };
      }
      return {
        type: 'tool_request',
        tool: action.tool.trim(),
        arguments: action.arguments || {},
        providerMessage: action.providerMessage || null,
        providerToolCallId: typeof action.providerToolCallId === 'string' ? action.providerToolCallId : null,
      };
    }
    return { type: 'agent_error', code: 'INVALID_ACTION', message: `未知 Agent Action 类型：${action.type || '(空)'}` };
  }

  const ACTION_CONTRACT = [
    '你正在 Teemo Agent Core 中执行任务。',
    '如果无需工具，必须只返回 JSON：{"type":"direct_response","content":"你的回答"}。',
    '如果需要安全测试工具，必须只返回 JSON：{"type":"tool_request","tool":"echo","arguments":{"text":"内容"}}。',
    '工具结果返回后继续推理，最终只返回 JSON：{"type":"final_response","content":"最终回答"}。',
    '不要输出 Markdown 代码围栏，不要调用未声明的工具。',
  ].join('\n');

  class TeemoAgentCore {
    constructor(options = {}) {
      this.aiService = options.aiService || null;
      this.contextBuilder = options.contextBuilder || null;
      this.creativeContextBuilder = options.creativeContextBuilder || null;
      this.challengeContextBuilder = options.challengeContextBuilder || null;
      this.inspirationContextBuilder = options.inspirationContextBuilder || null;
      this.cognitionCollector = options.cognitionCollector || null;
      this.skillRouter = options.skillRouter || null;
      this.skillComposer = options.skillComposer || null;
      this.maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : 4;
      this.toolRegistry = options.toolRegistry || null;
      this.activeRuns = new Map();
    }

    createRun(options = {}) {
      const run = {
        runId: options.runId || makeId('agent_run'),
        sessionId: options.sessionId || null,
        model: options.model || null,
        status: 'idle',
        step: 0,
        messages: Array.isArray(options.messages) ? options.messages.map(message => ({ ...message })) : [],
        toolCalls: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        cognitionContext: options.cognitionContext || null,
        cognitionError: options.cognitionError || null,
        creativeContext: options.creativeContext || null,
        creativeError: options.creativeError || null,
        challengeContext: options.challengeContext || null,
        challengeError: options.challengeError || null,
        challengeCommand: options.challengeCommand || null,
        challengeCommandMeta: options.challengeCommandMeta || null,
        skillRouting: options.skillRouting || null,
        skillRoutingError: options.skillRoutingError || null,
        skillContext: options.skillContext || null,
        skillCompositionError: options.skillCompositionError || null,
        inspirationContext: options.inspirationContext || null,
        inspirationError: options.inspirationError || null,
        cognitionCollection: null,
      };
      this.activeRuns.set(run.runId, run);
      return run;
    }

    getRun(runId) { return this.activeRuns.get(runId) || null; }

    async _executeTool(registry, action, run, signal, onStatus) {
      if (!registry || typeof registry.execute !== 'function') {
        throw Object.assign(new Error(`未知 Tool：${action.tool || '(空)'}`), { code: 'UNKNOWN_TOOL' });
      }
      run.status = 'tool_waiting';
      const envelope = await registry.execute(action.tool, action.arguments, {
        runId: run.runId,
        sessionId: run.sessionId,
        step: run.step,
        signal,
        onPermissionWaiting: request => {
          run.status = 'permission_waiting';
          if (typeof onStatus === 'function') onStatus(`等待 Tool 权限：${action.tool}`, run, request);
        },
      });
      const call = {
        toolCallId: envelope.toolCallId,
        name: action.tool,
        arguments: action.arguments,
        step: run.step,
        status: envelope.status,
        startedAt: envelope.startedAt,
        finishedAt: envelope.finishedAt,
        result: envelope.ok ? envelope.data : null,
        error: envelope.ok ? null : envelope.error,
      };
      run.toolCalls.push(call);
      if (!envelope.ok) {
        if (envelope.error && envelope.error.code === 'TOOL_CANCELLED') throw abortError();
        const error = new Error((envelope.error && envelope.error.message) || 'Tool 执行失败');
        error.code = (envelope.error && envelope.error.code) || 'TOOL_REGISTRY_INTERNAL_ERROR';
        error.toolResult = envelope;
        throw error;
      }
      return envelope;
    }

    async _prepareMessages(options, useActionContract) {
      const initialMessages = Array.isArray(options.messages)
        ? options.messages.map(message => ({ ...message }))
        : [];
      const messages = useActionContract
        ? [{ role: 'system', content: ACTION_CONTRACT }, ...initialMessages]
        : initialMessages;
      const skillRouter = options.skillRouter || this.skillRouter;
      const skillComposer = options.skillComposer || this.skillComposer;
      let skillRouting = null;
      let skillRoutingError = null;
      let skillContext = null;
      let skillCompositionError = null;
      if (skillRouter && options.skillRouting !== false && typeof skillRouter.route === 'function') {
        try {
          skillRouting = await skillRouter.route({
            text: options.userMessage,
            messages: initialMessages,
            modalities: options.modalities || ['text'],
            projectId: options.projectId || null,
            projectContext: options.projectContext || null,
            sessionId: options.sessionId || null,
            explicitSkillId: options.explicitSkillId || null,
            toolRegistry: options.toolRegistry || this.toolRegistry,
          });
          if (skillRouting && skillRouting.error) skillRoutingError = { ...skillRouting.error };
        } catch (error) {
          skillRoutingError = { code: error.code || 'SKILL_ROUTING_FAILED', message: error.message || 'Skill routing failed' };
          skillRouting = { type: 'no_skill', selectedSkillIds: [], confidence: 'low', reasons: [], excluded: [], continuityUsed: false, ambiguousCandidates: [] };
        }
      }
      if (skillRouting && skillRouting.selectedSkillIds && skillRouting.selectedSkillIds.length && skillComposer && typeof skillComposer.compose === 'function') {
        try {
          skillContext = await skillComposer.compose(skillRouting, { maxChars: options.skillContextBudget });
          if (skillContext && skillContext.systemMessage && skillContext.systemMessage.content) {
            let insertAt = useActionContract ? 1 : 0;
            while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt += 1;
            messages.splice(insertAt, 0, { ...skillContext.systemMessage });
          }
        } catch (error) {
          skillCompositionError = { code: error.code || 'SKILL_COMPOSITION_FAILED', message: error.message || 'Skill composition failed' };
          skillContext = null;
        }
      }
      const builder = options.contextBuilder || this.contextBuilder;
      let cognitionContext = null;
      let cognitionError = null;
      if (builder && options.cognition !== false && typeof builder.build === 'function') {
        try {
          cognitionContext = await builder.build({
            messages: initialMessages,
            projectId: options.projectId || null,
            projectContext: options.projectContext || null,
            skillContext: skillContext || options.skillContext || null,
            conversationContext: options.conversationContext || null,
            sessionId: options.sessionId || null,
            maxChars: options.contextBudget,
          });
          if (cognitionContext && cognitionContext.systemMessage && cognitionContext.systemMessage.content) {
            let insertAt = useActionContract ? 1 : 0;
            while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt += 1;
            messages.splice(insertAt, 0, { ...cognitionContext.systemMessage });
          }
        } catch (_) {
          // Cognition is an optional enhancement. Never break normal chat.
          cognitionError = { code: 'CONTEXT_BUILD_FAILED' };
          cognitionContext = null;
        }
      }
      const creativeBuilder = options.creativeContextBuilder || this.creativeContextBuilder;
      let creativeContext = null;
      let creativeError = null;
      if (creativeBuilder && options.creative !== false && typeof creativeBuilder.build === 'function') {
        try {
          creativeContext = await creativeBuilder.build({
            messages: initialMessages,
            userMessage: options.userMessage,
            projectId: options.projectId || null,
            projectContext: options.projectContext || null,
            skillContext: skillContext || options.skillContext || null,
            sessionId: options.sessionId || null,
            maxChars: options.creativeContextBudget,
          });
          if (creativeContext && creativeContext.stateError) creativeError = { ...creativeContext.stateError };
          if (creativeContext && creativeContext.systemMessage && creativeContext.systemMessage.content) {
            let insertAt = useActionContract ? 1 : 0;
            while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt += 1;
            messages.splice(insertAt, 0, { ...creativeContext.systemMessage });
          }
        } catch (_) {
          creativeError = { code: 'CREATIVE_CONTEXT_BUILD_FAILED' };
          creativeContext = null;
        }
      }
      const challengeBuilder = options.challengeContextBuilder || this.challengeContextBuilder;
      let challengeContext = null;
      let challengeError = null;
      let challengeCommand = null;
      let challengeCommandMeta = null;
      if (challengeBuilder && options.challenge !== false && typeof challengeBuilder.build === 'function') {
        if (typeof challengeBuilder.parseCommand === 'function') {
          try {
            const parsed = challengeBuilder.parseCommand({ messages: initialMessages, userMessage: options.userMessage });
            challengeCommandMeta = parsed || null;
            challengeCommand = parsed && parsed.type ? parsed.type : null;
          } catch (_) { /* Builder failure remains isolated from normal chat. */ }
        }
        try {
          challengeContext = await challengeBuilder.build({
            messages: initialMessages,
            userMessage: options.userMessage,
            projectId: options.projectId || null,
            projectContext: options.projectContext || null,
            skillContext: skillContext || options.skillContext || null,
            sessionId: options.sessionId || null,
            creativeContext,
            maxChars: options.challengeContextBudget,
          });
          if (challengeContext && challengeContext.error) challengeError = { ...challengeContext.error };
          if (challengeContext && challengeContext.resolution && challengeContext.resolution.command) {
            challengeCommandMeta = challengeContext.resolution.command;
            challengeCommand = challengeCommandMeta.type || challengeCommand;
          }
          if (challengeContext && challengeContext.systemMessage && challengeContext.systemMessage.content) {
            let insertAt = useActionContract ? 1 : 0;
            while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt += 1;
            messages.splice(insertAt, 0, { ...challengeContext.systemMessage });
          }
        } catch (_) {
          challengeError = { code: 'CHALLENGE_CONTEXT_BUILD_FAILED' };
          challengeContext = null;
        }
      }
      const inspirationBuilder = options.inspirationContextBuilder || this.inspirationContextBuilder;
      let inspirationContext = null;
      let inspirationError = null;
      if (inspirationBuilder && options.inspiration !== false && typeof inspirationBuilder.build === 'function') {
        try {
          inspirationContext = await inspirationBuilder.build({
            messages: initialMessages,
            userMessage: options.userMessage,
            projectId: options.projectId || null,
            sessionId: options.sessionId || null,
            maxChars: options.inspirationContextBudget,
          });
          if (inspirationContext && inspirationContext.error) inspirationError = { ...inspirationContext.error };
          if (inspirationContext && inspirationContext.systemMessage && inspirationContext.systemMessage.content) {
            let insertAt = useActionContract ? 1 : 0;
            while (insertAt < messages.length && messages[insertAt].role === 'system') insertAt += 1;
            messages.splice(insertAt, 0, { ...inspirationContext.systemMessage });
          }
        } catch (_) {
          inspirationError = { code: 'INSPIRATION_CONTEXT_BUILD_FAILED' };
          inspirationContext = null;
        }
      }
      return { messages, initialMessages, skillRouting, skillRoutingError, skillContext, skillCompositionError, cognitionContext, cognitionError, creativeContext, creativeError, challengeContext, challengeError, challengeCommand, challengeCommandMeta, inspirationContext, inspirationError };
    }

    _scheduleCollection(options, run, initialMessages, content) {
      const collector = options.cognitionCollector || this.cognitionCollector;
      if (!collector || options.skipCognitionCollection || typeof collector.collectTurn !== 'function') return null;
      const challengeCommandMeta = run.challengeCommandMeta || (run.challengeContext
        && run.challengeContext.resolution
        && run.challengeContext.resolution.command) || null;
      const challengeCommand = (challengeCommandMeta && challengeCommandMeta.type) || run.challengeCommand;
      let userMessage = options.userMessage;
      if (userMessage == null) {
        for (let index = initialMessages.length - 1; index >= 0; index -= 1) {
          if (initialMessages[index] && initialMessages[index].role === 'user') {
            userMessage = initialMessages[index].content;
            break;
          }
        }
      }
      if (userMessage == null) return null;
      if (challengeCommand && challengeCommand !== 'none') {
        const remaining = challengeCommandMeta && typeof challengeCommandMeta.remainingUserContent === 'string'
          ? challengeCommandMeta.remainingUserContent.trim()
          : '';
        if (!remaining) {
          run.cognitionCollection = { ok: true, skipped: 'challenge_runtime_command', promoted: false, scope: null };
          return null;
        }
        userMessage = remaining;
      }
      const promise = Promise.resolve().then(() => collector.collectTurn({
        userMessage,
        assistantMessage: content,
        sessionId: run.sessionId,
        projectId: options.projectId || null,
      })).then(result => {
        run.cognitionCollection = result && typeof result === 'object'
          ? { ok: result.ok !== false, skipped: result.skipped || null, promoted: Boolean(result.promoted), scope: result.scope || null }
          : { ok: true, skipped: null, promoted: false, scope: null };
        return result;
      }).catch(() => {
        run.cognitionCollection = { ok: false, error: 'COLLECTOR_FAILED' };
        return run.cognitionCollection;
      });
      run.collectionPromise = promise;
      return promise;
    }

    async runStream(options = {}) {
      const ai = options.aiService || this.aiService;
      if (!ai || typeof ai.stream !== 'function') throw new Error('Agent Core 缺少 AIService.stream');
      const prepared = await this._prepareMessages(options, !options.disableActionContract);
      const { messages, initialMessages, skillRouting, skillRoutingError, skillContext, skillCompositionError, cognitionContext, cognitionError, creativeContext, creativeError, challengeContext, challengeError, challengeCommand, challengeCommandMeta, inspirationContext, inspirationError } = prepared;
      const run = this.createRun({ ...options, messages, skillRouting, skillRoutingError, skillContext, skillCompositionError, cognitionContext, cognitionError, creativeContext, creativeError, challengeContext, challengeError, challengeCommand, challengeCommandMeta, inspirationContext, inspirationError });
      const signal = options.signal;
      const maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : this.maxSteps;
      const registry = options.toolRegistry || this.toolRegistry;
      run.status = 'thinking';
      try {
        for (let step = 1; step <= maxSteps; step += 1) {
          if (signal && signal.aborted) throw abortError();
          run.step = step;
          let streamed = '';
          const raw = await ai.stream(run.messages, (chunk, full) => {
            streamed = full || streamed;
            if (typeof options.onChunk === 'function') options.onChunk(chunk, full || streamed, run);
          }, signal);
          const action = normalizeAction(raw || streamed);
          if (action.type === 'direct_response' || action.type === 'final_response') {
            run.status = 'completed';
            run.finishedAt = new Date().toISOString();
            this._scheduleCollection(options, run, initialMessages, action.content);
            return { ok: true, run, action, content: action.content };
          }
          if (action.type === 'agent_error') throw Object.assign(new Error(action.message), { code: action.code });
          const result = await this._executeTool(registry, action, run, signal, options.onStatus);
          if (signal && signal.aborted) throw abortError();
          run.messages.push({ role: 'assistant', content: JSON.stringify(action) });
          run.messages.push({ role: 'tool', name: action.tool, content: JSON.stringify(result) });
          run.status = 'continuing';
          if (typeof options.onStatus === 'function') options.onStatus(`已执行 Tool：${action.tool}`, run);
        }
        throw Object.assign(new Error(`Agent 已达到最大步骤限制（${maxSteps}）`), { code: 'MAX_STEPS' });
      } catch (error) {
        run.status = error.name === 'AbortError' || error.code === 'AGENT_CANCELLED' ? 'cancelled' : 'failed';
        run.error = { code: error.code || 'AGENT_ERROR', message: error.message || 'Agent 执行失败' };
        run.finishedAt = new Date().toISOString();
        return { ok: false, run, error: { ...run.error, cancelled: run.status === 'cancelled' } };
      } finally {
        if (TERMINAL.has(run.status)) this.activeRuns.delete(run.runId);
      }
    }

    async run(options = {}) {
      const ai = options.aiService || this.aiService;
      if (!ai || typeof ai.send !== 'function') throw new Error('Agent Core 缺少 AIService');
      const prepared = await this._prepareMessages(options, !options.disableActionContract);
      const { messages, initialMessages, skillRouting, skillRoutingError, skillContext, skillCompositionError, cognitionContext, cognitionError, creativeContext, creativeError, challengeContext, challengeError, challengeCommand, challengeCommandMeta, inspirationContext, inspirationError } = prepared;
      const run = this.createRun({ ...options, messages, skillRouting, skillRoutingError, skillContext, skillCompositionError, cognitionContext, cognitionError, creativeContext, creativeError, challengeContext, challengeError, challengeCommand, challengeCommandMeta, inspirationContext, inspirationError });
      const signal = options.signal;
      const maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : this.maxSteps;
      const registry = options.toolRegistry || this.toolRegistry;
      run.status = 'thinking';
      try {
        for (let step = 1; step <= maxSteps; step += 1) {
          if (signal && signal.aborted) throw abortError();
          run.step = step;
          const raw = await ai.send(run.messages, { signal, timeout: options.timeout });
          if (signal && signal.aborted) throw abortError();
          const action = normalizeAction(raw);
          if (action.type === 'direct_response' || action.type === 'final_response') {
            run.status = 'completed';
            run.finishedAt = new Date().toISOString();
            this._scheduleCollection(options, run, initialMessages, action.content);
            return { ok: true, run, action, content: action.content };
          }
          if (action.type === 'agent_error') throw Object.assign(new Error(action.message), { code: action.code });
          const result = await this._executeTool(registry, action, run, signal, options.onStatus);
          if (signal && signal.aborted) throw abortError();
          run.messages.push({ role: 'assistant', content: JSON.stringify(action) });
          run.messages.push({ role: 'tool', name: action.tool, content: JSON.stringify(result) });
          run.status = 'continuing';
        }
        throw Object.assign(new Error(`Agent 已达到最大步骤限制（${maxSteps}）`), { code: 'MAX_STEPS' });
      } catch (error) {
        run.status = error.name === 'AbortError' || error.code === 'AGENT_CANCELLED' ? 'cancelled' : 'failed';
        run.error = { code: error.code || 'AGENT_ERROR', message: error.message || 'Agent 执行失败' };
        run.finishedAt = new Date().toISOString();
        return {
          ok: false,
          run,
          error: { ...run.error, cancelled: run.status === 'cancelled' },
        };
      } finally {
        if (TERMINAL.has(run.status)) this.activeRuns.delete(run.runId);
      }
    }

    async runNativeTools(options = {}) {
      const ai = options.aiService || this.aiService;
      const registry = options.toolRegistry || this.toolRegistry;
      if (!ai || typeof ai.sendWithTools !== 'function') throw new Error('Agent Core requires a native tool-calling provider adapter.');
      if (!registry || typeof registry.listDefinitions !== 'function') throw new Error('Agent Core requires a tool registry.');
      const prepared = await this._prepareMessages(options, false);
      const run = this.createRun({ ...options, ...prepared, messages: prepared.messages });
      const signal = options.signal;
      const maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : this.maxSteps;
      const tools = registry.listDefinitions().map(definition => ({ type: 'function', function: {
        name: definition.name, description: definition.description, parameters: definition.inputSchema,
      } }));
      run.status = 'thinking';
      try {
        for (let step = 1; step <= maxSteps; step += 1) {
          run.step = step;
          const action = normalizeAction(await ai.sendWithTools(run.messages, { tools, signal, timeout: options.timeout }));
          if (action.type === 'direct_response' || action.type === 'final_response') {
            run.status = 'completed'; run.finishedAt = new Date().toISOString();
            return { ok: true, run, action, content: action.content };
          }
          if (action.type === 'agent_error') throw Object.assign(new Error(action.message), { code: action.code });
          const result = await this._executeTool(registry, action, run, signal, options.onStatus);
          run.messages.push(action.providerMessage || { role: 'assistant', content: JSON.stringify(action) });
          run.messages.push(action.providerToolCallId
            ? { role: 'tool', tool_call_id: action.providerToolCallId, content: JSON.stringify(result) }
            : { role: 'tool', name: action.tool, content: JSON.stringify(result) });
          run.status = 'continuing';
        }
        throw Object.assign(new Error(`Agent exceeded max steps (${maxSteps}).`), { code: 'MAX_STEPS' });
      } catch (error) {
        run.status = error.name === 'AbortError' || error.code === 'AGENT_CANCELLED' ? 'cancelled' : 'failed';
        run.error = { code: error.code || 'AGENT_ERROR', message: error.message || 'Agent execution failed.' };
        run.finishedAt = new Date().toISOString();
        return { ok: false, run, error: { ...run.error, cancelled: run.status === 'cancelled' } };
      } finally {
        if (TERMINAL.has(run.status)) this.activeRuns.delete(run.runId);
      }
    }
  }

  TeemoAgentCore.normalizeAction = normalizeAction;
  return TeemoAgentCore;
});
