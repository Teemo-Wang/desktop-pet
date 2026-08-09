const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoCognitionCollector = require('../src/cognition/TeemoCognitionCollector');
const TeemoContextBuilder = require('../src/cognition/TeemoContextBuilder');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-cognition-intelligence-integration-'));
  try {
    let tick = Date.parse('2026-08-09T08:00:00.000Z');
    const service = new TeemoCognitionService({ dataDir: dir, clock: () => new Date(tick) });
    const collector = new TeemoCognitionCollector({ cognitionService: service });

    const revisionBefore = service.getState().revision;
    for (let index = 0; index < 3; index += 1) {
      const result = await collector.collectTurn({ userMessage: '我喜欢蓝色。', sessionId: `burst-${index}` });
      assert.equal(result.ok, true);
    }
    assert.equal(service.getState().revision, revisionBefore + 3, 'one Collector turn must persist exactly once');
    assert.equal(service.listObservations().find(item => /蓝色/.test(item.content)).evidenceCount, 3);
    assert.equal(service.getProfile().some(item => /蓝色/.test(item.content)), false, 'same-day burst must not promote');

    tick += 24 * 60 * 60 * 1000;
    const crossDay = await collector.collectTurn({ userMessage: '我喜欢蓝色。', sessionId: 'cross-day' });
    assert.equal(crossDay.promoted, true);
    assert.equal(service.getProfile().some(item => /蓝色/.test(item.content)), true);

    for (let index = 0; index < 4; index += 1) {
      tick += 24 * 60 * 60 * 1000;
      await collector.collectTurn({
        userMessage: '这个项目人物要更卡通。',
        projectId: 'project-A',
        sessionId: `project-${index}`,
      });
    }
    assert.equal(service.getProjectContext('project-A').some(item => /更卡通/.test(item.content)), true);
    assert.equal(service.getProfile().some(item => /更卡通/.test(item.content)), false, 'Project Cognition never auto-promotes');
    assert.equal(service.getProjectContext('project-B').length, 0);

    await collector.collectTurn({
      userMessage: '以后默认喜欢卡通人物设计。',
      projectId: 'project-active',
      sessionId: 'active-project-long-term',
    });
    assert.equal(service.getProjectContext('project-active').some(item => /卡通人物/.test(item.content)), true);
    assert.equal(service.getProfile().some(item => /卡通人物/.test(item.content)), false, 'active project outranks non-cross-project long-term wording');

    const crossProject = await collector.collectTurn({
      userMessage: '这个不只适用于当前项目，以后所有项目我都更喜欢高反射金属材质。',
      projectId: 'project-cross-scope',
      sessionId: 'explicit-cross-project',
    });
    assert.equal(crossProject.scope, 'global');
    assert.equal(service.getProfile().some(item => /以后所有项目/.test(item.content)), true);
    assert.equal(service.getProjectContext('project-cross-scope').some(item => /以后所有项目/.test(item.content)), false);
    const projectDefault = await collector.collectTurn({
      userMessage: '这个项目以后默认都使用高反射金属材质。',
      projectId: 'project-cross-scope',
      sessionId: 'project-default-only',
    });
    assert.equal(projectDefault.scope, 'project');
    assert.equal(service.getProjectContext('project-cross-scope').some(item => /这个项目以后默认/.test(item.content)), true);

    const manualState = service.getManagementSnapshot();
    const manualRecent = service.manualCreate({ content: '手动选择仅近期使用的偏好', scope: 'recent' }, { expectedRevision: manualState.revision });
    assert.equal(manualRecent.ok, true);
    assert.equal(service.getProfile().some(item => /手动选择仅近期/.test(item.content)), false);

    const manualRecentDir = fs.mkdtempSync(path.join(dir, 'manual-recent-'));
    let manualTick = Date.parse('2026-08-09T08:00:00.000Z');
    const manualRecentService = new TeemoCognitionService({ dataDir: manualRecentDir, clock: () => new Date(manualTick) });
    const manualStart = manualRecentService.getManagementSnapshot();
    manualRecentService.manualCreate(
      { content: '我喜欢高反射金属材质', scope: 'recent' },
      { expectedRevision: manualStart.revision }
    );
    const manualCollector = new TeemoCognitionCollector({ cognitionService: manualRecentService });
    await manualCollector.collectTurn({ userMessage: '我喜欢高反射金属材质', sessionId: 'manual-repeat-1' });
    manualTick += 24 * 60 * 60 * 1000;
    await manualCollector.collectTurn({ userMessage: '我喜欢高反射金属材质', sessionId: 'manual-repeat-2' });
    const manualEvidence = manualRecentService.listObservations().find(item => item.content === '我喜欢高反射金属材质');
    assert.equal(manualEvidence.source, 'user_manual');
    assert.equal(manualEvidence.evidenceCount, 3);
    assert.equal(manualRecentService.getRecentContext().some(item => item.content === '我喜欢高反射金属材质'), true);
    assert.equal(manualRecentService.getProfile().some(item => item.content === '我喜欢高反射金属材质'), false, 'Manual Recent lineage must never auto-promote');
    const manualExplicitGlobal = await manualCollector.collectTurn({
      userMessage: '以后所有项目我都喜欢高反射金属材质。',
      sessionId: 'manual-explicit-global',
    });
    assert.equal(manualExplicitGlobal.scope, 'global');
    assert.equal(manualRecentService.getProfile().some(item => /以后所有项目/.test(item.content)), true);

    const projectSameA = service.manualCreate({ content: '同文项目认知', scope: 'project', projectId: 'same-A' }, { expectedRevision: manualRecent.snapshot.revision });
    const projectSameB = service.manualCreate({ content: '同文项目认知', scope: 'project', projectId: 'same-B' }, { expectedRevision: projectSameA.snapshot.revision });
    assert.equal(projectSameB.ok, true, 'projectId is part of exact identity');
    const supersededA = service.supersedeCognitionEntry({ domain: 'project', projectId: 'same-A', id: projectSameA.cognition.id }, { expectedRevision: projectSameB.snapshot.revision });
    assert.equal(supersededA.ok, true);
    assert.equal(service.getProjectContext('same-B').some(item => item.status !== 'superseded'), true, 'Project A management must not affect Project B');

    const sensitiveTopic = await collector.collectTurn({
      userMessage: '这个项目属于成人向 NSFW 视觉方向。',
      projectId: 'project-sensitive-topic',
      sessionId: 'sensitive-topic',
    });
    assert.equal(sensitiveTopic.ok, true);
    assert.equal(service.getProjectContext('project-sensitive-topic').some(item => /NSFW/.test(item.content)), true);
    const cryptoStyle = await collector.collectTurn({ userMessage: '最近喜欢密码学风格视觉。', sessionId: 'crypto-style' });
    assert.equal(cryptoStyle.ok, true, 'credential keywords without a credential value are ordinary content');

    const beforeCorrection = await collector.collectTurn({ userMessage: '以后默认喜欢强烈渐变。', sessionId: 'correction' });
    assert.equal(beforeCorrection.promoted, true);
    const corrected = await collector.collectTurn({
      userMessage: '之前说强烈渐变那条不再适用，现在更偏克制色彩。',
      sessionId: 'correction',
    });
    assert.equal(corrected.ok, true);
    assert.equal(service.getProfile().some(item => /强烈渐变/.test(item.content)), false);
    assert.equal(service.getProfile({ includeSuperseded: true }).some(item => /强烈渐变/.test(item.content) && item.status === 'superseded'), true);

    await collector.collectTurn({ userMessage: '我喜欢较亮的字体。', sessionId: 'ambiguous' });
    await collector.collectTurn({ userMessage: '我喜欢较大的字号。', sessionId: 'ambiguous' });
    const ambiguousIds = service.listObservations().filter(item => item.sourceSessionId === 'ambiguous').map(item => item.id);
    const ambiguous = await collector.collectTurn({ userMessage: '之前那个不对。', sessionId: 'ambiguous' });
    assert.equal(ambiguous.ok, true);
    assert.equal(service.listObservations().filter(item => ambiguousIds.includes(item.id)).length, 2, 'ambiguous correction preserves candidates');

    const anchoredDir = fs.mkdtempSync(path.join(dir, 'anchored-correction-'));
    const anchoredService = new TeemoCognitionService({ dataDir: anchoredDir, clock: () => new Date(tick) });
    const anchoredCollector = new TeemoCognitionCollector({ cognitionService: anchoredService });
    await anchoredCollector.collectTurn({ userMessage: '我喜欢高反射金属材质。', sessionId: 'anchor-a' });
    await anchoredCollector.collectTurn({ userMessage: '我喜欢高反射金属字体。', sessionId: 'anchor-b' });
    const anchoredAmbiguous = await anchoredCollector.collectTurn({
      userMessage: '之前说高反射金属那条不再适用。',
      sessionId: 'anchor-correction',
    });
    assert.equal(anchoredAmbiguous.ambiguousCorrection, true);
    assert.equal(anchoredService.listObservations().filter(item => /我喜欢高反射金属/.test(item.content)).length, 2, 'one-to-many anchor must preserve all candidates');
    const pendingCorrection = anchoredService.getManagementSnapshot().recentContext.find(item => /之前说高反射金属/.test(item.content));
    assert.equal(pendingCorrection.intelligence.state, 'pending');
    await anchoredCollector.collectTurn({ userMessage: '我喜欢强烈渐变材质。', sessionId: 'unique-anchor' });
    const uniqueCorrection = await anchoredCollector.collectTurn({
      userMessage: '之前说强烈渐变材质那条不再适用，现在更喜欢克制色彩。',
      sessionId: 'unique-anchor',
    });
    assert.equal(uniqueCorrection.ambiguousCorrection, false);
    assert.equal(anchoredService.listObservations().some(item => /我喜欢强烈渐变材质/.test(item.content)), false, 'unique anchor still supersedes normally');

    const retryDir = fs.mkdtempSync(path.join(dir, 'retry-'));
    const retryService = new TeemoCognitionService({ dataDir: retryDir, clock: () => new Date(tick) });
    const realCommit = retryService.commitCollectorTurn.bind(retryService);
    let commitCalls = 0;
    retryService.commitCollectorTurn = (input, options) => {
      commitCalls += 1;
      if (commitCalls === 1) return { ok: false, code: 'COGNITION_CHANGED' };
      return realCommit(input, options);
    };
    const retried = await new TeemoCognitionCollector({ cognitionService: retryService }).collectTurn({
      userMessage: '最近喜欢高反射材质。',
      sessionId: 'retry',
    });
    assert.equal(retried.retryCount, 1);
    assert.equal(retryService.listObservations().length, 1, 'retry must be idempotent');
    retryService.commitCollectorTurn = () => ({ ok: false, code: 'COGNITION_CHANGED' });
    const exhausted = await new TeemoCognitionCollector({ cognitionService: retryService }).collectTurn({
      userMessage: '最近喜欢低饱和色彩。',
      sessionId: 'retry-exhausted',
    });
    assert.equal(exhausted.code, 'COGNITION_CONCURRENT_CHANGE');
    assert.equal(exhausted.retryCount, 1);

    const competingManagement = new TeemoCognitionService({ dataDir: retryDir, clock: () => new Date(tick) });
    const managementRevision = competingManagement.getState().revision;
    const lockProbe = retryService.storage.withFileLock(retryService.fileName, () => (
      competingManagement.manualCreate(
        { content: '锁竞争期间不能覆盖 Collector', scope: 'recent' },
        { expectedRevision: managementRevision }
      )
    ));
    assert.equal(lockProbe.acquired, true);
    assert.equal(lockProbe.value.code, 'COGNITION_CHANGED', 'Management mutation must share the Collector file lock');
    assert.equal(new TeemoCognitionService({ dataDir: retryDir }).getRecentContext().some(item => /锁竞争/.test(item.content)), false);

    const disabledSnapshot = retryService.getManagementSnapshot();
    retryService.setEnabled(false, { expectedRevision: disabledSnapshot.revision });
    const disabledRevision = retryService.getState().revision;
    const disabled = await new TeemoCognitionCollector({ cognitionService: retryService }).collectTurn({ userMessage: '以后默认喜欢红色。' });
    assert.equal(disabled.skipped, 'disabled');
    assert.equal(retryService.getState().revision, disabledRevision);

    const corruptDir = fs.mkdtempSync(path.join(dir, 'corrupt-'));
    const corruptPath = path.join(corruptDir, 'Teemo-cognition.json');
    const corruptBytes = '{ invalid cognition state';
    fs.writeFileSync(corruptPath, corruptBytes, 'utf8');
    const corruptService = new TeemoCognitionService({ dataDir: corruptDir });
    assert.equal(corruptService.isReadable(), false);
    const corruptCollection = await new TeemoCognitionCollector({ cognitionService: corruptService }).collectTurn({ userMessage: '以后默认喜欢红色。' });
    assert.equal(corruptCollection.skipped, 'unreadable');
    const corruptBundle = new TeemoContextBuilder({ cognitionService: corruptService }).build({ messages: [{ role: 'user', content: '红色设计' }] });
    assert.equal(corruptBundle.systemMessage, null);
    assert.equal(fs.readFileSync(corruptPath, 'utf8'), corruptBytes);
    assert.equal(corruptService.getManagementSnapshot().unreadable, true);

    const sent = [];
    const streamed = [];
    const sendAI = { async send(messages) { sent.push(messages); return 'ok'; } };
    const streamAI = { async stream(messages, onChunk) { streamed.push(messages); onChunk('ok', 'ok'); return 'ok'; } };
    const builder = new TeemoContextBuilder({ cognitionService: service });
    await new TeemoAgentCore({ aiService: sendAI, contextBuilder: builder }).run({
      messages: [{ role: 'user', content: '继续优化蓝色设计。' }],
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    await new TeemoAgentCore({ aiService: streamAI, contextBuilder: builder }).runStream({
      messages: [{ role: 'user', content: '继续优化蓝色设计。' }],
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    const cognitionMessage = messages => messages.find(item => item.role === 'system' && /Teemo Cognition 上下文/.test(String(item.content)));
    assert.deepEqual(cognitionMessage(sent[0]), cognitionMessage(streamed[0]), 'send and stream must receive identical Cognition Context');

    const singleDir = fs.mkdtempSync(path.join(dir, 'single-profile-'));
    const singleService = new TeemoCognitionService({ dataDir: singleDir, clock: () => new Date(tick) });
    const singleSnapshot = singleService.getManagementSnapshot();
    singleService.manualCreate({ content: '长期偏好成人向视觉题材', scope: 'global' }, { expectedRevision: singleSnapshot.revision });
    const singleBuilder = new TeemoContextBuilder({ cognitionService: singleService });
    const singleSend = { calls: [], async send(messages) { this.calls.push(messages); return 'ok'; } };
    const singleStream = { calls: [], async stream(messages, onChunk) { this.calls.push(messages); onChunk('ok', 'ok'); return 'ok'; } };
    await new TeemoAgentCore({ aiService: singleSend, contextBuilder: singleBuilder }).run({
      messages: [{ role: 'user', content: '帮我设计一个儿童教育 App UI。' }],
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    await new TeemoAgentCore({ aiService: singleStream, contextBuilder: singleBuilder }).runStream({
      messages: [{ role: 'user', content: '优化一个普通金融后台 UI。' }],
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    assert.equal(cognitionMessage(singleSend.calls[0]), undefined);
    assert.equal(cognitionMessage(singleStream.calls[0]), undefined, 'single sensitive-topic Profile must not leak into unrelated design send/stream');
    const personalBundle = singleBuilder.build({ messages: [{ role: 'user', content: '按照我平时喜欢的方向再来一版。' }] });
    assert.match(personalBundle.systemMessage.content, /长期偏好成人向视觉题材/);

    const failingAI = { calls: [], async send(messages) { this.calls.push(messages); return 'normal chat continues'; } };
    const failingResult = await new TeemoAgentCore({
      aiService: failingAI,
      contextBuilder: {
        build() { throw new Error('intelligence ranking failed'); },
      },
    }).run({ messages: [{ role: 'user', content: '普通聊天' }], disableActionContract: true });
    assert.equal(failingResult.ok, true);
    assert.equal(failingResult.run.cognitionError.code, 'CONTEXT_BUILD_FAILED');
    assert.equal(cognitionMessage(failingAI.calls[0]), undefined, 'intelligence failure must not inject an unranked fallback');

    const persistedPath = service.getStoragePath();
    const persistedBefore = fs.readFileSync(persistedPath, 'utf8');
    const restarted = new TeemoCognitionService({ dataDir: dir, clock: () => new Date(tick + 100 * 24 * 60 * 60 * 1000) });
    restarted.getManagementSnapshot();
    restarted.getIntelligentContext({ query: '蓝色' });
    assert.equal(fs.readFileSync(persistedPath, 'utf8'), persistedBefore, 'restart and freshness derive must not rewrite v2 data');

    console.log('Teemo Cognition Intelligence Integration tests passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
