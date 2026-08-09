/*
 * TeemoAgentCore
 * Model-neutral Agent Run/Step loop. It only exposes harmless in-memory tools
 * in P1-1; filesystem, shell, Git and network tools belong to later phases.
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
        if (parsed && typeof parsed.type === 'string') return parsed;
      } catch (_) { /* normal prose is a direct response */ }
    }
    return { type: 'direct_response', content: value };
  }

  function normalizeAction(value) {
    const action = parseAction(value);
    if (action.type === 'final_response') return { type: 'final_response', content: String(action.content ?? '') };
    if (action.type === 'direct_response') return { type: 'direct_response', content: String(action.content ?? '') };
    if (action.type === 'tool_request') {
      return {
        type: 'tool_request',
        tool: String(action.tool || ''),
        arguments: action.arguments && typeof action.arguments === 'object' ? action.arguments : {},
      };
    }
    return { type: 'agent_error', code: 'INVALID_ACTION', message: `未知 Agent Action 类型：${action.type || '(空)'}` };
  }

  function createSafeTestTools() {
    return {
      echo: async (args) => ({ text: String(args && args.text != null ? args.text : '') }),
      get_agent_runtime_info: async (_args, context) => ({
        runId: context.runId,
        step: context.step,
        test: true,
      }),
    };
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
      this.maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : 4;
      this.tools = { ...createSafeTestTools(), ...(options.tools || {}) };
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
      };
      this.activeRuns.set(run.runId, run);
      return run;
    }

    getRun(runId) { return this.activeRuns.get(runId) || null; }

    async runStream(options = {}) {
      const ai = options.aiService || this.aiService;
      if (!ai || typeof ai.stream !== 'function') throw new Error('Agent Core 缺少 AIService.stream');
      const initialMessages = Array.isArray(options.messages) ? options.messages : [];
      const messages = options.disableActionContract ? initialMessages : [{ role: 'system', content: ACTION_CONTRACT }, ...initialMessages];
      const run = this.createRun({ ...options, messages });
      const signal = options.signal;
      const maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : this.maxSteps;
      const tools = options.tools ? { ...this.tools, ...options.tools } : this.tools;
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
            return { ok: true, run, action, content: action.content };
          }
          if (action.type === 'agent_error') throw Object.assign(new Error(action.message), { code: action.code });
          if (!tools[action.tool] || typeof tools[action.tool] !== 'function') throw Object.assign(new Error(`未知 Tool：${action.tool || '(空)'}`), { code: 'UNKNOWN_TOOL' });
          run.status = 'tool_waiting';
          run.toolCalls.push({ tool: action.tool, arguments: action.arguments, step });
          let result;
          try { result = await tools[action.tool](action.arguments, { runId: run.runId, step, signal }); }
          catch (error) { throw Object.assign(new Error(`Tool 执行失败：${error.message || error}`), { code: 'TOOL_FAILED', cause: error }); }
          if (signal && signal.aborted) throw abortError();
          run.messages.push({ role: 'assistant', content: JSON.stringify(action) });
          run.messages.push({ role: 'tool', name: action.tool, content: JSON.stringify(result ?? null) });
          run.status = 'continuing';
          if (typeof options.onStatus === 'function') options.onStatus(`已执行测试 Tool：${action.tool}`, run);
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
      const initialMessages = Array.isArray(options.messages) ? options.messages : [];
      const messages = options.disableActionContract
        ? initialMessages
        : [{ role: 'system', content: ACTION_CONTRACT }, ...initialMessages];
      const run = this.createRun({ ...options, messages });
      const signal = options.signal;
      const maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : this.maxSteps;
      const tools = options.tools ? { ...this.tools, ...options.tools } : this.tools;
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
            return { ok: true, run, action, content: action.content };
          }
          if (action.type === 'agent_error') throw Object.assign(new Error(action.message), { code: action.code });
          if (!tools[action.tool] || typeof tools[action.tool] !== 'function') {
            throw Object.assign(new Error(`未知 Tool：${action.tool || '(空)'}`), { code: 'UNKNOWN_TOOL' });
          }
          run.status = 'tool_waiting';
          const call = { tool: action.tool, arguments: action.arguments, step };
          run.toolCalls.push(call);
          let result;
          try {
            result = await tools[action.tool](action.arguments, { runId: run.runId, step, signal });
          } catch (error) {
            throw Object.assign(new Error(`Tool 执行失败：${error.message || error}`), { code: 'TOOL_FAILED', cause: error });
          }
          if (signal && signal.aborted) throw abortError();
          run.messages.push({ role: 'assistant', content: JSON.stringify(action) });
          run.messages.push({ role: 'tool', name: action.tool, content: JSON.stringify(result ?? null) });
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
  }

  TeemoAgentCore.createSafeTestTools = createSafeTestTools;
  TeemoAgentCore.normalizeAction = normalizeAction;
  return TeemoAgentCore;
});
