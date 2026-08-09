const assert = require('assert');
const Policy = require('../src/creative/TeemoCreativeDirectorPolicy');
const SessionState = require('../src/creative/TeemoCreativeDirectorSessionState');

function main() {
  const state = new SessionState({ clock: () => new Date('2026-08-09T08:00:00.000Z') });
  assert.deepEqual(state.getState('a'), {
    schemaVersion: 1, mode: 'balanced', intensity: 'standard', source: 'default', updatedAt: null,
  });
  assert.equal(Policy.validateState(state.getState('a')).ok, true);

  assert.equal(Policy.parseCommand('开启挑战模式').type, 'session_activate');
  assert.equal(Policy.parseCommand('接下来用挑战模式').type, 'session_activate');
  assert.equal(Policy.parseCommand('挑战一下这个方案').type, 'one_shot_challenge');
  assert.equal(Policy.parseCommand('恢复常规判断').type, 'session_exit');
  assert.equal(Policy.parseCommand('这次别挑战，直接按要求改').type, 'one_shot_suppress');
  assert.equal(Policy.parseCommand('这个项目挺有挑战的').type, 'none');
  assert.equal(Policy.parseCommand('不要开启挑战模式').type, 'none');
  assert.equal(Policy.parseCommand('别顺着我，狠狠挑一下').intensity, 'strong');
  assert.equal(Policy.parseCommand('把“开启挑战模式”翻译成英文').type, 'none');
  assert.equal(Policy.parseCommand('把开启挑战模式翻译成英文').type, 'none');
  assert.equal(Policy.parseCommand('解释“退出挑战模式”这句话').type, 'none');
  assert.equal(Policy.parseCommand('解释退出挑战模式这句话').type, 'none');
  assert.equal(Policy.parseCommand('我准备在文档里写一句“开启挑战模式”').type, 'none');
  assert.equal(Policy.parseCommand('我准备在文档里写一句开启挑战模式').type, 'none');
  const mixed = Policy.parseCommand('开启挑战模式，我最近更喜欢高反射金属材质');
  assert.equal(mixed.type, 'session_activate');
  assert.equal(mixed.intensity, 'standard');
  assert.equal(mixed.consumedText, '开启挑战模式');
  assert.equal(mixed.remainingUserContent, '我最近更喜欢高反射金属材质');

  let run = state.resolveRun({ sessionId: 'a', userMessage: '开启挑战模式' });
  assert.equal(run.session.mode, 'challenge');
  assert.equal(run.effectiveIntensity, 'standard');
  assert.equal(state.getState('b').mode, 'balanced');

  assert.equal(state.setIntensity('a', 'light').ok, true);
  assert.equal(state.getState('a').intensity, 'light');
  assert.equal(state.setIntensity('a', 'ultra').code, 'INVALID_CHALLENGE_INTENSITY');
  assert.equal(state.setMode('a', 'critic').code, 'INVALID_CHALLENGE_MODE');

  run = state.resolveRun({ sessionId: 'a', userMessage: '这次别挑战' });
  assert.equal(run.effectiveMode, 'balanced');
  assert.equal(run.oneShot, true);
  assert.equal(state.getState('a').mode, 'challenge');

  run = state.resolveRun({ sessionId: 'b', userMessage: '挑战一下这个方案' });
  assert.equal(run.effectiveMode, 'challenge');
  assert.equal(run.oneShot, true);
  assert.equal(state.getState('b').mode, 'balanced');

  run = state.resolveRun({ sessionId: 'a', userMessage: '退出挑战模式' });
  assert.equal(run.effectiveMode, 'balanced');
  assert.equal(state.getState('a').mode, 'balanced');
  assert.equal(state.getState('a').intensity, 'standard');

  assert.equal(state.setMode(null, 'challenge').code, 'MISSING_CHALLENGE_SESSION_ID');
  run = state.resolveRun({ userMessage: '开启挑战模式' });
  assert.equal(run.hasSession, false);
  assert.equal(run.effectiveMode, 'balanced');
  assert.equal(state.getState(null).mode, 'balanced');
  run = state.resolveRun({ userMessage: '挑战一下这个方案' });
  assert.equal(run.effectiveMode, 'challenge');
  assert.equal(run.oneShot, true);
  assert.equal(state.getState(null).mode, 'balanced');

  const restarted = new SessionState();
  assert.equal(restarted.getState('a').mode, 'balanced');
  console.log('Teemo Creative Director tests passed');
}

main();
