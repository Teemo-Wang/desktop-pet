const assert = require('assert');
const AgentCore = require('../src/agent/TeemoAgentCore');
const Router = require('../src/skills/TeemoSkillRouter');
const Composer = require('../src/skills/TeemoSkillComposer');
const SessionState = require('../src/skills/TeemoSkillSessionState');
const { standardManifests, snapshot } = require('./TeemoSkillTestFixtures');

const manifests = standardManifests();
const bodies = new Map(manifests.map(item => [item.skillId, `# Raw ${item.name}\nRule ${item.skillId}`]));
const manifestService = {
  reload() { return snapshot(manifests); },
  getSkillManifest(id) { return manifests.find(item => item.skillId === id) || null; },
  getRawSkill(id) {
    const manifest = this.getSkillManifest(id);
    return manifest ? { skillId: id, name: manifest.name, rawBody: bodies.get(id) } : null;
  },
};
const router = new Router({ manifestService, sessionState: new SessionState(), toolRegistry: { has() { return false; } } });
const composer = new Composer({ manifestService });

function builder(label) {
  return {
    build() { return { systemMessage: { role: 'system', content: `[${label}]` } }; },
  };
}

const sendCalls = [];
const streamCalls = [];
const sendAI = { async send(messages) { sendCalls.push(messages); return 'send ok'; } };
const streamAI = { async stream(messages, onChunk) { streamCalls.push(messages); onChunk('stream ok', 'stream ok'); return 'stream ok'; } };
const common = {
  skillRouter: router,
  skillComposer: composer,
  contextBuilder: builder('Teemo Cognition'),
  creativeContextBuilder: builder('Teemo Creative'),
  challengeContextBuilder: builder('Teemo Challenge'),
};

(async () => {
  const sendResult = await new AgentCore({ ...common, aiService: sendAI }).run({
    messages: [{ role: 'user', content: '生成海报' }], userMessage: '生成海报', sessionId: 'send', disableActionContract: true, skipCognitionCollection: true,
  });
  const streamResult = await new AgentCore({ ...common, aiService: streamAI }).runStream({
    messages: [{ role: 'user', content: '生成海报' }], userMessage: '生成海报', sessionId: 'stream', disableActionContract: true, skipCognitionCollection: true,
  });
  assert.equal(sendResult.ok, true);
  assert.equal(streamResult.ok, true);
  assert.deepEqual(sendResult.run.skillRouting.selectedSkillIds, ['poster']);
  assert.deepEqual(streamResult.run.skillRouting.selectedSkillIds, ['poster']);
  const systemContents = messages => messages.filter(item => item.role === 'system').map(item => item.content);
  assert.deepEqual(systemContents(sendCalls[0]), systemContents(streamCalls[0]), 'send and stream Skill Context must be identical');
  const order = systemContents(sendCalls[0]);
  assert.ok(order[0].includes('Teemo Skill Context v1'));
  assert.equal(order[1], '[Teemo Cognition]');
  assert.equal(order[2], '[Teemo Creative]');
  assert.equal(order[3], '[Teemo Challenge]');
  assert.ok(!order[0].includes('positiveExamples'), 'full Manifest metadata must not enter model context');

  const brokenRouter = { route() { throw Object.assign(new Error('broken'), { code: 'BROKEN_ROUTER' }); } };
  const fallbackCalls = [];
  const fallback = await new AgentCore({ aiService: { async send(messages) { fallbackCalls.push(messages); return 'normal chat'; } }, skillRouter: brokenRouter, skillComposer: composer }).run({
    messages: [{ role: 'user', content: '普通聊天' }], userMessage: '普通聊天', disableActionContract: true, skipCognitionCollection: true,
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.content, 'normal chat');
  assert.equal(fallback.run.skillRouting.type, 'no_skill');
  assert.equal(fallback.run.skillRoutingError.code, 'BROKEN_ROUTER');
  assert.equal(fallbackCalls[0].some(item => String(item.content).includes('Raw Teemo')), false, 'router failure must not fail open');

  const brokenComposer = { compose() { throw new Error('broken composer'); } };
  const composeFallback = await new AgentCore({ aiService: sendAI, skillRouter: router, skillComposer: brokenComposer }).run({
    messages: [{ role: 'user', content: '生成海报' }], userMessage: '生成海报', sessionId: 'broken-compose', disableActionContract: true, skipCognitionCollection: true,
  });
  assert.equal(composeFallback.ok, true);
  assert.equal(composeFallback.run.skillCompositionError.code, 'SKILL_COMPOSITION_FAILED');
  assert.equal(composeFallback.run.skillContext, null);
  console.log('TeemoSkillIntegration.test: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
