const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoFileService = require('../../src/services/TeemoFileService');
const TeemoGitService = require('../../src/services/TeemoGitService');
const TeemoPermissionService = require('../../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../../src/permissions/TeemoPermissionIpc');
const registerTeemoGitToolIpc = require('../../src/tools/git/TeemoGitToolIpc');

const dataDir = path.resolve(process.env.TEEMO_ASSISTANT_DATA_DIR || path.join(__dirname, '.Teemo-smoke-data'));
const authorizedRoot = path.join(dataDir, 'Teemo-authorized-root');
const repo = path.join(authorizedRoot, 'Teemo-smoke-repo');
fs.mkdirSync(repo, { recursive: true });

function git(args) {
  return execFileSync('git', args, {
    cwd: repo, encoding: 'utf8', windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Teemo Smoke', GIT_AUTHOR_EMAIL: 'teemo-smoke@example.invalid',
      GIT_COMMITTER_NAME: 'Teemo Smoke', GIT_COMMITTER_EMAIL: 'teemo-smoke@example.invalid',
    },
  });
}

git(['init', '--initial-branch=main']);
git(['config', 'user.name', 'Teemo Smoke']);
git(['config', 'user.email', 'teemo-smoke@example.invalid']);
fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n', 'utf8');
git(['add', '--', 'base.txt']);
git(['commit', '-m', 'Initial smoke commit']);
fs.writeFileSync(path.join(repo, 'Teemo-stage.txt'), 'stage\n', 'utf8');
fs.writeFileSync(path.join(repo, 'Teemo-untracked.txt'), 'do not stage\n', 'utf8');

const providerCalls = new Map();
const permissionService = new TeemoPermissionService({
  timeoutMs: 1000,
  decisionProvider: async request => {
    const count = (providerCalls.get(request.toolName) || 0) + 1;
    providerCalls.set(request.toolName, count);
    if (request.toolName === 'git_status') return { decision: 'allow', scope: 'session' };
    if (request.toolName === 'git_stage_files' || request.toolName === 'git_commit') return { decision: 'allow', scope: 'once' };
    if (request.toolName === 'git_log') {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { decision: 'allow', scope: 'once' };
    }
    return { decision: 'deny', reason: 'user_denied' };
  },
});
const fileService = new TeemoFileService();
const gitService = new TeemoGitService({ fileService });
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoGitToolIpc(ipcMain, gitService, {
  rootsProvider: () => [authorizedRoot], permissionService,
});

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false },
  });
}

async function loadClient(window) {
  await window.loadFile(path.join(__dirname, 'TeemoGitToolsElectronSmoke.html'));
  await window.webContents.executeJavaScript('window.TeemoGitToolsSmokeReady');
}

function js(value) { return JSON.stringify(value); }

app.whenReady().then(async () => {
  const clientA = createClient();
  const clientB = createClient();
  try {
    await Promise.all([loadClient(clientA), loadClient(clientB)]);
    const statusA = await clientA.webContents.executeJavaScript(`window.runGitTool('git_status', ${js({ repo })})`);
    const statusB = await clientB.webContents.executeJavaScript(`window.runGitTool('git_status', ${js({ repo })})`);
    assert.equal(statusA.ok, true, JSON.stringify(statusA));
    assert.equal(statusB.ok, true, JSON.stringify(statusB));
    assert.equal(providerCalls.get('git_status'), 1, 'two renderers must share the Main session grant');

    const denied = await clientA.webContents.executeJavaScript(`window.runGitTool('git_diff', ${js({ repo, staged: false })})`);
    assert.equal(denied.error.code, 'PERMISSION_DENIED');

    const staged = await clientA.webContents.executeJavaScript(`window.runGitTool('git_stage_files', ${js({ repo, files: ['Teemo-stage.txt'] })})`);
    assert.equal(staged.ok, true);
    assert.equal(git(['diff', '--cached', '--name-only']).trim(), 'Teemo-stage.txt');

    const committed = await clientB.webContents.executeJavaScript(`window.runGitTool('git_commit', ${js({ repo, message: 'Teemo smoke explicit commit' })})`);
    assert.equal(committed.ok, true, JSON.stringify(committed));
    assert.equal(git(['show', '--format=', '--name-only', 'HEAD']).trim(), 'Teemo-stage.txt');
    assert.equal(git(['status', '--porcelain']).includes('Teemo-untracked.txt'), true);

    const aborted = await clientB.webContents.executeJavaScript(`window.runAbortedGitTool('git_log', ${js({ repo, limit: 5 })})`);
    assert.equal(aborted.error.code, 'TOOL_CANCELLED');
    assert.equal(providerCalls.get('git_log'), 1, 'late allow test must reach the permission provider before abort');

    console.log(JSON.stringify({
      marker: 'TEEMO_GIT_TOOLS_ELECTRON_SMOKE_PASS',
      definitionsA: await clientA.webContents.executeJavaScript("window.TeemoGitTools.createDefinitions({gitClient:{prepare(){},execute(){}}}).map(item=>item.name)"),
      definitionsB: await clientB.webContents.executeJavaScript("window.TeemoGitTools.createDefinitions({gitClient:{prepare(){},execute(){}}}).map(item=>item.name)"),
      providerCalls: Object.fromEntries(providerCalls),
      auditEvents: permissionService.listAudit().length,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_GIT_TOOLS_ELECTRON_SMOKE_FAIL', error);
    app.exit(1);
  }
});
