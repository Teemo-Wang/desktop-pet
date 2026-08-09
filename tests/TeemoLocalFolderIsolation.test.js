const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoCreativeDirectorSessionState = require('../src/creative/TeemoCreativeDirectorSessionState');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoLocalFolderService = require('../src/inspiration/TeemoLocalFolderService');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-2-isolation-'));
  const dataDir = path.join(root, 'data');
  const sourceRoot = path.join(root, 'Teemo Synthetic Private Source');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'Teemo-synthetic.png'), PNG);
  fs.writeFileSync(path.join(sourceRoot, 'Teemo-note.txt'), 'synthetic only');

  const protectedFiles = [
    'Teemo-cognition.json',
    'Teemo-creative-profile.json',
    'skills.json',
    'Teemo-skill-registry.json',
    'projects.json',
    'settings.json',
    'chat-history.json',
    'config.json',
  ];
  const before = new Map();
  protectedFiles.forEach((fileName, index) => {
    const bytes = Buffer.from(`Teemo-protected-${index}-${fileName}`, 'utf8');
    fs.writeFileSync(path.join(dataDir, fileName), bytes);
    before.set(fileName, bytes);
  });

  try {
    const fileService = new TeemoFileService();
    const roots = [sourceRoot];
    const sourceService = new TeemoInspirationSourceService({
      dataDir,
      fileService,
      rootsProvider: () => roots,
      idFactory: () => '11111111-1111-4111-8111-111111111111',
    });
    const source = sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Synthetic Private Source' }).sources[0];
    const globalService = new TeemoInspirationService({ dataDir });
    assert.equal(globalService.setEnabled(true, { expectedRevision: 0 }).ok, true);
    const globalStatePath = path.join(dataDir, TeemoInspirationService.STATE_FILE);
    const sourceStatePath = path.join(dataDir, TeemoInspirationSourceService.SOURCE_FILE);
    const globalBefore = fs.readFileSync(globalStatePath);
    const sourceBefore = fs.readFileSync(sourceStatePath);

    let providerCalls = 0;
    const localFolder = new TeemoLocalFolderService({
      fileService,
      sourceService,
      rootsProvider: () => roots,
      provider: { send: () => { providerCalls += 1; } },
    });
    assert.equal((await localFolder.execute('health', { sourceId: source.sourceId })).status, 'AVAILABLE');
    assert.equal((await localFolder.execute('list_items', { sourceId: source.sourceId })).entries.length, 2);
    assert.equal((await localFolder.execute('item_metadata', { sourceId: source.sourceId, relativePath: 'Teemo-synthetic.png' })).type, 'regular_file');
    assert.equal((await localFolder.execute('preview', { sourceId: source.sourceId, relativePath: 'Teemo-synthetic.png' })).mimeType, 'image/png');
    assert.equal(providerCalls, 0, 'Local Folder connector must not call a Provider');
    assert.ok(fs.readFileSync(globalStatePath).equals(globalBefore), 'browse must not modify P3 global state');
    assert.ok(fs.readFileSync(sourceStatePath).equals(sourceBefore), 'browse must not modify P3 source config');

    const challenge = new TeemoCreativeDirectorSessionState();
    challenge.setMode('p3-isolation', 'challenge', { intensity: 'strong', source: 'test' });
    const challengeBefore = challenge.getState('p3-isolation');
    let capturedMessages = null;
    const system = content => ({ systemMessage: { role: 'system', content } });
    const agent = new TeemoAgentCore({
      aiService: { send: async messages => { capturedMessages = messages; return 'done'; } },
      skillRouter: { route: async () => ({ selectedSkillIds: ['synthetic'], type: 'single_skill' }) },
      skillComposer: { compose: async () => system('Skill') },
      contextBuilder: { build: async () => system('Cognition') },
      creativeContextBuilder: { build: async () => system('Creative') },
      challengeContextBuilder: { build: async () => system('Challenge') },
    });
    const result = await agent.run({
      messages: [{ role: 'user', content: 'Current User' }],
      userMessage: 'Current User',
      sessionId: 'p3-isolation',
      disableActionContract: true,
      skipCognitionCollection: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(capturedMessages.map(message => message.content), ['Skill', 'Cognition', 'Creative', 'Challenge', 'Current User']);
    assert.equal(capturedMessages.some(message => /Inspiration|Local Folder|synthetic\.png/i.test(message.content)), false);
    assert.deepEqual(challenge.getState('p3-isolation'), challengeBefore);

    for (const fileName of protectedFiles) {
      assert.ok(fs.readFileSync(path.join(dataDir, fileName)).equals(before.get(fileName)), `${fileName} changed`);
    }
    const persistedSource = JSON.parse(fs.readFileSync(sourceStatePath, 'utf8'));
    assert.equal(JSON.stringify(persistedSource).includes('Teemo-synthetic.png'), false);
    assert.equal(JSON.stringify(persistedSource).includes('synthetic only'), false);
    assert.equal(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())), true);
    assert.notEqual(path.resolve(dataDir), path.resolve(os.homedir(), '.hellobike-pet'));

    console.log(JSON.stringify({
      ok: true,
      cognitionUnchanged: true,
      creativeUnchanged: true,
      challengeUnchanged: true,
      rawSkillUnchanged: true,
      skillRegistryUnchanged: true,
      projectUnchanged: true,
      agentContextOrder: ['Skill', 'Cognition', 'Creative', 'Challenge', 'Current User'],
      inspirationContextInjected: false,
      providerCalls,
      p3GlobalStateUnchanged: true,
      sourceConfigUnchangedByRead: true,
      formalUserDataTouched: false,
      realPersonalInspirationContentUsed: false,
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
