const TeemoPermissionClient = require('./TeemoPermissionClient');

function registerTeemoPermissionIpc(ipcMain, permissionService) {
  if (!ipcMain || !permissionService) throw new Error('Permission IPC requires ipcMain and a service.');
  const channels = TeemoPermissionClient.CHANNELS;
  const owners = new Map();

  ipcMain.handle(channels.request, async (event, request = {}) => {
    const senderId = event.sender.id;
    let ownedRequestId = null;
    try {
      return await permissionService.requestPermission(request, {
        onPrompt: publicRequest => {
          ownedRequestId = publicRequest.permissionRequestId;
          owners.set(ownedRequestId, { senderId, toolCallId: publicRequest.toolCallId });
          if (!event.sender.isDestroyed()) event.sender.send(channels.prompt, publicRequest);
        },
      });
    } finally {
      if (ownedRequestId) owners.delete(ownedRequestId);
    }
  });

  ipcMain.handle(channels.respond, (event, payload = {}) => {
    const permissionRequestId = String(payload.permissionRequestId || '');
    const owner = owners.get(permissionRequestId);
    if (!owner || owner.senderId !== event.sender.id) return false;
    return permissionService.respond(permissionRequestId, payload.response || {});
  });

  ipcMain.handle(channels.cancel, (event, payload = {}) => {
    const senderId = event.sender.id;
    const requestedId = String(payload.permissionRequestId || '');
    const requestedToolCallId = String(payload.toolCallId || '');
    let cancelled = 0;
    for (const [permissionRequestId, owner] of owners) {
      if (owner.senderId !== senderId) continue;
      if ((requestedId && requestedId === permissionRequestId)
        || (requestedToolCallId && requestedToolCallId === owner.toolCallId)) {
        cancelled += permissionService.cancel({ permissionRequestId });
      }
    }
    return cancelled;
  });

  ipcMain.handle(channels.evaluate, (_event, request = {}) => permissionService.evaluate(request));
  ipcMain.handle(channels.list, (_event, filters = {}) => permissionService.listGrants(filters));
  ipcMain.handle(channels.revoke, (_event, { grantId } = {}) => permissionService.revoke(grantId));
  ipcMain.handle(channels.clearSession, (_event, { sessionId } = {}) => permissionService.clearSessionGrants(sessionId));

  return { channels, owners };
}

module.exports = registerTeemoPermissionIpc;
