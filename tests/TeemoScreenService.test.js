const assert = require('node:assert/strict');
const TeemoScreenService = require('../src/runtime/TeemoScreenService');

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

async function run() {
  let now = 1000;
  let captureCalls = 0;
  const service = new TeemoScreenService({
    now: () => now,
    referenceTtlMs: 100,
    snapshotTtlMs: 100,
    displayProvider: {
      list: async () => [{ nativeId: 'native-display-private', width: 1920, height: 1080 }],
    },
    captureProvider: {
      capture: async nativeId => {
        captureCalls += 1;
        assert.equal(nativeId, 'native-display-private');
        return { png: TEST_PNG, width: 1, height: 1 };
      },
    },
  });

  const displays = await service.listDisplays('webcontents_1');
  assert.equal(displays.length, 1);
  assert.equal(displays[0].label, '显示器 1');
  assert.equal(Object.prototype.hasOwnProperty.call(displays[0], 'nativeId'), false);
  assert.equal(JSON.stringify(displays).includes('native-display-private'), false);

  await expectCode(() => Promise.resolve(service.prepare('webcontents_2', displays[0].displayRef)), 'SCREEN_REFERENCE_INVALID');
  const prepared = service.prepare('webcontents_1', displays[0].displayRef);
  assert.match(prepared.resource, /^screen:\/\/display\/screen_ref_/);
  assert.equal(prepared.resource.includes('native-display-private'), false);

  const snapshot = await service.capture('webcontents_1', displays[0].displayRef);
  assert.equal(captureCalls, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'dataUrl'), false);
  const preview = service.getPreview('webcontents_1', snapshot.snapshotId);
  assert.match(preview.dataUrl, /^data:image\/png;base64,/);
  await expectCode(() => Promise.resolve(service.getPreview('webcontents_2', snapshot.snapshotId)), 'SCREEN_SNAPSHOT_UNAVAILABLE');
  assert.equal(service.discard('webcontents_2', snapshot.snapshotId), false);
  assert.equal(service.discard('webcontents_1', snapshot.snapshotId), true);
  await expectCode(() => Promise.resolve(service.getPreview('webcontents_1', snapshot.snapshotId)), 'SCREEN_SNAPSHOT_UNAVAILABLE');

  const expiringSnapshotDisplays = await service.listDisplays('webcontents_1');
  const expiringSnapshot = await service.capture('webcontents_1', expiringSnapshotDisplays[0].displayRef);
  now += 101;
  await expectCode(() => Promise.resolve(service.getPreview('webcontents_1', expiringSnapshot.snapshotId)), 'SCREEN_SNAPSHOT_UNAVAILABLE');

  const expiringDisplays = await service.listDisplays('webcontents_1');
  now += 101;
  await expectCode(() => service.capture('webcontents_1', expiringDisplays[0].displayRef), 'SCREEN_REFERENCE_INVALID');

  const invalidService = new TeemoScreenService({
    displayProvider: { list: async () => [{ nativeId: 'display-2', width: 100, height: 100 }] },
    captureProvider: { capture: async () => ({ png: Buffer.from('not-a-png'), width: 1, height: 1 }) },
  });
  const invalidDisplays = await invalidService.listDisplays('webcontents_3');
  await expectCode(() => invalidService.capture('webcontents_3', invalidDisplays[0].displayRef), 'SCREEN_CAPTURE_INVALID');

  console.log(JSON.stringify({
    marker: 'TEEMO_SCREEN_SERVICE_TEST_PASS',
    assertions: 20,
    captureCalls,
    providerCallsForScreenData: 0,
    realDisplayCapture: false,
  }));
}

run().catch(error => {
  console.error('TEEMO_SCREEN_SERVICE_TEST_FAIL', error);
  process.exitCode = 1;
});
