const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoCreativeProfileDefaults = require('../src/creative/TeemoCreativeProfileDefaults');
const TeemoCreativeProfileService = require('../src/creative/TeemoCreativeProfileService');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoCognitionCollector = require('../src/cognition/TeemoCognitionCollector');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-creative-profile-'));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const profile = TeemoCreativeProfileDefaults.getProfile();
  const validation = TeemoCreativeProfileDefaults.validate(profile);
  assert.equal(validation.ok, true, validation.errors.join(', '));
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.profileVersion, '1.0.0');
  assert.equal(new Set(profile.principles.map(item => item.id)).size, profile.principles.length);
  assert.equal(new Set(profile.dimensions.map(item => item.id)).size, profile.dimensions.length);
  assert.equal(profile.dimensions.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.equal(TeemoCreativeProfileDefaults.getDomainLens('unknown').id, 'general');
  assert.deepEqual(Object.keys(profile.domainLenses).sort(), ['3d', 'brand', 'general', 'marketing', 'motion', 'ui']);

  const isolatedCopy = TeemoCreativeProfileDefaults.getProfile();
  isolatedCopy.principles[0].name = 'mutated';
  assert.notEqual(TeemoCreativeProfileDefaults.getProfile().principles[0].name, 'mutated');

  await withTempDir(async dir => {
    const service = new TeemoCreativeProfileService({ dataDir: dir });
    const stateFile = path.join(dir, TeemoCreativeProfileService.STATE_FILE);
    assert.equal(service.isEnabled(), true);
    assert.equal(service.getState().schemaVersion, 1);
    assert.equal(service.getState().profileVersion, '1.0.0');
    assert.equal(fs.existsSync(stateFile), false, 'default load must not write state');

    const disabled = service.setEnabled(false, { expectedRevision: 0 });
    assert.equal(disabled.ok, true);
    assert.equal(disabled.snapshot.state.revision, 1);
    assert.equal(new TeemoCreativeProfileService({ dataDir: dir }).isEnabled(), false);

    const otherWindow = new TeemoCreativeProfileService({ dataDir: dir });
    const enabled = otherWindow.setEnabled(true, { expectedRevision: 1 });
    assert.equal(enabled.ok, true);
    const stale = service.setEnabled(false, { expectedRevision: 1 });
    assert.equal(stale.code, 'CREATIVE_PROFILE_CHANGED');
    assert.equal(stale.snapshot.state.enabled, true);

    const beforeCollector = fs.readFileSync(stateFile, 'utf8');
    const cognition = new TeemoCognitionService({ dataDir: dir });
    const collector = new TeemoCognitionCollector({ cognitionService: cognition });
    const collected = await collector.collectTurn({ userMessage: '以后默认喜欢极简设计', sessionId: 'creative-isolation' });
    assert.equal(collected.ok, true);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), beforeCollector, 'Cognition Collector must not change Creative state');
    assert.ok(fs.existsSync(path.join(dir, 'Teemo-cognition.json')));
  });

  await withTempDir(async dir => {
    const stateFile = path.join(dir, TeemoCreativeProfileService.STATE_FILE);
    const invalid = '{ invalid creative state json';
    fs.writeFileSync(stateFile, invalid, 'utf8');
    const service = new TeemoCreativeProfileService({ dataDir: dir });
    assert.equal(service.isEnabled(), true, 'corrupt state must fail to safe in-memory default');
    assert.throws(() => service.setEnabled(false), /拒绝覆盖读取失败/);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), invalid);
  });

  console.log('Teemo Creative Profile tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
