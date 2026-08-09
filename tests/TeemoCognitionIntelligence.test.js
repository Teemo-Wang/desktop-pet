const assert = require('node:assert/strict');
const Intelligence = require('../src/cognition/TeemoCognitionIntelligence');

function entry(overrides = {}) {
  return {
    content: '我喜欢高反射金属材质',
    category: 'preference',
    scope: 'recent',
    confidence: 0.8,
    evidenceCount: 3,
    evidenceDays: ['2026-08-08', '2026-08-09'],
    status: 'active',
    createdAt: '2026-08-08T08:00:00.000Z',
    updatedAt: '2026-08-09T08:00:00.000Z',
    lastObservedAt: '2026-08-09T08:00:00.000Z',
    ...overrides,
  };
}

function main() {
  assert.equal(Intelligence.normalizeText('  ＡI\n\n  视觉  '), 'AI 视觉');
  assert.equal(
    Intelligence.contentFingerprint('“喜欢 蓝色，设计！”'),
    Intelligence.contentFingerprint('喜欢蓝色设计')
  );
  assert.notEqual(
    Intelligence.compositeIdentity(entry({ scope: 'recent' })),
    Intelligence.compositeIdentity(entry({ scope: 'global' }))
  );
  assert.notEqual(
    Intelligence.compositeIdentity(entry({ category: 'workflow' })),
    Intelligence.compositeIdentity(entry({ category: 'preference' }))
  );
  assert.notEqual(
    Intelligence.compositeIdentity(entry({ scope: 'project', projectId: 'A' })),
    Intelligence.compositeIdentity(entry({ scope: 'project', projectId: 'B' }))
  );
  assert.notEqual(
    Intelligence.contentFingerprint('喜欢简洁科技感'),
    Intelligence.contentFingerprint('偏爱克制未来视觉'),
    'P2-4 must not fuzzy-merge semantic neighbors'
  );

  const now = new Date('2026-08-09T12:00:00.000Z');
  assert.equal(Intelligence.freshness(entry({ lastObservedAt: '2026-07-26T12:00:00.000Z' }), now).state, 'fresh');
  assert.equal(Intelligence.freshness(entry({ lastObservedAt: '2026-07-25T12:00:00.000Z' }), now).state, 'current');
  assert.equal(Intelligence.freshness(entry({ lastObservedAt: '2026-06-24T12:00:00.000Z' }), now).state, 'aging');
  assert.equal(Intelligence.freshness(entry({ lastObservedAt: '2026-05-10T12:00:00.000Z' }), now).state, 'stale');
  assert.equal(Intelligence.freshness(entry({ scope: 'global', lastObservedAt: '2020-01-01T00:00:00.000Z' }), now).state, 'stable');

  const eligible = Intelligence.derive(entry(), { now, conflicts: new Set() });
  assert.equal(eligible.promotionEligible, true);
  const burst = Intelligence.derive(entry({ evidenceDays: ['2026-08-09'], createdAt: '2026-08-09T01:00:00.000Z' }), { now });
  assert.equal(burst.promotionEligible, false);
  assert.equal(burst.state, 'pending');
  const stale = Intelligence.derive(entry({ lastObservedAt: '2026-04-01T00:00:00.000Z' }), { now });
  assert.equal(stale.promotionEligible, false);
  assert.equal(stale.state, 'stale');

  const positive = entry({ content: '我喜欢蓝色', evidenceCount: 2 });
  const negative = entry({ content: '我不喜欢蓝色', evidenceCount: 2 });
  const conflicts = Intelligence.conflictIdentities([positive, negative]);
  const conflicted = Intelligence.derive(positive, { now, conflicts });
  assert.equal(conflicted.conflict, true);
  assert.equal(conflicted.state, 'conflict');
  assert.notEqual(conflicted.confidenceLabel, 'high');
  assert.equal(conflicted.promotionEligible, false);

  console.log('Teemo Cognition Intelligence tests passed');
}

main();
