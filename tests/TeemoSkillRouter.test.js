const assert = require('assert');
const Router = require('../src/skills/TeemoSkillRouter');
const SessionState = require('../src/skills/TeemoSkillSessionState');
const { manifest, standardManifests, snapshot } = require('./TeemoSkillTestFixtures');

function makeRouter(skills = standardManifests(), tools = []) {
  const state = new SessionState();
  let executions = 0;
  let permissions = 0;
  const registry = {
    has(name) { return tools.includes(name); },
    execute() { executions += 1; throw new Error('Router must not execute tools'); },
    requestPermission() { permissions += 1; throw new Error('Router must not request permission'); },
  };
  const router = new Router({ sessionState: state, toolRegistry: registry });
  return { router, state, registrySnapshot: snapshot(skills), calls: () => ({ executions, permissions }) };
}

{
  const env = makeRouter();
  const route = request => env.router.route({ registrySnapshot: env.registrySnapshot, ...request });
  assert.deepEqual(route({ text: '使用 Teemo 海报生成', sessionId: 'a' }).selectedSkillIds, ['poster']);
  assert.deepEqual(route({ text: '帮我生成海报', sessionId: 'a' }).selectedSkillIds, ['poster']);
  assert.equal(route({ text: '儿童教育 UI', sessionId: 'a' }).type, 'no_skill');
  assert.equal(route({ text: '什么是视觉设计？', projectContext: { domain: '视觉设计' } }).type, 'no_skill', 'domain and project are enhancers only');
  assert.deepEqual(route({ text: '把这个改一下', modalities: ['image'], sessionId: 'image' }).selectedSkillIds, ['image-edit']);
  assert.equal(route({ text: '整理这些文件', sessionId: 'tool' }).type, 'no_skill');
  assert.ok(route({ text: '整理这些文件', sessionId: 'tool' }).excluded.some(item => item.code === 'missing_required_tool'));
  assert.deepEqual(env.calls(), { executions: 0, permissions: 0 });

  assert.deepEqual(route({ text: '生成海报，遵循哈啰品牌，再翻译成英文', sessionId: 'compose' }).selectedSkillIds, ['poster', 'brand', 'translate']);
  const limited = route({ text: '生成海报，遵循哈啰品牌，翻译成英文并制作成人海报', sessionId: 'compose-limit' });
  assert.ok(limited.selectedSkillIds.length <= 3, 'automatic composition must never exceed three Skills');
  const limitedRoles = limited.selectedSkillIds.map(id => env.registrySnapshot.skills.find(item => item.skillId === id).routing.role);
  assert.equal(new Set(limitedRoles).size, limitedRoles.length, 'automatic composition must contain at most one Skill per role');
  assert.deepEqual(route({ text: '生成海报', sessionId: 'continuity' }).selectedSkillIds, ['poster']);
  const continued = route({ text: '标题再大一点', sessionId: 'continuity' });
  assert.deepEqual(continued.selectedSkillIds, ['poster']);
  assert.equal(continued.continuityUsed, true);
  assert.equal(route({ text: '今天星期几？', sessionId: 'continuity' }).type, 'no_skill');
  assert.equal(route({ text: '继续呢？', sessionId: 'continuity' }).type, 'no_skill', 'non-task turn clears continuity');

  route({ text: '生成海报', sessionId: 'session-a' });
  assert.equal(route({ text: '标题再大一点', sessionId: 'session-b' }).type, 'no_skill', 'sessions must be isolated');
  assert.equal(route({ text: '标题再大一点' }).type, 'no_skill', 'missing sessionId cannot inherit continuity');
  assert.deepEqual(route({ text: '翻译成英文', sessionId: 'session-a' }).selectedSkillIds, ['translate'], 'strong new intent overrides active Skill');
}

{
  const disabled = manifest('disabled', 'Teemo 禁用技能', { routing: { status: 'disabled', intents: ['禁用任务'] } });
  const needsReview = manifest('review', 'Teemo 待完善技能', { routing: { status: 'needs_review', intents: ['待完善任务'] } });
  const env = makeRouter([disabled, needsReview]);
  const route = text => env.router.route({ text, registrySnapshot: env.registrySnapshot });
  assert.equal(route('执行禁用任务').type, 'no_skill');
  assert.equal(route('使用 Teemo 禁用技能').type, 'no_skill');
  assert.deepEqual(route('使用 Teemo 待完善技能').selectedSkillIds, ['review'], 'needs_review remains explicitly usable');
}

{
  const a = manifest('a', 'Teemo 方案 A', { routing: { role: 'task', intents: ['制作方案'] } });
  const b = manifest('b', 'Teemo 方案 B', { routing: { role: 'task', intents: ['制作方案'] } });
  const env = makeRouter([a, b]);
  const result = env.router.route({ text: '制作方案', registrySnapshot: env.registrySnapshot });
  assert.equal(result.type, 'no_skill');
  assert.deepEqual(result.ambiguousCandidates, ['a', 'b']);
}

