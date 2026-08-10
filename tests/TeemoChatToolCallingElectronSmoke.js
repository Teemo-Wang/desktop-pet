const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('teemo:local-access-list', () => []);
ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
    await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const registered = window.teemoToolRegistry.list().sort();
      if (registered.includes('git_status') || registered.some(name => /^execute_/.test(name))) throw new Error('ordinary chat exposed Git or execute tools');
      if (!registered.includes('read_file') || !registered.includes('create_directory')) throw new Error('ordinary chat file allowlist is incomplete');
      const safeFileDefinitions = window.TeemoFileTools.createDefinitions({ fileClient: { prepare: async () => ({}), execute: async () => ({}), release: async () => ({}) } });
      if (safeFileDefinitions.some(definition => /\\bfs\\b/.test(String(definition.handler)) || /\\bfs\\b/.test(String(definition.resolvePermissionResource)))) {
        throw new Error('Safe File Tool renderer definition directly accesses fs');
      }
      const registry = new window.TeemoToolRegistry();
      registry.register({ name: 'echo', description: 'safe test', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, metadata: { permission: 'none' }, handler: async args => ({ text: args.text }) });
      let step = 0;
      const ai = { sendWithTools: async messages => {
        if (step++ === 0) return { type: 'tool_request', tool: 'echo', arguments: { text: 'smoke' }, providerToolCallId: 'call_smoke', providerMessage: { role: 'assistant', content: null, tool_calls: [{ id: 'call_smoke', type: 'function', function: { name: 'echo', arguments: '{\\"text\\":\\"smoke\\"}' } }] } };
        if (messages.at(-1).tool_call_id !== 'call_smoke') throw new Error('tool result did not preserve native call id');
        return { type: 'final_response', content: 'smoke complete' };
      } };
      const agent = new window.TeemoAgentCore({ aiService: ai, toolRegistry: registry });
      const run = await agent.runNativeTools({ messages: [{ role: 'user', content: 'test' }] });
      if (!run.ok || run.content !== 'smoke complete' || run.run.toolCalls.length !== 1) throw new Error('native Agent Core smoke failed');
      return { registered, nativeToolRoundTrip: true, safeFileToolRendererDirectFs: false, safeFileToolIpcOnly: true };
    })()`);
    console.log(JSON.stringify({ ok: true, formalUserDataTouched: false, result }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});

app.on('window-all-closed', () => {});
