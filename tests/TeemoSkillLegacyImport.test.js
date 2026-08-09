const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const StorageService = require('../src/services/TeemoStorageService');
const ManifestService = require('../src/skills/TeemoSkillManifestService');
const Specification = require('../src/skills/TeemoSkillSpecification');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-skill-legacy-import-'));
process.env.TEEMO_ASSISTANT_DATA_DIR = root;
global.window = { TeemoStorageService: StorageService };
require('../src/services/skills');

try {
  const markdown = Buffer.from('---\nname: Teemo Legacy Poster\ndescription: Legacy poster workflow\ntriggers: make poster\nallowed-tools: file_read image_generate\n---\n\n# Workflow\n\nKeep the Raw Skill body exact.\n', 'utf8').toString('utf8');
  const first = new window.SkillService();
  const imported = first.uploadFromMarkdown(markdown, 'Teemo-Legacy-Poster.md');
  assert.equal(imported.rawSource, markdown, 'import must preserve exact Raw Skill text');
  const repeated = first.uploadFromMarkdown(markdown, 'Teemo-Legacy-Poster.md');
  assert.equal(repeated.id, imported.id, 'same Raw Skill import must retain a deterministic Skill ID');
  assert.equal(first.getAll().filter(item => item.id === imported.id).length, 1, 'idempotent import must not duplicate the Skill');
  const sourceBytes = fs.readFileSync(path.join(root, 'skills.json'));
  const manifestService = new ManifestService({ skillService: first, storage: new StorageService({ dataDir: root }) });
  const manifest = manifestService.getSkillManifest(imported.id);
  assert.ok(manifest);
  assert.equal(manifest.source.contentHash, Specification.hashText(markdown));
  assert.equal(manifest.routing.status, 'ready');
  assert.deepEqual(manifest.requirements.toolsRequired, ['file_read', 'image_generate']);

  const registryBytes = fs.readFileSync(path.join(root, 'Teemo-skill-registry.json'));
  const restartedSkillService = new window.SkillService();
  const restartedManifestService = new ManifestService({ skillService: restartedSkillService, storage: new StorageService({ dataDir: root }) });
  assert.ok(restartedManifestService.getSkillManifest(imported.id), 'legacy migration must retain stable existing Skill ID');
  assert.deepEqual(fs.readFileSync(path.join(root, 'Teemo-skill-registry.json')), registryBytes, 'idempotent restart must not rewrite Registry');

  const revision = restartedManifestService.getRegistrySnapshot().revision;
  restartedManifestService.updateRoutingOverride(imported.id, { aliases: ['legacy poster'], role: 'task' }, revision);
  assert.deepEqual(fs.readFileSync(path.join(root, 'skills.json')), sourceBytes, 'routing override must not rewrite legacy Raw Skill storage');
  assert.equal(restartedSkillService.get(imported.id).rawSource, markdown);
  console.log('TeemoSkillLegacyImport.test: PASS');
} finally {
  delete process.env.TEEMO_ASSISTANT_DATA_DIR;
  fs.rmSync(root, { recursive: true, force: true });
}
