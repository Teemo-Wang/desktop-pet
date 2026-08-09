const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoFileService = require('../../src/services/TeemoFileService');
const TeemoExecuteService = require('../../src/services/TeemoExecuteService');
const TeemoPermissionService = require('../../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../../src/permissions/TeemoPermissionIpc');
const registerTeemoExecuteToolIpc = require('../../src/tools/execute/TeemoExecuteToolIpc');

const dataDir = path.resolve(process.env.TEEMO_ASSISTANT_DATA_DIR || path.join(__dirname, '.Teemo-smoke-data'));
const authorizedRoot = path.join(dataDir, 'Teemo-authorized-root');
const project = path.join(authorizedRoot, 'Teemo-smoke-project');
fs.mkdirSync(project, { recursive: true });

const packagePath = path.join(project, 'package.json');
const packageBody = JSON.stringify({
  private: true,
  scripts: {
    smoke: 'node Teemo-npm-smoke.js',
    toctou: 'node Teemo-npm-smoke.js',
  },
}, null, 2);
fs.writeFileSync(packagePath, packageBody, 'utf8');
fs.writeFileSync(path.join(project, 'Teemo-npm-smoke.js'), "console.log('Teemo npm smoke pass')\n", 'utf8');
fs.writeFileSync(path.join(project, 'Teemo-node-smoke.js'), "console.log('Teemo node smoke pass')\n", 'utf8');
fs.writeFileSync(path.join(project, 'Teemo-denied.js'), "console.log('must not run')\n", 'utf8');
fs.writeFileSync(path.join(project, 'Teemo-slow.js'), "setTimeout(() => console.log('late'), 500)\n", 'utf8');
fs.writeFileSync(path.join(project, 'Teemo-timeout.js'), "setTimeout(() => console.log('too late'), 5000)\n", 'utf8');

const providerCalls = new Map();
let toctouMutations = 0;
const permissionService = new TeemoPermissionService({
  timeoutMs: 1000,
  decisionProvider: async request => {
    const count = (providerCalls.get(request.toolName) || 0) + 1;
    providerCalls.set(request.toolName, count);
    if (request.resource.includes('Teemo-denied.js')) return { decision: 'deny', reason: 'user_denied' };
    if (request.resource.includes('script=toctou')) {
      fs.writeFileSync(packagePath, `${packageBody}\n`, 'utf8');
      toctouMutations += 1;
      return { decision: 'allow', scope: 'once' };
    }
    if (request.resource.includes('Teemo-slow.js')) {
      await new Promise(resolve => setTimeout(resolve, 250));
      return { decision: 'allow', scope: 'once' };
    }
    if (request.toolName === 'run_process') return { decision: 'allow', scope: 'session' };
    return { decision: 'allow', scope: 'once' };
  },
});
const fileService = new TeemoFileService();
let processStarts = 0;
const executeService = new TeemoExecuteService({
  fileService,
  spawnImpl: (...args) => {
    processStarts += 1;
    return childProcess.spawn(...args);
  },
});
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoExecuteToolIpc(ipcMain, executeService, {
  rootsProvider: () => [authorizedRoot], permissionService,
});

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false },
  });
}

async function loadClient(window) {
  await window.loadFile(path.join(__dirname, 'TeemoExecuteToolsElectronSmoke.html'));
  await window.webContents.executeJavaScript('window.TeemoExecuteToolsSmokeReady');
}

function js(value) { return JSON.stringify(value); }

app.whenReady().then(async () => {
  const clientA = createClient();
  const clientB = createClient();
  try {
    await Promise.all([loadClient(clientA), loadClient(clientB)]);
    const nodeArgs = { executable: 'node', cwd: project, scriptPath: path.join(project, 'Teemo-node-smoke.js') };
    const nodeA = await clientA.webContents.executeJavaScript(`window.runExecuteTool('run_process', ${js(nodeArgs)})`);
    const nodeB = await clientB.webContents.executeJavaScript(`window.runExecuteTool('run_process', ${js(nodeArgs)})`);
    assert.equal(nodeA.ok, true, JSON.stringify(nodeA));
    assert.equal(nodeB.ok, true, JSON.stringify(nodeB));
    assert.match(nodeA.data.stdout, /Teemo node smoke pass/);
    assert.equal(providerCalls.get('run_process'), 1, 'two renderers must share the exact Main session grant');

    const denied = await clientA.webContents.executeJavaScript(`window.runExecuteTool('run_process', ${js({
      executable: 'node', cwd: project, scriptPath: path.join(project, 'Teemo-denied.js'),
    })})`);
    assert.equal(denied.error.code, 'PERMISSION_DENIED', JSON.stringify(denied));

    const npmResult = await clientB.webContents.executeJavaScript(`window.runExecuteTool('run_npm_script', ${js({
      projectPath: project, script: 'smoke', timeoutMs: 30000,
    })})`);
    assert.equal(npmResult.ok, true, JSON.stringify(npmResult));
    assert.match(npmResult.data.stdout, /Teemo npm smoke pass/);

    const npmAgain = await clientB.webContents.executeJavaScript(`window.runExecuteTool('run_npm_script', ${js({
      projectPath: project, script: 'smoke', timeoutMs: 30000,
    })})`);
    assert.equal(npmAgain.ok, true, JSON.stringify(npmAgain));
    assert.equal(providerCalls.get('run_npm_script'), 2, 'an allow-once npm resource must prompt again');

    const startsBeforeToctou = processStarts;
    const changed = await clientA.webContents.executeJavaScript(`window.runExecuteTool('run_npm_script', ${js({
      projectPath: project, script: 'toctou', timeoutMs: 30000,
    })}, 'execute-toctou-session')`);
    assert.equal(changed.error.code, 'EXECUTION_RESOURCE_CHANGED', JSON.stringify(changed));
    assert.equal(toctouMutations, 1);
    assert.equal(processStarts, startsBeforeToctou, 'TOCTOU rejection must happen before a process starts');

    const aborted = await clientB.webContents.executeJavaScript(`window.runAbortedExecuteTool('run_process', ${js({
      executable: 'node', cwd: project, scriptPath: path.join(project, 'Teemo-slow.js'),
    })})`);
    assert.equal(aborted.error.code, 'TOOL_CANCELLED', JSON.stringify(aborted));

    const timedOut = await clientA.webContents.executeJavaScript(`window.runExecuteTool('run_process', ${js({
      executable: 'node', cwd: project, scriptPath: path.join(project, 'Teemo-timeout.js'), timeoutMs: 100,
    })}, 'execute-timeout-session')`);
    assert.equal(timedOut.error.code, 'EXECUTION_TIMEOUT', JSON.stringify(timedOut));

    console.log(JSON.stringify({
      marker: 'TEEMO_EXECUTE_TOOLS_ELECTRON_SMOKE_PASS',
      definitionsA: await clientA.webContents.executeJavaScript("window.TeemoExecuteTools.createDefinitions({executeClient:{prepare(){},execute(){}}}).map(item=>item.name)"),
      definitionsB: await clientB.webContents.executeJavaScript("window.TeemoExecuteTools.createDefinitions({executeClient:{prepare(){},execute(){}}}).map(item=>item.name)"),
      providerCalls: Object.fromEntries(providerCalls),
      processStarts,
      auditEvents: permissionService.listAudit().length,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_EXECUTE_TOOLS_ELECTRON_SMOKE_FAIL', error);
    app.exit(1);
  }
});
