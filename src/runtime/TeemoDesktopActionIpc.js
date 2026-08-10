const TeemoDesktopActionClient = require('./TeemoDesktopActionClient');

function publicError(error) {
  if (error && error.teemoSafe === true && error.code) {
    return { code: error.code, message: String(error.message || 'Desktop action failed safely.') };
  }
  return { code: 'DESKTOP_ACTION_FAILED', message: 'Desktop action failed safely.' };
}

function safeId(value, maxLength = 200) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : '';
}

function registerTeemoDesktopActionIpc(ipcMain, options = {}) {
  const desktopActionService = options.desktopActionService;
  const permissionService = options.permissionService;
  if (!ipcMain || !desktopActionService || !permissionService) {
    throw new Error('Teemo Desktop Action IPC dependencies are incomplete.');
  }
  const operations = new Map();
  const operationTtlMs = Number.isInteger(options.operationTtlMs) && options.operationTtlMs > 0
    ? options.operationTtlMs
    : 45 * 1000;
  const channels = TeemoDesktopActionClient.CHANNELS;

  function ownerId(event) {
    return `webcontents_${event.sender.id}`;
  }

  function releaseOperation(operation) {
    if (!operation) return;
    operations.delete(operation.actionId);
    if (operation.timer) clearTimeout(operation.timer);
    permissionService.discardExecutionAuthorization(operation.toolCallId);
    try { desktopActionService.release(operation.ownerId, operation.actionId); } catch (_) { /* already consumed or expired */ }
  }

  function cleanup() {
    const now = Date.now();
    for (const operation of Array.from(operations.values())) {
      if (operation.expiresAt <= now) releaseOperation(operation);
    }
    desktopActionService.cleanup();
  }

  function ownedOperation(event, actionId) {
    cleanup();
    const operation = operations.get(safeId(actionId, 200));
    if (!operation || operation.ownerId !== ownerId(event) || operation.expiresAt <= Date.now()) return null;
    return operation;
  }

  function disposeOwner(owner) {
    for (const operation of Array.from(operations.values())) {
      if (operation.ownerId === owner) releaseOperation(operation);
    }
    try { desktopActionService.disposeOwner(owner); } catch (_) { /* owner already invalid */ }
  }

  function bindOwner(event) {
    if (event.sender.__teemoDesktopActionOwnerBound) return;
    event.sender.__teemoDesktopActionOwnerBound = true;
    event.sender.once('destroyed', () => disposeOwner(`webcontents_${event.sender.id}`));
  }

  ipcMain.handle(channels.prepare, async (event, payload = {}) => {
    try {
      bindOwner(event);
      cleanup();
      const toolCallId = safeId(payload.toolCallId, 160);
      if (!toolCallId || payload.sessionId != null) {
        return { ok: false, error: { code: 'DESKTOP_ACTION_REQUEST_INVALID', message: 'Desktop action request is invalid.' } };
      }
      const prepared = await desktopActionService.prepare(ownerId(event), payload.snapshotId, payload.point);
      const operation = {
        actionId: prepared.actionId,
        ownerId: ownerId(event),
        snapshotId: safeId(payload.snapshotId, 200),
        toolCallId,
        runId: safeId(payload.runId, 160) || null,
        sessionId: null,
        resource: prepared.resource,
        expiresAt: Date.now() + operationTtlMs,
        timer: null,
      };
      operation.timer = setTimeout(() => releaseOperation(operation), operationTtlMs);
      if (operation.timer && typeof operation.timer.unref === 'function') operation.timer.unref();
      operations.set(operation.actionId, operation);
      return {
        ok: true,
        actionId: operation.actionId,
        resource: operation.resource,
        reason: prepared.reason,
        expiresAt: prepared.expiresAt,
      };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.execute, async (event, payload = {}) => {
    const operation = ownedOperation(event, payload.actionId);
    if (!operation) {
      return { ok: false, error: { code: 'DESKTOP_ACTION_UNAVAILABLE', message: 'Prepared desktop action is unavailable.' } };
    }
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId: operation.toolCallId,
      runId: operation.runId,
      sessionId: null,
      toolName: 'desktop_primary_click',
      permission: 'execute',
      resource: operation.resource,
    })) {
      releaseOperation(operation);
      return { ok: false, error: { code: 'PERMISSION_CHECK_FAILED', message: 'Desktop action authorization is missing or invalid.' } };
    }
    operations.delete(operation.actionId);
    if (operation.timer) clearTimeout(operation.timer);
    try {
      return { ok: true, result: await desktopActionService.execute(operation.ownerId, operation.actionId) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.release, (event, payload = {}) => {
    const operation = ownedOperation(event, payload.actionId);
    if (!operation) return { ok: true, released: false };
    releaseOperation(operation);
    return { ok: true, released: true };
  });

  return {
    channels,
    operations,
    discardSnapshot(owner, snapshotId) {
      let released = 0;
      for (const operation of Array.from(operations.values())) {
        if (operation.ownerId === owner && operation.snapshotId === snapshotId) {
          releaseOperation(operation);
          released += 1;
        }
      }
      try { desktopActionService.releaseSnapshot(owner, snapshotId); } catch (_) { /* no matching action */ }
      return released;
    },
    disposeOwner,
  };
}

module.exports = registerTeemoDesktopActionIpc;
