const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoInspirationContracts = require('../src/inspiration/TeemoInspirationContracts');
const TeemoInspirationConnectorRegistry = require('../src/inspiration/TeemoInspirationConnectorRegistry');
const TeemoInspirationAccessGuard = require('../src/inspiration/TeemoInspirationAccessGuard');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-inspiration-foundation-'));
}

function definition(overrides = {}) {
  return {
    connectorId: 'synthetic',
    kind: 'test',
    displayName: 'Synthetic Test Source',
    version: '1.0.0',
    readOnly: true,
    capabilities: ['health', 'list_items', 'item_metadata', 'preview'],
    authorization: { type: 'explicit_test' },
    offlineBehavior: 'unavailable',
    privacyClass: 'synthetic',
    ...overrides,
  };
}

function syntheticConnector(counter, overrides = {}) {
  return {
    getDefinition: () => definition(overrides),
    healthCheck: async () => ({ status: 'available' }),
    listItems: async request => {
      counter.count += 1;
      return [{ itemId: 'synthetic-1', query: request.query || null }];
    },
    getItemMetadata: async () => ({ itemId: 'synthetic-1' }),
    getPreview: async () => ({ itemId: 'synthetic-1', preview: null }),
  };
}

function expectCode(callback, code) {
  assert.throws(callback, error => error && error.code === code);
}

