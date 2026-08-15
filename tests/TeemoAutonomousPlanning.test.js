const assert = require('node:assert/strict');
const PlanningContract = require('../src/planning/TeemoPlanningContract');
const PlanningSessionState = require('../src/planning/TeemoPlanningSessionState');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');

function planJson(goal = 'Ship a bounded feature') {
  return JSON.stringify({
    goal,
    assumptions: ['The owner will review each proposed step.'],
    constraints: ['No automatic execution.'],
    steps: [{ title: 'Clarify scope', description: 'Confirm the requested outcome and boundaries.', status: 'proposed' }],
    risks: ['The proposal may require later review.'],
    successCriteria: ['The owner can revise or discard the plan.'],
  });
}

async function main() {
  const contractResult = PlanningContract.parseResponse(planJson(), { goal: 'Ship a bounded feature' });
  assert.equal(contractResult.ok, true);
  assert.equal(contractResult.plan.steps[0].status, 'proposed');
  assert.equal(PlanningContract.parseResponse(planJson(), { goal: 'x'.repeat(2001) }).ok, false);
  assert.equal(PlanningContract.parseResponse(JSON.stringify({ ...JSON.parse(planJson()), steps: [{ title: 'x', description: 'x', status: 'completed' }] }), { goal: 'x' }).ok, false);

  const state = new PlanningSessionState({ clock: () => new Date('2026-08-10T00:00:00.000Z') });
  assert.equal(state.set('owner-a', contractResult.plan).ok, true);
  assert.equal(state.get('owner-b'), null);
  const copy = state.get('owner-a');
  copy.plan.goal = 'mutated outside state';
  assert.equal(state.get('owner-a').plan.goal, contractResult.plan.goal);
  assert.equal(state.revise('owner-a', { ...contractResult.plan, goal: 'Revised goal' }).ok, true);
  assert.equal(state.get('owner-a').plan.goal, 'Revised goal');
  assert.equal(state.discard('owner-a').discarded, true);
  assert.equal(state.get('owner-a'), null);

  const calls = [];
  const ai = {
    async sendPlanning(messages, options) {
      calls.push({ messages, options });
      return { type: 'planning_response', content: planJson('Plan this request') };
    },
  };
  const core = new TeemoAgentCore({ aiService: ai });
  const result = await core.runPlanning({ sessionId: 'owner-a', goal: 'Plan this request', messages: [{ role: 'user', content: 'Plan this request' }] });
  assert.equal(result.ok, true);
  assert.equal(result.run.planning, true);
  assert.equal(result.run.toolCalls.length, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /planning-only/);
  assert.match(calls[0].messages[0].content, /does not make a step blocked/);
  assert.match(calls[0].messages[0].content, /concrete prerequisite is currently missing/);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].options, 'tools'), false);

  const unexpectedCore = new TeemoAgentCore({
    aiService: { async sendPlanning() { return { content: planJson(), tool_calls: [{ id: 'unexpected' }] }; } },
  });
  const unexpected = await unexpectedCore.runPlanning({ sessionId: 'owner-a', goal: 'Ship a bounded feature', messages: [] });
  assert.equal(unexpected.ok, false);
  assert.equal(unexpected.error.code, 'PLANNING_UNEXPECTED_TOOL_CALL');

  const forbidden = await core.runPlanning({ sessionId: 'owner-a', goal: 'x', messages: [], toolRegistry: new TeemoToolRegistry() });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.code, 'PLANNING_TOOLS_FORBIDDEN');

  console.log('TeemoAutonomousPlanning tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
