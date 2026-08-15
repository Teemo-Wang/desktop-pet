const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoAutonomousExecution = require('../src/execution/TeemoAutonomousExecution');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoFileTools = require('../src/tools/file/TeemoFileTools');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

function plan(steps) {
  return {
    goal: 'Perform bounded file work',
    assumptions: ['The owner is present.'],
    constraints: ['Use Safe File Tools only.'],
    steps,
    risks: ['A permission may be denied.'],
    successCriteria: ['Every completed step has a trusted local postcondition.'],
  };
}

function step(title) { return { title, description: `${title} through the approved local file path.`, status: 'proposed' }; }

function action(tool, args) { return { type: 'tool_request', tool, arguments: args, providerMessage: null, providerToolCallId: null }; }

function makeFileRegistry(root, decision = 'allow') {
  const service = new TeemoFileService({ maxReadBytes: 4096, maxReturnedText: 4096, maxCreateBytes: 4096, maxPatchBytes: 4096 });
  const permission = new TeemoPermissionService({ decisionProvider: async () => ({ decision, scope: 'once' }) });
  let prepares = 0;
  let executions = 0;
  const client = {
    prepare: async (tool, args) => {
      prepares += 1;
      const prepared = service.prepareOperation(tool, args, [root]);
      return { resource: prepared.resource, reason: prepared.reason, preparation: prepared };
    },
    execute: async (prepared, options = {}) => {
      executions += 1;
      return service.executePrepared(prepared, [root], { checkCancelled: () => Boolean(options.signal && options.signal.aborted) });
    },
    release: async () => true,
  };
  const registry = new TeemoToolRegistry({ permissionService: { authorize: (request, options) => permission.requestPermission(request, options) } });
  TeemoFileTools.register(registry, { fileClient: client });
  return { registry, permission, counts: () => ({ prepares, executions }) };
}

function makeAi(actions, observed) {
  let index = 0;
  return {
    async sendWithTools(messages, options) {
      observed.push({ messages, tools: options.tools.map(item => item.function.name).sort() });
      const next = actions[index++];
      if (typeof next === 'function') return next(options);
      return next;
    },
  };
}

