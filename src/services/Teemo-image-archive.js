/**
 * Teemo 聊天生图存档：自动保存到 D:\Teemo助手，并提供打开文件夹能力。
 */
(function() {
  const { ipcRenderer } = require('electron');

  const DEFAULTS = {
    enabled: true,
    dir: 'D:\\Teemo助手',
    comfyOutputDir: 'I:\\ComfyUI\\ComfyUI\\output',
  };

  class TeemoImageArchiveService {
    getConfig(store) {
      const saved = store && store.get ? (store.get('imageArchive') || {}) : {};
      return { ...DEFAULTS, ...saved };
    }

    async openFolder(folderPath) {
      if (!ipcRenderer) return { ok: false, error: '当前环境不支持打开文件夹' };
      return ipcRenderer.invoke('teemo:open-folder', { folderPath });
    }

    async openComfyOutput(store) {
      let cfgStore = store;
      if (!cfgStore && window.SettingsStore) cfgStore = new window.SettingsStore();
      const cfg = this.getConfig(cfgStore);
      return this.openFolder(cfg.comfyOutputDir);
    }

    async openArchiveDir(store) {
      let cfgStore = store;
      if (!cfgStore && window.SettingsStore) cfgStore = new window.SettingsStore();
      const cfg = this.getConfig(cfgStore);
      return this.openFolder(cfg.dir);
    }

    /**
     * 将聊天里生成的图片存档，并写入索引文件。
     * @returns {Promise<{ok:boolean,path?:string,indexFile?:string,error?:string}>}
     */
    async saveFromChat(store, options = {}) {
      let cfgStore = store;
      if (!cfgStore && window.SettingsStore) {
        cfgStore = new window.SettingsStore();
        if (typeof cfgStore.reload === 'function') cfgStore.reload();
      }
      const cfg = this.getConfig(cfgStore);
      if (cfg.enabled === false || !options.imageUrl) return { ok: false, skipped: true };
      if (!ipcRenderer) return { ok: false, error: '当前环境不支持存档' };
      try {
        return await ipcRenderer.invoke('teemo:archive-chat-image', {
          imageUrl: options.imageUrl,
          userPrompt: options.userPrompt || '',
          source: options.source || 'chat',
          archiveDir: cfg.dir,
          directUrl: options.directUrl || '',
        });
      } catch (error) {
        console.warn('[TeemoImageArchive]', error && error.message);
        return { ok: false, error: error && error.message };
      }
    }
  }

  window.TeemoImageArchiveService = TeemoImageArchiveService;
  window.teemoImageArchive = new TeemoImageArchiveService();
})();
