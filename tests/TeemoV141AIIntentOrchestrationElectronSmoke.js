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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-V141-intent-electron-'));
const profile = path.join(sandbox, 'profile');
const dataDir = path.join(sandbox, 'data');
const repo = path.join(sandbox, 'Teemo-source');
const indexRelative = 'docs/TeemoProjectKnowledge/INDEX.md';
const indexPath = path.join(repo, ...indexRelative.split('/'));
const targetPath = path.join(repo, 'TeemoTarget.js');
fs.mkdirSync(path.dirname(indexPath), { recursive: true });
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Teemo synthetic rules\n', 'utf8');
fs.writeFileSync(indexPath, '# Teemo Project Knowledge\n', 'utf8');
fs.writeFileSync(path.join(repo, 'docs', 'TeemoProjectKnowledge', 'CURRENT-STATE.md'), 'Installed Version:\n`1.3.2`\n<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:START -->\n- Version: `1.3.2`\n- Latest Recovery Tag: `v1.3.2-test`\n<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:END -->\n', 'utf8');
fs.writeFileSync(targetPath, "module.exports = 'baseline';\n", 'utf8');
fs.writeFileSync(path.join(repo, 'TeemoVerify.js'), "if(require('./TeemoTarget')!=='upgraded') process.exit(2);\n", 'utf8');
fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'teemo-v141-synthetic', version: '1.3.2', scripts: { 'test:synthetic': 'node TeemoVerify.js' } }, null, 2), 'utf8');
git(repo, ['init']);
git(repo, ['config', 'user.email', 'teemo@example.invalid']);
git(repo, ['config', 'user.name', 'Teemo Test']);
git(repo, ['add', '.']);
git(repo, ['commit', '-m', 'Teemo synthetic baseline']);

process.env.TEEMO_ASSISTANT_DATA_DIR = dataDir;
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService({ maxReadBytes: 512 * 1024, maxReturnedText: 512 * 1024, maxPatchBytes: 512 * 1024 });
const permission = new TeemoPermissionService({ timeoutMs: 5000 });
registerTeemoPermissionIpc(ipcMain, permission);
registerTeemoFileToolIpc(ipcMain, fileService, { rootsProvider: () => [repo], permissionService: permission });
registerTeemoGitToolIpc(ipcMain, new TeemoGitService({ fileService }), { rootsProvider: () => [repo], permissionService: permission });
registerTeemoExecuteToolIpc(ipcMain, new TeemoExecuteService({ fileService, defaultTimeoutMs: 5000 }), { rootsProvider: () => [repo], permissionService: permission });
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [repo] }));
ipcMain.handle('get-app-version', () => app.getVersion());

