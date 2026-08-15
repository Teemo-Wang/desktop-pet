const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-V14-productization-'));
const profile = path.join(sandbox, 'profile');
const dataDir = path.join(sandbox, 'data');
const root = path.join(sandbox, 'Teemo-source');
const relativePath = 'docs/TeemoProjectKnowledge/INDEX.md';
const indexPath = path.join(root, ...relativePath.split('/'));
const testRelativePath = 'test.md';
const testPath = path.join(root, testRelativePath);
const expectedContent = '# Teemo Project Knowledge\n\nTeemo V1.4 ordinary Chat E2E.';
const originalTestContent = '# Old title\n';
const testSha256 = crypto.createHash('sha256').update(originalTestContent).digest('hex');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(indexPath), { recursive: true });
fs.writeFileSync(indexPath, expectedContent, 'utf8');
fs.writeFileSync(testPath, originalTestContent, 'utf8');
process.env.TEEMO_ASSISTANT_DATA_DIR = dataDir;

app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
let mainExecutions = 0;
const originalExecutePrepared = fileService.executePrepared.bind(fileService);
fileService.executePrepared = (...args) => {
  mainExecutions += 1;
  return originalExecutePrepared(...args);
};
const permissionService = new TeemoPermissionService({ timeoutMs: 150 });
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoFileToolIpc(ipcMain, fileService, { rootsProvider: () => [root], permissionService });
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [root] }));
ipcMain.handle('get-app-version', () => app.getVersion());

