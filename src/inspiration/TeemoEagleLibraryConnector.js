(function (root, factory) {
  const Connector = factory();
  if (root) root.TeemoEagleLibraryConnector = Connector;
  if (typeof window !== 'undefined') window.TeemoEagleLibraryConnector = Connector;
  if (typeof module === 'object' && module.exports) module.exports = Connector;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class TeemoEagleLibraryConnector {
    constructor(options = {}) { this.client = options.client || null; }
    getDefinition() {
      return { connectorId: 'eagle-library', kind: 'eagle_library', displayName: 'Eagle-compatible 灵感库', version: '1.0.0', readOnly: true,
        capabilities: ['health', 'list_items', 'item_metadata', 'preview'], authorization: { type: 'p1_authorized_root_and_source_permission' },
        offlineBehavior: 'live_local_only', privacyClass: 'private_local_source' };
    }
    _execute(operation, request, context) {
      if (!this.client || typeof this.client.execute !== 'function') { const error = new Error('Eagle 灵感库暂不可用'); error.code = 'INSPIRATION_CONNECTOR_UNAVAILABLE'; throw error; }
      return this.client.execute(operation, request, context);
    }
    healthCheck(request, context) { return this._execute('health', request, context); }
    listItems(request, context) { return this._execute('list_items', request, context); }
    getItemMetadata(request, context) { return this._execute('item_metadata', request, context); }
    getPreview(request, context) { return this._execute('preview', request, context); }
  }
  return TeemoEagleLibraryConnector;
});
