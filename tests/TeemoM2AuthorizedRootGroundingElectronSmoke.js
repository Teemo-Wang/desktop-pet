const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-M2-chat-e2e-'));
const profile = path.join(sandbox, 'profile');
const dataDir = path.join(sandbox, 'data');
const root = path.join(sandbox, 'Teemo-source');
const docs = path.join(root, 'docs');
const outside = path.join(sandbox, 'outside');
const expectedContent = 'Teemo M2 synthetic ordinary Chat content.';
const outsideContent = 'M2 outside-root content must never be read.';
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(docs, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
const testFile = path.join(docs, 'test.md');
const outsideFile = path.join(outside, 'secret.md');
fs.writeFileSync(testFile, expectedContent, 'utf8');
fs.writeFileSync(outsideFile, outsideContent, 'utf8');
process.env.TEEMO_ASSISTANT_DATA_DIR = dataDir;

app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
const permissionService = new TeemoPermissionService({
  decisionProvider: () => ({ decision: 'allow', scope: 'once' }),
});
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoFileToolIpc(ipcMain, fileService, {
  rootsProvider: () => [root],
  permissionService,
});
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [root] }));
ipcMain.handle('get-app-version', () => app.getVersion());

async function installSyntheticProvider(window) {
  return window.webContents.executeJavaScript(`(() => {
    window.TeemoPermissionPrompt = { request: async () => ({ decision: 'allow', scope: 'once' }) };
    window.__TeemoM2ProviderCalls = [];
    window.__TeemoM2RootSummaries = [];
    window.teemoAIService.sendIntentClassification = async () => ({ type: 'intent_response', content: JSON.stringify({
      schemaVersion: 1, intent: 'safe_file_operation', action: 'read', target: 'authorized root file', needsPlanning: false, confidence: 0.99,
    }) });
    let callCounter = 0;
    window.teemoAIService.sendWithTools = async (messages, options = {}) => {
      const last = messages[messages.length - 1] || {};
      if (last.role === 'tool') {
        const envelope = JSON.parse(last.content || '{}');
        return { type: 'final_response', content: '真实文件内容：' + String(envelope.data && envelope.data.content || '') };
      }
      const rootMessage = messages.find(message => message.role === 'system' && /Trusted authorized-root summary/.test(message.content || ''));
      if (!rootMessage) throw new Error('authorized-root summary missing from provider round');
      const roots = JSON.parse(String(rootMessage.content).split('\\n').pop());
      window.__TeemoM2RootSummaries.push(roots);
      const userMessage = [...messages].reverse().find(message => message.role === 'user') || {};
      const userText = String(userMessage.content || '');
      const definitionNames = (options.tools || []).map(item => item && item.function && item.function.name).filter(Boolean).sort();
      const safeAllowlist = ['create_directory','create_file','list_directory','patch_file','read_file','rename_file','search_files','search_text'];
      if (JSON.stringify(definitionNames.filter(name => safeAllowlist.includes(name)).sort()) !== JSON.stringify(safeAllowlist)) {
        throw new Error('ordinary Chat Safe File allowlist changed');
      }
      if (definitionNames.some(name => /git|execute|shell|delete/i.test(name))) throw new Error('ordinary Chat exposed a forbidden tool');
      const rootRef = roots[0];
      let args;
      const absoluteMatch = userText.match(/([A-Za-z]:\\\\[^\\r\\n]+?\\.md)/i);
      if (absoluteMatch) args = { path: absoluteMatch[1] };
      else if (userText.includes('Teemo源码')) args = { rootReference: 'Teemo源码', relativePath: 'docs/test.md' };
      else if (userText.includes('Teemo-source')) args = { rootId: rootRef.rootId, relativePath: 'docs/test.md' };
      else throw new Error('synthetic provider could not ground the requested path');
      const id = 'call_m2_' + (++callCounter);
      window.__TeemoM2ProviderCalls.push({ userText, args, definitionNames });
      return {
        type: 'tool_request', tool: 'read_file', arguments: args,
        providerToolCallId: id,
        providerMessage: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: JSON.stringify(args) } }] },
      };
    };
    return true;
  })()`);
}

