/**
 * Teemo 视频音轨分析
 * 1. 使用随应用打包的 FFmpeg 从 MP4/MOV 提取小体积 MP3。
 * 2. 优先交给音频理解模型分析音乐、节奏、乐器和人声。
 * 3. 音频理解接口不可用时，回退到 Transcriptions API 做语音转写。
 */
(function() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { spawn } = require('child_process');

  const TEMP_ROOT = path.join(
    path.resolve(process.env.TEEMO_ASSISTANT_DATA_DIR || path.join(os.homedir(), '.hellobike-pet')),
    'Teemo-audio-temp',
  );

  function _safeJson(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function _messageFromResponse(data) {
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content.map(item => item && (item.text || item.content || '')).filter(Boolean).join('\n').trim();
    }
    return '';
  }

  class TeemoAudioAnalysisService {
    constructor(store) {
      this.store = store;
    }

    _resolveConfig() {
      const own = (this.store && this.store.get('audioModel')) || {};
      const configs = (this.store && this.store.get('providerConfigs')) || {};
      let provider = null;
      let xaiProvider = null;

      if (own.providerId && configs[own.providerId]) provider = configs[own.providerId];
      if (!provider) {
        const entries = Object.entries(configs);
        const preferred = entries.find(([id, cfg]) => {
          const label = `${id} ${cfg && cfg.label || ''} ${cfg && cfg.modelName || ''}`;
          return cfg && cfg.apiKey && cfg.baseUrl && /openai|gpt/i.test(label) && !cfg.paused;
        });
        if (preferred) provider = preferred[1];
      }
      const xaiEntry = Object.entries(configs).find(([id, cfg]) => {
        const label = `${id} ${cfg && cfg.label || ''} ${cfg && cfg.baseUrl || ''}`;
        return cfg && cfg.apiKey && cfg.baseUrl && /x\.ai|grok/i.test(label) && !cfg.paused;
      });
      if (xaiEntry) xaiProvider = xaiEntry[1];

      return {
        enabled: own.enabled !== false,
        baseUrl: String(own.baseUrl || (provider && provider.baseUrl) || '').replace(/\/+$/, ''),
        apiKey: own.apiKey || (provider && provider.apiKey) || '',
        modelName: own.modelName || 'gpt-audio-1.5',
        transcriptionModel: own.transcriptionModel || 'gpt-4o-mini-transcribe',
        xaiBaseUrl: String((xaiProvider && xaiProvider.baseUrl) || '').replace(/\/+$/, ''),
        xaiApiKey: (xaiProvider && xaiProvider.apiKey) || '',
      };
    }

    getStatus() {
      const cfg = this._resolveConfig();
      return {
        enabled: cfg.enabled,
        ready: !!(cfg.enabled && ((cfg.baseUrl && cfg.apiKey && cfg.modelName) || (cfg.xaiBaseUrl && cfg.xaiApiKey))),
        modelName: cfg.modelName,
        baseUrl: cfg.baseUrl,
      };
    }

    _ffmpegPath() {
      let binary = require('ffmpeg-static');
      if (binary && binary.includes('app.asar')) binary = binary.replace('app.asar', 'app.asar.unpacked');
      if (!binary || !fs.existsSync(binary)) throw new Error('内置 FFmpeg 不可用，请重新安装最新版 Teemo 助理');
      return binary;
    }

    async _writeSource(file, dir) {
      const ext = /\.mov$/i.test(file && file.name || '') ? '.mov' : '.mp4';
      const sourcePath = path.join(dir, `Teemo-audio-source${ext}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.promises.writeFile(sourcePath, buffer);
      return sourcePath;
    }

    _extractAudio(sourcePath, outputPath, signal) {
      return new Promise((resolve, reject) => {
        const args = [
          '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
          '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '44100', '-b:a', '96k', outputPath,
        ];
        const child = spawn(this._ffmpegPath(), args, { windowsHide: true });
        let stderr = '';
        const abort = () => child.kill();
        if (signal) signal.addEventListener('abort', abort, { once: true });
        child.stderr.on('data', chunk => { stderr += String(chunk || ''); });
        child.on('error', reject);
        child.on('close', code => {
          if (signal) signal.removeEventListener('abort', abort);
          if (signal && signal.aborted) return reject(new DOMException('已停止', 'AbortError'));
          if (code === 0 && fs.existsSync(outputPath)) return resolve(outputPath);
          const noAudio = /matches no streams|does not contain any stream|stream map.*matches no streams/i.test(stderr);
          reject(new Error(noAudio ? '视频中没有检测到音轨' : `音轨提取失败${stderr ? '：' + stderr.slice(-240) : ''}`));
        });
      });
    }

    async _analyzeWithAudioModel(audioPath, cfg, prompt, signal) {
      const audioBase64 = (await fs.promises.readFile(audioPath)).toString('base64');
      const response = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey,
        },
        body: JSON.stringify({
          model: cfg.modelName,
          modalities: ['text'],
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'input_audio', input_audio: { data: audioBase64, format: 'mp3' } },
            ],
          }],
          max_tokens: 2000,
        }),
        signal,
      });
      const raw = await response.text();
      const data = _safeJson(raw);
      if (!response.ok) throw new Error((data && data.error && (data.error.message || data.error.code)) || raw.slice(0, 300) || `HTTP ${response.status}`);
      const text = _messageFromResponse(data);
      if (!text) throw new Error('音频模型没有返回分析结果');
      return text;
    }

    async _transcribe(audioPath, cfg, signal) {
      const bytes = await fs.promises.readFile(audioPath);
      const form = new FormData();
      form.append('model', cfg.transcriptionModel);
      form.append('response_format', 'json');
      form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'Teemo-audio.mp3');
      const response = await fetch(cfg.baseUrl + '/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey },
        body: form,
        signal,
      });
      const raw = await response.text();
      const data = _safeJson(raw);
      if (!response.ok) throw new Error((data && data.error && (data.error.message || data.error.code)) || raw.slice(0, 300) || `HTTP ${response.status}`);
      const text = String((data && data.text) || raw || '').trim();
      if (!text) throw new Error('转写模型没有识别到可用人声');
      return text;
    }

    async _transcribeXai(audioPath, cfg, signal) {
      const bytes = await fs.promises.readFile(audioPath);
      const form = new FormData();
      form.append('format', 'true');
      form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'Teemo-audio.mp3');
      const response = await fetch(cfg.xaiBaseUrl + '/stt', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.xaiApiKey },
        body: form,
        signal,
      });
      const raw = await response.text();
      const data = _safeJson(raw);
      if (!response.ok) throw new Error((data && data.error && (data.error.message || data.error.code)) || raw.slice(0, 300) || `HTTP ${response.status}`);
      const text = String((data && data.text) || '').trim();
      if (!text) throw new Error('xAI 没有识别到可用人声');
      return text;
    }

    async analyzeVideo(file, options = {}) {
      const cfg = this._resolveConfig();
      if (!cfg.enabled) return { ok: false, skipped: true, error: '音频分析已关闭' };
      if ((!cfg.baseUrl || !cfg.apiKey) && (!cfg.xaiBaseUrl || !cfg.xaiApiKey)) {
        return { ok: false, skipped: true, error: '未找到可用的 GPT 音频接口或 xAI 转写接口，请在设置中配置音频分析 API' };
      }

      const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
      const dir = path.join(TEMP_ROOT, `Teemo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const outputPath = path.join(dir, 'Teemo-audio.mp3');
      await fs.promises.mkdir(dir, { recursive: true });
      try {
        onStatus('正在读取视频并提取音轨…');
        const sourcePath = await this._writeSource(file, dir);
        await this._extractAudio(sourcePath, outputPath, options.signal);
        onStatus(`正在用 ${cfg.modelName} 分析声音…`);
        const prompt = options.prompt || [
          '请完整分析这段视频音轨。',
          '用中文输出：1. 是否有人声及说话/歌词内容；2. 音乐类型与情绪；3. 主要乐器/音色；4. 速度、节拍与节奏特点；5. 音量、动态和关键时间点；6. 与短视频画面或剪辑的配合建议。',
          '无法确定的内容请明确标注，不要臆测。',
        ].join('\n');
        try {
          if (!cfg.baseUrl || !cfg.apiKey) throw new Error('未配置 GPT 音频理解接口');
          const analysis = await this._analyzeWithAudioModel(outputPath, cfg, prompt, options.signal);
          return { ok: true, mode: 'analysis', model: cfg.modelName, text: analysis };
        } catch (audioError) {
          onStatus(`${cfg.modelName} 不可用，正在回退到语音转写…`);
          try {
            let transcript = '';
            let transcriptModel = cfg.transcriptionModel;
            let openaiTranscriptionError = null;
            if (cfg.baseUrl && cfg.apiKey) {
              try {
                transcript = await this._transcribe(outputPath, cfg, options.signal);
              } catch (error) {
                openaiTranscriptionError = error;
              }
            }
            if (!transcript && cfg.xaiBaseUrl && cfg.xaiApiKey) {
              onStatus('正在使用 xAI 转写视频人声…');
              transcript = await this._transcribeXai(outputPath, cfg, options.signal);
              transcriptModel = 'xAI STT';
            }
            if (!transcript) throw openaiTranscriptionError || new Error('没有可用的语音转写接口');
            return {
              ok: true,
              mode: 'transcription',
              model: transcriptModel,
              text: `音频接口仅完成了人声转写，未完成音乐特征识别。\n\n【人声转写】\n${transcript}`,
              warning: audioError.message,
            };
          } catch (transcriptionError) {
            throw new Error(`音频分析接口不可用：${audioError.message}；转写回退也失败：${transcriptionError.message}`);
          }
        }
      } finally {
        fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  window.TeemoAudioAnalysisService = TeemoAudioAnalysisService;
})();
