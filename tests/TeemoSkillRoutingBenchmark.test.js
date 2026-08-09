const assert = require('assert');
const cases = require('./fixtures/TeemoSkillRoutingBenchmark.json');
const Router = require('../src/skills/TeemoSkillRouter');
const { snapshot } = require('./TeemoSkillTestFixtures');

assert.ok(cases.length >= 30, 'benchmark must contain at least 30 deterministic cases');
for (const item of cases) {
  const router = new Router();
  const result = router.previewRoute({
    text: item.text,
    modalities: item.modalities || ['text'],
    projectContext: item.projectContext || null,
    registrySnapshot: snapshot(),
  });
  assert.deepEqual(result.selectedSkillIds, item.expected, `${item.id}: unexpected route (${JSON.stringify(result)})`);
}
console.log(`TeemoSkillRoutingBenchmark.test: PASS (${cases.length} cases)`);
