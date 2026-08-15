const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-M2-argument-normalization-'));
const profile = path.join(sandbox, 'profile');
const dataDir = path.join(sandbox, 'data');
const root = path.join(sandbox, 'Teemo-source');
const relativePath = 'docs/TeemoProjectKnowledge/INDEX.md';
const indexPath = path.join(root, ...relativePath.split('/'));
const expectedContent = '# Teemo Project Knowledge\n\nTeemo M2 normalized ordinary Chat E2E.';
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(indexPath), { recursive: true });
fs.writeFileSync(indexPath, expectedContent, 'utf8');
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
    window.__TeemoM2NormalizationProviderCalls = [];
    window.__TeemoM2NormalizedArguments = [];
    window.__TeemoM2PreparedArguments = [];
    window.teemoAIService.sendIntentClassification = async () => ({ type: 'intent_response', content: JSON.stringify({
      schemaVersion: 1, intent: 'safe_file_operation', action: 'read', target: 'Teemo-source INDEX', needsPlanning: false, confidence: 0.99,
    }) });

    const originalNormalize = window.teemoFileClient.normalize.bind(window.teemoFileClient);
    window.teemoFileClient.normalize = async (tool, args) => {
      const normalized = await originalNormalize(tool, args);
      window.__TeemoM2NormalizedArguments.push({ tool, input: JSON.parse(JSON.stringify(args)), normalized: JSON.parse(JSON.stringify(normalized)) });
      return normalized;
    };
    const originalPrepare = window.teemoFileClient.prepare.bind(window.teemoFileClient);
    window.teemoFileClient.prepare = async (tool, args, context) => {
      window.__TeemoM2PreparedArguments.push({ tool, args: JSON.parse(JSON.stringify(args)) });
      return originalPrepare(tool, args, context);
    };

    let callCounter = 0;
    window.teemoAIService.sendWithTools = async (messages, options = {}) => {
      const last = messages[messages.length - 1] || {};
      if (last.role === 'tool') {
        const envelope = JSON.parse(last.content || '{}');
        return { type: 'final_response', content: '已读取 INDEX：' + String(envelope.data && envelope.data.content || '') };
      }
      const rootMessage = messages.find(message => message.role === 'system' && /Trusted authorized-root summary/.test(message.content || ''));
      if (!rootMessage) throw new Error('authorized-root summary missing from provider round');
      const roots = JSON.parse(String(rootMessage.content).split('\\n').pop());
      if (roots.length !== 1 || roots[0].displayName !== 'Teemo-source') throw new Error('synthetic authorized root missing');
      const userMessage = [...messages].reverse().find(message => message.role === 'user') || {};
      const userText = String(userMessage.content || '');
      if (userText !== '读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md') {
        throw new Error('ordinary Chat prompt changed: ' + userText);
      }
      const definitionNames = (options.tools || []).map(item => item && item.function && item.function.name).filter(Boolean).sort();
      const safeAllowlist = ['create_directory','create_file','list_directory','patch_file','read_file','rename_file','search_files','search_text'];
      if (JSON.stringify(definitionNames.filter(name => safeAllowlist.includes(name)).sort()) !== JSON.stringify(safeAllowlist)) {
        throw new Error('ordinary Chat Safe File allowlist changed');
      }
      if (definitionNames.some(name => /git|execute|shell|delete/i.test(name))) throw new Error('ordinary Chat exposed a forbidden tool');

      const args = {
        rootId: roots[0].rootId,
        rootReference: 'Teemo-source',
        relativePath: ${JSON.stringify(relativePath)},
        path: ${JSON.stringify(indexPath)},
      };
      const id = 'call_m2_normalization_' + (++callCounter);
      window.__TeemoM2NormalizationProviderCalls.push({ userText, args: JSON.parse(JSON.stringify(args)), definitionNames, roots });
      return {
        type: 'tool_request',
        tool: 'read_file',
        arguments: args,
        providerToolCallId: id,
        providerMessage: {
          role: 'assistant', content: null,
          tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: JSON.stringify(args) } }],
        },
      };
    };
    return true;
  })()`);
}

async function send(window) {
  const prompt = '读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md';
  return window.webContents.executeJavaScript(`(async () => {
    const input = document.getElementById('messageInput');
    const button = document.getElementById('sendButton');
    const beforeAssistantCount = document.querySelectorAll('#messageList .teemo-message.assistant').length;
    input.value = ${JSON.stringify(prompt)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const assistants = [...document.querySelectorAll('#messageList .teemo-message.assistant')];
      const latest = assistants[assistants.length - 1];
      if (!button.classList.contains('stop') && assistants.length > beforeAssistantCount
        && latest && latest.innerText && !/正在理解|思考中/.test(latest.innerText)) {
        return latest.innerText;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('ordinary Chat normalization request did not finish');
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
    const response = await send(window);
    const state = await window.webContents.executeJavaScript(`(() => ({
      providerCalls: window.__TeemoM2NormalizationProviderCalls,
      normalized: window.__TeemoM2NormalizedArguments,
      prepared: window.__TeemoM2PreparedArguments,
      registered: window.teemoToolRegistry.list().sort(),
    }))()`);

    if (!response.includes(expectedContent)) throw new Error(`real ordinary Chat INDEX read failed: ${response}`);
    if (/arguments\.path is required|The requested path does not exist|Use exactly one of rootId or rootReference/i.test(response)) {
      throw new Error(`legacy path error remained visible: ${response}`);
    }
    if (state.providerCalls.length !== 1 || state.normalized.length !== 1 || state.prepared.length !== 1) {
      throw new Error(`unexpected pipeline counts: ${JSON.stringify(state)}`);
    }
    const raw = state.providerCalls[0].args;
    const normalized = state.normalized[0].normalized;
    const prepared = state.prepared[0].args;
    const expectedRootId = state.providerCalls[0].roots[0].rootId;
    if (!raw.rootId || !raw.rootReference || !raw.path) throw new Error('synthetic provider did not reproduce mixed arguments');
    if (normalized.rootId !== expectedRootId || normalized.relativePath !== relativePath) {
      throw new Error(`normalized target mismatch: ${JSON.stringify(normalized)}`);
    }
    if (Object.keys(normalized).sort().join(',') !== 'relativePath,rootId') {
      throw new Error(`normalized arguments retained forbidden keys: ${JSON.stringify(normalized)}`);
    }
    if (JSON.stringify(prepared) !== JSON.stringify(normalized)) {
      throw new Error(`Registry did not pass normalized arguments to File IPC: ${JSON.stringify({ normalized, prepared })}`);
    }
    if (state.registered.some(name => /git|execute|shell|delete/i.test(name))) throw new Error('ordinary Chat exposed a forbidden tool');
    if (!permissionService.listAudit().some(event => event.toolName === 'read_file' && event.decision === 'allow')) {
      throw new Error('P1 permission allow audit missing');
    }

    console.log(JSON.stringify({
      ok: true,
      TOOL_ARGUMENT_NORMALIZATION: 'PASS',
      ROOTID_ONLY_AFTER_GROUNDING: 'PASS',
      ROOTREFERENCE_REMOVED_AFTER_RESOLUTION: 'PASS',
      LEGACY_PATH_REMOVED: 'PASS',
      REAL_CHAT_INDEX_READ_E2E: 'PASS',
      TOOL_REGISTRY_VALIDATION: 'PASS',
      P1_FILE_IPC_MAIN_FILESERVICE: 'PASS',
      TOOL_RESULT_SECOND_PROVIDER_RESPONSE: 'PASS',
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