async function installSyntheticRuntime(window) {
  return window.webContents.executeJavaScript(`(() => {
    window.__TeemoV14ProviderCalls = [];
    window.__TeemoV14NativeToolRequests = 0;
    window.__TeemoV14PermissionCalls = 0;
    window.__TeemoV14PlanningCalls = [];
    window.__TeemoV14NormalizedArguments = [];
    window.__TeemoV14PermissionMode = 'allow';
    window.__TeemoV14InspirationBuilds = 0;
    window.__TeemoV14ClassifierCalls = [];
    window.TeemoPermissionPrompt = {
      request: async () => {
        window.__TeemoV14PermissionCalls += 1;
        if (window.__TeemoV14PermissionMode === 'timeout') return new Promise(() => {});
        if (window.__TeemoV14PermissionMode === 'deny') return { decision: 'deny', reason: 'user_denied' };
        return { decision: 'allow', scope: 'once' };
      },
      dismiss: () => {},
    };

    const originalNormalize = window.teemoFileClient.normalize.bind(window.teemoFileClient);
    window.teemoFileClient.normalize = async (tool, args) => {
      const normalized = await originalNormalize(tool, args);
      window.__TeemoV14NormalizedArguments.push({ tool, input: JSON.parse(JSON.stringify(args)), normalized: JSON.parse(JSON.stringify(normalized)) });
      return normalized;
    };

    window.teemoInspirationContextBuilder.shouldRetrieve = text => /灵感库.*参考/.test(String(text || ''));
    window.teemoInspirationContextBuilder.build = async options => {
      const triggered = window.teemoInspirationContextBuilder.shouldRetrieve(options && options.userMessage);
      if (!triggered) return { enabled: true, triggered: false, status: 'BYPASS', items: [], systemMessage: null };
      window.__TeemoV14InspirationBuilds += 1;
      return {
        enabled: true, triggered: true, status: 'READY', items: [{ name: 'poster.png', path: 'poster.png' }],
        systemMessage: { role: 'system', content: '[Teemo Inspiration]' + String.fromCharCode(10) + '<teemo_inspiration_data>{"name":"poster.png"}</teemo_inspiration_data>' },
      };
    };

    window.teemoAIService.sendIntentClassification = async () => {
      throw Object.assign(new Error('Single-pass Chat must not call the intent classifier.'), { code: 'INTENT_CLASSIFIER_SHOULD_NOT_RUN' });
    };

    window.teemoAIService.sendPlanning = async messages => {
      const user = [...messages].reverse().find(message => message.role === 'user');
      const goal = String(user && user.content || 'Teemo plan');
      window.__TeemoV14PlanningCalls.push({ messages: JSON.parse(JSON.stringify(messages)) });
      return { content: JSON.stringify({
        goal,
        assumptions: ['The authorized synthetic root is available.'],
        constraints: ['Use existing Safe File Tools only.'],
        steps: [{
          title: /缺少前置条件/.test(goal) ? 'Wait for prerequisite' : 'Read project knowledge',
          description: /缺少前置条件/.test(goal) ? 'The required reference is not available yet.' : 'Read the authorized INDEX file.',
          status: /缺少前置条件/.test(goal) ? 'blocked' : 'proposed',
        }],
        risks: ['The file may change.'],
        successCriteria: ['The trusted read result is verified.'],
      }) };
    };

    let callCounter = 0;
    const makeToolRequest = (tool, args) => {
      window.__TeemoV14NativeToolRequests += 1;
      const id = 'call_v14_' + (++callCounter);
      return {
        type: 'tool_request', tool, arguments: args, providerToolCallId: id,
        providerMessage: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] },
      };
    };
    window.teemoAIService.stream = async (messages, onChunk) => {
      const systemText = messages.filter(message => message.role === 'system').map(message => message.content || '').join(String.fromCharCode(10));
      const user = [...messages].reverse().find(message => message.role === 'user') || {};
      const userText = String(user.content || '');
      window.__TeemoV14ProviderCalls.push({
        kind: 'tool_free',
        route: window.__TeemoV14LastRoute,
        userText,
        lastRole: messages[messages.length - 1] && messages[messages.length - 1].role,
        definitions: [],
        systemText,
      });
      if (/provider unavailable/i.test(userText)) throw Object.assign(new Error('HTTP body with private detail'), { code: 'NATIVE_TOOL_CALLING_REQUEST_FAILED' });
      if (/execution failed/i.test(userText)) throw Object.assign(new Error('ipc channel and stack detail'), { code: 'EXECUTION_FAILED' });
      if (/verification failed/i.test(userText)) throw Object.assign(new Error('trusted verifier stack detail'), { code: 'EXECUTION_VERIFICATION_FAILED' });
      let response = '普通聊天回复。';
      if (/优化一下你的设置面板/.test(userText)) response = '我准备好了，可以先讨论布局目标与参考图。';
      if (/灵感库.*参考/.test(userText)) {
        if (!/teemo_inspiration_data/.test(systemText)) throw new Error('bounded inspiration context missing');
        response = '已根据授权灵感元数据整理参考。';
      }
      if (typeof onChunk === 'function') onChunk(response, response);
      return response;
    };
    window.teemoAIService.sendWithTools = async (messages, options = {}) => {
      const definitions = (options.tools || []).map(item => item && item.function && item.function.name).filter(Boolean).sort();
      const last = messages[messages.length - 1] || {};
      const systemText = messages.filter(message => message.role === 'system').map(message => message.content || '').join(String.fromCharCode(10));
      const user = [...messages].reverse().find(message => message.role === 'user') || {};
      const userText = String(user.content || '');
      window.__TeemoV14ProviderCalls.push({
        kind: 'native_tools',
        route: window.__TeemoV14LastRoute,
        userText,
        lastRole: last.role,
        definitions,
        systemText,
      });

      if (/Execute exactly the supplied approved plan step/.test(systemText)) {
        return makeToolRequest('read_file', { rootReference: 'Teemo-source', relativePath: ${JSON.stringify(relativePath)} });
      }
      if (last.role === 'tool') {
        const envelope = JSON.parse(last.content || '{}');
        return { type: 'final_response', content: '工具结果已返回：' + String(envelope.data && (envelope.data.content || envelope.data.path) || '') };
      }
      if (/provider unavailable/i.test(userText)) throw Object.assign(new Error('HTTP body with private detail'), { code: 'NATIVE_TOOL_CALLING_REQUEST_FAILED' });
      if (/execution failed/i.test(userText)) throw Object.assign(new Error('ipc channel and stack detail'), { code: 'EXECUTION_FAILED' });
      if (/verification failed/i.test(userText)) throw Object.assign(new Error('trusted verifier stack detail'), { code: 'EXECUTION_VERIFICATION_FAILED' });
      if (/不存在/.test(userText)) return makeToolRequest('read_file', { rootReference: 'Teemo-source', relativePath: 'docs/missing.md' });
      if (/无效参数/.test(userText)) return makeToolRequest('read_file', {});
      if (/拒绝写入/.test(userText)) return makeToolRequest('create_file', { rootReference: 'Teemo-source', relativePath: 'docs/denied.md', content: 'denied' });
      if (/超时写入/.test(userText)) return makeToolRequest('create_file', { rootReference: 'Teemo-source', relativePath: 'docs/timeout.md', content: 'timeout' });
      if (/创建.*Teemo-note[.]md/.test(userText)) return makeToolRequest('create_file', { rootReference: 'Teemo-source', relativePath: 'docs/Teemo-note.md', content: 'hello' });
      if (/修改 Teemo-source.*test[.]md 标题/.test(userText)) return makeToolRequest('patch_file', {
        rootReference: 'Teemo-source',
        relativePath: ${JSON.stringify(testRelativePath)},
        expectedSha256: ${JSON.stringify(testSha256)},
        edits: [{ oldText: '# Old title', newText: '# New title' }],
      });
      if (/读取 Teemo-source/.test(userText)) {
        const rootsLine = systemText.split(String.fromCharCode(10)).find(line => line.startsWith('[{"rootId"'));
        const roots = rootsLine ? JSON.parse(rootsLine) : [];
        const rootId = roots[0] && roots[0].rootId;
        return makeToolRequest('read_file', { rootId, rootReference: 'Teemo-source', relativePath: ${JSON.stringify(relativePath)}, path: ${JSON.stringify(indexPath)} });
      }
      if (/优化一下你的设置面板/.test(userText)) {
        return { type: 'final_response', content: '我准备好了，可以先讨论布局目标与参考图。' };
      }
      if (/你好|聊聊设计|测试 |执行刚才的计划/.test(userText)) {
        return { type: 'final_response', content: /执行刚才的计划/.test(userText) ? '当前没有可执行计划，我们可以先聊聊或重新规划。' : '普通聊天回复。' };
      }
      throw new Error('unexpected native tool route: ' + window.__TeemoV14LastRoute + ' / ' + userText);
    };
    return true;
  })()`);
}

