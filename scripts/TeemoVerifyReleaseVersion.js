const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
const lockVersion = String(packageLock.version || '');
const rootLockVersion = String(packageLock.packages && packageLock.packages['']
  ? packageLock.packages[''].version || ''
  : '');

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error(`Teemo package version must be X.Y.Z, received: ${appVersion || '<empty>'}`);
}

if (lockVersion !== appVersion || rootLockVersion !== appVersion) {
  throw new Error(
    `Teemo lockfile mismatch: package.json is ${appVersion}, package-lock.json is ${lockVersion || '<empty>'}, root package is ${rootLockVersion || '<empty>'}.`,
  );
}

let nearestTag = '';
try {
  nearestTag = execFileSync('git', [
    'describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', 'HEAD',
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch (_) {
  console.log(`[Teemo version] No reachable release tag; package version is ${appVersion}.`);
  process.exit(0);
}

const match = /^v(\d+\.\d+\.\d+)(?:-|$)/.exec(nearestTag);
if (!match) {
  throw new Error(`Teemo release tag must start with vX.Y.Z: ${nearestTag}`);
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

if (match[1] !== appVersion && compareVersions(appVersion, match[1]) <= 0) {
  throw new Error(
    `Teemo version mismatch: tag ${nearestTag} requires package/UI/installer ${match[1]}, but package.json is ${appVersion}.`,
  );
}

if (match[1] === appVersion) {
  console.log(`[Teemo version] ${nearestTag} -> package/UI/installer ${appVersion}: PASS`);
} else {
  console.log(`[Teemo version] development ${appVersion} advances baseline ${nearestTag}: PASS`);
}
