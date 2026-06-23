/**
 * 项目工作台数据服务
 * 职责：项目 CRUD、本地 JSON 持久化、变更事件广播
 *
 * 数据结构：
 * {
 *   id: string,                          // 唯一 ID（p_ 前缀）
 *   name: string,                        // 项目名称（必填）
 *   status: 'active'|'archived',         // 项目状态
 *   background: string,                  // 项目背景
 *   businessGoal: string,                // 业务目标
 *   designBrief: string,                 // 设计 Brief
 *   visualDirection: string,             // 视觉方向
 *   yuqueLinks: [{url, title}],          // 语雀资料
 *   dingtalkFeedback: [{content, from, time}], // 钉钉反馈
 *   aiPrompts: [{name, prompt}],         // AI 提示词
 *   deliverables: [{name, size, status}],// 交付物
 *   changelog: [{time, content, source}],// 修改记录
 *   retrospective: string,              // 项目复盘
 *   createdAt: number,
 *   updatedAt: number,
 * }
 */
(function() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const DIR = path.join(os.homedir(), '.hellobike-pet');
  const FILE = path.join(DIR, 'projects.json');

  // Seed 数据（首次启动填充）
  const SEED_PROJECTS = [
    {
      id: _pid(),
      name: '2026 Q2 新车上线',
      status: 'active',
      background: '两轮事业部 Q2 发布 3 款新车型，需要全套曝光资源位素材更新。',
      businessGoal: '新车首周曝光量提升 30%，统一视觉风格强化品牌认知。',
      designBrief: 'Banner + 场景卡 + Tab 图标 + Lottie 入场动效，覆盖骑行页/首页/发现页。',
      visualDirection: '活力渐变 + 3D 车型渲染 + 品牌蓝主色调',
      yuqueLinks: [],
      dingtalkFeedback: [],
      aiPrompts: [
        { name: '新车 Banner 创意', prompt: '请为哈啰新车上线生成 3 个 Banner 设计创意方向（尺寸 750×360px），包含核心视觉概念、主元素、配色倾向、文案建议。' }
      ],
      deliverables: [
        { name: 'banner_newbike_750x360@2x.png', size: '750×360', status: 'doing' },
        { name: 'scene_card_340x200@2x.png', size: '340×200', status: 'todo' },
        { name: 'tab_icon_96x96.png', size: '96×96', status: 'todo' },
      ],
      changelog: [],
      retrospective: '',
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 3600000,
    },
    {
      id: _pid(),
      name: '618 骑行节活动页',
      status: 'active',
      background: '618 大促期间推出骑行节活动，需要活动主视觉和落地页设计。',
      businessGoal: '活动期间日活提升 15%，新用户注册转化率 8%。',
      designBrief: '活动主 KV + H5 落地页 + 分享海报 + Push 图标',
      visualDirection: '夏日清爽 + 运动活力 + 橙色渐变强调促销感',
      yuqueLinks: [],
      dingtalkFeedback: [],
      aiPrompts: [],
      deliverables: [],
      changelog: [],
      retrospective: '',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 7200000,
    }
  ];

  function _pid() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  class ProjectService {
    constructor() {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      this.items = this._load();
      this.listeners = new Set();
    }

    _load() {
      try {
        if (!fs.existsSync(FILE)) {
          this._writeFile(SEED_PROJECTS);
          return JSON.parse(JSON.stringify(SEED_PROJECTS));
        }
        const raw = fs.readFileSync(FILE, 'utf-8');
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        console.warn('[ProjectService] load failed, fallback to seed:', e);
        return JSON.parse(JSON.stringify(SEED_PROJECTS));
      }
    }

    _writeFile(data) {
      try {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[ProjectService] save failed:', e);
      }
    }

    _persist() {
      this._writeFile(this.items);
      this._emit();
    }

    _emit() {
      this.listeners.forEach(fn => {
        try { fn(this.items); } catch (e) { console.warn(e); }
      });
    }

    /** 订阅数据变更 */
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    /** 获取全部项目（按 updatedAt 倒序） */
    getAll() {
      return this.items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** 获取活跃项目 */
    getActive() {
      return this.getAll().filter(p => p.status === 'active');
    }

    /** 获取已归档项目 */
    getArchived() {
      return this.getAll().filter(p => p.status === 'archived');
    }

    /** 按 ID 获取 */
    getById(id) {
      return this.items.find(p => p.id === id) || null;
    }

    /**
     * 创建项目
     * @param {object} payload - { name, background?, businessGoal?, designBrief?, visualDirection? }
     */
    create(payload) {
      const now = Date.now();
      const project = {
        id: _pid(),
        name: (payload.name || '未命名项目').trim(),
        status: 'active',
        background: payload.background || '',
        businessGoal: payload.businessGoal || '',
        designBrief: payload.designBrief || '',
        visualDirection: payload.visualDirection || '',
        yuqueLinks: [],
        dingtalkFeedback: [],
        aiPrompts: [],
        deliverables: [],
        changelog: [],
        retrospective: '',
        createdAt: now,
        updatedAt: now,
      };
      this.items.unshift(project);
      this._persist();
      return project;
    }

    /** 更新项目 */
    update(id, patch) {
      const idx = this.items.findIndex(p => p.id === id);
      if (idx < 0) return null;
      this.items[idx] = Object.assign({}, this.items[idx], patch, { updatedAt: Date.now() });
      this._persist();
      return this.items[idx];
    }

    /** 归档项目 */
    archive(id) {
      return this.update(id, { status: 'archived' });
    }

    /** 恢复归档 */
    restore(id) {
      return this.update(id, { status: 'active' });
    }

    /**
     * 删除项目
     * 注意：调用方需要同时调用 todoService.clearProjectId(id) 清空关联待办
     */
    remove(id) {
      const before = this.items.length;
      this.items = this.items.filter(p => p.id !== id);
      if (this.items.length !== before) this._persist();
    }

    /** 添加修改记录 */
    addChangelog(id, content, source) {
      const project = this.getById(id);
      if (!project) return;
      project.changelog.push({ time: Date.now(), content, source: source || '手动' });
      project.updatedAt = Date.now();
      this._persist();
    }

    /** 获取项目数量统计 */
    getStats() {
      return {
        total: this.items.length,
        active: this.items.filter(p => p.status === 'active').length,
        archived: this.items.filter(p => p.status === 'archived').length,
      };
    }
  }

  window.ProjectService = ProjectService;
})();
