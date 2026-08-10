const assert = require('node:assert/strict');
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P5-2-execution-smoke-'));
process.env.TEEMO_ASSISTANT_DATA_DIR = path.join(isolatedRoot, 'data');
app.setPath('userData', path.join(isolatedRoot, 'profile'));
app.commandLine.appendSwitch('disable-gpu');
const authorizedRoot = path.join(isolatedRoot, 'authorized');
const sourcePath = path.join(authorizedRoot, 'source.txt');
const createdPath = path.join(authorizedRoot, 'Teemo-electron-created.txt');
fs.mkdirSync(authorizedRoot, { recursive: true });
fs.writeFileSync(sourcePath, 'synthetic source', 'utf8');
const permissionService = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoFileToolIpc(ipcMain, new TeemoFileService(), { rootsProvider: () => [authorizedRoot], permissionService });

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      if (!window.TeemoAutonomousExecution || !window.teemoAutonomousExecution) throw new Error('execution runtime missing');
      const registry = window.teemoToolRegistry;
      const actions = [
        { type: 'tool_request', tool: 'read_file', arguments: { path: ${JSON.stringify(sourcePath)} } },
        { type: 'tool_request', tool: 'create_file', arguments: { path: ${JSON.stringify(createdPath)}, content: 'created through Main' } },
      ];
      let actionIndex = 0;
      const ai = { sendWithTools: async (_messages, options) => {
        if (options.tools.some(item => !window.TeemoAutonomousExecution.SAFE_TOOLS.includes(item.function.name))) throw new Error('unsafe tool exposed');
        return actions[actionIndex++];
      } };
      const core = new window.TeemoAgentCore({ aiService: ai, toolRegistry: registry });
      const execution = new window.TeemoAutonomousExecution({ agentCore: core, aiService: ai, toolRegistry: registry });
      const plan = { goal: 'Electron bounded execution', assumptions: ['Synthetic only.'], constraints: ['No persistence.'], steps: [{ title: 'Read', description: 'Read synthetic local data.', status: 'proposed' }, { title: 'Create', description: 'Create one synthetic local file.', status: 'proposed' }], risks: ['None outside the isolated renderer.'], successCriteria: ['Trusted result validated.'] };
      let confirmations = 0;
      const run = await execution.run({ sessionId: 'electron-owner', planState: plan, maxSteps: 2, maxRetries: 0, runTimeoutMs: 2000, stepTimeoutMs: 1000, getCurrentSessionId: () => 'electron-owner', getCurrentPlanState: () => plan, requestRunApproval: async () => true, requestStepConfirmation: async pending => { if (pending.tool !== 'create_file') throw new Error('unexpected confirmation'); confirmations += 1; return true; } });
      if (!run.ok || run.run.state !== 'succeeded' || !run.run.steps.every(step => step.verified)) throw new Error('bounded execution failed');
      if (run.run.toolCalls.length !== 3 || confirmations !== 1) throw new Error('execution/verification call count failed');
      if (execution.getRun(run.run.runId, 'foreign-owner') !== null) throw new Error('owner isolation failed');
      const ordinary = window.teemoToolRegistry.list();
      if (ordinary.includes('git_status') || ordinary.some(name => /^execute_/.test(name)) || ordinary.includes('delete_file')) throw new Error('ordinary Chat surface expanded');
      return { approvedRun: true, verified: true, ownerIsolated: true, runtimeOnly: true, ordinaryAllowlistUnchanged: true, fileIpcCalls: run.run.toolCalls.length, confirmations };
    })()`);
    assert.equal(fs.readFileSync(createdPath, 'utf8'), 'created through Main');
    assert.ok(permissionService.listAudit().length >= 3);
    console.log(JSON.stringify({ ok: true, formalUserDataTouched: false, mainProcessExecution: true, permissionAuditEvents: permissionService.listAudit().length, result }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) {}
  }
});

app.on('window-all-closed', () => {});
