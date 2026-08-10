const TeemoInspirationContracts = require('./TeemoInspirationContracts');
const TeemoInspirationRetrievalClient = require('./TeemoInspirationRetrievalClient');

function registerTeemoInspirationRetrievalIpc(ipcMain, options = {}) {
  const retrievalService = options.retrievalService;
  if (!ipcMain || !retrievalService) throw new Error('Teemo Inspiration Retrieval IPC dependencies are incomplete.');
  const channels = TeemoInspirationRetrievalClient.CHANNELS;

  ipcMain.handle(channels.search, (_event, payload = {}) => {
    try {
      const input = {
        query: TeemoInspirationContracts.safeText(payload.query, 160),
        sourceId: payload.sourceId == null ? '' : TeemoInspirationContracts.safeText(payload.sourceId, 120),
        format: payload.format == null ? '' : TeemoInspirationContracts.safeText(payload.format, 40),
        orientation: TeemoInspirationContracts.safeText(payload.orientation, 20),
        minWidth: payload.minWidth,
        minHeight: payload.minHeight,
        sort: TeemoInspirationContracts.safeText(payload.sort, 20),
        offset: payload.offset,
        limit: payload.limit,
      };
      return { ok: true, result: retrievalService.search(input) };
    } catch (error) {
      return { ok: false, error: TeemoInspirationContracts.publicError(error) };
    }
  });

  return { channels };
}

module.exports = registerTeemoInspirationRetrievalIpc;
