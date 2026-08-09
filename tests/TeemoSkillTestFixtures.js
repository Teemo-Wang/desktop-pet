const Specification = require('../src/skills/TeemoSkillSpecification');

function manifest(id, name, options = {}) {
  const routing = {
    status: 'ready', role: 'task', domains: [], intents: [], aliases: [],
    positiveExamples: [], negativeExamples: [], exclusions: [],
    allowComposition: false, continuity: true, priority: 0,
    ...(options.routing || {}),
  };
  return {
    skillId: id,
    name,
    skillVersion: null,
    source: { sourceRef: `fixture:${id}`, contentHash: Specification.hashText(options.rawBody || `Raw ${name}`) },
    routing,
    generatedRouting: { ...routing },
    modalities: { input: ['text'], output: ['text'], ...(options.modalities || {}) },
    requirements: { toolsRequired: [], toolsOptional: [], permissions: [], dependencies: [], ...(options.requirements || {}) },
    content: { domains: [], sensitivity: 'general', ...(options.content || {}) },
    overrides: {},
  };
}

function standardManifests() {
  return [
    manifest('poster', 'Teemo 海报生成', {
      routing: {
        role: 'task', intents: ['生成海报', '制作活动海报'], aliases: ['海报助手'],
        positiveExamples: ['做一张活动海报'], domains: ['视觉设计'], allowComposition: true,
      },
      modalities: { input: ['text', 'image'], output: ['image'] },
      rawBody: '# 海报生成\n保持标题层级清晰。',
    }),
    manifest('brand', 'Teemo 哈啰品牌', {
      routing: {
        role: 'brand', intents: ['遵循哈啰品牌', '哈啰品牌视觉'], aliases: ['哈啰规范'],
        positiveExamples: ['按哈啰品牌规范设计'], domains: ['哈啰', '品牌视觉'], allowComposition: true,
      },
      rawBody: '# 哈啰品牌\n使用品牌蓝并保持识别一致。',
    }),
    manifest('translate', 'Teemo 英文翻译', {
      routing: { role: 'utility', intents: ['翻译成英文'], aliases: ['英文翻译'], allowComposition: true },
      rawBody: '# 英文翻译\n忠实、简洁地翻译。',
    }),
    manifest('image-edit', 'Teemo 图片修改', {
      routing: { role: 'task', intents: ['修改图片'], positiveExamples: ['把这个改一下'] },
      modalities: { input: ['image'], output: ['image'] },
      rawBody: '# 图片修改\n保留未提及元素。',
    }),
    manifest('adult', 'Teemo 成人视觉', {
      routing: { role: 'domain', intents: ['成人海报'], positiveExamples: ['制作成人主题视觉'], exclusions: ['儿童教育'] },
      content: { sensitivity: 'adult' },
      rawBody: '# 成人视觉\n按用户明确主题创作。',
    }),
    manifest('tool-skill', 'Teemo 文件整理', {
      routing: { role: 'utility', intents: ['整理这些文件'] },
      requirements: { toolsRequired: ['file_read'] },
      rawBody: '# 文件整理\n读取后分类。',
    }),
  ];
}

function snapshot(skills = standardManifests()) {
  return { ok: true, schemaVersion: 1, revision: 1, updatedAt: '2026-08-09T00:00:00.000Z', skills };
}

module.exports = { manifest, standardManifests, snapshot };