async function main() {
  const root = tempDir();
  try {
    const serviceA = new TeemoInspirationService({ dataDir: root, clock: () => new Date('2026-08-09T13:00:00.000Z') });
    const serviceB = new TeemoInspirationService({ dataDir: root });
    assert.deepEqual(serviceA.getState(), {
      schemaVersion: 1, enabled: false, revision: 0, updatedAt: null,
    });
    assert.equal(fs.existsSync(path.join(root, TeemoInspirationService.STATE_FILE)), false, 'default read must not persist');
    assert.equal(Object.isFrozen(TeemoInspirationContracts.READ_CAPABILITIES), true);
    assert.throws(() => TeemoInspirationContracts.READ_CAPABILITIES.push('delete'), TypeError);

    const enabled = serviceA.setEnabled(true, { expectedRevision: 0 });
    assert.equal(enabled.ok, true);
    assert.equal(enabled.snapshot.state.enabled, true);
    assert.equal(enabled.snapshot.state.revision, 1);
    assert.equal(enabled.snapshot.state.updatedAt, '2026-08-09T13:00:00.000Z');
    assert.equal(serviceB.reload().enabled, true, 'latest state must reload across instances');

    const stale = serviceB.setEnabled(false, { expectedRevision: 0 });
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, TeemoInspirationContracts.ERROR_CODES.stateChanged);
    assert.equal(serviceA.reload().enabled, true, 'stale writer must not overwrite current state');

    const corruptRoot = tempDir();
    try {
      const corruptPath = path.join(corruptRoot, TeemoInspirationService.STATE_FILE);
      const corruptBytes = Buffer.from('{broken-inspiration-state', 'utf8');
      fs.writeFileSync(corruptPath, corruptBytes);
      const corrupt = new TeemoInspirationService({ dataDir: corruptRoot });
      assert.equal(corrupt.isEnabled(), false);
      assert.equal(corrupt.getState().stateError.code, TeemoInspirationContracts.ERROR_CODES.stateUnreadable);
      const rejected = corrupt.setEnabled(true, { expectedRevision: 0 });
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error.code, TeemoInspirationContracts.ERROR_CODES.stateUnreadable);
      assert.ok(fs.readFileSync(corruptPath).equals(corruptBytes), 'corrupt state bytes must remain unchanged');

      const invalidSchemaBytes = Buffer.from(JSON.stringify({ enabled: true, revision: 4, updatedAt: null }), 'utf8');
      fs.writeFileSync(corruptPath, invalidSchemaBytes);
      const invalidSchema = new TeemoInspirationService({ dataDir: corruptRoot });
      assert.equal(invalidSchema.isEnabled(), false);
      assert.equal(invalidSchema.getState().stateError.code, TeemoInspirationContracts.ERROR_CODES.stateUnreadable);
      assert.ok(fs.readFileSync(corruptPath).equals(invalidSchemaBytes), 'invalid schema bytes must remain unchanged');
    } finally {
      fs.rmSync(corruptRoot, { recursive: true, force: true });
    }

    const registry = new TeemoInspirationConnectorRegistry();
    const counter = { count: 0 };
    const connector = syntheticConnector(counter);
    const registered = registry.register(connector);
    assert.equal(registered.readOnly, true);
    assert.equal(registry.listDefinitions().length, 1);
    assert.notEqual(registry.getDefinition('synthetic'), registered, 'public definitions must be copies');
    expectCode(() => registry.register(connector), TeemoInspirationContracts.ERROR_CODES.connectorInvalid);
    expectCode(() => registry.getConnector('missing'), TeemoInspirationContracts.ERROR_CODES.connectorNotFound);
    expectCode(() => new TeemoInspirationConnectorRegistry().register(syntheticConnector({ count: 0 }, { readOnly: false })), TeemoInspirationContracts.ERROR_CODES.connectorInvalid);
    expectCode(() => new TeemoInspirationConnectorRegistry().register(syntheticConnector({ count: 0 }, { capabilities: ['delete'] })), TeemoInspirationContracts.ERROR_CODES.connectorInvalid);
    const writable = syntheticConnector({ count: 0 });
    writable.deleteItem = async () => true;
    expectCode(() => new TeemoInspirationConnectorRegistry().register(writable), TeemoInspirationContracts.ERROR_CODES.connectorInvalid);

    const decisions = [];
    const guardFor = decisionProvider => new TeemoInspirationAccessGuard({
      registry,
      permissionService: { authorize: decisionProvider },
    });
    const execute = guard => guard.execute('synthetic', 'list_items', { query: 'test' }, { sessionId: 'session-a' });

    await assert.rejects(execute(guardFor(async request => {
      decisions.push(request);
      return { decision: 'deny' };
    })), error => error.code === TeemoInspirationContracts.ERROR_CODES.permissionDenied);
    assert.equal(counter.count, 0, 'DENY must not invoke connector');
    assert.equal(decisions[0].permission, 'read');
    assert.match(decisions[0].resource, /^inspiration:\/\/source\//);

    await assert.rejects(execute(guardFor(async () => null)), error => error.code === TeemoInspirationContracts.ERROR_CODES.permissionDenied);
    assert.equal(counter.count, 0, 'invalid permission must not invoke connector');
    await assert.rejects(execute(guardFor(async () => { throw new Error('permission backend detail'); })), error => error.code === TeemoInspirationContracts.ERROR_CODES.permissionDenied);
    assert.equal(counter.count, 0, 'permission error must not invoke connector');

    const allowedGuard = guardFor(async () => ({ decision: 'allow' }));
    const allowed = await execute(allowedGuard);
    assert.equal(counter.count, 1);
    assert.equal(allowed[0].itemId, 'synthetic-1');

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      allowedGuard.execute('synthetic', 'list_items', {}, { signal: aborted.signal }),
      error => error.code === TeemoInspirationContracts.ERROR_CODES.aborted,
    );
    assert.equal(counter.count, 1, 'pre-aborted request must not invoke connector');

    const serviceRegistry = new TeemoInspirationConnectorRegistry();
    const serviceCounter = { count: 0 };
    serviceRegistry.register(syntheticConnector(serviceCounter));
    const serviceGuard = new TeemoInspirationAccessGuard({
      registry: serviceRegistry,
      permissionService: { authorize: async () => ({ decision: 'allow' }) },
    });
    const serviceRoot = tempDir();
    try {
      const readService = new TeemoInspirationService({ dataDir: serviceRoot, registry: serviceRegistry, accessGuard: serviceGuard });
      const disabledRead = await readService.read('synthetic', 'list_items');
      assert.equal(disabledRead.ok, false);
      assert.equal(disabledRead.error.code, TeemoInspirationContracts.ERROR_CODES.disabled);
      assert.equal(serviceCounter.count, 0);
      assert.equal(readService.setEnabled(true, { expectedRevision: 0 }).ok, true);
      const read = await readService.read('synthetic', 'list_items', { query: 'foundation' });
      assert.equal(read.ok, true);
      assert.equal(read.data[0].query, 'foundation');
      assert.equal(serviceCounter.count, 1);
    } finally {
      fs.rmSync(serviceRoot, { recursive: true, force: true });
    }

    console.log('Teemo inspiration foundation tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