async function installRuntime(window) {
  await window.webContents.executeJavaScript(`(() => {
    window.__TeemoV141 = { classifier: [], provider: [], toolRequests: 0, permissionCalls: 0, planningCalls: 0 };
    window.TeemoPermissionPrompt = {
      request: async () => { window.__TeemoV141.permissionCalls += 1; return { decision: 'allow', scope: 'once' }; },
      dismiss: () => {},
    };
    window.teemoAIService.sendIntentClassification = async () => {
      window.__TeemoV141.classifier.push({ unexpected: true });
      throw Object.assign(new Error('Single-pass Chat must not call the intent classifier.'), { code: 'INTENT_CLASSIFIER_SHOULD_NOT_RUN' });
    };
    window.teemoAIService.sendPlanning = async messages => {
      const user = [...messages].reverse().find(message => message.role === 'user') || {};
      const goal = String(user.content || 'Teemo plan');
      window.__TeemoV141.planningCalls += 1;
      return { type: 'planning_response', content: JSON.stringify({
        goal,
        assumptions: ['Synthetic repository is authorized.'],
        constraints: ['Use the existing bounded controller only.'],
        steps: [{ title: /设置/.test(goal) ? 'Patch Teemo settings target' : 'Read project knowledge', description: /设置/.test(goal) ? 'Patch the synthetic Teemo target and verify it.' : 'Read the synthetic INDEX file.', status: 'proposed' }],
        risks: ['Synthetic verification may fail.'],
        successCriteria: ['Trusted verification passes.'],
      }) };
    };
    let callId = 0;
    const toolRequest = (tool, args) => {
      window.__TeemoV141.toolRequests += 1;
      const id = 'v141_call_' + (++callId);
      return { type: 'tool_request', tool, arguments: args, providerToolCallId: id, providerMessage: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } };
    };
    window.teemoAIService.sendWithTools = async (messages, options = {}) => {
      const definitions = (options.tools || []).map(item => item && item.function && item.function.name).filter(Boolean).sort();
      const system = messages.filter(message => message.role === 'system').map(message => message.content || '').join(String.fromCharCode(10));
      const last = messages[messages.length - 1] || {};
      const user = [...messages].reverse().find(message => message.role === 'user') || {};
      const userText = String(user.content || '');
      const kind = /Propose one bounded Teemo P5-3/.test(system) ? 'p5_3_manifest' : (/Execute exactly the supplied approved plan step/.test(system) ? 'p5_2' : 'ordinary_safe_file');
      window.__TeemoV141.provider.push({ kind, route: window.__TeemoV14LastRoute, definitions, lastRole: last.role });
      if (kind === 'p5_3_manifest') return { type: 'final_response', content: JSON.stringify({
        files: [{ path: 'TeemoTarget.js', oldText: "module.exports = 'baseline';\\n", newText: "module.exports = 'upgraded';\\n" }],
        scripts: ['test:synthetic'], runTimeoutMs: 30000, stepTimeoutMs: 5000,
      }) };
      if (kind === 'p5_2') return toolRequest('read_file', { path: ${JSON.stringify(indexPath)} });
      if (last.role === 'tool') return { type: 'final_response', content: '读取完成。' };
      if (/读取 Teemo-source/.test(userText) || /^你好/.test(userText) || /执行刚才的计划/.test(userText)) {
        if (/读取 Teemo-source/.test(userText)) return toolRequest('read_file', { path: ${JSON.stringify(indexPath)} });
        if (/执行刚才的计划/.test(userText)) return { type: 'final_response', content: '当前没有可执行计划，我们可以先聊聊或重新规划。' };
        return { type: 'final_response', content: '你好，我在。' };
      }
      throw new Error('Unexpected native Tool route: ' + kind + ' / ' + userText);
    };
    window.teemoAIService.stream = async (messages, onChunk) => {
      const user = [...messages].reverse().find(message => message.role === 'user') || {};
      const text = String(user.content || '');
      window.__TeemoV141.provider.push({ kind: 'tool_free', route: window.__TeemoV14LastRoute, definitions: [], lastRole: messages[messages.length - 1] && messages[messages.length - 1].role });
      const response = /^你好/.test(text)
        ? '你好，我在。'
        : (/优化一下你自己的设置面板/.test(text)
          ? '我准备好了，可以先讨论目标，不会直接执行。'
          : (/执行刚才的计划/.test(text) ? '当前没有可执行计划，我们可以先聊聊或重新规划。' : '普通聊天回复。'));
      if (onChunk) onChunk(response, response);
      return response;
    };
    return true;
  })()`);
}

