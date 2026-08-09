const path = require('path');
const TeemoLocalFolderClient = require('./TeemoLocalFolderClient');
const TeemoInspirationContracts = require('./TeemoInspirationContracts');

function publicError(error) {
  return TeemoInspirationContracts.publicError(error);
}

function registerTeemoLocalFolderIpc(ipcMain, options = {}) {
  const sourceService = options.sourceService;
  const localFolderService = options.localFolderService;
  const permissionService = options.permissionService;
  const rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
  const saveRoots = typeof options.saveRoots === 'function' ? options.saveRoots : () => {};
  const selectFolder = typeof options.selectFolder === 'function' ? options.selectFolder : null;
  const fileService = options.fileService;
  if (!ipcMain || !sourceService || !localFolderService || !permissionService || !fileService || !selectFolder) {
    throw new Error('Teemo Local Folder IPC dependencies are incomplete.');
  }
  const channels = TeemoLocalFolderClient.CHANNELS;
  const operations = new Map();

  function samePath(left, right) {
    return process.platform === 'win32'
      ? String(left).toLowerCase() === String(right).toLowerCase()
      : String(left) === String(right);
  }

  function publicSnapshot() {
    const snapshot = sourceService.reload();
    if (snapshot.stateError) return snapshot;
    const roots = rootsProvider().map(root => path.resolve(root));
    return {
      schemaVersion: snapshot.schemaVersion,
      revision: snapshot.revision,
      sources: snapshot.sources.map(source => ({
        sourceId: source.sourceId,
        kind: source.kind,
        displayName: source.displayName,
        folderName: path.basename(source.rootPath),
        status: roots.some(root => fileService.isPathWithinRoot(root, source.rootPath)) ? 'CONFIGURED' : 'AUTHORIZATION_REQUIRED',
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      })),
    };
  }

  ipcMain.handle(channels.listSources, () => {
    try { return { ok: true, snapshot: publicSnapshot() }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
  });

  ipcMain.handle(channels.selectAndAdd, async (event, payload = {}) => {
    try {
      const selectedPath = await selectFolder(event);
      if (!selectedPath) return { ok: false, canceled: true };
      const selected = fileService.canonicalPath(selectedPath);
      const roots = rootsProvider();
      const covered = roots.some(root => {
        try { return fileService.isPathWithinRoot(fileService.canonicalPath(root), selected); } catch (_) { return false; }
      });
      if (!covered) saveRoots([...roots, selected]);
      sourceService.addLocalFolder({ rootPath: selected, displayName: path.basename(selected) }, {
        expectedRevision: payload.expectedRevision,
      });
      return { ok: true, snapshot: publicSnapshot() };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.removeSource, (_event, payload = {}) => {
    try {
      sourceService.removeSource(payload.sourceId, { expectedRevision: payload.expectedRevision });
      return { ok: true, snapshot: publicSnapshot() };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.reauthorize, async (event, payload = {}) => {
    try {
      const source = sourceService.getSource(payload.sourceId);
      const selectedPath = await selectFolder(event);
      if (!selectedPath) return { ok: false, canceled: true };
      const selected = fileService.canonicalPath(selectedPath);
      if (!samePath(selected, source.rootPath)) {
        return { ok: false, error: { code: 'INSPIRATION_SOURCE_MISMATCH', message: '请选择原来的灵感来源文件夹' } };
      }
      const roots = rootsProvider();
      const covered = roots.some(root => {
        try { return fileService.isPathWithinRoot(fileService.canonicalPath(root), selected); } catch (_) { return false; }
      });
      if (!covered) saveRoots([...roots, selected]);
      return { ok: true, snapshot: publicSnapshot() };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.execute, async (event, payload = {}) => {
    const requestId = TeemoInspirationContracts.safeText(payload.requestId, 160);
    const sourceId = TeemoInspirationContracts.safeText(payload.request && payload.request.sourceId, 120);
    if (!requestId || !sourceId || operations.has(requestId)) {
      return { ok: false, error: { code: 'INSPIRATION_REQUEST_INVALID', message: '本地灵感请求无效' } };
    }
    if (Array.from(operations.values()).filter(item => item.senderId === event.sender.id).length >= 32) {
      return { ok: false, error: { code: 'INSPIRATION_REQUEST_INVALID', message: '本地灵感请求过多，请稍后重试' } };
    }
    const toolCallId = TeemoInspirationContracts.safeText(payload.toolCallId, 120);
    const resource = `inspiration://local-folder/${encodeURIComponent(sourceId)}`;
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId,
      runId: payload.runId == null ? null : TeemoInspirationContracts.safeText(payload.runId, 120),
      sessionId: payload.sessionId == null ? null : TeemoInspirationContracts.safeText(payload.sessionId, 120),
      toolName: 'inspiration_local_folder',
      permission: 'read',
      resource,
    })) {
      return { ok: false, error: { code: 'INSPIRATION_PERMISSION_DENIED', message: '本地灵感读取授权无效或已过期' } };
    }
    const operation = { requestId, senderId: event.sender.id, cancelled: false };
    operations.set(requestId, operation);
    try {
      const data = await localFolderService.execute(payload.operation, payload.request, {
        checkCancelled: () => operation.cancelled,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      operations.delete(requestId);
    }
  });

  ipcMain.handle(channels.cancel, (event, payload = {}) => {
    const operation = operations.get(String(payload.requestId || ''));
    if (!operation || operation.senderId !== event.sender.id) return false;
    operation.cancelled = true;
    return true;
  });

  return { channels, operations, publicSnapshot, samePath };
}

module.exports = registerTeemoLocalFolderIpc;
