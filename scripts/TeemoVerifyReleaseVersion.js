const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '');

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error(`Teemo package version must be X.Y.Z, received: ${appVersion || '<empty>'}`);
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
if (match[1] !== appVersion) {
  throw new Error(
    `Teemo version mismatch: tag ${nearestTag} requires package/UI/installer ${match[1]}, but package.json is ${appVersion}.`,
  );
}

console.log(`[Teemo version] ${nearestTag} -> package/UI/installer ${appVersion}: PASS`);