async function send(window, prompt) {
  return window.webContents.executeJavaScript(`(async () => {
    const input = document.getElementById('messageInput');
    const button = document.getElementById('sendButton');
    const beforeAssistantCount = document.querySelectorAll('#messageList .teemo-message.assistant').length;
    input.value = ${JSON.stringify(prompt)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    let started = false;
    let completed = false;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      started = started || button.classList.contains('stop');
      const assistants = [...document.querySelectorAll('#messageList .teemo-message.assistant')];
      const latest = assistants[assistants.length - 1];
      if (!button.classList.contains('stop') && assistants.length > beforeAssistantCount
        && latest && latest.innerText && !/正在理解|思考中/.test(latest.innerText)) {
        completed = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!completed || button.classList.contains('stop')) throw new Error('ordinary Chat request did not finish: ' + JSON.stringify({
      prompt: ${JSON.stringify(prompt)},
      started,
      status: document.getElementById('chatStatus') && document.getElementById('chatStatus').innerText,
      providerCalls: window.__TeemoM2ProviderCalls,
      lastMessages: [...document.querySelectorAll('#messageList .teemo-message')].map(item => item.innerText).slice(-3),
    }));
    return [...document.querySelectorAll('#messageList .teemo-message.assistant')].map(item => item.innerText).filter(Boolean).slice(-1)[0] || '';
  })()`);
}

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    await installSyntheticProvider(window);

    const displayNameRead = await send(window, '读取 Teemo-source 下的 docs/test.md，并告诉我内容。');
    const aliasRead = await send(window, '读取 Teemo源码里的 docs/test.md，并告诉我内容。');
    const absoluteRead = await send(window, `读取：\n${testFile}`);
    const outsideRead = await send(window, `读取：\n${outsideFile}`);
    const rendererState = await window.webContents.executeJavaScript(`(() => ({
      calls: window.__TeemoM2ProviderCalls,
      summaries: window.__TeemoM2RootSummaries,
      registered: window.teemoToolRegistry.list().sort(),
      safeFileDefinitionDirectFs: window.TeemoFileTools.createDefinitions({ fileClient: { prepare() {}, execute() {}, release() {} } })
        .some(definition => /\\bfs\\b/.test(String(definition.handler)) || /\\bfs\\b/.test(String(definition.resolvePermissionResource))),
    }))()`);

    if (!displayNameRead.includes(expectedContent)) throw new Error('displayName ordinary Chat read failed');
    if (!aliasRead.includes(expectedContent)) throw new Error('alias ordinary Chat read failed');
    if (!absoluteRead.includes(expectedContent)) throw new Error('absolute-path ordinary Chat read failed');
    if (outsideRead.includes(outsideContent) || !/未获授权|操作执行失败|outside authorized folders|授权文件夹之外/i.test(outsideRead)
      || /FILE_OUTSIDE_AUTHORIZED_ROOT|stack|ipc|schema/i.test(outsideRead)) {
      throw new Error(`outside-root request did not fail closed: ${outsideRead}`);
    }
    if (rendererState.safeFileDefinitionDirectFs) throw new Error('Safe File Tool renderer handler accessed fs');
    if (rendererState.summaries.some(summary => JSON.stringify(summary).includes(root))) throw new Error('provider root summary leaked an absolute path');
    if (!rendererState.calls.some(call => call.args.rootReference === 'Teemo源码')) throw new Error('alias path did not use deterministic rootReference grounding');
    if (!rendererState.calls.some(call => call.args.path === testFile)) throw new Error(`absolute path did not enter trusted grounding: ${JSON.stringify(rendererState.calls)}`);
    if (rendererState.registered.some(name => /git|execute|shell|delete/i.test(name))) throw new Error('ordinary Chat exposed a forbidden tool');

    console.log(JSON.stringify({
      ok: true,
      ROOT_DISCOVERY: 'PASS',
      REAL_CHAT_READ_E2E: 'PASS',
      ABSOLUTE_PATH_READ_E2E: 'PASS',
      ALIAS_READ_E2E: 'PASS',
      OUTSIDE_ROOT_FAIL_CLOSED: 'PASS',
      PROVIDER_NATIVE_TOOL_CALL: 'PASS',
      TOOL_RESULT_CONTINUATION: 'PASS',
      RENDERER_DIRECT_FS: 'NO',
      CHAT_SAFE_FILE_ALLOWLIST_CHANGED: 'NO',
      FORMAL_USER_DATA_TOUCHED: 'NO',
      isolatedProfile: profile,
      syntheticRoot: root,
    }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});

app.on('window-all-closed', () => {});
