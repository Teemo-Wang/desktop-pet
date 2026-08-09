const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoCreativeDirectorSessionState = require('../src/creative/TeemoCreativeDirectorSessionState');
const TeemoInspirationConnectorRegistry = require('../src/inspiration/TeemoInspirationConnectorRegistry');
const TeemoInspirationAccessGuard = require('../src/inspiration/TeemoInspirationAccessGuard');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-inspiration-isolation-'));
  try {
    const protectedFiles = [
      'Teemo-cognition.json',
      'Teemo-creative-profile.json',
      'skills.json',
      'Teemo-skill-registry.json',
      'projects.json',
    ];
    const before = new Map();
    protectedFiles.forEach((fileName, index) => {
      const bytes = Buffer.from(`protected-${index}-${fileName}`, 'utf8');
      fs.writeFileSync(path.join(root, fileName), bytes);
      before.set(fileName, bytes);
    });

    const registry = new TeemoInspirationConnectorRegistry();
    let invocationCount = 0;
    registry.register({
      getDefinition: () => ({
        connectorId: 'isolation', kind: 'test', displayName: 'Isolation Source', version: '1.0.0', readOnly: true,
        capabilities: ['list_items'], authorization: { type: 'test' }, offlineBehavior: 'unavailable', privacyClass: 'synthetic',
      }),
      listItems: async () => {
        invocationCount += 1;
        return [{ itemId: 'isolated' }];
      },
    });
    const guard = new TeemoInspirationAccessGuard({
      registry,
      permissionService: { authorize: async () => ({ decision: 'allow' }) },
    });

    const director = new TeemoCreativeDirectorSessionState();
    director.setMode('session-a', 'challenge', { intensity: 'strong', source: 'test' });
    const challengeBefore = director.getState('session-a');
    const providerCalls = { A: 0, B: 0 };
    const serviceA = new TeemoInspirationService({ dataDir: root, registry, accessGuard: guard, provider: { send: () => { providerCalls.A += 1; } } });
    const serviceB = new TeemoInspirationService({ dataDir: root, registry, accessGuard: guard, provider: { send: () => { providerCalls.B += 1; } } });
    assert.equal(serviceA.setEnabled(true, { expectedRevision: 0 }).ok, true);
    assert.equal((await serviceA.read('isolation', 'list_items')).ok, true);
    assert.equal(serviceB.reload().enabled, true);
    assert.equal(invocationCount, 1);
    assert.deepEqual(providerCalls, { A: 0, B: 0 }, 'foundation must not call an AI provider');
    assert.deepEqual(director.getState('session-a'), challengeBefore, 'Inspiration must not change Challenge session state');

    for (const fileName of protectedFiles) {
      assert.ok(fs.readFileSync(path.join(root, fileName)).equals(before.get(fileName)), `${fileName} changed`);
    }
    const state = JSON.parse(fs.readFileSync(path.join(root, TeemoInspirationService.STATE_FILE), 'utf8'));
    assert.deepEqual(Object.keys(state).sort(), ['enabled', 'revision', 'schemaVersion', 'updatedAt']);
    assert.equal(JSON.stringify(state).includes('protected-'), false);

    let capturedMessages = null;
    const message = label => ({ systemMessage: { role: 'system', content: label } });
    const agent = new TeemoAgentCore({
      aiService: { send: async messages => { capturedMessages = messages; return 'done'; } },
      skillRouter: { route: async () => ({ selectedSkillIds: ['test'], type: 'single_skill' }) },
      skillComposer: { compose: async () => message('Skill') },
      contextBuilder: { build: async () => message('Cognition') },
      creativeContextBuilder: { build: async () => message('Creative') },
      challengeContextBuilder: { build: async () => message('Challenge') },
    });
    const run = await agent.run({
      messages: [{ role: 'user', content: 'Current User' }],
      userMessage: 'Current User',
      sessionId: 'agent-isolation',
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    assert.equal(run.ok, true);
    assert.deepEqual(capturedMessages.map(item => item.content), ['Skill', 'Cognition', 'Creative', 'Challenge', 'Current User']);
    assert.equal(capturedMessages.some(item => /Inspiration/i.test(item.content)), false, 'P3-1 must not inject Agent context');

    assert.equal(path.resolve(serviceA.storage.getDir()), path.resolve(root));
    assert.notEqual(path.resolve(root), path.resolve(os.homedir(), '.hellobike-pet'));
    console.log('Teemo inspiration isolation tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
