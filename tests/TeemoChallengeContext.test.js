const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoCognitionCollector = require('../src/cognition/TeemoCognitionCollector');
const TeemoContextBuilder = require('../src/cognition/TeemoContextBuilder');
const TeemoCreativeProfileService = require('../src/creative/TeemoCreativeProfileService');
const TeemoCreativeContextBuilder = require('../src/creative/TeemoCreativeContextBuilder');
const TeemoCreativeDirectorSessionState = require('../src/creative/TeemoCreativeDirectorSessionState');
const TeemoChallengeContextBuilder = require('../src/creative/TeemoChallengeContextBuilder');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-challenge-context-'));
  try { return await run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

class CapturingAI {
  constructor() { this.calls = []; }
  async send(messages) { this.calls.push(JSON.parse(JSON.stringify(messages))); return 'ok'; }
}

class CapturingStreamAI {
  constructor() { this.calls = []; }
  async stream(messages, onChunk) {
    this.calls.push(JSON.parse(JSON.stringify(messages)));
    onChunk('ok', 'ok');
    return 'ok';
  }
}

class RecordingCollector {
  constructor() { this.calls = []; }
  async collectTurn(input) {
    this.calls.push(JSON.parse(JSON.stringify(input)));
    return { ok: true, skipped: null, promoted: false, scope: 'recent' };
  }
}

function findContext(messages, marker) {
  return messages.find(message => String(message.content || '').includes(marker));
}

async function main() {
  await withTempDir(async dir => {
    const cognitionService = new TeemoCognitionService({ dataDir: dir });
    const snapshot = cognitionService.getManagementSnapshot();
    cognitionService.manualCreate({ content: '用户喜欢极简科技感', scope: 'global', category: 'preference' }, { expectedRevision: snapshot.revision });
    const cognitionFile = path.join(dir, 'Teemo-cognition.json');
    const creativeService = new TeemoCreativeProfileService({ dataDir: dir });
    creativeService.setEnabled(true, { expectedRevision: 0 });
    const creativeFile = path.join(dir, TeemoCreativeProfileService.STATE_FILE);
    const cognitionBefore = fs.readFileSync(cognitionFile, 'utf8');
    const creativeBefore = fs.readFileSync(creativeFile, 'utf8');
    const sessionState = new TeemoCreativeDirectorSessionState();
    const cognitionBuilder = new TeemoContextBuilder({ cognitionService });
    const creativeBuilder = new TeemoCreativeContextBuilder({ profileService: creativeService });
    const challengeBuilder = new TeemoChallengeContextBuilder({ profileService: creativeService, sessionState });
    let core = new TeemoAgentCore({
      contextBuilder: cognitionBuilder,
      cognitionCollector: new TeemoCognitionCollector({ cognitionService }),
      creativeContextBuilder: creativeBuilder,
      challengeContextBuilder: challengeBuilder,
    });

    sessionState.setMode('a', 'challenge', { intensity: 'standard', source: 'ui' });
    const probe = challengeBuilder.build({
      sessionId: 'a', userMessage: '挑战一下这个品牌设计',
      creativeContext: creativeBuilder.build({ userMessage: '挑战一下这个品牌设计' }),
    });
    assert.equal(probe.mode, 'challenge');
    assert.ok(probe.systemMessage.content.length <= 900);
    assert.ok(probe.systemMessage.content.includes('当前用户明确要求 > 当前项目硬约束 > 已加载 Skill 规范 > Creative Profile / Challenge Judgment'));
    assert.ok(probe.systemMessage.content.includes('不编造未知项目事实、不可见图片内容'));
    assert.ok(probe.systemMessage.content.includes('至少在构图/信息架构'));
    assert.ok(probe.systemMessage.content.includes('2 个轴上实质不同'));
    const creativeProbe = creativeBuilder.build({ userMessage: '挑战一下这个品牌设计' });
    assert.ok(creativeProbe.systemMessage.content.length + probe.systemMessage.content.length <= 2300);
    sessionState.setIntensity('a', 'strong');
    const strong = challengeBuilder.build({ sessionId: 'a', userMessage: '狠狠挑一下这个设计', creativeContext: creativeBuilder.build({ userMessage: '狠狠挑一下这个设计' }) });
    assert.ok(strong.systemMessage.content.includes('3–5 个关键风险'));
    sessionState.setIntensity('a', 'standard');

    const small = challengeBuilder.build({
      sessionId: 'a', userMessage: '评价这个设计', maxChars: 650,
      creativeContext: creativeBuilder.build({ userMessage: '评价这个设计' }),
    });
    assert.ok(small.systemMessage);
    assert.ok(small.systemMessage.content.length <= 650);
    assert.ok(small.systemMessage.content.includes('约束优先级（不可覆盖）'));
    const tooSmall = challengeBuilder.build({
      sessionId: 'a', userMessage: '评价这个设计', maxChars: 100,
      creativeContext: creativeBuilder.build({ userMessage: '评价这个设计' }),
    });
    assert.equal(tooSmall.systemMessage, null);
    assert.equal(tooSmall.error.code, 'CHALLENGE_CONTEXT_BUDGET_TOO_SMALL');
    assert.equal(tooSmall.resolution.effectiveMode, 'balanced');

    const sendAI = new CapturingAI();
    const send = await core.run({
      aiService: sendAI,
      messages: [
        { role: 'system', content: '【已加载 Skill】品牌规范' },
        { role: 'user', content: '挑战一下这个品牌 KV' },
      ],
      userMessage: '挑战一下这个品牌 KV',
      sessionId: 'a',
      projectId: 'red',
      projectContext: { project: { designBrief: '品牌规定必须红色' } },
      skillContext: '品牌规范',
      skipCognitionCollection: true,
    });
    assert.equal(send.ok, true);
    const messages = sendAI.calls.at(-1);
    const skillIndex = messages.findIndex(item => String(item.content).includes('已加载 Skill'));
    const cognitionIndex = messages.findIndex(item => String(item.content).includes('Teemo Cognition 上下文'));
    const creativeIndex = messages.findIndex(item => String(item.content).includes('Teemo Creative Judgment'));
    const challengeIndex = messages.findIndex(item => String(item.content).includes('Teemo Challenge Overlay'));
    const userIndex = messages.findIndex(item => item.role === 'user');
    assert.ok(skillIndex < cognitionIndex && cognitionIndex < creativeIndex && creativeIndex < challengeIndex && challengeIndex < userIndex);
    assert.ok(findContext(messages, 'Teemo Challenge Overlay'));
    assert.ok(send.run.challengeContext);
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'send command must not change Cognition');

    const streamAI = new CapturingStreamAI();
    const streamed = await core.runStream({
      aiService: streamAI,
      messages: [{ role: 'user', content: '挑战一下这个品牌 KV' }],
      userMessage: '挑战一下这个品牌 KV', sessionId: 'a',
      skipCognitionCollection: true,
    });
    assert.equal(streamed.ok, true);
    assert.deepEqual(findContext(streamAI.calls.at(-1), 'Teemo Challenge Overlay'), findContext(messages, 'Teemo Challenge Overlay'));
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'stream command must not change Cognition');

    const providerB = new CapturingAI();
    const providerResult = await core.run({ aiService: providerB, messages: [{ role: 'user', content: '挑战一下这个品牌 KV' }], userMessage: '挑战一下这个品牌 KV', sessionId: 'a', skipCognitionCollection: true });
    assert.deepEqual(findContext(providerB.calls.at(-1), 'Teemo Challenge Overlay'), findContext(streamAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(providerResult.run.challengeCommand, 'one_shot_challenge');
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'provider command must not change Cognition');

    const implicitAI = new CapturingAI();
    const implicit = await core.run({
      aiService: implicitAI,
      messages: [{ role: 'user', content: '挑战一下这个品牌 KV' }],
      sessionId: 'implicit',
      skipCognitionCollection: true,
    });
    assert.ok(findContext(implicitAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(implicit.run.challengeCommand, 'one_shot_challenge');
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'implicit user message command must not change Cognition');

    const pureControl = await core.run({
      aiService: new CapturingAI(),
      messages: [{ role: 'user', content: '开启挑战模式' }],
      userMessage: '开启挑战模式',
      sessionId: 'pure-control',
    });
    assert.equal(pureControl.run.cognitionCollection.skipped, 'challenge_runtime_command');
    assert.equal(sessionState.getState('pure-control').mode, 'challenge');
    const pureControlStream = await core.runStream({
      aiService: new CapturingStreamAI(),
      messages: [{ role: 'user', content: '退出挑战模式' }],
      userMessage: '退出挑战模式',
      sessionId: 'pure-control',
    });
    assert.equal(pureControlStream.run.cognitionCollection.skipped, 'challenge_runtime_command');
    assert.equal(sessionState.getState('pure-control').mode, 'balanced');
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'pure send/stream commands must not change Cognition');

    const recordingCollector = new RecordingCollector();
    const mixedCore = new TeemoAgentCore({
      creativeContextBuilder: creativeBuilder,
      challengeContextBuilder: challengeBuilder,
      cognitionCollector: recordingCollector,
    });
    const mixedAI = new CapturingAI();
    const mixedSend = await mixedCore.run({
      aiService: mixedAI,
      messages: [{ role: 'user', content: '开启挑战模式，我最近更喜欢高反射金属材质' }],
      userMessage: '开启挑战模式，我最近更喜欢高反射金属材质',
      sessionId: 'mixed',
    });
    await mixedSend.run.collectionPromise;
    assert.equal(sessionState.getState('mixed').mode, 'challenge');
    assert.equal(recordingCollector.calls.at(-1).userMessage, '我最近更喜欢高反射金属材质');

    const mixedStreamAI = new CapturingStreamAI();
    const mixedStream = await mixedCore.runStream({
      aiService: mixedStreamAI,
      messages: [{ role: 'user', content: '这次别挑战，我最近更喜欢人物设计比例成熟一些' }],
      userMessage: '这次别挑战，我最近更喜欢人物设计比例成熟一些',
      sessionId: 'mixed',
    });
    await mixedStream.run.collectionPromise;
    assert.equal(mixedStream.run.challengeContext.resolution.effectiveMode, 'balanced');
    assert.equal(sessionState.getState('mixed').mode, 'challenge');
    assert.equal(recordingCollector.calls.at(-1).userMessage, '我最近更喜欢人物设计比例成熟一些');

    const quoted = await mixedCore.run({
      aiService: new CapturingAI(),
      messages: [{ role: 'user', content: '把“开启挑战模式”翻译成英文' }],
      userMessage: '把“开启挑战模式”翻译成英文',
      sessionId: 'quoted',
    });
    await quoted.run.collectionPromise;
    assert.equal(quoted.run.challengeCommand, 'none');
    assert.equal(sessionState.getState('quoted').mode, 'balanced');

    // The remaining cases inspect context behavior only. Keep the real Cognition
    // builder, but remove collection so ordinary design turns cannot mutate the fixture.
    core = new TeemoAgentCore({
      contextBuilder: cognitionBuilder,
      creativeContextBuilder: creativeBuilder,
      challengeContextBuilder: challengeBuilder,
    });

    const missingIdentityAI = new CapturingAI();
    await core.run({
      aiService: missingIdentityAI,
      messages: [{ role: 'user', content: '评价这个品牌设计' }],
      userMessage: '评价这个品牌设计',
    });
    assert.ok(!findContext(missingIdentityAI.calls.at(-1), 'Teemo Challenge Overlay'));
    const missingOneShotAI = new CapturingAI();
    await core.run({
      aiService: missingOneShotAI,
      messages: [{ role: 'user', content: '挑战一下这个品牌设计' }],
      userMessage: '挑战一下这个品牌设计',
    });
    assert.ok(findContext(missingOneShotAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(sessionState.getState(null).mode, 'balanced');

    const ordinaryAI = new CapturingAI();
    await core.run({ aiService: ordinaryAI, messages: [{ role: 'user', content: '1+1 等于几？' }], userMessage: '1+1 等于几？', sessionId: 'a' });
    assert.ok(!findContext(ordinaryAI.calls.at(-1), 'Teemo Creative Judgment'));
    assert.ok(!findContext(ordinaryAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(sessionState.getState('a').mode, 'challenge');

    const weakAI = new CapturingAI();
    await core.run({
      aiService: weakAI,
      messages: [
        { role: 'user', content: '分析这个品牌 KV 的视觉层级' },
        { role: 'assistant', content: '已给出设计分析' },
        { role: 'user', content: '这个怎么样' },
      ],
      userMessage: '这个怎么样', sessionId: 'a',
    });
    assert.ok(findContext(weakAI.calls.at(-1), 'Teemo Challenge Overlay'));

    const imageContent = text => [{ type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }];
    const imageReviewAI = new CapturingAI();
    await core.run({ aiService: imageReviewAI, messages: [{ role: 'user', content: imageContent('评价一下这张图') }], userMessage: '评价一下这张图', sessionId: 'a' });
    assert.ok(findContext(imageReviewAI.calls.at(-1), 'Teemo Challenge Overlay'));
    const imagePlainAI = new CapturingAI();
    await core.run({ aiService: imagePlainAI, messages: [{ role: 'user', content: imageContent('今天星期几？') }], userMessage: '今天星期几？', sessionId: 'a' });
    assert.ok(!findContext(imagePlainAI.calls.at(-1), 'Teemo Challenge Overlay'));

    const sessionBAI = new CapturingAI();
    await core.run({ aiService: sessionBAI, messages: [{ role: 'user', content: '评价这个品牌设计' }], userMessage: '评价这个品牌设计', sessionId: 'b' });
    assert.ok(findContext(sessionBAI.calls.at(-1), 'Teemo Creative Judgment'));
    assert.ok(!findContext(sessionBAI.calls.at(-1), 'Teemo Challenge Overlay'));

    const oneShotAI = new CapturingAI();
    await core.run({ aiService: oneShotAI, messages: [{ role: 'user', content: '挑战一下这个方案' }], userMessage: '挑战一下这个方案', sessionId: 'b' });
    assert.ok(findContext(oneShotAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(sessionState.getState('b').mode, 'balanced');

    const suppressedAI = new CapturingAI();
    await core.run({ aiService: suppressedAI, messages: [{ role: 'user', content: '这次别挑战，直接评价这个设计' }], userMessage: '这次别挑战，直接评价这个设计', sessionId: 'a' });
    assert.ok(findContext(suppressedAI.calls.at(-1), 'Teemo Creative Judgment'));
    assert.ok(!findContext(suppressedAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(sessionState.getState('a').mode, 'challenge');

    assert.equal(fs.readFileSync(creativeFile, 'utf8'), creativeBefore, 'Challenge changes must not modify Creative state');

    let creativeState = creativeService.getManagementSnapshot().state;
    creativeService.setEnabled(false, { expectedRevision: creativeState.revision });
    const disabledAI = new CapturingAI();
    await core.run({ aiService: disabledAI, messages: [{ role: 'user', content: '评价这个设计' }], userMessage: '评价这个设计', sessionId: 'a' });
    assert.ok(!findContext(disabledAI.calls.at(-1), 'Teemo Creative Judgment'));
    assert.ok(!findContext(disabledAI.calls.at(-1), 'Teemo Challenge Overlay'));
    assert.equal(sessionState.getState('a').mode, 'balanced');

    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'Challenge state must not change Cognition');
    assert.notEqual(fs.readFileSync(creativeFile, 'utf8'), creativeBefore, 'only the explicit Creative enabled toggle may change Creative state');
    const stored = JSON.parse(fs.readFileSync(creativeFile, 'utf8'));
    assert.ok(!Object.prototype.hasOwnProperty.call(stored, 'mode'));
    assert.ok(!Object.prototype.hasOwnProperty.call(stored, 'intensity'));

    const failingAI = new CapturingAI();
    const failingCore = new TeemoAgentCore({
      creativeContextBuilder: creativeBuilder,
      cognitionCollector: new TeemoCognitionCollector({ cognitionService }),
      challengeContextBuilder: {
        parseCommand() { return { type: 'one_shot_challenge', intensity: 'standard' }; },
        build() { throw new Error('challenge failed'); },
      },
    });
    creativeState = creativeService.getManagementSnapshot().state;
    creativeService.setEnabled(true, { expectedRevision: creativeState.revision });
    const degraded = await failingCore.run({ aiService: failingAI, messages: [{ role: 'user', content: '挑战一下这个设计' }], userMessage: '挑战一下这个设计' });
    assert.equal(degraded.ok, true);
    assert.equal(degraded.run.challengeError.code, 'CHALLENGE_CONTEXT_BUILD_FAILED');
    assert.equal(degraded.run.cognitionCollection.skipped, 'challenge_runtime_command');
    assert.equal(fs.readFileSync(cognitionFile, 'utf8'), cognitionBefore, 'builder failure command must not change Cognition');
    assert.ok(findContext(failingAI.calls.at(-1), 'Teemo Creative Judgment'));
  });

  await withTempDir(async dir => {
    const file = path.join(dir, TeemoCreativeProfileService.STATE_FILE);
    fs.writeFileSync(file, '{ invalid state', 'utf8');
    const profileService = new TeemoCreativeProfileService({ dataDir: dir });
    const sessionState = new TeemoCreativeDirectorSessionState();
    sessionState.setMode('broken', 'challenge', { intensity: 'strong', source: 'ui' });
    const builder = new TeemoChallengeContextBuilder({ profileService, sessionState });
    const result = builder.build({ sessionId: 'broken', userMessage: '评价这个设计' });
    assert.equal(result.systemMessage, null);
    assert.equal(result.error.code, 'CREATIVE_PROFILE_STATE_UNREADABLE');
    assert.equal(sessionState.getState('broken').mode, 'balanced');
    assert.equal(fs.readFileSync(file, 'utf8'), '{ invalid state');
  });

  console.log('Teemo Challenge Context tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
