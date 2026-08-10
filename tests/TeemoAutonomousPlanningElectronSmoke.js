const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p5-1-planning-smoke-'));
const isolatedData = path.join(isolatedRoot, 'data');
const isolatedProfile = path.join(isolatedRoot, 'profile');
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const plan = {
        goal: 'Electron planning smoke',
        assumptions: ['Owner review is required.'],
        constraints: ['No execution.'],
        steps: [{ title: 'Review', description: 'Review the proposed work.', status: 'proposed' }],
        risks: ['Scope may change.'],
        successCriteria: ['Plan remains local to this session.'],
      };
      const json = JSON.stringify(plan);
      const state = new window.TeemoPlanningSessionState();
      const ai = { calls: [], sendPlanning: async (messages, options) => { ai.calls.push({ messages, options }); return { content: json }; } };
      const core = new window.TeemoAgentCore({ aiService: ai });
      const run = await core.runPlanning({ sessionId: 'electron-owner', goal: plan.goal, messages: [{ role: 'user', content: plan.goal }] });
      if (!run.ok || run.run.toolCalls.length !== 0) throw new Error('planning run did not remain tool-free');
      if (Object.prototype.hasOwnProperty.call(ai.calls[0].options, 'tools')) throw new Error('planning adapter received tools');
      if (state.set('electron-owner', run.plan).ok !== true || state.get('other-owner') !== null) throw new Error('plan session ownership failed');
      const unexpectedAi = { sendPlanning: async () => ({ content: json, tool_calls: [{ id: 'unexpected' }] }) };
      const unexpected = await new window.TeemoAgentCore({ aiService: unexpectedAi }).runPlanning({ sessionId: 'electron-owner', goal: plan.goal, messages: [] });
      if (unexpected.ok || unexpected.error.code !== 'PLANNING_UNEXPECTED_TOOL_CALL') throw new Error('unexpected tool call was not rejected');
      const registered = window.teemoToolRegistry.list().sort();
      if (registered.includes('git_status') || registered.some(name => /^execute_/.test(name))) throw new Error('ordinary chat allowlist expanded');
      if (!registered.includes('read_file') || !registered.includes('create_directory')) throw new Error('safe file allowlist missing');

      const provider = new window.AIService();
      provider.configure({ apiKey: 'synthetic-key', baseUrl: 'https://planning.invalid/v1', modelName: 'synthetic-planner' });
      const originalFetch = window.fetch;
      let payload = null;
      window.fetch = async (_url, request) => { payload = JSON.parse(request.body); return { ok: true, json: async () => ({ choices: [{ message: { content: json } }] }) }; };
      const response = await provider.sendPlanning([{ role: 'user', content: plan.goal }]);
      window.fetch = originalFetch;
      if (!response.content || payload.tools !== undefined || payload.tool_choice !== undefined || payload.stream !== undefined) throw new Error('planning provider request was not tool-free');
      return { planningRun: true, toolCalls: run.run.toolCalls.length, planningToolsSent: false, sessionIsolated: true, unexpectedToolCallRejected: true, ordinaryAllowlistUnchanged: true };
    })()`);
    console.log(JSON.stringify({ ok: true, formalUserDataTouched: false, result }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort smoke cleanup */ }
  }
});

app.on('window-all-closed', () => {});