function runOptions(planState, overrides = {}) {
  let owner = 'owner-a';
  let currentPlan = planState;
  return {
    sessionId: 'owner-a', planState,
    maxSteps: planState.steps.length, maxRetries: 0, runTimeoutMs: 2000, stepTimeoutMs: 1000,
    getCurrentSessionId: () => owner,
    getCurrentPlanState: () => currentPlan,
    requestRunApproval: async () => true,
    requestStepConfirmation: async () => true,
    setOwner: value => { owner = value; },
    setPlan: value => { currentPlan = value; },
    ...overrides,
  };
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P5-2-execution-'));
  const root = path.join(sandbox, 'authorized');
  fs.mkdirSync(root, { recursive: true });
  const source = path.join(root, 'source.txt');
  const created = path.join(root, 'Teemo-created.txt');
  fs.writeFileSync(source, 'source content', 'utf8');

  try {
    const observed = [];
    const file = makeFileRegistry(root);
    const ai = makeAi([action('read_file', { path: source }), action('create_file', { path: created, content: 'created safely' })], observed);
    const core = new TeemoAgentCore({ aiService: ai, toolRegistry: file.registry });
    const execution = new TeemoAutonomousExecution({ agentCore: core, aiService: ai, toolRegistry: file.registry });
    let approvals = 0;
    let confirmations = 0;
    const states = [];
    const result = await execution.run(runOptions(plan([step('Read source'), step('Create output')]), {
      requestRunApproval: async () => { approvals += 1; return true; },
      requestStepConfirmation: async pending => { confirmations += 1; assert.equal(pending.tool, 'create_file'); assert.equal(pending.arguments.path, created); return true; },
      onState: run => states.push(run.state),
    }));
    assert.equal(result.ok, true);
    assert.equal(result.run.state, 'succeeded');
    assert.equal(result.run.steps.every(item => item.verified), true);
    assert.equal(result.run.toolCalls.length, 3, 'two actions plus a fresh read verification');
    assert.equal(approvals, 1);
    assert.equal(confirmations, 1);
    assert.equal(fs.readFileSync(created, 'utf8'), 'created safely');
    assert.ok(states.includes('awaiting_user_approval'));
    assert.ok(states.includes('awaiting_step_confirmation'));
    assert.ok(states.includes('authorizing'));
    assert.ok(states.includes('verifying'));
    assert.deepEqual(observed[0].tools, [...TeemoAutonomousExecution.SAFE_TOOLS].sort());
    assert.equal(observed[0].tools.some(name => /git|execute|shell|delete|desktop|comfy/i.test(name)), false);
    assert.ok(file.counts().executions >= 3);
    assert.ok(file.permission.listAudit().length >= 3, 'every action and verification must traverse P1');

    const blockedObserved = [];
    let blockedApprovals = 0;
    const blockedAi = makeAi([action('read_file', { path: source })], blockedObserved);
    const blockedExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: blockedAi, toolRegistry: file.registry }), aiService: blockedAi, toolRegistry: file.registry });
    const blockedResult = await blockedExecution.run(runOptions(plan([{
      title: 'Wait for a prerequisite',
      description: 'The required reference is not available yet.',
      status: 'blocked',
    }]), { requestRunApproval: async () => { blockedApprovals += 1; return true; } }));
    assert.equal(blockedResult.ok, false);
    assert.equal(blockedResult.run.state, 'blocked');
    assert.equal(blockedResult.error.code, 'EXECUTION_PLAN_BLOCKED');
    assert.equal(blockedApprovals, 0, 'blocked plans must fail before asking for run approval');
    assert.equal(blockedObserved.length, 0, 'blocked plans must not call the Provider');

    const noApprovalObserved = [];
    const noApprovalAi = makeAi([action('read_file', { path: source })], noApprovalObserved);
    const noApproval = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: noApprovalAi, toolRegistry: file.registry }), aiService: noApprovalAi, toolRegistry: file.registry });
    const noApprovalResult = await noApproval.run(runOptions(plan([step('Do not dispatch')]), { requestRunApproval: async () => false }));
    assert.equal(noApprovalResult.ok, false);
    assert.equal(noApprovalResult.run.state, 'blocked');
    assert.equal(noApprovalObserved.length, 0);

    const deniedTarget = path.join(root, 'Teemo-not-created.txt');
    const deniedFile = makeFileRegistry(root, 'deny');
    const deniedAi = makeAi([action('create_file', { path: deniedTarget, content: 'no' })], []);
    const deniedExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: deniedAi, toolRegistry: deniedFile.registry }), aiService: deniedAi, toolRegistry: deniedFile.registry });
    const deniedResult = await deniedExecution.run(runOptions(plan([step('Denied mutation')])));
    assert.equal(deniedResult.ok, false);
    assert.equal(fs.existsSync(deniedTarget), false);

    const confirmTarget = path.join(root, 'Teemo-unconfirmed.txt');
    const confirmAi = makeAi([action('create_file', { path: confirmTarget, content: 'no' })], []);
    const confirmExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: confirmAi, toolRegistry: file.registry }), aiService: confirmAi, toolRegistry: file.registry });
    const confirmResult = await confirmExecution.run(runOptions(plan([step('Unconfirmed mutation')]), { requestStepConfirmation: async () => false }));
    assert.equal(confirmResult.run.state, 'blocked');
    assert.equal(fs.existsSync(confirmTarget), false);

    const retryRegistry = new TeemoToolRegistry();
    let readAttempts = 0;
    retryRegistry.register({
      name: 'read_file', description: 'Synthetic bounded read.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      metadata: { permission: 'none', sideEffect: 'none' },
      handler: async args => {
        readAttempts += 1;
        if (readAttempts === 1) throw new Error('transient');
        return { path: args.path, type: 'file', content: 'ok', truncated: false, sha256: 'a'.repeat(64) };
      },
    });
    const retryAi = makeAi([action('read_file', { path: 'synthetic.txt' })], []);
    const retryExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: retryAi, toolRegistry: retryRegistry }), aiService: retryAi, toolRegistry: retryRegistry });
    const retried = await retryExecution.run(runOptions(plan([step('Retry read')]), { maxRetries: 1 }));
    assert.equal(retried.ok, true);
    assert.equal(readAttempts, 2);
    assert.equal(retried.run.retryCount, 1);

    const staleOptions = runOptions(plan([step('Owner-bound read')]));
    const staleAi = makeAi([action('read_file', { path: source })], []);
    const staleExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: staleAi, toolRegistry: file.registry }), aiService: staleAi, toolRegistry: file.registry });
    staleOptions.requestRunApproval = async () => { staleOptions.setOwner('owner-b'); return true; };
    const stale = await staleExecution.run(staleOptions);
    assert.equal(stale.run.state, 'blocked');
    assert.equal(stale.error.code, 'EXECUTION_OWNER_STALE');

    const changedPlanOptions = runOptions(plan([step('Plan-bound read')]));
    const changedPlanAi = makeAi([action('read_file', { path: source })], []);
    const changedPlanExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: changedPlanAi, toolRegistry: file.registry }), aiService: changedPlanAi, toolRegistry: file.registry });
    changedPlanOptions.requestRunApproval = async () => { changedPlanOptions.setPlan(plan([step('Changed after approval')])); return true; };
    const changedPlan = await changedPlanExecution.run(changedPlanOptions);
    assert.equal(changedPlan.run.state, 'blocked');
    assert.equal(changedPlan.error.code, 'EXECUTION_PLAN_STALE');

    const pendingAi = makeAi([options => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'AGENT_CANCELLED' })), { once: true });
    })], []);
    const cancelExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: pendingAi, toolRegistry: file.registry }), aiService: pendingAi, toolRegistry: file.registry });
    let cancelRunId = null;
    const cancelledPromise = cancelExecution.run(runOptions(plan([step('Cancelable read')]), {
      onState: run => {
        cancelRunId = run.runId;
        if (run.state === 'running') setTimeout(() => cancelExecution.cancel(run.runId, 'owner-a'), 0);
      },
    }));
    const cancelled = await cancelledPromise;
    assert.equal(cancelled.run.state, 'cancelled');
    assert.equal(cancelExecution.getRun(cancelRunId, 'owner-b'), null);
    assert.equal(cancelExecution.cancel(cancelRunId, 'owner-b').ok, false);

    const timeoutAi = makeAi([options => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { code: 'AGENT_CANCELLED' })), { once: true });
    })], []);
    const timeoutExecution = new TeemoAutonomousExecution({ agentCore: new TeemoAgentCore({ aiService: timeoutAi, toolRegistry: file.registry }), aiService: timeoutAi, toolRegistry: file.registry });
    const timedOut = await timeoutExecution.run(runOptions(plan([step('Timed read')]), { stepTimeoutMs: 10 }));
    assert.equal(timedOut.run.state, 'timed_out');

    const invalid = await execution.run(runOptions(plan([step('Invalid bounds')]), { maxSteps: 13 }));
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, 'EXECUTION_BOUNDS_INVALID');
    assert.equal(execution.getRun(result.run.runId, 'owner-b'), null);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
  console.log('TeemoAutonomousExecution tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
