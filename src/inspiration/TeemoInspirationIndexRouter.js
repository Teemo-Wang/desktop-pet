class TeemoInspirationIndexRouter {
  constructor(options = {}) {
    if (!options.sourceService || !options.localFolderScanner || !options.eagleLibraryScanner) {
      throw new Error('TeemoInspirationIndexRouter requires source service and both source scanners.');
    }
    this.sourceService = options.sourceService;
    this.scanners = Object.freeze({
      local_folder: options.localFolderScanner,
      eagle_library: options.eagleLibraryScanner,
    });
    this.hooks = options.hooks || {};
  }

  _scanner(sourceId) {
    const source = this.sourceService.getSource(sourceId);
    const scanner = this.scanners[source.kind];
    if (!scanner) {
      const error = new Error('灵感来源类型无效');
      error.code = 'INSPIRATION_SOURCE_INVALID';
      throw error;
    }
    return scanner;
  }

  inspectSource(sourceId) { return this._scanner(sourceId).inspectSource(sourceId); }
  revalidateSource(sourceContext) { return this._scanner(sourceContext.source.sourceId).revalidateSource(sourceContext); }
  scan(sourceId, options = {}) { return this._scanner(sourceId).scan(sourceId, options); }
}

module.exports = TeemoInspirationIndexRouter;