{
  const duplicateName = [manifest('a', 'Teemo 同名'), manifest('b', 'Teemo 同名')];
  const env = makeRouter(duplicateName);
  const result = env.router.route({ text: '使用 Teemo 同名', registrySnapshot: env.registrySnapshot });
  assert.equal(result.type, 'no_skill');
  assert.deepEqual(result.ambiguousCandidates, ['a', 'b']);
}

{
  const env = makeRouter();
  const route = text => env.router.route({ text, registrySnapshot: env.registrySnapshot });
  assert.deepEqual(route('使用 Teemo 海报生成').selectedSkillIds, ['poster']);
  assert.equal(route('不要使用 Teemo 海报生成，直接普通回答').type, 'no_skill');
  assert.equal(route('Teemo 海报生成是干什么的？').type, 'no_skill');
  assert.equal(route('解释一下“使用 Teemo 海报生成”这句话').type, 'no_skill');
  for (const question of [
    '使用 Teemo 海报生成 可以做什么？',
    '使用 Teemo 海报生成 有什么作用？',
    '我想知道，使用 Teemo 海报生成 可以做什么？',
    '使用 Teemo 海报生成 和 Teemo 图片修改对比一下',
    '如何使用 Teemo 海报生成来生成海报？',
    '怎么用 Teemo 海报生成来生成海报？',
    '怎么使用 Teemo 海报生成来生成海报？',
    '如何调用 Teemo 海报生成来生成海报？',
  ]) {
    assert.equal(Router.isTextExplicitInvocation(question, 'Teemo 海报生成'), false, `meta question must not be explicit: ${question}`);
    assert.equal(route(question).type, 'no_skill');
  }
  for (const negative of [
    '不要用海报助手，帮我生成海报',
    '我不想用 Teemo 海报生成，帮我生成海报',
    '我不想使用 Teemo 海报生成，帮我生成海报',
    '不要再用 Teemo 海报生成，帮我生成海报',
    '不要再用海报助手，帮我生成海报',
    '别再用 Teemo 海报生成，帮我生成海报',
    '这次不用 Teemo 海报生成，帮我生成海报',
    '先别用 Teemo 海报生成，帮我生成海报',
  ]) {
    const suppressed = route(negative);
    assert.equal(suppressed.type, 'no_skill', `negative mention must suppress: ${negative}`);
    assert.ok(suppressed.excluded.some(item => item.skillId === 'poster' && item.code === 'suppressed_by_user'));
  }
  const suppressedExplicitId = env.router.route({
    text: '我不想用 Teemo 海报生成，帮我生成海报',
    explicitSkillId: 'poster',
    registrySnapshot: env.registrySnapshot,
  });
  assert.equal(suppressedExplicitId.type, 'no_skill');
  assert.ok(suppressedExplicitId.excluded.some(item => item.skillId === 'poster' && item.code === 'suppressed_by_user'));
  const questionedExplicitId = env.router.route({
    text: '如何使用 Teemo 海报生成来生成海报？',
    explicitSkillId: 'poster',
    registrySnapshot: env.registrySnapshot,
  });
  assert.equal(questionedExplicitId.type, 'no_skill');
  assert.ok(questionedExplicitId.excluded.some(item => item.skillId === 'poster' && item.code === 'suppressed_by_user'));
}