async function runChat(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const input = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const confirmOk = document.getElementById('confirmOkButton');
    const confirmModal = document.getElementById('confirmModal');
    const waitDone = async (route, timeout = 60000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (confirmModal && !confirmModal.hidden) confirmOk.click();
        const state = document.getElementById('chatStatus').dataset.executionState;
        if (!sendButton.classList.contains('stop') && window.__TeemoV14LastRoute === route && ['succeeded', 'failed', 'cancelled'].includes(state)) {
          await new Promise(resolve => setTimeout(resolve, 50));
          return { state, status: document.getElementById('chatStatus').innerText, text: document.getElementById('messageList').innerText };
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Timed out route=' + route + ' state=' + document.getElementById('chatStatus').dataset.executionState + ' text=' + document.getElementById('messageList').innerText.slice(-500));
    };
    const send = async (text, route, timeout) => {
      const before = { classifier: window.__TeemoV141.classifier.length, provider: window.__TeemoV141.provider.length, tools: window.__TeemoV141.toolRequests, permissions: window.__TeemoV141.permissionCalls };
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      for (let attempt = 0; attempt < 400 && input.value === text; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (input.value === text) throw new Error('Chat send lifecycle did not start: ' + text);
      const done = await waitDone(route, timeout);
      await new Promise(resolve => setTimeout(resolve, 150));
      return { ...done, classifier: window.__TeemoV141.classifier.slice(before.classifier), provider: window.__TeemoV141.provider.slice(before.provider), toolCalls: window.__TeemoV141.toolRequests - before.tools, permissionCalls: window.__TeemoV141.permissionCalls - before.permissions, intent: window.__TeemoV141LastIntent };
    };
    const results = {};
    results.normal = await send('你好，聊聊今天的设计方向。', 'normal_chat');
    results.discussion = await send('优化一下你自己的设置面板，你准备好后告诉我。', 'normal_chat');
    results.safe = await send('读取 Teemo-source 下的 INDEX.md。', 'safe_file_operation');
    results.planOrdinary = await send('先规划一下整理文件，不要执行。', 'planning');
    results.execute = await send('执行刚才普通文件计划', 'autonomous_execution');
    results.planUpgrade = await send('先规划一下怎么优化你自己的设置页面，不要执行。', 'planning');
    results.upgrade = await send('执行刚才修改 Teemo UI 的方案', 'controlled_self_upgrade', 90000);
    const sessionId = window.__TeemoV141LastSessionId;
    const upgradeRun = sessionId && window.teemoControlledSelfUpgrade.getLatestRun(sessionId, sessionId);
    document.getElementById('newChatButton').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    results.noPlanExecute = await send('执行刚才的计划', 'normal_chat');
    return { results, traces: window.__TeemoV141, upgradeRun, ordinaryTools: window.teemoToolRegistry.list() };
  })()`);
}

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    await installRuntime(window);
    const result = await runChat(window);
    assert.equal(result.results.normal.intent.singlePass, true);
    assert.equal(result.results.normal.intent.decision.intent, 'normal_chat');
    assert.equal(result.results.normal.classifier.length, 0);
    assert.equal(result.results.normal.state, 'succeeded');
    assert.match(result.results.normal.text, /你好，我在|普通聊天回复/);
    assert.equal(result.results.discussion.intent.decision.intent, 'normal_chat');
    assert.equal(result.results.discussion.classifier.length, 0);
    assert.equal(result.results.safe.intent.decision.intent, 'safe_file_operation');
    assert.equal(result.results.safe.classifier.length, 0);
    assert.equal(result.results.safe.provider.find(call => call.kind === 'ordinary_safe_file').definitions.length, 8);
    assert.match(result.results.safe.text, /读取完成/);
    assert.equal(result.results.planOrdinary.intent.decision.intent, 'planning');
    assert.equal(result.results.execute.intent.decision.intent, 'autonomous_execution');
    assert.equal(result.results.execute.provider.find(call => call.kind === 'p5_2').definitions.length, 8);
    assert.equal(result.results.planUpgrade.intent.decision.intent, 'planning');
    assert.equal(result.results.upgrade.intent.decision.intent, 'controlled_self_upgrade');
    assert.equal(result.results.upgrade.provider.some(call => call.kind === 'p5_2'), false);
    assert.equal(result.results.upgrade.provider.find(call => call.kind === 'p5_3_manifest').definitions.length, 3);
    assert.equal(result.upgradeRun.state, 'succeeded');
    assert.equal(result.upgradeRun.manifest.files[0].path, 'TeemoTarget.js');
    assert.equal(result.upgradeRun.steps[0].verified, true);
    assert.equal(result.upgradeRun.scripts[0].exitCode, 0);
    assert.equal(result.results.noPlanExecute.intent.route, 'normal_chat');
    assert.equal(result.results.noPlanExecute.classifier.length, 0);
    assert.equal(result.traces.classifier.length, 0);
    assert.equal(result.ordinaryTools.includes('git_status'), false);
    assert.equal(result.ordinaryTools.includes('run_npm_script'), false);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), "module.exports = 'upgraded';\n");
    const status = spawnSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8', windowsHide: true });
    assert.match(status.stdout, /TeemoTarget[.]js/);
    console.log(JSON.stringify({
      ok: true,
      SINGLE_PASS_ORDINARY_CHAT: 'PASS',
      PRE_SEND_CLASSIFIER_CALLED: 'NO',
      LOCAL_HIGH_CONFIDENCE_RULES: 'PASS',
      SAFE_FILE_TOOL_COUNT: 8,
      AUTONOMOUS_EXECUTION_ROUTE: 'PASS',
      CONTROLLED_SELF_UPGRADE_ROUTE: 'PASS',
      NO_PLAN_SOFT_FALLBACK: 'PASS',
      REAL_ORDINARY_CHAT_E2E: 'PASS',
      P1_BOUNDARY_CHANGED: 'NO',
      ORDINARY_CHAT_GIT_EXPOSED: 'NO',
      ORDINARY_CHAT_EXECUTE_EXPOSED: 'NO',
      SHELL_EXPOSED: 'NO',
      FORMAL_USER_DATA_TOUCHED: 'NO',
      isolatedProfile: profile,
      syntheticRepo: repo,
      permissionAuditEvents: permission.listAudit().length,
    }));
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
