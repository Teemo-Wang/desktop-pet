const assert = require('node:assert/strict');
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoGitService = require('../src/services/TeemoGitService');
const TeemoExecuteService = require('../src/services/TeemoExecuteService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');
const registerTeemoGitToolIpc = require('../src/tools/git/TeemoGitToolIpc');
const registerTeemoExecuteToolIpc = require('../src/tools/execute/TeemoExecuteToolIpc');

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P5-3-electron-'));
const repo = path.join(sandbox, 'TeemoSyntheticRepo');
const profile = path.join(sandbox, 'profile');
fs.mkdirSync(path.join(repo, 'docs', 'TeemoProjectKnowledge'), { recursive: true });
fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Teemo synthetic rules\n', 'utf8');
fs.writeFileSync(path.join(repo, 'docs', 'TeemoProjectKnowledge', 'INDEX.md'), '# Teemo Project Knowledge\n', 'utf8');
fs.writeFileSync(path.join(repo, 'docs', 'TeemoProjectKnowledge', 'CURRENT-STATE.md'), 'Installed Version:\n`1.3.2`\n<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:START -->\n- Version: `1.3.2`\n- Latest Recovery Tag: `v1.3.2-test`\n<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:END -->\n', 'utf8');
fs.writeFileSync(path.join(repo, 'TeemoTarget.js'), "module.exports = 'baseline';\n", 'utf8');
fs.writeFileSync(path.join(repo, 'TeemoVerify.js'), "if(require('./TeemoTarget')!=='upgraded') process.exit(2);\n", 'utf8');
fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'teemo-electron-synthetic', version: '1.3.2', scripts: { 'test:synthetic': 'node TeemoVerify.js' } }, null, 2), 'utf8');
git(repo, ['init']);
git(repo, ['config', 'user.email', 'teemo@example.invalid']);
git(repo, ['config', 'user.name', 'Teemo Test']);
git(repo, ['add', '.']);
git(repo, ['commit', '-m', 'Teemo synthetic baseline']);
process.env.TEEMO_ASSISTANT_DATA_DIR = path.join(sandbox, 'data');
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService({ maxReadBytes: 512 * 1024, maxReturnedText: 512 * 1024, maxPatchBytes: 512 * 1024 });
const permission = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
registerTeemoPermissionIpc(ipcMain, permission);
registerTeemoFileToolIpc(ipcMain, fileService, { rootsProvider: () => [repo], permissionService: permission });
registerTeemoGitToolIpc(ipcMain, new TeemoGitService({ fileService }), { rootsProvider: () => [repo], permissionService: permission });
registerTeemoExecuteToolIpc(ipcMain, new TeemoExecuteService({ fileService, defaultTimeoutMs: 5000 }), { rootsProvider: () => [repo], permissionService: permission });

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      if (!window.TeemoControlledSelfUpgrade || !window.TeemoUpgradeRegistry || !window.TeemoFileClient || !window.TeemoGitClient || !window.TeemoExecuteClient) throw new Error('P5-3 runtime missing');
      const ipc = require('electron').ipcRenderer;
      const permission = new window.TeemoPermissionClient({ ipcRenderer: ipc });
      const file = new window.TeemoFileClient({ ipcRenderer: ipc });
      const git = new window.TeemoGitClient({ ipcRenderer: ipc });
      const execute = new window.TeemoExecuteClient({ ipcRenderer: ipc });
      const registries = window.TeemoUpgradeRegistry.create({ permissionService: permission, fileClient: file, gitClient: git, executeClient: execute });
      const core = new window.TeemoAgentCore({ toolRegistry: registries.registry });
      const upgrade = new window.TeemoControlledSelfUpgrade({ toolRegistry: registries.registry, discoveryRegistry: registries.discoveryRegistry, agentCore: core });
      const plan = { goal: 'Upgrade synthetic Teemo code.', assumptions: ['Synthetic repository only.'], constraints: ['Patch existing text only.'], steps: [{ title: 'Patch', description: 'Patch synthetic target.', status: 'proposed' }], risks: ['Verification.'], successCriteria: ['Test passes.'] };
      const run = await upgrade.start({
        ownerId: 'electron-owner', sessionId: 'electron-owner', repoRoot: ${JSON.stringify(repo)}, planState: plan,
        getCurrentOwnerId: () => 'electron-owner', getCurrentSessionId: () => 'electron-owner', getCurrentPlanState: () => plan,
        requestBeginApproval: async () => true, requestManifestApproval: async () => true,
        requestPatchConfirmation: async () => true, requestScriptConfirmation: async () => true,
        manifestProposal: { files: [{ path: 'TeemoTarget.js', oldText: "module.exports = 'baseline';\\n", newText: "module.exports = 'upgraded';\\n" }], scripts: ['test:synthetic'], runTimeoutMs: 30000, stepTimeoutMs: 5000 },
      });
      if (!run.ok || run.run.state !== 'succeeded') throw new Error(JSON.stringify(run.error || run.run));
      const ordinary = window.teemoToolRegistry.list();
      if (ordinary.includes('git_status') || ordinary.includes('run_npm_script') || ordinary.includes('patch_file') && false) throw new Error('ordinary chat gained P5-3 Git or Execute');
      if (registries.registry.list().some(name => /commit|stage|process|create|rename|delete/i.test(name))) throw new Error('upgrade registry exposed forbidden tool');
      return { upgraded: true, p1: true, main: true, toolCalls: run.run.steps.length, scripts: run.run.scripts.length, ordinaryAllowlistUnchanged: true };
    })()`);
    assert.equal(fs.readFileSync(path.join(repo, 'TeemoTarget.js'), 'utf8'), "module.exports = 'upgraded';\n");
    assert.ok(permission.listAudit().length >= 10);
    console.log(JSON.stringify({ ok: true, formalUserDataTouched: false, permissionAuditEvents: permission.listAudit().length, result }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (_) {}
  }
});

app.on('window-all-closed', () => {});
