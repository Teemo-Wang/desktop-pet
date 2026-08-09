const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoContextBuilder = require('../src/cognition/TeemoContextBuilder');
const TeemoCreativeProfileService = require('../src/creative/TeemoCreativeProfileService');
const TeemoCreativeContextBuilder = require('../src/creative/TeemoCreativeContextBuilder');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-creative-context-'));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

class CapturingAI {
  constructor(name) {
    this.name = name;
    this.calls = [];
  }

  async send(messages) {
    this.calls.push(JSON.parse(JSON.stringify(messages)));
    return `${this.name}: ok`;
  }
}

class CapturingStreamAI {
  constructor() {
    this.calls = [];
  }

  async stream(messages, onChunk) {
    this.calls.push(JSON.parse(JSON.stringify(messages)));
    onChunk('stream ok', 'stream ok');
    return 'stream ok';
  }
}

function systemText(messages) {
  return messages.filter(item => item.role === 'system').map(item => String(item.content || '')).join('\n\n');
}

async function runWith(core, ai, userMessage, options = {}) {
  return core.run({
    aiService: ai,
    messages: options.messages || [{ role: 'user', content: userMessage }],
    userMessage,
    projectId: options.projectId,
    projectContext: options.projectContext,
    skillContext: options.skillContext,
    disableActionContract: options.disableActionContract !== false,
  });
}

async function runStreamWith(core, ai, userMessage, options = {}) {
  return core.runStream({
    aiService: ai,
    messages: options.messages || [{ role: 'user', content: userMessage }],
    userMessage,
    projectId: options.projectId,
    projectContext: options.projectContext,
    skillContext: options.skillContext,
    disableActionContract: options.disableActionContract !== false,
  });
}

