const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const handlerStart = mainSource.indexOf("autoUpdater.on('update-downloaded'");
const handlerEnd = mainSource.indexOf("autoUpdater.on('error'", handlerStart);

assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'update-downloaded handler must exist');

const downloadedHandler = mainSource.slice(handlerStart, handlerEnd);
assert.match(mainSource, /autoUpdater\.autoDownload\s*=\s*true/);
assert.match(mainSource, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true/);
assert.match(downloadedHandler, /autoUpdater\.quitAndInstall\(true,\s*true\)/);
assert.doesNotMatch(downloadedHandler, /showMessageBox|稍后/);

console.log('Teemo auto-update policy tests passed');
