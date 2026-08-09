(function (root, factory) {
  const Contracts = root && root.TeemoInspirationContracts
    ? root.TeemoInspirationContracts
    : require('./TeemoInspirationContracts');
  const Registry = factory(Contracts);
  if (root) root.TeemoInspirationConnectorRegistry = Registry;
  if (typeof window !== 'undefined') window.TeemoInspirationConnectorRegistry = Registry;
  if (typeof module === 'object' && module.exports) module.exports = Registry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contracts) {
  const CAPABILITY_METHODS = Object.freeze({
    health: 'healthCheck',
    list_items: 'listItems',
    item_metadata: 'getItemMetadata',
    preview: 'getPreview',
  });

  class TeemoInspirationConnectorRegistry {
    constructor() {
      this.connectors = new Map();
    }

    register(connector) {
      if (!connector || typeof connector.getDefinition !== 'function') {
        throw Contracts.inspirationError('connectorInvalid', 'Connector 必须提供 getDefinition');
      }
      let definition;
      try {
        definition = connector.getDefinition();
      } catch (_) {
        throw Contracts.inspirationError('connectorInvalid', 'Connector Definition 无法读取');
      }
      const validation = Contracts.validateDefinition(definition);
      if (!validation.ok) {
        throw Contracts.inspirationError('connectorInvalid', 'Connector Definition 无效', { fields: validation.errors });
      }
      const normalized = validation.value;
      if (this.connectors.has(normalized.connectorId)) {
        throw Contracts.inspirationError('connectorInvalid', 'Connector 已注册');
      }
      for (const method of Contracts.FORBIDDEN_METHODS) {
        if (typeof connector[method] === 'function') {
          throw Contracts.inspirationError('connectorInvalid', '只读 Connector 不得提供写入方法');
        }
      }
      for (const capability of normalized.capabilities) {
        const method = CAPABILITY_METHODS[capability];
        if (!method || typeof connector[method] !== 'function') {
          throw Contracts.inspirationError('connectorInvalid', 'Connector Capability 缺少对应只读方法', { capability });
        }
      }
      const record = Object.freeze({ connector, definition: Object.freeze(Contracts.clone(normalized)) });
      this.connectors.set(normalized.connectorId, record);
      return Contracts.clone(record.definition);
    }

    has(connectorId) {
      return this.connectors.has(Contracts.safeText(connectorId, 100));
    }

    getConnector(connectorId) {
      const id = Contracts.safeText(connectorId, 100);
      const record = this.connectors.get(id);
      if (!record) throw Contracts.inspirationError('connectorNotFound', 'Connector 不存在');
      return record.connector;
    }

    getDefinition(connectorId) {
      const id = Contracts.safeText(connectorId, 100);
      const record = this.connectors.get(id);
      if (!record) throw Contracts.inspirationError('connectorNotFound', 'Connector 不存在');
      return Contracts.clone(record.definition);
    }

    listDefinitions() {
      return Array.from(this.connectors.values()).map(record => Contracts.clone(record.definition));
    }
  }

  TeemoInspirationConnectorRegistry.CAPABILITY_METHODS = CAPABILITY_METHODS;
  return TeemoInspirationConnectorRegistry;
});
