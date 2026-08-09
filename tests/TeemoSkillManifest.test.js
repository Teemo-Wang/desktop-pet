const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const StorageService = require('../src/services/TeemoStorageService');
const ManifestService = require('../src/skills/TeemoSkillManifestService');
const Router = require('../src/skills/TeemoSkillRouter');
const Validator = require('../src/skills/TeemoSkillValidator');
const Specification = require('../src/skills/TeemoSkillSpecification');
const { manifest } = require('./TeemoSkillTestFixtures');

class FakeSkillService {
  constructor(skills) { this.skills = skills; this.listeners = new Set(); }
  getAll() { return this.skills.map(item => ({ ...item })); }
  get(id) { return this.skills.find(item => item.id === id) || null; }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  update(id, patch) {
    const skill = this.get(id);
    Object.assign(skill, patch);
    for (const listener of this.listeners) listener();
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p2-5-manifest-'));
try {
  const raw = '# Skill: Teemo 海报\n\n## 触发条件\n- 生成活动海报\n\n## 步骤\n- 保持层级清晰';
  const skills = new FakeSkillService([{ id: 'poster', name: 'Teemo 海报', desc: '生成活动海报', systemPrompt: raw }]);
  const storage = new StorageService({ dataDir: root });
  const service = new ManifestService({ skillService: skills, storage });
  const initial = service.getRegistrySnapshot();
  assert.equal(initial.ok, true);
  assert.equal(initial.schemaVersion, 1);
  assert.equal(initial.revision, 1);
  assert.equal(initial.skills.length, 1);
  assert.equal(initial.skills[0].skillId, 'poster');
  assert.equal(initial.skills[0].source.contentHash, Specification.hashText(raw));
  assert.equal(service.validateSkill('poster').valid, true);

  const registryPath = storage.getPath('Teemo-skill-registry.json');
  const bytesBeforeRead = fs.readFileSync(registryPath);
  service.getRegistrySnapshot();
  service.reload();
  assert.deepEqual(fs.readFileSync(registryPath), bytesBeforeRead, 'read-only registry access must not rewrite bytes');

  const rawBeforeOverride = skills.get('poster').systemPrompt;
  const updated = service.updateRoutingOverride('poster', {
    role: 'brand', aliases: ['活动 KV'], intents: ['制作活动 KV'], allowComposition: true,
    inputModalities: ['image'], sensitivity: 'sensitive',
  }, initial.revision);
  assert.equal(updated.revision, 2);
  assert.equal(service.getSkillManifest('poster').routing.role, 'brand');
  assert.deepEqual(service.getSkillManifest('poster').modalities.input, ['image']);
  assert.equal(service.getSkillManifest('poster').content.sensitivity, 'sensitive');
  assert.equal(skills.get('poster').systemPrompt, rawBeforeOverride, 'override must not change Raw Skill');
  assert.throws(() => service.updateRoutingOverride('poster', { role: 'task' }, initial.revision), error => error.code === 'SKILL_REGISTRY_CHANGED');

  const secondWindow = new ManifestService({ skillService: skills, storage: new StorageService({ dataDir: root }) });
  const secondRevision = secondWindow.getRegistrySnapshot().revision;
  secondWindow.updateRoutingOverride('poster', { continuity: false }, secondRevision);
  service.synchronize();
  assert.equal(service.getSkillManifest('poster').routing.continuity, false, 'startup synchronization must preserve newer cross-window overrides');

  const nextRaw = `${raw}\n- 增加安全区`;
  skills.update('poster', { systemPrompt: nextRaw });
  const afterSourceChange = service.getSkillManifest('poster');
  assert.equal(afterSourceChange.source.contentHash, Specification.hashText(nextRaw));
  assert.equal(afterSourceChange.routing.role, 'brand', 'manual overrides survive Raw Skill updates');
  assert.equal(afterSourceChange.routing.continuity, false);
  assert.deepEqual(afterSourceChange.routing.aliases, ['活动 KV']);
  assert.deepEqual(afterSourceChange.modalities.input, ['image']);
  assert.equal(afterSourceChange.content.sensitivity, 'sensitive');

  const revision = service.getRegistrySnapshot().revision;
  service.resetRoutingOverride('poster', revision);
  assert.deepEqual(service.getSkillManifest('poster').overrides, {});

  const validator = new Validator();
  const invalidRole = manifest('bad', 'Bad', { routing: { role: 'invalid' } });
  assert.equal(validator.validateManifest(invalidRole).valid, false);
  const duplicate = { schemaVersion: 1, revision: 1, skills: [manifest('same', 'A'), manifest('same', 'B')] };
  assert.equal(validator.validateRegistry(duplicate).valid, false);

  const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p2-5-invalid-manifest-'));
  try {
    const validRaw = 'Raw Teemo Valid';
    const invalidRaw = 'Raw Teemo Invalid';
    const validManifest = manifest('valid', 'Teemo Valid', { rawBody: validRaw, routing: { intents: ['valid task'] } });
    const invalidManifest = manifest('invalid', 'Teemo Invalid', { rawBody: invalidRaw });
    invalidManifest.routing.role = 'bad_role';
    const mixedRegistryPath = path.join(mixedRoot, 'Teemo-skill-registry.json');
    const mixedBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: 3, updatedAt: '2026-08-09T00:00:00.000Z', skills: [validManifest, invalidManifest] }, null, 2), 'utf8');
    fs.writeFileSync(mixedRegistryPath, mixedBytes);
    const mixedSkills = new FakeSkillService([
      { id: 'valid', name: 'Teemo Valid', systemPrompt: validRaw },
      { id: 'invalid', name: 'Teemo Invalid', systemPrompt: invalidRaw },
    ]);
    const mixedService = new ManifestService({ skillService: mixedSkills, storage: new StorageService({ dataDir: mixedRoot }) });
    const mixedSnapshot = mixedService.getRegistrySnapshot();
    assert.equal(mixedSnapshot.ok, true);
    assert.deepEqual(mixedSnapshot.skills.map(item => item.skillId), ['valid']);
    assert.equal(mixedSnapshot.invalidSkills.length, 1);
    assert.equal(mixedSnapshot.invalidSkills[0].skillId, 'invalid');
    assert.ok(mixedSnapshot.invalidSkills[0].errors.some(error => error.includes('routing.role')));
    const mixedRoute = new Router({ manifestService: mixedService }).route({ text: 'valid task' });
    assert.deepEqual(mixedRoute.selectedSkillIds, ['valid']);
    assert.equal(new Router({ manifestService: mixedService }).route({ text: 'use Teemo Invalid', explicitSkillId: 'invalid' }).type, 'no_skill');
    mixedService.reload();
    assert.deepEqual(fs.readFileSync(mixedRegistryPath), mixedBytes, 'individual invalid manifest must not rewrite Registry bytes');
    assert.equal(mixedSkills.get('invalid').systemPrompt, invalidRaw, 'individual invalid manifest must not rewrite Raw Skill');
  } finally {
    fs.rmSync(mixedRoot, { recursive: true, force: true });
  }

  const corruptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p2-5-corrupt-'));
  try {
    const corruptPath = path.join(corruptRoot, 'Teemo-skill-registry.json');
    const corruptBytes = Buffer.from('{broken-json', 'utf8');
    fs.writeFileSync(corruptPath, corruptBytes);
    const corruptService = new ManifestService({ skillService: skills, storage: new StorageService({ dataDir: corruptRoot }) });
    assert.equal(corruptService.getRegistrySnapshot().ok, false);
    assert.equal(corruptService.getRegistrySnapshot().error.code, 'SKILL_REGISTRY_UNREADABLE');
    assert.deepEqual(fs.readFileSync(corruptPath), corruptBytes, 'corrupt registry must remain byte-identical');
  } finally {
    fs.rmSync(corruptRoot, { recursive: true, force: true });
  }
  console.log('TeemoSkillManifest.test: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
