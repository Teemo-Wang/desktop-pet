/* Bounded, owner-controlled P5-2 execution. Runtime state is intentionally memory-only. */
(function (root, factory) {
  const PlanningContract = root && root.TeemoPlanningContract
    ? root.TeemoPlanningContract
    : (typeof module === 'object' && module.exports ? require('../planning/TeemoPlanningContract') : null);
  const Execution = factory(PlanningContract);
  if (root) root.TeemoAutonomousExecution = Execution;
  if (typeof window !== 'undefined') window.TeemoAutonomousExecution = Execution;
  if (typeof module === 'object' && module.exports) module.exports = Execution;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PlanningContract) {
  const SAFE_TOOLS = Object.freeze([
    'list_directory', 'read_file', 'search_files', 'search_text',
    'create_file', 'patch_file', 'rename_file', 'create_directory',
  ]);
  const READ_TOOLS = new Set(['list_directory', 'read_file', 'search_files', 'search_text']);
  const WRITE_TOOLS = new Set(['create_file', 'patch_file', 'rename_file', 'create_directory']);
  const TERMINAL = new Set(['succeeded', 'failed', 'blocked', 'cancelled', 'timed_out']);
  const RETRYABLE_CODES = new Set(['TOOL_HANDLER_FAILED', 'FILE_OPERATION_FAILED']);
  const LIMITS = Object.freeze({ maxSteps: 12, maxRetries: 1, runTimeoutMs: 300000, stepTimeoutMs: 60000 });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function makeId() { return `execution_run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
  function executionError(code, message) { return Object.assign(new Error(message), { code }); }
  function planFingerprint(planState) {
    const state = planState && planState.plan ? planState : { plan: planState };
    return JSON.stringify({ plan: state && state.plan || null, createdAt: state && state.createdAt || null, revisedAt: state && state.revisedAt || null });
  }

  function abortable(value, signal) {
    if (!signal) return Promise.resolve(value);
    if (signal.aborted) return Promise.reject(executionError('EXECUTION_CANCELLED', 'Execution was cancelled.'));
    return new Promise((resolve, reject) => {
      const aborted = () => reject(executionError('EXECUTION_CANCELLED', 'Execution was cancelled.'));
      signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(value).then(result => {
        signal.removeEventListener('abort', aborted);
        resolve(result);
      }, error => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      });
    });
  }

  function deadline(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
      signal: controller.signal,
      didTimeout: () => timedOut,
      dispose: () => {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
      },
    };
  }

  function resultData(envelope) {
    return envelope && envelope.ok ? envelope.data : null;
  }

  function verifyTrustedResult(action, envelope, expected = null) {
    const data = resultData(envelope);
    if (!data || typeof data !== 'object') return false;
    if (action.tool === 'list_directory') return data.type === 'directory' && Array.isArray(data.entries);
    if (action.tool === 'read_file') {
      if (data.type !== 'file' || typeof data.path !== 'string' || !/^[a-f0-9]{64}$/i.test(String(data.sha256 || ''))) return false;
      return !expected || !expected.sha256 || data.sha256 === expected.sha256;
    }
    if (action.tool === 'search_files' || action.tool === 'search_text') return Array.isArray(data.results);
    return false;
  }

  function verificationAction(action, envelope) {
    const data = resultData(envelope);
    if (!data || typeof data.path !== 'string') return null;
    if (action.tool === 'create_directory') return { type: 'tool_request', tool: 'list_directory', arguments: { path: data.path } };
    if (action.tool === 'create_file' || action.tool === 'patch_file' || action.tool === 'rename_file') {
      return { type: 'tool_request', tool: 'read_file', arguments: { path: data.path }, expected: { sha256: data.sha256 } };
    }
    return null;
  }

  class TeemoAutonomousExecution {
    constructor(options = {}) {
      this.agentCore = options.agentCore || null;
      this.aiService = options.aiService || null;
      this.toolRegistry = options.toolRegistry || null;
      this.runs = new Map();
      this.controllers = new Map();
      this.latestBySession = new Map();
    }

    _snapshot(run) { return clone(run); }

    _setState(run, state, onState, details = null) {
      run.state = state;
      run.updatedAt = new Date().toISOString();
      if (details) run.stateDetails = clone(details);
      if (typeof onState === 'function') onState(this._snapshot(run));
    }

    _ownerCurrent(run, getCurrentSessionId) {
      return typeof getCurrentSessionId === 'function' && String(getCurrentSessionId() || '') === run.sessionId;
    }

    _assertContext(run, getCurrentSessionId, getCurrentPlanState) {
      if (!this._ownerCurrent(run, getCurrentSessionId)) throw executionError('EXECUTION_OWNER_STALE', 'The execution owner is no longer active.');
      if (typeof getCurrentPlanState !== 'function' || planFingerprint(getCurrentPlanState()) !== run.planFingerprint) {
        throw executionError('EXECUTION_PLAN_STALE', 'The approved plan changed during execution.');
      }
    }

    _finish(run, state, code, message, onState) {
      run.error = code ? { code, message } : null;
      run.finishedAt = new Date().toISOString();
      this._setState(run, state, onState, code ? { code, message } : null);
      this.controllers.delete(run.runId);
      return { ok: state === 'succeeded', run: this._snapshot(run), error: run.error ? { ...run.error } : null };
    }

    _validate(options) {
      if (!this.agentCore || typeof this.agentCore.requestAutonomousToolAction !== 'function'
        || typeof this.agentCore.executeAutonomousToolAction !== 'function') {
        throw executionError('EXECUTION_AGENT_CORE_UNAVAILABLE', 'Autonomous execution requires Teemo Agent Core.');
      }
      if (!PlanningContract) throw executionError('EXECUTION_PLAN_INVALID', 'Planning contract is unavailable.');
      const sessionId = String(options.sessionId || '').trim();
      if (!sessionId || typeof options.getCurrentSessionId !== 'function') throw executionError('EXECUTION_OWNER_INVALID', 'An active owner session is required.');
      if (typeof options.getCurrentPlanState !== 'function') throw executionError('EXECUTION_PLAN_INVALID', 'Current plan state validation is required.');
      const planState = options.planState && options.planState.plan ? options.planState : { plan: options.planState };
      const plan = planState && planState.plan;
      const checked = plan && PlanningContract.parseResponse(JSON.stringify(plan), { goal: plan.goal });
      if (!checked || !checked.ok) throw executionError('EXECUTION_PLAN_INVALID', checked && checked.error ? checked.error.message : 'A valid P5-1 plan is required.');
      const maxSteps = options.maxSteps;
      const maxRetries = options.maxRetries;
      const runTimeoutMs = options.runTimeoutMs;
      const stepTimeoutMs = options.stepTimeoutMs;
      if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > LIMITS.maxSteps || checked.plan.steps.length > maxSteps) {
        throw executionError('EXECUTION_BOUNDS_INVALID', 'maxSteps must cover the plan and be between 1 and 12.');
      }
      if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > LIMITS.maxRetries) {
        throw executionError('EXECUTION_BOUNDS_INVALID', 'maxRetries must be 0 or 1.');
      }
      if (!Number.isInteger(runTimeoutMs) || runTimeoutMs < 1 || runTimeoutMs > LIMITS.runTimeoutMs
        || !Number.isInteger(stepTimeoutMs) || stepTimeoutMs < 1 || stepTimeoutMs > LIMITS.stepTimeoutMs) {
        throw executionError('EXECUTION_BOUNDS_INVALID', 'Finite run and step deadlines are required.');
      }
      if (typeof options.requestRunApproval !== 'function') throw executionError('EXECUTION_APPROVAL_REQUIRED', 'Explicit run approval is required.');
      return { sessionId, plan: checked.plan, planFingerprint: planFingerprint(planState), maxSteps, maxRetries, runTimeoutMs, stepTimeoutMs };
    }

    getRun(runId, sessionId) {
      const run = this.runs.get(String(runId || ''));
      return run && run.sessionId === String(sessionId || '') ? this._snapshot(run) : null;
    }

    getLatestRun(sessionId) {
      const runId = this.latestBySession.get(String(sessionId || ''));
      return runId ? this.getRun(runId, sessionId) : null;
    }

    cancel(runId, sessionId) {
      const run = this.runs.get(String(runId || ''));
      if (!run || run.sessionId !== String(sessionId || '') || TERMINAL.has(run.state)) return { ok: false, code: 'EXECUTION_OWNER_MISMATCH' };
      run.cancelRequested = true;
      const controller = this.controllers.get(run.runId);
      if (controller) controller.abort();
      return { ok: true };
    }

    discard(runId, sessionId) {
      const run = this.runs.get(String(runId || ''));
      if (!run || run.sessionId !== String(sessionId || '') || !TERMINAL.has(run.state)) return false;
      this.runs.delete(run.runId);
      if (this.latestBySession.get(run.sessionId) === run.runId) this.latestBySession.delete(run.sessionId);
      return true;
    }

    async _execute(run, action, signal, options, verification = false) {
      let attempt = 0;
      const retryable = verification || READ_TOOLS.has(action.tool);
      while (true) {
        try {
          const envelope = await this.agentCore.executeAutonomousToolAction({
            action,
            runId: run.runId,
            sessionId: run.sessionId,
            step: run.currentStep,
            signal,
            toolRegistry: options.toolRegistry || this.toolRegistry,
            onStatus: options.onToolStatus,
            toolCalls: run.toolCalls,
          });
          return envelope;
        } catch (error) {
          if (!retryable || attempt >= run.maxRetries || !RETRYABLE_CODES.has(String(error.code || ''))) throw error;
          attempt += 1;
          run.steps[run.currentStep - 1].retries = attempt;
          run.retryCount += 1;
          this._setState(run, 'running', options.onState, { retry: attempt, verification });
        }
      }
    }

    async run(options = {}) {
      let validated;
      try { validated = this._validate(options); } catch (error) {
        return { ok: false, run: null, error: { code: error.code || 'EXECUTION_INVALID', message: error.message } };
      }
      const previousRunId = this.latestBySession.get(validated.sessionId);
      const previousRun = previousRunId ? this.runs.get(previousRunId) : null;
      if (previousRun && !TERMINAL.has(previousRun.state)) {
        return { ok: false, run: this._snapshot(previousRun), error: { code: 'EXECUTION_ALREADY_ACTIVE', message: 'This session already has an active execution run.' } };
      }
      if (previousRun) this.runs.delete(previousRun.runId);
      const run = {
        runId: options.runId || makeId(), sessionId: validated.sessionId, state: 'pending',
        plan: clone(validated.plan), planRevision: options.planState && options.planState.revisedAt || null,
        planFingerprint: validated.planFingerprint,
        maxSteps: validated.maxSteps, maxRetries: validated.maxRetries,
        runTimeoutMs: validated.runTimeoutMs, stepTimeoutMs: validated.stepTimeoutMs,
        currentStep: 0, retryCount: 0, toolCalls: [], cancelRequested: false,
        steps: validated.plan.steps.map((step, index) => ({ index: index + 1, title: step.title, state: 'pending', retries: 0, tool: null, verified: false })),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null, error: null,
      };
      this.runs.set(run.runId, run);
      this.latestBySession.set(run.sessionId, run.runId);
      const controller = new AbortController();
      this.controllers.set(run.runId, controller);
      const onExternalAbort = () => controller.abort();
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
      const runDeadline = deadline(controller.signal, run.runTimeoutMs);
      const signal = runDeadline.signal;
      const finishError = (error, stepDeadline = null) => {
        if (runDeadline.didTimeout() || (stepDeadline && stepDeadline.didTimeout())) {
          return this._finish(run, 'timed_out', 'EXECUTION_TIMED_OUT', 'The bounded execution deadline expired.', options.onState);
        }
        if (run.cancelRequested || signal.aborted || error.code === 'EXECUTION_CANCELLED' || error.code === 'AGENT_CANCELLED') {
          return this._finish(run, 'cancelled', 'EXECUTION_CANCELLED', 'Execution was cancelled.', options.onState);
        }
        const blocked = ['EXECUTION_OWNER_STALE', 'EXECUTION_PLAN_STALE', 'EXECUTION_PLAN_BLOCKED', 'EXECUTION_APPROVAL_DENIED', 'EXECUTION_STEP_CONFIRMATION_DENIED', 'EXECUTION_STEP_UNVERIFIABLE'].includes(error.code);
        return this._finish(run, blocked ? 'blocked' : 'failed', error.code || 'EXECUTION_FAILED', error.message || 'Execution failed.', options.onState);
      };
      try {
        this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
        const blockedStep = run.plan.steps.findIndex(step => step.status !== 'proposed');
        if (blockedStep >= 0) {
          throw executionError('EXECUTION_PLAN_BLOCKED', `Plan step ${blockedStep + 1} has an unmet prerequisite and must be revised before execution.`);
        }
        this._setState(run, 'awaiting_user_approval', options.onState);
        const approved = await abortable(options.requestRunApproval(this._snapshot(run), signal), signal);
        this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
        if (approved !== true) throw executionError('EXECUTION_APPROVAL_DENIED', 'The owner did not approve this execution run.');
        run.approvedAt = new Date().toISOString();

        for (let index = 0; index < run.plan.steps.length; index += 1) {
          const planStep = run.plan.steps[index];
          run.currentStep = index + 1;
          if (planStep.status !== 'proposed') throw executionError('EXECUTION_STEP_UNVERIFIABLE', 'A blocked plan step cannot be executed.');
          const stepDeadline = deadline(signal, run.stepTimeoutMs);
          try {
            this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
            this._setState(run, 'running', options.onState, { step: run.currentStep });
            const action = await this.agentCore.requestAutonomousToolAction({
              aiService: options.aiService || this.aiService,
              toolRegistry: options.toolRegistry || this.toolRegistry,
              signal: stepDeadline.signal,
              timeout: run.stepTimeoutMs,
              plan: run.plan,
              planStep,
              step: run.currentStep,
            });
            this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
            if (!action || action.type !== 'tool_request' || !SAFE_TOOLS.includes(action.tool)) {
              throw executionError('EXECUTION_STEP_UNVERIFIABLE', 'The plan step did not produce one allowed Safe File Tool action.');
            }
            run.steps[index].tool = action.tool;
            if (WRITE_TOOLS.has(action.tool)) {
              if (typeof options.requestStepConfirmation !== 'function') throw executionError('EXECUTION_STEP_CONFIRMATION_REQUIRED', 'A side-effecting step requires confirmation.');
              this._setState(run, 'awaiting_step_confirmation', options.onState, { step: run.currentStep, tool: action.tool, arguments: clone(action.arguments) });
              const confirmed = await abortable(options.requestStepConfirmation({
                runId: run.runId, sessionId: run.sessionId, step: run.currentStep,
                tool: action.tool, arguments: clone(action.arguments), planStep: clone(planStep),
              }, stepDeadline.signal), stepDeadline.signal);
              this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
              if (confirmed !== true) throw executionError('EXECUTION_STEP_CONFIRMATION_DENIED', 'The owner did not confirm the side-effecting step.');
            }
            this._setState(run, 'authorizing', options.onState, { step: run.currentStep, tool: action.tool });
            const envelope = await this._execute(run, action, stepDeadline.signal, options, false);
            this._assertContext(run, options.getCurrentSessionId, options.getCurrentPlanState);
            this._setState(run, 'verifying', options.onState, { step: run.currentStep, tool: action.tool });
            if (READ_TOOLS.has(action.tool)) {
              if (!verifyTrustedResult(action, envelope)) throw executionError('EXECUTION_VERIFICATION_FAILED', 'Trusted read result validation failed.');
            } else {
              const verifyAction = verificationAction(action, envelope);
              if (!verifyAction) throw executionError('EXECUTION_STEP_UNVERIFIABLE', 'The mutation did not provide a trusted postcondition.');
              const verification = await this._execute(run, verifyAction, stepDeadline.signal, options, true);
              if (!verifyTrustedResult(verifyAction, verification, verifyAction.expected)) {
                throw executionError('EXECUTION_VERIFICATION_FAILED', 'The mutation postcondition could not be confirmed.');
              }
            }
            run.steps[index].state = 'succeeded';
            run.steps[index].verified = true;
          } catch (error) {
            run.steps[index].state = stepDeadline.didTimeout() ? 'timed_out' : (signal.aborted ? 'cancelled' : 'failed');
            return finishError(error, stepDeadline);
          } finally {
            stepDeadline.dispose();
          }
        }
        return this._finish(run, 'succeeded', null, null, options.onState);
      } catch (error) {
        return finishError(error);
      } finally {
        runDeadline.dispose();
        if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  TeemoAutonomousExecution.SAFE_TOOLS = SAFE_TOOLS;
  TeemoAutonomousExecution.LIMITS = LIMITS;
  return TeemoAutonomousExecution;
});
