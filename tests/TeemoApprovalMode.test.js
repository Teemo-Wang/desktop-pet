const assert = require('node:assert/strict');
const TeemoApprovalMode = require('../src/permissions/TeemoApprovalMode');

function main() {
  assert.equal(TeemoApprovalMode.normalizeMode('full'), 'full');
  assert.equal(TeemoApprovalMode.normalizeMode('help'), 'assisted');
  assert.equal(TeemoApprovalMode.normalizeMode(''), 'ask');

  assert.equal(
    TeemoApprovalMode.decide({ permission: 'read', toolName: 'read_file' }, 'ask'),
    null,
  );
  assert.deepEqual(
    TeemoApprovalMode.decide({ permission: 'read', toolName: 'read_file' }, 'assisted'),
    { decision: 'allow', scope: 'session', reason: 'approval_mode_assisted_read' },
  );
  assert.equal(
    TeemoApprovalMode.decide({ permission: 'write', toolName: 'write_file' }, 'assisted'),
    null,
  );
  assert.deepEqual(
    TeemoApprovalMode.decide({ permission: 'write', toolName: 'write_file' }, 'full'),
    { decision: 'allow', scope: 'session', reason: 'approval_mode_full' },
  );
  assert.equal(
    TeemoApprovalMode.decide({ permission: 'execute', toolName: 'run_npm_script' }, 'full'),
    null,
  );
  assert.equal(
    TeemoApprovalMode.decide({ permission: 'write', toolName: 'desktop_primary_click' }, 'full'),
    null,
  );

  let prompted = 0;
  const provider = TeemoApprovalMode.createDecisionProvider(
    () => 'assisted',
    async () => {
      prompted += 1;
      return { decision: 'allow', scope: 'once' };
    },
  );

  return Promise.resolve()
    .then(() => provider({ permission: 'read', toolName: 'read_file' }))
    .then((result) => {
      assert.equal(result.reason, 'approval_mode_assisted_read');
      assert.equal(prompted, 0);
      return provider({ permission: 'write', toolName: 'write_file' });
    })
    .then((result) => {
      assert.equal(result.scope, 'once');
      assert.equal(prompted, 1);
      console.log('TeemoApprovalMode tests passed');
    });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
