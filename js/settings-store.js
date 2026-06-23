/**
 * 设置持久化模块
 */

(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const STORE_DIR = path.join(os.homedir(), '.hellobike-pet');
  const STORE_FILE = path.join(STORE_DIR, 'settings.json');

  const DEFAULT_SETTINGS = {
    general: {
      autoStart: false,
      alwaysOnTop: true,
      opacity: 100,
      scale: 100,
      snapToEdge: true,
      minimizeToTray: false,
    },
    appearance: {
      petSize: 'medium',
      defaultAction: 'idle',
      idleAnimation: 'float',
      messageReaction: 'bounce',
      expressionMode: 'auto',
    },
    work: {
      dingtalkNotify: true,
      aiAssistant: true,
      yuqueAccess: true,
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
    },
    model: {
      provider: 'openai',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      systemPrompt: '你是哈啰出行的AI助手，名叫哈啰小哈。你性格活泼友好，回答简洁有用。',
    }
  };

  function deepMerge(defaults, overrides) {
    const result = JSON.parse(JSON.stringify(defaults));
    for (const key of Object.keys(overrides)) {
      if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
          && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = deepMerge(result[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    return result;
  }

  class SettingsStore {
    constructor() {
      this.settings = null;
      this._ensureDir();
      this._load();
    }

    _ensureDir() {
      if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    }

    _load() {
      try {
        if (fs.existsSync(STORE_FILE)) {
          const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
          this.settings = deepMerge(DEFAULT_SETTINGS, saved);
        } else {
          this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          this._save();
        }
      } catch (e) {
        this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }
    }

    _save() {
      try { fs.writeFileSync(STORE_FILE, JSON.stringify(this.settings, null, 2), 'utf-8'); } catch(e) {}
    }

    get(group) { return group ? this.settings[group] : this.settings; }
    getValue(group, key) { return this.settings[group]?.[key]; }

    setValue(group, key, value) {
      if (!this.settings[group]) return;
      this.settings[group][key] = value;
      this._save();
    }

    reset(group) {
      if (group) this.settings[group] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[group]));
      else this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this._save();
    }
  }

  window.SettingsStore = SettingsStore;
})();
