const assert = require('node:assert/strict');
const TeemoLocalDriveRoots = require('../src/tools/file/TeemoLocalDriveRoots');

function main() {
  assert.deepEqual(
    TeemoLocalDriveRoots.resolveEffectiveRoots({
      approvalMode: 'assisted',
      authorizedRoots: ['D:\\Teemo'],
      existsSync: (candidate) => candidate === 'C:\\' || candidate === 'D:\\' || candidate === 'D:\\Teemo',
      homeDir: 'C:\\Users\\Teemo',
    }).sort(),
    process.platform === 'win32' ? ['C:\\', 'D:\\', 'D:\\Teemo'].sort() : ['D:\\Teemo'].sort(),
  );

  const full = TeemoLocalDriveRoots.resolveEffectiveRoots({
    approvalMode: 'full',
    authorizedRoots: ['D:\\Teemo'],
    existsSync: (candidate) => candidate === 'C:\\' || candidate === 'D:\\' || candidate === 'D:\\Teemo',
    homeDir: 'C:\\Users\\Teemo',
  });
  assert.ok(full.includes('D:\\Teemo'));
  if (process.platform === 'win32') {
    assert.ok(full.includes('C:\\'));
    assert.ok(full.includes('D:\\'));
  }

  assert.equal(TeemoLocalDriveRoots.normalizeApprovalMode('full_access'), 'full');
  console.log('TeemoLocalDriveRoots tests passed');
}

main();
