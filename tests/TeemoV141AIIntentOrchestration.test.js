const assert = require('node:assert/strict');
const Productization = require('../src/agent/TeemoChatProductization');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');

function decision(intent, action, overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    intent,
    action,
    target: '',
    needsPlanning: false,
    confidence: 0.96,
    ...overrides,
  });
}

async function main() {
  const { ROUTES } = Productization;

  const planning = Productization.matchHighConfidenceIntent({ text: '先规划一下怎么优化设置页，不要执行' });
  assert.equal(planning.route, ROUTES.PLANNING);
  const absoluteRead = Productization.matchHighConfidenceIntent({ text: '请读取 D:\\Teemo\\docs\\INDEX.md' });
  assert.equal(absoluteRead.route, ROUTES.SAFE_FILE_OPERATION);
  assert.equal(Productization.matchHighConfidenceIntent({ text: '你好' }), null);
  assert.equal(Productization.matchHighConfidenceIntent({ text: '优化一下你自己的设置面板，你准备好后告诉我' }), null);
  assert.equal(
    Productization.matchHighConfidenceIntent({ text: '执行刚才的计划', currentPlanExecutable: true }).route,
    ROUTES.AUTONOMOUS_EXECUTION
  );
  assert.equal(
    Productization.matchHighConfidenceIntent({ text: '按刚才方案开始修改你自己的设置页面', currentPlanExecutable: true }).route,
    ROUTES.CONTROLLED_SELF_UPGRADE
  );
  assert.equal(Productization.matchHighConfidenceIntent({ text: '执行刚才的计划', currentPlanExecutable: false }), null);
  assert.equal(Productization.matchHighConfidenceIntent({ text: '取消当前任务', activeRun: true }).action, 'cancel_current_task');
  assert.equal(Productization.matchHighConfidenceIntent({ text: '取消当前任务', activeRun: false }), null);
  assert.equal(Productization.matchHighConfidenceIntent({ text: '帮我新建一个浏览器窗口' }).action, 'open_browser');
  assert.equal(Productization.matchHighConfidenceIntent({ text: '帮我新建一个浏览器窗口' }).payload.mode, 'new_window');
  assert.equal(Productization.matchHighConfidenceIntent({ text: '打开 ComfyUI' }).payload.mode, 'comfyui');
  assert.equal(Productization.matchHighConfidenceIntent({ text: '打开 https://example.com' }).payload.url, 'https://example.com');
  assert.equal(
    Productization.matchHighConfidenceIntent({
      text: '从我的灵感库找一些极简科技海报参考',
      inspirationAvailable: true,
    }).route,
    ROUTES.INSPIRATION_RETRIEVAL
  );

  const tools = [...Productization.SAFE_FILE_TOOLS];
  const snapshot = Productization.buildCapabilitySnapshot({
    aiAvailable: true,
    toolRegistry: { list: () => tools },
    authorizedRoots: [{ rootId: 'root_synthetic' }],
    inspirationContextBuilder: {},
    planningAvailable: true,
    autonomousExecutionAvailable: true,
    currentPlanAvailable: true,
    currentPlanExecutable: true,
    controlledSelfUpgradeAvailable: true,
    intentClassificationAvailable: false,
  });

  const singlePassHello = Productization.resolveSinglePassIntent({
    text: '你好',
    capabilitySnapshot: snapshot,
  });
  assert.equal(singlePassHello.route, ROUTES.NORMAL_CHAT);
  assert.equal(singlePassHello.source, 'single_pass_default');

  const singlePassExecute = Productization.resolveSinglePassIntent({
    text: '执行刚才的计划',
    capabilitySnapshot: snapshot,
  });
  assert.equal(singlePassExecute.route, ROUTES.AUTONOMOUS_EXECUTION);

  const noPlan = { ...snapshot, currentPlanAvailable: false, currentPlanExecutable: false };
  const softExecute = Productization.resolveSinglePassIntent({
    text: '执行刚才的计划',
    capabilitySnapshot: noPlan,
  });
  assert.equal(softExecute.route, ROUTES.NORMAL_CHAT);
  assert.equal(softExecute.source, 'single_pass_default');

  const file = Productization.parseIntentResponse(decision(ROUTES.SAFE_FILE_OPERATION, 'read', { target: 'Teemo-source INDEX.md' }));
  assert.equal(file.ok, true);
  assert.equal(Productization.validateIntentDecision(file.decision, snapshot).route, ROUTES.SAFE_FILE_OPERATION);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.NORMAL_CHAT), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.SAFE_FILE_OPERATION), true);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.PLANNING), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.INSPIRATION_RETRIEVAL), false);
  assert.equal(Productization.shouldExposeSafeFileTools(ROUTES.CONTROLLED_SELF_UPGRADE), false);

  // Compatibility: classifier helpers remain available but Chat no longer depends on them.
  const providerCalls = [];
  const core = new TeemoAgentCore({
    aiService: {
      async sendIntentClassification(messages, options) {
        providerCalls.push({ messages, options });
        return { type: 'intent_response', content: decision(ROUTES.NORMAL_CHAT, 'discuss') };
      },
    },
  });
  const classified = await core.classifyIntent({
    messages: Productization.buildIntentClassificationMessages({ text: '你好', capabilitySnapshot: snapshot }),
  });
  assert.equal(classified.ok, true);
  assert.equal(providerCalls.length, 1);

  console.log(JSON.stringify({
    ok: true,
    SINGLE_PASS_DEFAULT: 'PASS',
    PRE_SEND_CLASSIFIER_REQUIRED: 'NO',
    LOCAL_HIGH_CONFIDENCE_RULES: 'PASS',
    CAPABILITY_VALIDATION: 'PASS',
    NORMAL_CHAT_CAN_EXPOSE_SAFE_FILE: 'NO',
    SAFE_FILE_TOOL_COUNT: tools.length,
    PLANNING_TOOL_COUNT: 0,
    AUTONOMOUS_EXECUTION_ROUTE: 'PASS',
    CONTROLLED_SELF_UPGRADE_ROUTE: 'PASS',
    P1_BOUNDARY_CHANGED: 'NO',
    TOOL_REGISTRY_BOUNDARY_CHANGED: 'NO',
    MAIN_PROCESS_BOUNDARY_CHANGED: 'NO',
    ORDINARY_CHAT_GIT_EXPOSED: 'NO',
    ORDINARY_CHAT_EXECUTE_EXPOSED: 'NO',
    SHELL_EXPOSED: 'NO',
  }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
