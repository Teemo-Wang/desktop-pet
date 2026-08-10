const TeemoInspirationContracts = require('./TeemoInspirationContracts');
const TeemoInspirationIndexClient = require('./TeemoInspirationIndexClient');

function registerTeemoInspirationIndexIpc(ipcMain, options = {}) {
  const indexService = options.indexService;
  const sourceService = options.sourceService;
  const permissionService = options.permissionService;
  const inspirationStateService = options.inspirationStateService || null;
  if (!ipcMain || !indexService || !sourceService || !permissionService) {
    throw new Error('Teemo Inspiration Index IPC dependencies are incomplete.');
  }
  const channels = TeemoInspirationIndexClient.CHANNELS;
  const operations = new Map();

  function inspirationEnabled() {
    if (!inspirationStateService) return true;
    inspirationStateService.reload();
    return inspirationStateService.isEnabled();
  }

  ipcMain.handle(channels.getSource, (_event, payload = {}) => {
    try {
      const sourceId = TeemoInspirationContracts.safeText(payload.sourceId, 120);
      if (!sourceId) throw TeemoInspirationContracts.inspirationError('requestInvalid');
      if (!inspirationEnabled()) return { ok: true, snapshot: { status: 'DISABLED', sourceId, items: [], total: 0, hasMore: false } };
      return {
        ok: true,
        snapshot: indexService.getSourceSnapshot(sourceId, {
          offset: payload.offset,
          limit: payload.limit,
          preferRuntime: true,
        }),
      };
    } catch (error) {
      return { ok: false, error: TeemoInspirationContracts.publicError(error) };
    }
  });

  ipcMain.handle(channels.scan, async (event, payload = {}) => {
    const requestId = TeemoInspirationContracts.safeText(payload.requestId, 160);
    const sourceId = TeemoInspirationContracts.safeText(payload.sourceId, 120);
    const mode = TeemoInspirationContracts.safeText(payload.mode, 20);
    const toolCallId = TeemoInspirationContracts.safeText(payload.toolCallId, 120);
    const runId = payload.runId == null ? null : TeemoInspirationContracts.safeText(payload.runId, 120);
    const sessionId = payload.sessionId == null ? null : TeemoInspirationContracts.safeText(payload.sessionId, 120);
    const sourceKind = TeemoInspirationContracts.safeText(payload.sourceKind, 32);
    if (!requestId || !sourceId || !['build', 'refresh', 'rebuild'].includes(mode) || operations.has(requestId)) {
      return { ok: false, error: TeemoInspirationContracts.publicError({ code: 'INSPIRATION_REQUEST_INVALID' }) };
    }
    if (!inspirationEnabled()) {
      return { ok: false, error: TeemoInspirationContracts.publicError({ code: 'INSPIRATION_DISABLED' }) };
    }
    let trustedSource;
    try { trustedSource = sourceService.getSource(sourceId); }
    catch (error) { return { ok: false, error: TeemoInspirationContracts.publicError(error) }; }
    if (!['local_folder', 'eagle_library'].includes(trustedSource.kind)
      || sourceKind !== trustedSource.kind) {
      return { ok: false, error: TeemoInspirationContracts.publicError({ code: 'INSPIRATION_PERMISSION_DENIED' }) };
    }
    const resourceType = trustedSource.kind === 'eagle_library' ? 'eagle-library' : 'local-folder';
    const resource = `inspiration://${resourceType}/${encodeURIComponent(sourceId)}`;
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId,
      runId,
      sessionId,
      toolName: 'inspiration_metadata_index',
      permission: 'read',
      resource,
    })) {
      return { ok: false, error: TeemoInspirationContracts.publicError({ code: 'INSPIRATION_PERMISSION_DENIED' }) };
    }
    const operation = { requestId, sourceId, senderId: event.sender.id, cancelled: false };
    operation.inspirationEnabled = true;
    operation.inspirationCheckedAt = Date.now();
    operations.set(requestId, operation);
    try {
      const data = await indexService.scan(sourceId, mode, {
        scanId: requestId,
        checkCancelled: () => {
          if (operation.cancelled) return true;
          const now = Date.now();
          if (now - operation.inspirationCheckedAt >= 100) {
            operation.inspirationEnabled = inspirationEnabled();
            operation.inspirationCheckedAt = now;
          }
          return !operation.inspirationEnabled;
        },
        onProgress: progress => {
          if (!operation.cancelled && !event.sender.isDestroyed()) {
            event.sender.send(channels.progress, { requestId, sourceId, progress });
          }
        },
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: TeemoInspirationContracts.publicError(error) };
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

  ipcMain.handle(channels.discardAuthorization, (_event, payload = {}) => {
    const toolCallId = TeemoInspirationContracts.safeText(payload.toolCallId, 120);
    if (!toolCallId.startsWith('inspiration_index_')) return false;
    return permissionService.discardExecutionAuthorization(toolCallId);
  });

  ipcMain.handle(channels.resetCorrupt, () => {
    try {
      if (!inspirationEnabled()) return { ok: false, error: TeemoInspirationContracts.publicError({ code: 'INSPIRATION_DISABLED' }) };
      return { ok: true, data: indexService.resetCorruptIndex() };
    }
    catch (error) { return { ok: false, error: TeemoInspirationContracts.publicError(error) }; }
  });

  return { channels, operations };
}

module.exports = registerTeemoInspirationIndexIpc;
