const path = require('path');
const TeemoEagleLibraryClient = require('./TeemoEagleLibraryClient');
const TeemoInspirationContracts = require('./TeemoInspirationContracts');

function publicError(error) {
  return TeemoInspirationContracts.publicError(error);
}

function registerTeemoEagleLibraryIpc(ipcMain, options = {}) {
  const sourceService = options.sourceService;
  const eagleLibraryService = options.eagleLibraryService;
  const permissionService = options.permissionService;
  const fileService = options.fileService;
  const rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
  const saveRoots = typeof options.saveRoots === 'function' ? options.saveRoots : () => {};
  const selectFolder = typeof options.selectFolder === 'function' ? options.selectFolder : null;
  if (!ipcMain || !sourceService || !eagleLibraryService || !permissionService || !fileService || !selectFolder) {
    throw new Error('Teemo Eagle Library IPC dependencies are incomplete.');
  }
  const channels = TeemoEagleLibraryClient.CHANNELS;
  const operations = new Map();

  function covers(roots, selected) {
    return roots.some(root => {
      try { return fileService.isPathWithinRoot(fileService.canonicalPath(root), selected); } catch (_) { return false; }
    });
  }

  function publicSnapshot() {
    const state = sourceService.reload();
    return { schemaVersion: state.schemaVersion, revision: state.revision };
  }

  ipcMain.handle(channels.selectAndAdd, async (event, payload = {}) => {
    try {
      const selectedPath = await selectFolder(event);
      if (!selectedPath) return { ok: false, canceled: true };
      const selected = fileService.canonicalPath(selectedPath);
      const roots = rootsProvider();
      if (!covers(roots, selected)) return { ok: false, error: { code: 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', message: 'Eagle 灵感库必须位于当前已授权文件夹内' } };
      sourceService.addEagleLibrary({ rootPath: selected, displayName: path.basename(selected) }, { expectedRevision: payload.expectedRevision });
      return { ok: true, snapshot: publicSnapshot() };
    } catch (error) { return { ok: false, error: publicError(error) }; }
  });

  ipcMain.handle(channels.reauthorize, async (event, payload = {}) => {
    try {
      const source = sourceService.getSource(payload.sourceId);
      if (source.kind !== 'eagle_library') throw TeemoInspirationContracts.inspirationError('sourceInvalid', '不是 Eagle 灵感库来源');
      const selectedPath = await selectFolder(event);
      if (!selectedPath) return { ok: false, canceled: true };
      const selected = fileService.canonicalPath(selectedPath);
      if ((process.platform === 'win32' ? selected.toLowerCase() : selected) !== (process.platform === 'win32' ? source.rootPath.toLowerCase() : source.rootPath)) {
        return { ok: false, error: { code: 'INSPIRATION_SOURCE_MISMATCH', message: '请选择原来的 Eagle 灵感库文件夹' } };
      }
      const roots = rootsProvider();
      if (!covers(roots, selected)) return { ok: false, error: { code: 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', message: 'Eagle 灵感库需要重新授权' } };
      return { ok: true, snapshot: publicSnapshot() };
    } catch (error) { return { ok: false, error: publicError(error) }; }
  });

  ipcMain.handle(channels.execute, async (event, payload = {}) => {
    const requestId = TeemoInspirationContracts.safeText(payload.requestId, 160);
    const sourceId = TeemoInspirationContracts.safeText(payload.request && payload.request.sourceId, 120);
    if (!requestId || !sourceId || operations.has(requestId)) return { ok: false, error: { code: 'INSPIRATION_REQUEST_INVALID', message: 'Eagle 灵感请求无效' } };
    if (Array.from(operations.values()).filter(item => item.senderId === event.sender.id).length >= 32) return { ok: false, error: { code: 'INSPIRATION_REQUEST_INVALID', message: 'Eagle 灵感请求过多，请稍后重试' } };
    const resource = `inspiration://eagle-library/${encodeURIComponent(sourceId)}`;
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId: TeemoInspirationContracts.safeText(payload.toolCallId, 120),
      runId: payload.runId == null ? null : TeemoInspirationContracts.safeText(payload.runId, 120),
      sessionId: payload.sessionId == null ? null : TeemoInspirationContracts.safeText(payload.sessionId, 120),
      toolName: 'inspiration_eagle_library', permission: 'read', resource,
    })) return { ok: false, error: { code: 'INSPIRATION_PERMISSION_DENIED', message: 'Eagle 灵感读取授权无效或已过期' } };
    const source = sourceService.getSource(sourceId);
    if (source.kind !== 'eagle_library') return { ok: false, error: { code: 'INSPIRATION_SOURCE_INVALID', message: '灵感来源类型无效' } };
    operations.set(requestId, { senderId: event.sender.id });
    try { return { ok: true, data: await eagleLibraryService.execute(payload.operation, payload.request) }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
    finally { operations.delete(requestId); }
  });

  ipcMain.handle(channels.cancel, (event, payload = {}) => {
    const operation = operations.get(String(payload.requestId || ''));
    return Boolean(operation && operation.senderId === event.sender.id);
  });
  return { channels, operations };
}

module.exports = registerTeemoEagleLibraryIpc;
