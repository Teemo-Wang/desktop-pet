/* Bounded, untrusted P5-1 planning data contract. No execution semantics. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoPlanningContract = api;
  if (typeof window !== 'undefined') window.TeemoPlanningContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LIMITS = Object.freeze({
    goalBytes: 2000,
    titleBytes: 160,
    descriptionBytes: 1200,
    itemBytes: 600,
    maxAssumptions: 8,
    maxConstraints: 8,
    maxRisks: 8,
    maxSuccessCriteria: 8,
    minSteps: 1,
    maxSteps: 12,
  });
  const STEP_STATUSES = new Set(['proposed', 'blocked']);

  const RESPONSE_INSTRUCTIONS = [
    'This is an explicit planning-only request. Return one JSON object and no Markdown.',
    'A plan is untrusted proposed work only. It does not execute, authorize, or complete anything.',
    'Never call tools, request permissions, access local resources, or claim work was performed.',
    'Use exactly these fields: goal, assumptions, constraints, steps, risks, successCriteria.',
    'steps must contain 1 to 12 objects with title, description, and status. status is only proposed or blocked.',
    'Use proposed for an actionable future step. A planning-only request, "do not execute now", or later owner confirmation does not make a step blocked.',
    'Use blocked only when a concrete prerequisite is currently missing; name that missing prerequisite in the step description.',
  ].join('\n');

  function bytes(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
    return unescape(encodeURIComponent(text)).length;
  }

  function fail(code, message) { return { ok: false, error: { code, message } }; }

  function boundedString(value, maxBytes, label, allowEmpty = false) {
    if (typeof value !== 'string') return fail('PLANNING_INVALID_PLAN', `${label} must be a string.`);
    const text = value.trim();
    if (!allowEmpty && !text) return fail('PLANNING_INVALID_PLAN', `${label} must not be empty.`);
    if (bytes(text) > maxBytes) return fail('PLANNING_PLAN_TOO_LARGE', `${label} exceeds its byte limit.`);
    return { ok: true, value: text };
  }

  function validateGoal(value) {
    return boundedString(value, LIMITS.goalBytes, 'Goal');
  }

  function validateItems(value, field, max) {
    if (!Array.isArray(value) || value.length > max) return fail('PLANNING_INVALID_PLAN', `${field} must be a bounded array.`);
    const items = [];
    for (const item of value) {
      const checked = boundedString(item, LIMITS.itemBytes, field);
      if (!checked.ok) return checked;
      items.push(checked.value);
    }
    return { ok: true, value: items };
  }

  function validateSteps(value) {
    if (!Array.isArray(value) || value.length < LIMITS.minSteps || value.length > LIMITS.maxSteps) {
      return fail('PLANNING_INVALID_PLAN', `steps must contain ${LIMITS.minSteps} to ${LIMITS.maxSteps} entries.`);
    }
    const steps = [];
    for (const step of value) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) return fail('PLANNING_INVALID_PLAN', 'Each step must be an object.');
      const title = boundedString(step.title, LIMITS.titleBytes, 'Step title');
      const description = boundedString(step.description, LIMITS.descriptionBytes, 'Step description');
      if (!title.ok) return title;
      if (!description.ok) return description;
      if (!STEP_STATUSES.has(step.status)) return fail('PLANNING_INVALID_PLAN', 'Step status must be proposed or blocked.');
      steps.push({ title: title.value, description: description.value, status: step.status });
    }
    return { ok: true, value: steps };
  }

  function parseResponse(value, options = {}) {
    if (typeof value !== 'string' || !value.trim()) return fail('PLANNING_INVALID_RESPONSE', 'Planning provider returned no JSON plan.');
    let raw;
    try { raw = JSON.parse(value); } catch (_) {
      return fail('PLANNING_INVALID_RESPONSE', 'Planning provider returned invalid JSON.');
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('PLANNING_INVALID_PLAN', 'Planning response must be an object.');
    const allowed = new Set(['goal', 'assumptions', 'constraints', 'steps', 'risks', 'successCriteria']);
    if (Object.keys(raw).some(key => !allowed.has(key))) return fail('PLANNING_INVALID_PLAN', 'Planning response contains unsupported fields.');
    if (Object.keys(raw).length !== allowed.size) return fail('PLANNING_INVALID_PLAN', 'Planning response is missing required fields.');
    const requestedGoal = validateGoal(options.goal);
    if (!requestedGoal.ok) return requestedGoal;
    const goal = boundedString(raw.goal, LIMITS.goalBytes, 'Plan goal');
    const assumptions = validateItems(raw.assumptions, 'assumptions', LIMITS.maxAssumptions);
    const constraints = validateItems(raw.constraints, 'constraints', LIMITS.maxConstraints);
    const steps = validateSteps(raw.steps);
    const risks = validateItems(raw.risks, 'risks', LIMITS.maxRisks);
    const successCriteria = validateItems(raw.successCriteria, 'successCriteria', LIMITS.maxSuccessCriteria);
    for (const checked of [goal, assumptions, constraints, steps, risks, successCriteria]) {
      if (!checked.ok) return checked;
    }
    return {
      ok: true,
      plan: {
        goal: goal.value,
        assumptions: assumptions.value,
        constraints: constraints.value,
        steps: steps.value,
        risks: risks.value,
        successCriteria: successCriteria.value,
      },
    };
  }

  return Object.freeze({ LIMITS, STEP_STATUSES, RESPONSE_INSTRUCTIONS, validateGoal, parseResponse });
});
