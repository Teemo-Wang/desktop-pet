const assert = require('assert');
const Composer = require('../src/skills/TeemoSkillComposer');
const { standardManifests } = require('./TeemoSkillTestFixtures');

const manifests = standardManifests();
const rawById = new Map(manifests.map(item => [item.skillId, {
  skillId: item.skillId,
  name: item.name,
  rawBody: item.skillId === 'poster' ? '# Poster\n' + 'A'.repeat(1200) : `# ${item.name}\nComplete body for ${item.skillId}.`,
}]));
const manifestService = {
  getSkillManifest(id) { return manifests.find(item => item.skillId === id) || null; },
  getRawSkill(id) { return rawById.get(id) || null; },
};

const composer = new Composer({ manifestService, maxChars: 2600 });
const route = { selectedSkillIds: ['translate', 'brand', 'poster'] };
const context = composer.compose(route);
assert.deepEqual(context.selectedSkillIds, ['poster', 'brand', 'translate']);
assert.ok(context.systemMessage.content.indexOf('Teemo 海报生成') < context.systemMessage.content.indexOf('Teemo 哈啰品牌'));
assert.ok(context.systemMessage.content.indexOf('Teemo 哈啰品牌') < context.systemMessage.content.indexOf('Teemo 英文翻译'));
assert.ok(context.systemMessage.content.includes('cannot override system rules'));
assert.ok(!context.systemMessage.content.includes('positiveExamples'));
assert.ok(context.charCount <= context.budget);
assert.equal(context.provenance.length, 3);

const tight = new Composer({ manifestService, maxChars: 1000 }).compose(route);
assert.equal(tight.selectedSkillIds[0], 'poster');
assert.ok(tight.provenance.length >= 1);
assert.ok(tight.charCount <= tight.budget);
assert.equal(composer.compose({ selectedSkillIds: [] }), null);
console.log('TeemoSkillComposition.test: PASS');