{
  const hard = manifest('hard', 'Teemo 海报路由', {
    routing: { intents: ['生成海报'], exclusions: ['长 H5'], continuity: true },
    modalities: { input: ['video'] },
    requirements: { toolsRequired: ['render'], dependencies: ['canvas'] },
  });
  const review = manifest('review', 'Teemo 待审核', { routing: { status: 'needs_review' } });
  const disabled = manifest('disabled', 'Teemo 已禁用', { routing: { status: 'disabled' } });
  const env = makeRouter([hard, review, disabled]);
  const route = request => env.router.route({ registrySnapshot: env.registrySnapshot, ...request });
  const available = { availableTools: ['render'], availableDependencies: ['canvas'], modalities: ['video'] };

  assert.deepEqual(route({ text: '生成海报', sessionId: 'excluded', ...available }).selectedSkillIds, ['hard']);
  const excludedFollowUp = route({ text: '改成长 H5', sessionId: 'excluded', ...available });
  assert.equal(excludedFollowUp.type, 'no_skill');
  assert.ok(excludedFollowUp.excluded.some(item => item.skillId === 'hard' && item.code === 'excluded_by_manifest'));
  assert.equal(env.state.get('excluded'), null, 'hard-rejected active Skill must be removed from Session State');
  assert.equal(route({ text: '标题再大一点', sessionId: 'excluded', ...available }).type, 'no_skill', 'hard-rejected Skill must not revive on a later follow-up');

  assert.deepEqual(route({ text: '生成海报', sessionId: 'tool', ...available }).selectedSkillIds, ['hard']);
  const missingToolFollowUp = route({ text: '标题再大一点', sessionId: 'tool', ...available, availableTools: [] });
  assert.equal(missingToolFollowUp.type, 'no_skill');
  assert.ok(missingToolFollowUp.excluded.some(item => item.skillId === 'hard' && item.code === 'missing_required_tool'));

  assert.deepEqual(route({ text: hard.routing.intents[0], sessionId: 'suppressed', ...available }).selectedSkillIds, ['hard']);
  const suppressedFollowUp = route({ text: `我不想用 ${hard.name}，${hard.routing.intents[0]}`, sessionId: 'suppressed', ...available });
  assert.equal(suppressedFollowUp.type, 'no_skill');
  assert.ok(suppressedFollowUp.excluded.some(item => item.skillId === 'hard' && item.code === 'suppressed_by_user'));
  assert.equal(env.state.get('suppressed'), null);
  assert.equal(route({ text: '标题再大一点', sessionId: 'suppressed', ...available }).type, 'no_skill');

  assert.equal(route({ text: '使用 Teemo 海报路由 长 H5', explicitSkillId: 'hard', ...available }).type, 'no_skill');
  assert.equal(route({ text: '使用 Teemo 海报路由', explicitSkillId: 'hard', ...available, availableDependencies: [] }).type, 'no_skill');
  assert.equal(route({ text: '使用 Teemo 海报路由', explicitSkillId: 'hard', ...available, modalities: ['image'] }).type, 'no_skill');
  assert.deepEqual(route({ text: '使用 Teemo 待审核' }).selectedSkillIds, ['review']);
  assert.equal(route({ text: '使用 Teemo 已禁用', explicitSkillId: 'disabled' }).type, 'no_skill');
}

{
  const task = manifest('session-task', 'Teemo Session Task', { routing: { role: 'task', intents: ['生成海报'], allowComposition: true, continuity: true } });
  const brand = manifest('session-brand', 'Teemo Session Brand', { routing: { role: 'brand', intents: ['遵循品牌'], exclusions: ['去掉品牌'], allowComposition: true, continuity: true } });
  const env = makeRouter([task, brand]);
  const route = text => env.router.route({ text, sessionId: 'multi-hard', registrySnapshot: env.registrySnapshot });
  assert.deepEqual(route('生成海报并遵循品牌').selectedSkillIds, ['session-task', 'session-brand']);
  const survivor = route('改成去掉品牌');
  assert.deepEqual(survivor.selectedSkillIds, ['session-task']);
  assert.deepEqual(env.state.get('multi-hard').selectedSkillIds, ['session-task']);
  const continued = route('标题再大一点');
  assert.deepEqual(continued.selectedSkillIds, ['session-task']);
  assert.equal(continued.continuityUsed, true);
}

{
  const task = manifest('task', 'Teemo 海报任务', { routing: { role: 'task', intents: ['生成海报'], allowComposition: true } });
  const brandA = manifest('brand-a', 'Teemo 品牌 A', { routing: { role: 'brand', intents: ['遵循品牌'], allowComposition: true } });
  const brandB = manifest('brand-b', 'Teemo 品牌 B', { routing: { role: 'brand', intents: ['遵循品牌'], allowComposition: true } });
  const ambiguousEnv = makeRouter([task, brandA, brandB]);
  const ambiguous = ambiguousEnv.router.route({ text: '生成海报并遵循品牌', registrySnapshot: ambiguousEnv.registrySnapshot });
  assert.deepEqual(ambiguous.selectedSkillIds, ['task'], 'ambiguous supplement role must be skipped');
  assert.deepEqual(ambiguous.ambiguousCandidates, ['brand-a', 'brand-b']);

  brandA.routing.priority = 1;
  const uniqueEnv = makeRouter([task, brandA, brandB]);
  const unique = uniqueEnv.router.route({ text: '生成海报并遵循品牌', registrySnapshot: uniqueEnv.registrySnapshot });
  assert.deepEqual(unique.selectedSkillIds, ['task', 'brand-a']);
  assert.deepEqual(unique.ambiguousCandidates, []);
}

{
  const env = makeRouter(standardManifests(), ['file_read']);
  const result = env.router.route({ text: '整理这些文件', registrySnapshot: env.registrySnapshot });
  assert.deepEqual(result.selectedSkillIds, ['tool-skill']);
  assert.deepEqual(env.calls(), { executions: 0, permissions: 0 });
}

{
  const env = makeRouter();
  const request = { text: '生成海报并遵循哈啰品牌', registrySnapshot: env.registrySnapshot };
  assert.deepEqual(env.router.route(request), env.router.route(request), 'same input and registry must be deterministic');
}

console.log('TeemoSkillRouter.test: PASS');