async function main() {
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({ userMessage: '1+1 等于几？' }), false);
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({ userMessage: '从设计角度评价这个。' }), true);
  assert.equal(TeemoCreativeContextBuilder.detectDomain({ userMessage: '检查这个 UI 界面的操作路径' }), 'ui');
  assert.equal(TeemoCreativeContextBuilder.detectDomain({ userMessage: '评价 Blender 材质和渲染' }), '3d');
  assert.equal(TeemoCreativeContextBuilder.detectDomain({ userMessage: '评价一个普通设计方案' }), 'general');
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({
    userMessage: '1+1 等于几？',
    skillContext: '营销海报设计 Skill',
    projectContext: { brief: '品牌视觉设计项目' },
  }), false, 'project and Skill design terms must not trigger an ordinary request');
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({
    userMessage: '这个怎么样',
    messages: [
      { role: 'user', content: '分析这个品牌 KV 的视觉层级' },
      { role: 'assistant', content: '已给出第一版设计分析' },
      { role: 'user', content: '这个怎么样' },
    ],
  }), true, 'weak follow-up should use active design context');
  const visualMessage = content => [{ role: 'user', content: [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }];
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({ userMessage: '今天星期几？', messages: visualMessage('今天星期几？') }), false);
  assert.equal(TeemoCreativeContextBuilder.isCreativeRelevant({ userMessage: '评价一下这张图', messages: visualMessage('评价一下这张图') }), true);

  await withTempDir(async dir => {
    const cognitionService = new TeemoCognitionService({ dataDir: dir });
    let cognitionSnapshot = cognitionService.getManagementSnapshot();
    const cognition = cognitionService.manualCreate({
      content: '用户喜欢简洁科技感',
      scope: 'global',
      category: 'preference',
    }, { expectedRevision: cognitionSnapshot.revision });
    assert.equal(cognition.ok, true);

    const creativeService = new TeemoCreativeProfileService({ dataDir: dir });
    const cognitionBuilder = new TeemoContextBuilder({ cognitionService });
    const creativeBuilder = new TeemoCreativeContextBuilder({ profileService: creativeService });
    const probe = creativeBuilder.build({ userMessage: '这个品牌 KV 是否应该继续做得更简单？' });
    assert.equal(probe.relevant, true);
    assert.ok(probe.systemMessage.content.length >= 800);
    assert.ok(probe.systemMessage.content.length <= 1400);
    assert.ok(probe.systemMessage.content.includes('用户偏好是输入，不是专业结论'));
    assert.ok(probe.systemMessage.content.includes('当前用户明确要求 > 当前项目约束 > 已加载 Skill 规范 > Creative Judgment'));
    assert.ok(!probe.systemMessage.content.includes('87.34'));
    const minimumBudget = creativeBuilder.build({ userMessage: '评价这个设计', maxChars: 800 });
    assert.ok(minimumBudget.systemMessage.content.includes('当前用户明确要求 > 当前项目约束 > 已加载 Skill 规范 > Creative Judgment'));
    assert.ok(minimumBudget.systemMessage.content.includes('必须区分“用户偏好匹配”和“专业设计判断”'));
    assert.ok(minimumBudget.systemMessage.content.includes('不得编造缺失的项目事实'));
    assert.ok(minimumBudget.systemMessage.content.length <= 800);

    const ai = new CapturingAI('provider-a');
    const core = new TeemoAgentCore({
      aiService: ai,
      contextBuilder: cognitionBuilder,
      creativeContextBuilder: creativeBuilder,
    });
    const both = await runWith(core, ai, '这个品牌 KV 是否应该继续做得更简单？', {
      projectId: 'project-red',
      projectContext: { projectId: 'project-red', project: { name: '红色活动', designBrief: '品牌规定必须红色' } },
      skillContext: '固定品牌布局与文案位置',
      messages: [
        { role: 'system', content: '【已加载 Skill】固定品牌布局与文案位置' },
        { role: 'user', content: '这个品牌 KV 是否应该继续做得更简单？' },
      ],
    });
    assert.equal(both.ok, true);
    let text = systemText(ai.calls.at(-1));
    assert.ok(text.includes('Teemo Cognition 上下文'));
    assert.ok(text.includes('用户喜欢简洁科技感'));
    assert.ok(text.includes('Teemo Creative Judgment'));
    assert.ok(text.includes('品牌规定必须红色'));
    assert.ok(text.includes('已加载 Skill'));
    assert.equal(both.run.creativeContext.relevant, true);
    const assembled = ai.calls.at(-1);
    const skillIndex = assembled.findIndex(item => String(item.content).includes('已加载 Skill'));
    const cognitionIndex = assembled.findIndex(item => String(item.content).includes('Teemo Cognition 上下文'));
    const creativeIndex = assembled.findIndex(item => String(item.content).includes('Teemo Creative Judgment'));
    const userIndex = assembled.findIndex(item => item.role === 'user');
    assert.ok(skillIndex >= 0 && skillIndex < cognitionIndex && cognitionIndex < creativeIndex && creativeIndex < userIndex,
      'existing system constraints must remain before Creative Context and the current user turn');

    const plain = await runWith(core, ai, '1+1 等于几？');
    assert.equal(plain.ok, true);
    text = systemText(ai.calls.at(-1));
    assert.ok(!text.includes('Teemo Cognition 上下文'));
    assert.ok(!text.includes('Teemo Creative Judgment'));

    let creativeState = creativeService.getManagementSnapshot().state;
    const creativeOff = creativeService.setEnabled(false, { expectedRevision: creativeState.revision });
    assert.equal(creativeOff.ok, true);
    await runWith(core, ai, '帮我评价这个品牌设计');
    text = systemText(ai.calls.at(-1));
    assert.ok(text.includes('Teemo Cognition 上下文'));
    assert.ok(!text.includes('Teemo Creative Judgment'));

    cognitionSnapshot = cognitionService.getManagementSnapshot();
    const cognitionOff = cognitionService.setEnabled(false, { expectedRevision: cognitionSnapshot.revision });
    assert.equal(cognitionOff.ok, true);
    creativeState = creativeService.getManagementSnapshot().state;
    const creativeOn = creativeService.setEnabled(true, { expectedRevision: creativeState.revision });
    assert.equal(creativeOn.ok, true);
    await runWith(core, ai, '帮我评价这个品牌设计');
    text = systemText(ai.calls.at(-1));
    assert.ok(!text.includes('Teemo Cognition 上下文'));
    assert.ok(text.includes('Teemo Creative Judgment'));

    creativeState = creativeService.getManagementSnapshot().state;
    creativeService.setEnabled(false, { expectedRevision: creativeState.revision });
    await runWith(core, ai, '帮我评价这个品牌设计');
    text = systemText(ai.calls.at(-1));
    assert.ok(!text.includes('Teemo Cognition 上下文'));
    assert.ok(!text.includes('Teemo Creative Judgment'));

    cognitionSnapshot = cognitionService.getManagementSnapshot();
    cognitionService.setEnabled(true, { expectedRevision: cognitionSnapshot.revision });
    creativeState = creativeService.getManagementSnapshot().state;
    creativeService.setEnabled(true, { expectedRevision: creativeState.revision });
    const providerB = new CapturingAI('provider-b');
    await runWith(core, ai, '分析这个 Logo 的品牌识别', { disableActionContract: false });
    await runWith(core, providerB, '分析这个 Logo 的品牌识别');
    const creativeA = ai.calls.at(-1).find(item => String(item.content).includes('Teemo Creative Judgment'));
    const creativeB = providerB.calls.at(-1).find(item => String(item.content).includes('Teemo Creative Judgment'));
    assert.deepEqual(creativeA, creativeB, 'providers must receive the same Creative Profile');

    const streamAI = new CapturingStreamAI();
    const streamed = await runStreamWith(core, streamAI, '分析这个 Logo 的品牌识别', { disableActionContract: false });
    assert.equal(streamed.ok, true);
    const streamCreative = streamAI.calls.at(-1).find(item => String(item.content).includes('Teemo Creative Judgment'));
    assert.deepEqual(streamCreative, creativeA, 'run and runStream must inject identical Creative Context');

    const instanceA = new TeemoCreativeProfileService({ dataDir: dir });
    const instanceB = new TeemoCreativeProfileService({ dataDir: dir });
    const sharedRevision = instanceA.getManagementSnapshot().state.revision;
    const disabledByA = instanceA.setEnabled(false, { expectedRevision: sharedRevision });
    assert.equal(disabledByA.ok, true);
    const staleByB = instanceB.setEnabled(true, { expectedRevision: sharedRevision });
    assert.equal(staleByB.code, 'CREATIVE_PROFILE_CHANGED');
    const crossInstanceCore = new TeemoAgentCore({
      creativeContextBuilder: new TeemoCreativeContextBuilder({ profileService: instanceB }),
    });
    const crossSendAI = new CapturingAI('cross-instance-send');
    await runWith(crossInstanceCore, crossSendAI, '评价这个品牌设计');
    assert.ok(!systemText(crossSendAI.calls.at(-1)).includes('Teemo Creative Judgment'));
    const crossStreamAI = new CapturingStreamAI();
    await runStreamWith(crossInstanceCore, crossStreamAI, '评价这个品牌设计');
    assert.ok(!systemText(crossStreamAI.calls.at(-1)).includes('Teemo Creative Judgment'));

    const failingCore = new TeemoAgentCore({
      aiService: ai,
      contextBuilder: cognitionBuilder,
      creativeContextBuilder: { build() { throw new Error('creative failed'); } },
    });
    const degraded = await runWith(failingCore, ai, '评价这个设计');
    assert.equal(degraded.ok, true);
    assert.equal(degraded.run.creativeError.code, 'CREATIVE_CONTEXT_BUILD_FAILED');
    assert.ok(systemText(ai.calls.at(-1)).includes('Teemo Cognition 上下文'));
  });

  await withTempDir(async dir => {
    const stateFile = path.join(dir, TeemoCreativeProfileService.STATE_FILE);
    const invalid = '{ invalid creative state json';
    fs.writeFileSync(stateFile, invalid, 'utf8');
    const service = new TeemoCreativeProfileService({ dataDir: dir });
    const builder = new TeemoCreativeContextBuilder({ profileService: service });
    const context = builder.build({ userMessage: '评价这个品牌设计' });
    assert.equal(context.enabled, false);
    assert.equal(context.systemMessage, null);
    assert.equal(context.stateError.code, 'CREATIVE_PROFILE_STATE_UNREADABLE');
    const ai = new CapturingAI('corrupt-state');
    const result = await runWith(new TeemoAgentCore({ aiService: ai, creativeContextBuilder: builder }), ai, '评价这个品牌设计');
    assert.equal(result.ok, true);
    assert.equal(result.run.creativeError.code, 'CREATIVE_PROFILE_STATE_UNREADABLE');
    assert.ok(!systemText(ai.calls.at(-1)).includes('Teemo Creative Judgment'));
    assert.equal(fs.readFileSync(stateFile, 'utf8'), invalid);
  });

  console.log('Teemo Creative Context tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
