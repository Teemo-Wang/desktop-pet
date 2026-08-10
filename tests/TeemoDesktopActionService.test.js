const assert = require('node:assert/strict');
const TeemoScreenService = require('../src/runtime/TeemoScreenService');
const TeemoDesktopActionService = require('../src/runtime/TeemoDesktopActionService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function expectCode(fn, code) {
  try {
    await fn();
  } catch (error) {
    assert.equal(error && error.code, code);
    return;
  }
  assert.fail(`Expected ${code} rejection.`);
}

async function createSnapshot(screenService, owner = 'webcontents_1') {
  const displays = await screenService.listDisplays(owner);
  return screenService.capture(owner, displays[0].displayRef);
}

async function run() {
  let now = 1000;
  let displays = [{ nativeId: 'private-display', x: 100, y: -100, width: 1000, height: 500 }];
  const inputCalls = [];
  const screenService = new TeemoScreenService({
    now: () => now,
    referenceTtlMs: 500,
    snapshotTtlMs: 400,
    displayProvider: { list: async () => displays },
    captureProvider: { capture: async () => ({ png: TEST_PNG, width: 1, height: 1 }) },
  });
  const desktopActionService = new TeemoDesktopActionService({
    screenService,
    now: () => now,
    actionTtlMs: 300,
    inputAdapter: {
      async clickPrimaryAt(point) {
        inputCalls.push(point);
        return { dispatched: true };
      },
    },
  });

  const successSnapshot = await createSnapshot(screenService);
  const success = await desktopActionService.prepare('webcontents_1', successSnapshot.snapshotId, { x: 0.5, y: 0.25 });
  assert.match(success.resource, /^desktop:\/\/display\/screen_ref_.*\/primary-click\/0\.500000-0\.250000$/);
  assert.equal(success.resource.includes('private-display'), false);
  const successResult = await desktopActionService.execute('webcontents_1', success.actionId);
  assert.deepEqual(successResult, { dispatched: true });
  assert.deepEqual(inputCalls, [{ x: 600, y: 25 }]);
  await expectCode(() => desktopActionService.execute('webcontents_1', success.actionId), 'DESKTOP_ACTION_UNAVAILABLE');
  assert.equal(inputCalls.length, 1, 'replay must not dispatch input');

  const crossOwnerSnapshot = await createSnapshot(screenService);
  const crossOwner = await desktopActionService.prepare('webcontents_1', crossOwnerSnapshot.snapshotId, { x: 0, y: 0 });
  await expectCode(() => desktopActionService.execute('webcontents_2', crossOwner.actionId), 'DESKTOP_ACTION_UNAVAILABLE');
  assert.equal(inputCalls.length, 1, 'cross-owner action must not dispatch input');
  assert.equal(desktopActionService.release('webcontents_1', crossOwner.actionId), true);

  const invalidSnapshot = await createSnapshot(screenService);
  await expectCode(() => desktopActionService.prepare('webcontents_1', invalidSnapshot.snapshotId, { x: -0.01, y: 0.5 }), 'DESKTOP_ACTION_POINT_INVALID');
  await expectCode(() => desktopActionService.prepare('webcontents_1', invalidSnapshot.snapshotId, { x: 0.5, y: Number.NaN }), 'DESKTOP_ACTION_POINT_INVALID');
  assert.equal(inputCalls.length, 1, 'invalid points must not dispatch input');

  const changedSnapshot = await createSnapshot(screenService);
  const changed = await desktopActionService.prepare('webcontents_1', changedSnapshot.snapshotId, { x: 1, y: 1 });
  displays = [{ nativeId: 'private-display', x: 0, y: -100, width: 1000, height: 500 }];
  await expectCode(() => desktopActionService.execute('webcontents_1', changed.actionId), 'DESKTOP_ACTION_DISPLAY_CHANGED');
  assert.equal(inputCalls.length, 1, 'changed display layout must not dispatch input');

  displays = [{ nativeId: 'private-display', x: 100, y: -100, width: 1000, height: 500 }];
  const unavailableSnapshot = await createSnapshot(screenService);
  const unavailable = await desktopActionService.prepare('webcontents_1', unavailableSnapshot.snapshotId, { x: 0.1, y: 0.1 });
  displays = [];
  await expectCode(() => desktopActionService.execute('webcontents_1', unavailable.actionId), 'SCREEN_DISPLAY_UNAVAILABLE');
  assert.equal(inputCalls.length, 1, 'unavailable display must not dispatch input');

  displays = [{ nativeId: 'private-display', x: 100, y: -100, width: 1000, height: 500 }];
  const expiredSnapshot = await createSnapshot(screenService);
  const expired = await desktopActionService.prepare('webcontents_1', expiredSnapshot.snapshotId, { x: 0.1, y: 0.1 });
  now += 401;
  await expectCode(() => desktopActionService.execute('webcontents_1', expired.actionId), 'DESKTOP_ACTION_UNAVAILABLE');
  assert.equal(inputCalls.length, 1, 'expired action must not dispatch input');

  now = 2000;
  const discardedSnapshot = await createSnapshot(screenService);
  const discarded = await desktopActionService.prepare('webcontents_1', discardedSnapshot.snapshotId, { x: 0.2, y: 0.2 });
  assert.equal(desktopActionService.releaseSnapshot('webcontents_1', discardedSnapshot.snapshotId), 1);
  await expectCode(() => desktopActionService.execute('webcontents_1', discarded.actionId), 'DESKTOP_ACTION_UNAVAILABLE');
  assert.equal(inputCalls.length, 1, 'discarded preview action must not dispatch input');

  const permissionService = new TeemoPermissionService({
    decisionProvider: async () => ({ decision: 'allow', scope: 'session' }),
  });
  const permissionRequest = {
    toolCallId: 'desktop-click-once',
    runId: null,
    sessionId: null,
    toolName: 'desktop_primary_click',
    permission: 'execute',
    resource: 'desktop://display/screen_ref_test/primary-click/0.500000-0.500000',
    requiresExecutionAuthorization: true,
  };
  assert.equal(permissionService.grant(permissionRequest, { scope: 'session' }), null);
  assert.equal(permissionService.grant(permissionRequest, { scope: 'resource' }), null);
  assert.equal((await permissionService.requestPermission(permissionRequest)).decision, 'deny');
  const oncePermissionService = new TeemoPermissionService({
    decisionProvider: async () => ({ decision: 'allow', scope: 'once' }),
  });
  assert.equal((await oncePermissionService.requestPermission(permissionRequest)).decision, 'allow');
  assert.equal(oncePermissionService.listGrants().length, 0, 'desktop clicks must not create persistent grants');
  assert.equal(oncePermissionService.consumeExecutionAuthorization(permissionRequest), true);
  assert.equal(oncePermissionService.consumeExecutionAuthorization(permissionRequest), false, 'execution authorization must be one-shot');

  console.log(JSON.stringify({
    marker: 'TEEMO_DESKTOP_ACTION_SERVICE_TEST_PASS',
    assertions: 31,
    fakeInputCalls: inputCalls.length,
    providerCallsForDesktopAction: 0,
    realDisplayCapture: false,
    realOsInput: false,
  }));
}

run().catch(error => {
  console.error('TEEMO_DESKTOP_ACTION_SERVICE_TEST_FAIL', error);
  process.exitCode = 1;
});
