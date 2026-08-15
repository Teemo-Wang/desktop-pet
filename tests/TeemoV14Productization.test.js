const assert = require('node:assert/strict');
const Productization = require('../src/agent/TeemoChatProductization');

function fakeInspirationBuilder() {
  return { shouldRetrieve: text => /灵感库.*参考/.test(String(text || '')) };
}

async function main() {
  const { ROUTES, STATES } = Productization;
  const inspirationContextBuilder = fakeInspirationBuilder();

  assert.equal(Productization.routeIntent({ text: '你好，今天帮我梳理一下思路', inspirationContextBuilder }), ROUTES.NORMAL_CHAT);
  assert.equal(Productization.routeIntent({ text: '读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md', inspirationContextBuilder }), ROUTES.SAFE_FILE_OPERATION);
  assert.equal(Productization.routeIntent({ text: '创建 docs/Teemo-note.md 文件', inspirationContextBuilder }), ROUTES.SAFE_FILE_OPERATION);
  assert.equal(Productization.routeIntent({
    text: '从我的灵感库找一些极简科技海报参考',
    inspirationAvailable: true,
    inspirationContextBuilder,
  }), ROUTES.INSPIRATION_RETRIEVAL);
  assert.equal(Productization.routeIntent({ text: '参考一下这个方案', inspirationContextBuilder }), ROUTES.NORMAL_CHAT);
  assert.equal(Productization.routeIntent({ text: '先规划一下如何读取并整理这个项目，不要执行', inspirationContextBuilder }), ROUTES.PLANNING);
  assert.equal(Productization.routeIntent({ text: '执行刚才的计划', inspirationContextBuilder, currentPlanExecutable: true }), ROUTES.AUTONOMOUS_EXECUTION);
  assert.equal(Productization.routeIntent({ text: '执行刚才的计划', inspirationContextBuilder, hasPlan: true }), ROUTES.NORMAL_CHAT);
  assert.equal(Productization.matchHighConfidenceIntent({ text: '读取 D:\\Teemo\\INDEX.md' }).route, ROUTES.SAFE_FILE_OPERATION);
  assert.equal(Productization.routeIntent({ text: '读取文件', planningMode: true, inspirationContextBuilder }), ROUTES.PLANNING);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.NORMAL_CHAT), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.INSPIRATION_RETRIEVAL), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.PLANNING), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.AUTONOMOUS_EXECUTION), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.CONTROLLED_SELF_UPGRADE), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.SAFE_FILE_OPERATION), true);

  const eightTools = [...Productization.SAFE_FILE_TOOLS];
  const registry = { list: () => [...eightTools, 'echo'] };
  const snapshot = Productization.buildCapabilitySnapshot({
    aiAvailable: true,
    toolRegistry: registry,
    authorizedRoots: [{ rootId: 'root_synthetic' }],
    inspirationContextBuilder,
    planningAvailable: true,
    autonomousExecutionAvailable: true,
    currentPlanAvailable: false,
    controlledSelfUpgradeAvailable: true,
    intentClassificationAvailable: true,
  });
  assert.deepEqual(snapshot.safeFileTools, eightTools);
  assert.equal(snapshot.authorizedRootCount, 1);
  assert.equal(snapshot.currentPlanAvailable, false);
  const capability = Productization.buildCapabilityContext(snapshot, ROUTES.SAFE_FILE_OPERATION).content;
  assert.match(capability, /Selected intent route: safe_file_operation/);
  assert.match(capability, /Provider Safe File tool definitions exposed for this route: 8/);
  assert.match(capability, /no current session plan/);
  assert.doesNotMatch(capability, /[A-Z]:\\|authorizationId|permissionRequestId|ipc/i);
  assert.match(Productization.buildCapabilityContext(snapshot, ROUTES.NORMAL_CHAT).content, /Provider Safe File tool definitions exposed for this route: 0/);
  const definitions = [...eightTools, 'echo'].map(name => ({ name }));
  const view = Productization.createSafeFileRegistryView({
    listDefinitions: () => definitions,
    get: name => definitions.find(item => item.name === name),
    execute: async name => ({ ok: true, name }),
  });
  assert.deepEqual(view.list().sort(), eightTools);
  assert.equal((await Promise.resolve(view.execute('echo', {}))).error.code, 'UNKNOWN_TOOL');

  const errors = [
    ['PERMISSION_DENIED', 'permission_denied'],
    ['PERMISSION_TIMEOUT', 'permission_timeout'],
    ['FILE_NOT_FOUND', 'file_not_found'],
    ['FILE_PATH_CONTRACT_INVALID', 'invalid_request'],
    ['NATIVE_TOOL_CALLING_REQUEST_FAILED', 'provider_unavailable'],
    ['EXECUTION_FAILED', 'execution_failed'],
    ['EXECUTION_VERIFICATION_FAILED', 'verification_failed'],
  ];
  for (const [code, category] of errors) {
    const normalized = Productization.normalizeError(Object.assign(new Error('internal ipc/schema/stack detail'), { code }));
    assert.equal(normalized.category, category);
    assert.doesNotMatch(normalized.userMessage, /ipc|schema|stack|arguments\.path/i);
  }
  assert.match(Productization.normalizeError({ code: 'FILE_PATH_CONTRACT_INVALID' }).userMessage, /文件路径参数不完整/);
  assert.match(Productization.normalizeError({ code: 'EXECUTION_PLAN_INVALID' }).userMessage, /先.*计划/);
  assert.match(Productization.normalizeError({ code: 'EXECUTION_PLAN_BLOCKED' }).userMessage, /阻塞步骤/);

  const states = {
    idle: STATES.IDLE,
    planning: STATES.PLANNING,
    permission_waiting: STATES.WAITING_PERMISSION,
    running: STATES.RUNNING,
    verifying: STATES.VERIFYING,
    completed: STATES.SUCCEEDED,
    failed: STATES.FAILED,
    cancelled: STATES.CANCELLED,
  };
  for (const [source, expected] of Object.entries(states)) assert.equal(Productization.mapExecutionState(source), expected);

  const tracker = Productization.createExecutionStateTracker();
  const oldOwner = tracker.begin('old-session');
  assert.equal(tracker.update(oldOwner, 'running').state, STATES.RUNNING);
  const currentOwner = tracker.begin('current-session');
  assert.deepEqual(tracker.update(oldOwner, 'failed'), { accepted: false, state: STATES.IDLE });
  assert.deepEqual(tracker.update(currentOwner, 'permission_waiting'), { accepted: true, state: STATES.WAITING_PERMISSION });
  assert.deepEqual(tracker.update(currentOwner, 'completed'), { accepted: true, state: STATES.SUCCEEDED });
  assert.deepEqual(tracker.update(currentOwner, 'running'), { accepted: false, state: STATES.SUCCEEDED });

  console.log(JSON.stringify({
    ok: true,
    CAPABILITY_AWARENESS: 'PASS',
    INTENT_ROUTING: 'PASS',
    ERROR_NORMALIZATION: 'PASS',
    UNIFIED_EXECUTION_STATE: 'PASS',
    STALE_STATE_REJECTED: 'PASS',
    CHAT_SAFE_FILE_TOOL_COUNT: snapshot.safeFileTools.length,
    NEW_CAPABILITY: 'NO',
  }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
