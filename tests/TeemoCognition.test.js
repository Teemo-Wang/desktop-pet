const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoCognitionCollector = require('../src/cognition/TeemoCognitionCollector');
const TeemoContextBuilder = require('../src/cognition/TeemoContextBuilder');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');

function responseAI(value = '正常回答') {
  return {
    calls: [],
    async send(messages) {
      this.calls.push(messages.map(message => ({ ...message })));
      return value;
    },
  };
}

async function main() {
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p1-2-cognition-'));
  try {
    let tick = Date.parse('2026-08-09T00:00:00.000Z');
    const service = new TeemoCognitionService({
      dataDir: isolatedDir,
      clock: () => new Date(tick += 1000),
    });
    const collector = new TeemoCognitionCollector({ cognitionService: service, repeatThreshold: 3 });

    assert.equal(path.dirname(service.getStoragePath()), path.resolve(isolatedDir));
    assert.notEqual(path.resolve(isolatedDir), path.resolve(os.homedir(), '.hellobike-pet'));

    const corruptDir = fs.mkdtempSync(path.join(isolatedDir, 'corrupt-'));
    const corruptPath = path.join(corruptDir, 'Teemo-cognition.json');
    fs.writeFileSync(corruptPath, '{invalid json', 'utf8');
    const corruptService = new TeemoCognitionService({ dataDir: corruptDir });
    assert.throws(() => corruptService.recordObservation({
      scope: 'recent',
      content: '最近喜欢简洁设计',
    }), /拒绝覆盖读取失败的存储文件/);
    assert.equal(fs.readFileSync(corruptPath, 'utf8'), '{invalid json');

    const longTerm = await collector.collectTurn({
      userMessage: '记住，我以后默认喜欢简洁、留白充足的设计。',
      sessionId: 'session-profile',
    });
    assert.equal(longTerm.promoted, true);
    assert.match(service.getProfile()[0].content, /简洁/);

    await collector.collectTurn({ userMessage: '这次我想试一下粉色。', sessionId: 'session-temp' });
    assert.equal(service.getProfile().some(item => /粉色/.test(item.content)), false);
    assert.equal(service.getRecentContext().some(item => /粉色/.test(item.content)), true);

    await collector.collectTurn({ userMessage: '最近开始使用 Blender 做灯光研究。', sessionId: 'session-recent' });
    const recent = service.getRecentContext().find(item => /Blender/.test(item.content));
    assert.ok(recent.createdAt && recent.updatedAt && recent.lastObservedAt);
    assert.equal(service.getProfile().some(item => /Blender/.test(item.content)), false);

    await collector.collectTurn({
      userMessage: '这个项目要求未来科技风，并且禁止复杂背景。',
      projectId: 'project-A',
      sessionId: 'session-project',
    });
    assert.equal(service.getProjectContext('project-A').length, 1);
    assert.equal(service.getProjectContext('project-A')[0].projectId, 'project-A');
    assert.equal(service.getProjectContext('project-B').length, 0);
    assert.equal(service.getProfile().some(item => /未来科技风/.test(item.content)), false);

    await collector.collectTurn({ userMessage: '我比较喜欢大圆角卡片。', sessionId: 'scope-correction' });
    assert.equal(service.getProfile().some(item => /大圆角/.test(item.content)), true);
    await collector.collectTurn({
      userMessage: '这个只适用于这个项目。',
      projectId: 'project-A',
      sessionId: 'scope-correction',
    });
    assert.equal(service.getProfile().some(item => /大圆角/.test(item.content)), false);
    assert.equal(service.getProjectContext('project-A').some(item => /大圆角/.test(item.content)), true);

    for (let index = 0; index < 3; index += 1) {
      await collector.collectTurn({ userMessage: '我喜欢留白丰富的版式。', sessionId: `repeat-${index}` });
    }
    const repeated = service.listObservations().find(item => /留白丰富/.test(item.content));
    assert.equal(repeated.evidenceCount, 3);
    assert.equal(service.getProfile().some(item => /留白丰富/.test(item.content)), true);

    await collector.collectTurn({ userMessage: '以后默认使用蓝色作为主色。', sessionId: 'before-correction' });
    assert.equal(service.getProfile().some(item => /蓝色/.test(item.content)), true);
    await collector.collectTurn({ userMessage: '不是，我现在不喜欢蓝色了。', sessionId: 'correction' });
    assert.equal(service.getProfile().some(item => /蓝色/.test(item.content)), false);
    assert.equal(service.getProfile({ includeSuperseded: true }).some(item => /蓝色/.test(item.content) && item.status === 'superseded'), true);
    assert.equal(service.listObservations({ includeSuperseded: true }).some(item => /蓝色/.test(item.content) && item.status === 'superseded'), true);

    const beforeSensitive = service.listObservations({ includeSuperseded: true }).length;
    const sensitive = await collector.collectTurn({
      userMessage: '记住 API Key: sk-abcdefghijklmnopqrstuvwxyz123456',
      sessionId: 'sensitive',
    });
    assert.equal(sensitive.skipped, 'sensitive');
    assert.equal(service.listObservations({ includeSuperseded: true }).length, beforeSensitive);

    const builder = new TeemoContextBuilder({ cognitionService: service, maxChars: 2200 });
    const bundle = builder.build({
      projectId: 'project-A',
      projectContext: { project: { name: '银行卡项目', visualDirection: '高密度赛博朋克视觉' } },
      messages: [
        { role: 'system', content: '【已加载技能：版式】严格遵循栅格。' },
        { role: 'user', content: '本轮请降低信息密度。' },
      ],
    });
    assert.ok(bundle.profile.length > 0);
    assert.ok(bundle.recentContext.length > 0);
    assert.equal(bundle.projectContext.projectId, 'project-A');
    assert.match(bundle.skillContext, /栅格/);
    assert.match(bundle.conversationContext, /降低信息密度/);
    assert.match(bundle.systemMessage.content, /当前用户明确指令 > 当前项目 Context > Recent Context > 长期 Teemo Profile/);
    assert.match(bundle.systemMessage.content, /高密度赛博朋克/);
    assert.ok(bundle.systemMessage.content.length <= 2200);
    assert.equal(service.getProfile().some(item => /赛博朋克/.test(item.content)), false);

    for (let index = 0; index < 30; index += 1) {
      const recorded = service.recordObservation({
        category: 'preference',
        scope: 'recent',
        content: `近期观察 ${index}：${'内容'.repeat(80)}`,
        confidence: 0.5 + (index % 5) / 10,
      });
      service.updateRecentFromObservation(recorded.observation);
    }
    const budgeted = new TeemoContextBuilder({ cognitionService: service, maxChars: 1000 }).build({ messages: [] });
    assert.ok(budgeted.recentContext.length < service.getRecentContext().length);
    assert.ok(budgeted.systemMessage.content.length <= 1000);

    const ai = responseAI('使用统一 Cognition 的回答');
    const core = new TeemoAgentCore({ aiService: ai, contextBuilder: builder, cognitionCollector: collector });
    const agentResult = await core.run({
      messages: [{ role: 'user', content: '请给建议' }],
      disableActionContract: true,
      projectId: 'project-A',
      projectContext: { project: { name: '银行卡项目' } },
      skipCognitionCollection: true,
    });
    assert.equal(agentResult.ok, true);
    assert.equal(ai.calls.length, 1);
    assert.equal(ai.calls[0].some(message => message.role === 'system' && /Teemo Cognition/.test(message.content)), true);

    const streamAI = {
      calls: [],
      async stream(messages, onChunk) {
        this.calls.push(messages.map(message => ({ ...message })));
        onChunk('流式 Cognition 正常', '流式 Cognition 正常');
        return '流式 Cognition 正常';
      },
    };
    const streamResult = await new TeemoAgentCore({
      aiService: streamAI,
      contextBuilder: builder,
      cognitionCollector: collector,
    }).runStream({
      messages: [{ role: 'user', content: '普通知识问答，不需要记录。' }],
      disableActionContract: true,
      projectId: 'project-A',
    });
    assert.equal(streamResult.ok, true);
    assert.equal(streamResult.content, '流式 Cognition 正常');
    assert.equal(streamAI.calls[0].some(message => message.role === 'system' && /Teemo Cognition/.test(message.content)), true);
    await streamResult.run.collectionPromise;
    assert.equal(streamResult.run.cognitionCollection.skipped, 'no_signal');

    const emptyDir = fs.mkdtempSync(path.join(isolatedDir, 'empty-'));
    const emptyService = new TeemoCognitionService({ dataDir: emptyDir });
    const emptyAI = responseAI('无 Cognition 也正常');
    const emptyResult = await new TeemoAgentCore({
      aiService: emptyAI,
      contextBuilder: new TeemoContextBuilder({ cognitionService: emptyService }),
    }).run({ messages: [{ role: 'user', content: '你好' }], disableActionContract: true });
    assert.equal(emptyResult.ok, true);
    assert.equal(emptyAI.calls[0].some(message => /Teemo Cognition/.test(String(message.content))), false);

    const fallbackAI = responseAI('Context Builder 失败后仍正常');
    const fallbackResult = await new TeemoAgentCore({
      aiService: fallbackAI,
      contextBuilder: { build() { throw new Error('builder failed'); } },
    }).run({ messages: [{ role: 'user', content: '继续聊天' }], disableActionContract: true });
    assert.equal(fallbackResult.ok, true);
    assert.equal(fallbackResult.run.cognitionError.code, 'CONTEXT_BUILD_FAILED');

    let collectorCalls = 0;
    const collectorFailureAI = responseAI('Collector 失败不影响回答');
    const collectorFailureResult = await new TeemoAgentCore({
      aiService: collectorFailureAI,
      cognitionCollector: {
        async collectTurn() {
          collectorCalls += 1;
          throw new Error('collector failed');
        },
      },
    }).run({ messages: [{ role: 'user', content: '我喜欢简洁设计' }], disableActionContract: true });
    assert.equal(collectorFailureResult.ok, true);
    await collectorFailureResult.run.collectionPromise;
    assert.equal(collectorCalls, 1);
    assert.equal(collectorFailureAI.calls.length, 1);
    assert.deepEqual(collectorFailureResult.run.cognitionCollection, { ok: false, error: 'COLLECTOR_FAILED' });

    assert.equal(fs.existsSync(service.getStoragePath()), true);
    console.log('Teemo Cognition tests passed');
  } finally {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
