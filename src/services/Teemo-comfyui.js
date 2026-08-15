/**
 * Teemo ComfyUI 本地生图服务
 * 使用 ComfyUI 原生 /prompt、/ws、/history、/view 接口。
 */
(function() {
  const crypto = require('crypto');
  const fs = require('fs');
  const WebSocket = require('ws');

  const DEFAULT_CONFIG = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:8188',
    checkpoint: 'SDXL\\Realistic\\speciosa25D_v12.safetensors',
    width: 1024,
    height: 1024,
    steps: 26,
    cfg: 5.5,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    negativePrompt: 'worst quality, low quality, lowres, blurry, deformed, bad anatomy, extra fingers, extra limbs, watermark, signature, jpeg artifacts',
  };

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function imageDimension(value, fallback) {
    return Math.round(clampNumber(value, fallback, 256, 2048) / 64) * 64;
  }

  class TeemoComfyUIService {
    constructor(store) {
      this.store = store || null;
      this.configure(store && store.get ? store.get('comfyui') : {});
    }

    configure(config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
      this.config.baseUrl = String(this.config.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, '');
      return this.config;
    }

    reload() {
      if (this.store && typeof this.store.reload === 'function') this.store.reload();
      return this.configure(this.store && this.store.get ? this.store.get('comfyui') : this.config);
    }

    getConfig() {
      return { ...this.config };
    }

    isEnabled() {
      return this.config.enabled !== false;
    }

    isImageRequest(text) {
      const value = String(text || '').trim();
      if (!value) return false;
      return /(生(?:一|个|张|幅)?(?:张)?图|生成(?:一张|一个|图片|图像|海报|插画|照片|壁纸|头像|图)|画(?:图|一张|一个|个|幅)|来(?:一|个|张|幅)?(?:张)?图|做(?:一张|一个|个).{0,8}(?:图|海报|插画|封面)|出(?:一张|一个|个).{0,6}(?:图|海报)|文生图|text[\s-]*to[\s-]*image)/i.test(value);
    }

    _isBareImageCommand(text) {
      return /^(?:请|麻烦)?(?:帮我)?(?:生|生成|来|做|画|出)(?:一|个|张|幅)?(?:张)?(?:图|图片|图像)(?:吧|呗|看看|试试)?[。！!？?\s]*$/i
        .test(String(text || '').trim());
    }

    isBareImageCommand(text) {
      return this._isBareImageCommand(text);
    }

    async _json(pathname, options = {}) {
      let response;
      try {
        response = await fetch(this.config.baseUrl + pathname, {
          ...options,
          signal: options.signal || AbortSignal.timeout(15000),
        });
      } catch (error) {
        throw new Error(`无法连接 ComfyUI（${this.config.baseUrl}）。请先启动 ComfyUI，再重试。${error && error.message ? ` ${error.message}` : ''}`);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ComfyUI 请求失败（${response.status}）${detail ? `：${detail.slice(0, 300)}` : ''}`);
      }
      return response.json();
    }

    async ping() {
      const stats = await this._json('/system_stats');
      const device = stats && stats.devices && stats.devices[0];
      return {
        ok: true,
        version: stats && stats.system ? stats.system.comfyui_version : '',
        device: device ? (device.name || device.type || '') : '',
        vramTotal: device ? Number(device.vram_total || 0) : 0,
        vramFree: device ? Number(device.vram_free || 0) : 0,
      };
    }

    async listCheckpoints() {
      const data = await this._json('/object_info/CheckpointLoaderSimple');
      const options = data && data.CheckpointLoaderSimple
        && data.CheckpointLoaderSimple.input
        && data.CheckpointLoaderSimple.input.required
        && data.CheckpointLoaderSimple.input.required.ckpt_name;
      return Array.isArray(options) && Array.isArray(options[0]) ? options[0] : [];
    }

    _resolveDimensions(options = {}) {
      let width = options.width;
      let height = options.height;
      const match = String(options.size || '').match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
      if (match) {
        width = Number(match[1]);
        height = Number(match[2]);
      }
      return {
        width: imageDimension(width, imageDimension(this.config.width, 1024)),
        height: imageDimension(height, imageDimension(this.config.height, 1024)),
      };
    }

    analyzeWorkflow(workflow) {
      if (!workflow || Array.isArray(workflow) || typeof workflow !== 'object') {
        throw new Error('工作流 JSON 不是 ComfyUI API 格式。请在开发者模式中选择“导出（API 格式）”。');
      }
      const entries = Object.entries(workflow);
      if (!entries.length || entries.some(([, node]) => !node || typeof node !== 'object' || !node.class_type)) {
        throw new Error('工作流缺少 class_type，当前文件可能是普通界面工作流，不是 API JSON。');
      }

      const mapping = {
        promptTargets: [],
        negativeTargets: [],
        seedTargets: [],
        sizeTargets: [],
        outputNodes: [],
      };
      const addTarget = (list, nodeId, input) => {
        if (!list.some(item => item.nodeId === String(nodeId) && item.input === input)) {
          list.push({ nodeId: String(nodeId), input });
        }
      };

      // 优先识别带明确“用户描述”输入的自定义提示词节点。
      entries.forEach(([nodeId, node]) => {
        const inputs = node.inputs || {};
        if (Object.prototype.hasOwnProperty.call(inputs, 'seed') && typeof inputs.seed === 'number') {
          addTarget(mapping.seedTargets, nodeId, 'seed');
        }
        if (/EmptyLatentImage/i.test(node.class_type)
          && typeof inputs.width === 'number' && typeof inputs.height === 'number') {
          mapping.sizeTargets.push({ nodeId: String(nodeId), widthInput: 'width', heightInput: 'height' });
        }
        if (/SaveImage/i.test(node.class_type)) mapping.outputNodes.push(String(nodeId));
      });

      // 从采样器的正负条件连线反向查找文本输入，兼容标准 SD/SDXL 工作流。
      entries.filter(([, node]) => /Sampler/i.test(node.class_type)).forEach(([, sampler]) => {
        const inputs = sampler.inputs || {};
        [['positive', mapping.promptTargets], ['negative', mapping.negativeTargets]].forEach(([key, targetList]) => {
          const link = inputs[key];
          if (!Array.isArray(link) || !workflow[String(link[0])]) return;
          const encodeNodeId = String(link[0]);
          const encodeNode = workflow[encodeNodeId];
          const text = encodeNode.inputs && encodeNode.inputs.text;
          // 连线到 AnimaPromptComposer 等上游节点时，优先写入上游，避免误改 CLIP 的 link 数组。
          if (Array.isArray(text) && workflow[String(text[0])]) {
            const sourceId = String(text[0]);
            const source = workflow[sourceId];
            const sourceInputs = source.inputs || {};
            const preferred = ['resolved_prompt', 'prompt', 'text'].find(input => typeof sourceInputs[input] === 'string');
            if (preferred) addTarget(targetList, sourceId, preferred);
            else addTarget(targetList, encodeNodeId, 'text');
          } else if (typeof text === 'string') {
            addTarget(targetList, encodeNodeId, 'text');
          }
        });
      });

      // 没有采样器连线信息时，回退到第一个可编辑的正向 CLIP 文本节点。
      if (!mapping.promptTargets.length) {
        const candidate = entries.find(([, node]) =>
          /CLIPTextEncode/i.test(node.class_type) && typeof (node.inputs || {}).text === 'string');
        if (candidate) addTarget(mapping.promptTargets, candidate[0], 'text');
      }
      if (!mapping.promptTargets.length) {
        const composer = entries.find(([, node]) =>
          /AnimaPromptComposer/i.test(node.class_type) && typeof (node.inputs || {}).resolved_prompt === 'string');
        if (composer) addTarget(mapping.promptTargets, composer[0], 'resolved_prompt');
      }
      if (!mapping.promptTargets.length) {
        throw new Error('没有找到可写入用户命令的提示词节点。');
      }
      if (!mapping.outputNodes.length) {
        throw new Error('没有找到 SaveImage 输出节点，请在工作流末尾连接“保存图像”。');
      }

      return {
        mapping,
        summary: {
          nodeCount: entries.length,
          promptNode: mapping.promptTargets[0].nodeId,
          sizeNode: mapping.sizeTargets[0] ? mapping.sizeTargets[0].nodeId : '',
          outputNode: mapping.outputNodes[0],
        },
      };
    }

    createWorkflowRecord(name, workflow) {
      const analysis = this.analyzeWorkflow(workflow);
      return {
        id: `teemo-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: String(name || 'Teemo 自定义工作流').replace(/\.json$/i, ''),
        workflow,
        mapping: analysis.mapping,
        summary: analysis.summary,
        createdAt: new Date().toISOString(),
      };
    }

    getWorkflows() {
      return Array.isArray(this.config.workflows) ? this.config.workflows : [];
    }

    getActiveWorkflow() {
      const id = this.config.activeWorkflowId;
      return id && id !== 'builtin'
        ? this.getWorkflows().find(item => item && item.id === id) || null
        : null;
    }

    _readWorkflowRecord(record) {
      if (record && record.workflow) return record.workflow;
      if (record && record.workflowPath) {
        try {
          return JSON.parse(fs.readFileSync(record.workflowPath, 'utf8'));
        } catch (error) {
          throw new Error(`无法读取工作流文件：${record.workflowPath}。请重新导入该 API JSON。`);
        }
      }
      throw new Error('当前工作流没有可用的 API JSON 数据。');
    }

    _buildImportedWorkflow(record, options = {}) {
      const workflow = JSON.parse(JSON.stringify(this._readWorkflowRecord(record)));
      const mapping = record.mapping || this.analyzeWorkflow(workflow).mapping;
      // “生个图”这类没有画面描述的命令，保留工作流原有提示词连线，让随机抽卡节点自行出题。
      if (!this._isBareImageCommand(options.prompt)) {
        mapping.promptTargets.forEach(target => {
          if (workflow[target.nodeId] && workflow[target.nodeId].inputs) {
            workflow[target.nodeId].inputs[target.input] = String(options.prompt || '');
          }
        });
      }
      if (options.negativePrompt) {
        mapping.negativeTargets.forEach(target => {
          if (workflow[target.nodeId] && workflow[target.nodeId].inputs) {
            workflow[target.nodeId].inputs[target.input] = String(options.negativePrompt);
          }
        });
      }
      mapping.seedTargets.forEach(target => {
        if (workflow[target.nodeId] && workflow[target.nodeId].inputs) {
          // 自定义节点的 seed 上限不统一；32 位正整数可同时兼容 KSampler 与 Anima 等节点。
          workflow[target.nodeId].inputs[target.input] = Math.floor(Math.random() * 2147483647);
        }
      });
      // 自定义工作流默认保留作者设置的尺寸；用户明确说出尺寸时才覆盖。
      if (options.size || options.width || options.height) {
        const dimensions = this._resolveDimensions(options);
        mapping.sizeTargets.forEach(target => {
          if (!workflow[target.nodeId] || !workflow[target.nodeId].inputs) return;
          workflow[target.nodeId].inputs[target.widthInput] = dimensions.width;
          workflow[target.nodeId].inputs[target.heightInput] = dimensions.height;
        });
      }
      mapping.outputNodes.forEach(nodeId => {
        const node = workflow[nodeId];
        if (node && node.inputs && Object.prototype.hasOwnProperty.call(node.inputs, 'filename_prefix')) {
          node.inputs.filename_prefix = `Teemo_${String(record.name || 'Workflow').replace(/[\\/:*?"<>|]+/g, '_')}`;
        }
      });
      return workflow;
    }

    getWorkflowByRef(ref) {
      const value = String(ref || '').trim();
      if (!value || /^(current|active|default)$/i.test(value)) return this.getActiveWorkflow();
      if (/^builtin$/i.test(value)) return null;
      const workflows = this.getWorkflows();
      const lower = value.toLowerCase();
      const found = workflows.find(item => item && (
        String(item.id) === value
        || String(item.name || '').toLowerCase() === lower
        || String(item.name || '').replace(/\s+/g, '-').toLowerCase() === lower
      ));
      return found || undefined;
    }

    buildWorkflow(options = {}) {
      const requested = options.workflowId || options.workflowName;
      if (requested) {
        const record = this.getWorkflowByRef(requested);
        if (record === undefined) {
          const names = this.getWorkflows().map(item => item && item.name).filter(Boolean);
          throw new Error(`找不到工作流「${requested}」。${names.length ? `当前已导入：${names.join('、')}。` : '请先在设置里导入一条 API 工作流。'}`);
        }
        if (record) return this._buildImportedWorkflow(record, options);
      } else {
        const imported = this.getActiveWorkflow();
        if (imported) return this._buildImportedWorkflow(imported, options);
      }
      const dimensions = this._resolveDimensions(options);
      const seed = Number.isFinite(Number(options.seed))
        ? Number(options.seed)
        : Math.floor(Math.random() * 9007199254740990);
      return {
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: options.checkpoint || this.config.checkpoint },
        },
        '2': {
          class_type: 'CLIPTextEncode',
          inputs: { text: String(options.prompt || ''), clip: ['1', 1] },
        },
        '3': {
          class_type: 'CLIPTextEncode',
          inputs: { text: String(options.negativePrompt || this.config.negativePrompt || ''), clip: ['1', 1] },
        },
        '4': {
          class_type: 'EmptyLatentImage',
          inputs: { width: dimensions.width, height: dimensions.height, batch_size: 1 },
        },
        '5': {
          class_type: 'KSampler',
          inputs: {
            seed,
            steps: Math.round(clampNumber(options.steps, this.config.steps, 1, 100)),
            cfg: clampNumber(options.cfg, this.config.cfg, 1, 30),
            sampler_name: options.sampler || this.config.sampler,
            scheduler: options.scheduler || this.config.scheduler,
            denoise: 1,
            model: ['1', 0],
            positive: ['2', 0],
            negative: ['3', 0],
            latent_image: ['4', 0],
          },
        },
        '6': {
          class_type: 'VAEDecode',
          inputs: { samples: ['5', 0], vae: ['1', 2] },
        },
        '7': {
          class_type: 'SaveImage',
          inputs: { filename_prefix: 'Teemo', images: ['6', 0] },
        },
      };
    }

    async _waitForResult(socket, promptId, onProgress, signal) {
      const started = Date.now();
      return new Promise((resolve, reject) => {
        let finished = false;
        let pollTimer = null;
        let timeoutTimer = null;

        const cleanup = () => {
          finished = true;
          if (pollTimer) clearInterval(pollTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (signal) signal.removeEventListener('abort', onAbort);
          try { if (socket && socket.readyState < 2) socket.close(); } catch (_) {}
        };
        const succeed = history => {
          if (finished) return;
          cleanup();
          resolve(history);
        };
        const fail = error => {
          if (finished) return;
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        };
        const onAbort = () => fail(new DOMException('已停止生图', 'AbortError'));

        if (signal) {
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
        }

        socket.on('message', raw => {
          if (finished) return;
          let message;
          try { message = JSON.parse(String(raw)); } catch (_) { return; }
          const data = message.data || {};
          if (data.prompt_id && data.prompt_id !== promptId) return;
          if (message.type === 'progress' && onProgress) {
            const value = Number(data.value || 0);
            const max = Number(data.max || 0);
            onProgress({ stage: 'sampling', value, max, percent: max ? Math.round(value / max * 100) : 0 });
          } else if (message.type === 'executing' && data.node == null) {
            this._json(`/history/${encodeURIComponent(promptId)}`)
              .then(history => succeed(history[promptId] || history))
              .catch(fail);
          } else if (message.type === 'execution_error') {
            fail(new Error(`ComfyUI 生图失败：${data.exception_message || data.exception_type || '工作流执行错误'}`));
          }
        });

        const poll = async () => {
          if (finished) return;
          try {
            const history = await this._json(`/history/${encodeURIComponent(promptId)}`);
            if (history && history[promptId]) succeed(history[promptId]);
            else if (onProgress && Date.now() - started > 2500) onProgress({ stage: 'waiting', value: 0, max: 0, percent: 0 });
          } catch (_) {
            // WebSocket 是主通道，轮询失败时继续等待。
          }
        };
        pollTimer = setInterval(poll, 1800);
        timeoutTimer = setTimeout(() => fail(new Error('ComfyUI 生图超时，请检查队列或模型是否正常加载。')), 15 * 60 * 1000);
      });
    }

    _collectImages(history) {
      const images = [];
      const outputs = history && history.outputs ? history.outputs : {};
      Object.values(outputs).forEach(output => {
        (output && output.images || []).forEach(image => {
          if (image && image.filename) images.push(image);
        });
      });
      return images.sort((a, b) => (a.type === 'output' ? -1 : 1) - (b.type === 'output' ? -1 : 1));
    }

    async _downloadImage(image) {
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || '',
        type: image.type || 'output',
      });
      const response = await fetch(`${this.config.baseUrl}/view?${query.toString()}`, {
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`读取 ComfyUI 成品失败（${response.status}）`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/png';
      const b64 = buffer.toString('base64');
      return {
        ...image,
        b64,
        url: `data:${contentType};base64,${b64}`,
        directUrl: `${this.config.baseUrl}/view?${query.toString()}`,
      };
    }

    async generate(options = {}) {
      this.reload();
      if (!this.isEnabled()) throw new Error('ComfyUI 本地生图尚未启用，请在设置中开启。');
      if (!String(options.prompt || '').trim()) throw new Error('请先描述想生成的图片。');
      if (options.onProgress) options.onProgress({ stage: 'connecting', value: 0, max: 0, percent: 0 });

      await this.ping();
      const clientId = crypto.randomUUID();
      const wsUrl = this.config.baseUrl.replace(/^http/i, 'ws') + `/ws?clientId=${encodeURIComponent(clientId)}`;
      const socket = new WebSocket(wsUrl);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('连接 ComfyUI 实时进度通道超时。')), 10000);
        socket.once('open', () => { clearTimeout(timer); resolve(); });
        socket.once('error', error => { clearTimeout(timer); reject(new Error(`连接 ComfyUI 失败：${error.message}`)); });
      });

      if (options.onProgress) options.onProgress({ stage: 'queued', value: 0, max: 0, percent: 0 });
      const queued = await this._json('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: this.buildWorkflow(options),
          client_id: clientId,
        }),
        signal: options.signal,
      });
      if (!queued.prompt_id) {
        try { socket.close(); } catch (_) {}
        const details = queued.node_errors ? JSON.stringify(queued.node_errors).slice(0, 500) : '';
        throw new Error(`ComfyUI 未接受生图任务${details ? `：${details}` : ''}`);
      }

      const history = await this._waitForResult(socket, queued.prompt_id, options.onProgress, options.signal);
      const descriptors = this._collectImages(history);
      if (!descriptors.length) throw new Error('ComfyUI 已执行完成，但工作流没有输出图片。');
      if (options.onProgress) options.onProgress({ stage: 'downloading', value: 1, max: 1, percent: 100 });
      const images = await Promise.all(descriptors.map(image => this._downloadImage(image)));
      const first = images[0];
      return {
        url: first.url,
        b64: first.b64,
        promptId: queued.prompt_id,
        images,
        provider: 'comfyui',
      };
    }
  }

  window.TeemoComfyUIService = TeemoComfyUIService;
})();