async function runScenarios(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const input = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const confirmOk = document.getElementById('confirmOkButton');
    const confirmModal = document.getElementById('confirmModal');
    const waitForDone = async expectedRoute => {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        if (confirmModal && !confirmModal.hidden) confirmOk.click();
        const state = document.getElementById('chatStatus').dataset.executionState;
        if (!sendButton.classList.contains('stop') && window.__TeemoV14LastRoute === expectedRoute
          && ['succeeded', 'failed', 'cancelled'].includes(state)) {
          await new Promise(resolve => setTimeout(resolve, 30));
          return { state, text: document.getElementById('messageList').innerText, status: document.getElementById('chatStatus').innerText };
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Chat scenario timed out: ' + expectedRoute
        + ' route=' + window.__TeemoV14LastRoute
        + ' state=' + document.getElementById('chatStatus').dataset.executionState
        + ' status=' + document.getElementById('chatStatus').innerText
        + ' text=' + document.getElementById('messageList').innerText.slice(-500));
    };
    const send = async (text, route) => {
      const before = {
        providers: window.__TeemoV14ProviderCalls.length,
        tools: window.__TeemoV14NativeToolRequests,
        permissions: window.__TeemoV14PermissionCalls,
      };
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      for (let attempt = 0; attempt < 20 && input.value === text; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (!sendButton.classList.contains('stop')) sendButton.click();
      }
      const result = await waitForDone(route);
      const calls = window.__TeemoV14ProviderCalls.slice(before.providers);
      return {
        ...result,
        providerCalls: calls,
        providerToolDefinitionCounts: calls.map(call => call.definitions.length),
        toolCalls: window.__TeemoV14NativeToolRequests - before.tools,
        permissionCalls: window.__TeemoV14PermissionCalls - before.permissions,
      };
    };
    const results = {};
    results.normal = await send('你好，今天聊聊设计吧', 'normal_chat');
    results.uiConsultation = await send('优化一下你的设置面板，你准备好跟我说', 'normal_chat');
    results.safeRead = await send('读取 Teemo-source 下的 docs/TeemoProjectKnowledge/INDEX.md', 'safe_file_operation');
    results.safeWrite = await send('修改 Teemo-source 下的 test.md 标题', 'safe_file_operation');
    results.inspiration = await send('从我的灵感库找一些极简科技海报参考', 'inspiration_retrieval');
    results.planning = await send('先规划一下怎么优化设置面板，不要执行', 'planning');
    results.execution = await send('执行刚才的计划', 'autonomous_execution');

    document.getElementById('newChatButton').click();
    const providerBeforeNoPlan = window.__TeemoV14ProviderCalls.length;
    results.noPlan = await send('执行刚才的计划', 'normal_chat');
    results.noPlanProviderDelta = window.__TeemoV14ProviderCalls.length - providerBeforeNoPlan;

    window.__TeemoV14PermissionMode = 'deny';
    results.permissionDenied = await send('创建 Teemo-source 下的 docs/denied.md 文件，拒绝写入', 'safe_file_operation');
    window.__TeemoV14PermissionMode = 'timeout';
    results.permissionTimeout = await send('创建 Teemo-source 下的 docs/timeout.md 文件，超时写入', 'safe_file_operation');
    window.__TeemoV14PermissionMode = 'allow';
    results.notFound = await send('读取 Teemo-source 下不存在的 docs/missing.md 文件', 'safe_file_operation');
    results.invalid = await send('读取 Teemo-source 文件，测试无效参数', 'safe_file_operation');
    results.provider = await send('测试 provider unavailable', 'normal_chat');
    results.executionFailed = await send('测试 execution failed', 'normal_chat');
    results.verificationFailed = await send('测试 verification failed', 'normal_chat');

    document.getElementById('newChatButton').click();
    const blockedProviderBefore = window.__TeemoV14ProviderCalls.length;
    const blockedPermissionBefore = window.__TeemoV14PermissionCalls;
    results.blockedPlanning = await send('先规划一个缺少前置条件的任务，不要执行', 'planning');
    const blockedPlanArticle = [...document.querySelectorAll('.teemo-plan-message')].at(-1);
    const blockedExecute = blockedPlanArticle && [...blockedPlanArticle.querySelectorAll('button')].find(button => button.textContent === '执行规划');
    if (blockedExecute) blockedExecute.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    results.blockedPlanningUi = {
      executeDisabled: Boolean(blockedExecute && blockedExecute.disabled),
      text: blockedPlanArticle && blockedPlanArticle.innerText || '',
      providerDeltaAfterClick: window.__TeemoV14ProviderCalls.length - blockedProviderBefore,
      permissionDeltaAfterClick: window.__TeemoV14PermissionCalls - blockedPermissionBefore,
    };

    return {
      results,
      providerCalls: window.__TeemoV14ProviderCalls,
      planningCalls: window.__TeemoV14PlanningCalls,
      normalized: window.__TeemoV14NormalizedArguments,
      inspirationBuilds: window.__TeemoV14InspirationBuilds,
      capability: window.__TeemoV14CapabilitySnapshot,
      tools: window.teemoOrdinaryChatToolRegistry.list().sort(),
      finalState: window.__TeemoV14ExecutionState,
    };
  })()`);
}

function assertNoLeak(result) {
  if (/arguments\.path|schema|ipc|stack|HTTP body|permissionRequestId|authorizationId|The requested path does not exist|Use exactly one of rootId/i.test(result.text)) {
    throw new Error(`internal error leaked to ordinary UI: ${result.text}`);
  }
}

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    await installSyntheticRuntime(window);
    const state = await runScenarios(window);
    const r = state.results;

    if (!r.normal.text.includes('普通聊天回复')) throw new Error('normal Chat response missing');
    if (!r.uiConsultation.text.includes('我准备好了')) throw new Error('UI consultation did not receive a normal Chat response');
    if (/请求参数或目标不完整/.test(r.uiConsultation.text)) throw new Error('UI consultation regressed to invalid_request');
    if (!r.safeRead.text.includes(expectedContent)) throw new Error('Safe File read did not complete through second Provider response');
    if (fs.readFileSync(testPath, 'utf8') !== '# New title\n') throw new Error('Safe File patch did not reach Main FileService');
    if (!r.inspiration.text.includes('授权灵感元数据')) throw new Error('inspiration route response missing');
    if (state.inspirationBuilds !== 1 || state.planningCalls.length !== 2) throw new Error('inspiration/planning route count mismatch');
    if (!r.execution.text.includes('当前计划已执行，并通过本地核验')) throw new Error('autonomous execution did not complete');
    if (r.noPlan.state !== 'succeeded' || r.noPlanProviderDelta < 1) throw new Error('no-plan execute should soft-fallback to single-pass normal chat');
    if (!/未获授权/.test(r.permissionDenied.text)) throw new Error('permission denial was not normalized');
    if (!/授权等待已超时/.test(r.permissionTimeout.text)) throw new Error('permission timeout was not normalized');
    if (!/没有找到请求的文件/.test(r.notFound.text)) throw new Error('file-not-found was not normalized');
    if (!/请求条件不完整|请求参数或目标不完整/.test(r.invalid.text)) throw new Error('invalid request was not normalized');
    if (!/AI 服务暂时不可用/.test(r.provider.text)) throw new Error('provider error was not normalized');
    if (!/操作执行失败/.test(r.executionFailed.text)) throw new Error('execution error was not normalized');
    if (!/未通过核验/.test(r.verificationFailed.text)) throw new Error('verification error was not normalized');
    if (!r.blockedPlanningUi.executeDisabled || !/规划包含 1 个阻塞步骤/.test(r.blockedPlanningUi.text) || !/阻塞：需先解决前置条件/.test(r.blockedPlanningUi.text)) throw new Error('blocked plan UI did not explain and disable execution');
    if (r.blockedPlanningUi.providerDeltaAfterClick !== 0 || r.blockedPlanningUi.permissionDeltaAfterClick !== 0) throw new Error('blocked plan attempted Provider or Permission execution');
    Object.values(r).filter(value => value && value.text).forEach(assertNoLeak);

    for (const scenario of [r.normal, r.uiConsultation]) {
      if (scenario.providerCalls.length !== 1 || scenario.providerCalls[0].kind !== 'tool_free') throw new Error('normal_chat did not use the tool-free streaming Provider path');
      if (scenario.providerToolDefinitionCounts.some(count => count !== 0)) throw new Error('normal_chat must stay tool-free');
      if (scenario.toolCalls !== 0 || scenario.permissionCalls !== 0) throw new Error('normal_chat greeting should not execute tools');
    }
    if (r.inspiration.providerToolDefinitionCounts.some(count => count !== 0) || r.inspiration.toolCalls !== 0) throw new Error('inspiration route exposed Safe File tools');
    if (r.planning.providerToolDefinitionCounts.some(count => count !== 0) || r.planning.toolCalls !== 0) throw new Error('planning route exposed tools');
    for (const scenario of [r.safeRead, r.safeWrite]) {
      if (!scenario.providerCalls.length || scenario.providerCalls.some(call => call.kind !== 'native_tools')) throw new Error('safe_file_operation did not use native tools');
      if (scenario.providerToolDefinitionCounts.some(count => count !== 8)) throw new Error('safe_file_operation Provider tool count changed');
      if (scenario.toolCalls !== 1) throw new Error('safe_file_operation native tool call count mismatch');
    }
    if (r.safeWrite.permissionCalls !== 1) throw new Error('P1 write confirmation was not preserved');

    const safeTools = ['create_directory','create_file','list_directory','patch_file','read_file','rename_file','search_files','search_text'].sort();
    if (JSON.stringify(state.tools) !== JSON.stringify(safeTools)) throw new Error(`ordinary Chat allowlist changed: ${JSON.stringify(state.tools)}`);
    const mixed = state.normalized.find(item => item.input.rootId && item.input.rootReference && item.input.path);
    if (!mixed || Object.keys(mixed.normalized).sort().join(',') !== 'relativePath,rootId') throw new Error('M2 canonical normalization proof missing');
    const capabilityCall = state.providerCalls.find(call => call.route === 'normal_chat' && call.kind === 'tool_free');
    if (!capabilityCall || !/Teemo V1\.4 Runtime Capability Snapshot/.test(capabilityCall.systemText)) throw new Error('capability context missing');
    if (!/Provider Safe File tool definitions exposed for this route: 0/.test(capabilityCall.systemText)) throw new Error('normal_chat capability exposure should stay tool-free');
    if (/[A-Z]:\\/.test(capabilityCall.systemText)) throw new Error('capability context leaked an absolute path');
    if (state.capability.safeFileTools.length !== 8) throw new Error('capability snapshot did not reflect Registry');
    if (fs.existsSync(path.join(root, 'docs', 'denied.md')) || fs.existsSync(path.join(root, 'docs', 'timeout.md'))) throw new Error('denied/timed-out write executed');
    if (!permissionService.listAudit().some(event => event.decision === 'deny')) throw new Error('P1 denial audit missing');

    console.log(JSON.stringify({
      ok: true,
      CAPABILITY_AWARENESS: 'PASS',
      NORMAL_CHAT_ROUTING: 'PASS',
      SAFE_FILE_ROUTING: 'PASS',
      INSPIRATION_ROUTING: 'PASS',
      PLANNING_ROUTING: 'PASS',
      AUTONOMOUS_EXECUTION_ROUTING: 'PASS',
      TOOL_CONTRACT_STABILIZATION: 'PASS',
      ERROR_NORMALIZATION: 'PASS',
      UNIFIED_EXECUTION_STATE: 'PASS',
      CHAT_FIRST_UX: 'PASS',
      REAL_ORDINARY_CHAT_E2E: 'PASS',
      SINGLE_PASS_ORDINARY_CHAT: 'PASS',
      PRE_SEND_CLASSIFIER_CALLED: 'NO',
      NORMAL_CHAT_TOOLS_EXPOSED: 'NO',
      SAFE_FILE_ROUTE_TOOL_COUNT: 8,
      CHAT_SAFE_FILE_TOOL_COUNT: state.tools.length,
      CHAT_SAFE_FILE_ALLOWLIST_CHANGED: 'NO',
      M2_CHANGED: 'NO',
      P1_CHANGED: 'NO',
      FORMAL_USER_DATA_TOUCHED: 'NO',
      isolatedProfile: profile,
      syntheticRoot: root,
      mainExecutions,
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
