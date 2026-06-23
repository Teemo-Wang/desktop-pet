/**
 * 生图执行区组件
 * 职责：在 AI 面板中展示生图参数面板，支持三种方式切换、生成、迭代
 */
(function() {

  class VisualExecutor {
    /**
     * @param {object} deps - { visualGen, skills }
     */
    constructor(deps) {
      this.visualGen = deps.visualGen;
      this.skills = deps.skills;
      this._currentMethod = 2; // 默认 AI 生图
      this._demandData = null;
      this._lastResult = null;
      this._el = null;
    }

    /**
     * 创建并返回生图执行区 DOM
     * @param {object} demandData - 来自 DemandCard.buildData 的需求数据
     * @returns {HTMLElement}
     */
    create(demandData) {
      this._demandData = demandData;
      this._currentMethod = demandData.recommendedMethod || 2;
      this._lastResult = null;

      const el = document.createElement('div');
      el.className = 'visual-executor';
      this._el = el;
      this._render();
      this._bind();
      return el;
    }

    _render() {
      const data = this._demandData;
      const sizes = this.visualGen.getSizePresets();
      const styles = this.visualGen.getStylePresets();
      const designSkills = this.skills ? this.skills.getAll().filter(s => s.category === 'design') : [];

      // 默认提示词
      const defaultPrompt = this._buildDefaultPrompt(data);
      const defaultSize = data.extractedParams?.size || '750x360';

      let html = `
        <div class="ve-header">🎨 视觉生成</div>
        <div class="ve-demand-brief">${_esc(data.aiSummary || '').slice(0, 100)}${(data.aiSummary || '').length > 100 ? '...' : ''}</div>

        <div class="ve-method-tabs">
          <button class="ve-tab ${this._currentMethod === 1 ? 'active' : ''}" data-method="1">素材库</button>
          <button class="ve-tab ${this._currentMethod === 2 ? 'active' : ''}" data-method="2">AI 生图</button>
          <button class="ve-tab ${this._currentMethod === 3 ? 'active' : ''}" data-method="3">Skill 生图</button>
        </div>

        <!-- 方式一：素材库 -->
        <div class="ve-method-panel ${this._currentMethod === 1 ? 'active' : ''}" data-panel="1">
          <div class="ve-assets-hint">🔍 正在匹配相关素材...</div>
          <div class="ve-assets-grid">
            <div class="ve-asset-item">🚲 哈啰单车</div>
            <div class="ve-asset-item">🛴 哈啰助力车</div>
            <div class="ve-asset-item">🎨 品牌色块</div>
            <div class="ve-asset-item">🏙️ 城市背景</div>
          </div>
          <div class="ve-assets-note">* 当前为 Mock 数据，后续对接真实素材库</div>
        </div>

        <!-- 方式二：AI 生图 -->
        <div class="ve-method-panel ${this._currentMethod === 2 ? 'active' : ''}" data-panel="2">
          <label class="ve-label">正向提示词</label>
          <textarea class="ve-prompt" rows="3" placeholder="描述你想要的画面...">${_esc(defaultPrompt)}</textarea>
          <label class="ve-label">负向提示词</label>
          <textarea class="ve-negative" rows="2" placeholder="不想出现的元素...">低质量, 模糊, 变形, 文字错误</textarea>
          <div class="ve-row">
            <div class="ve-field">
              <label class="ve-label">尺寸</label>
              <select class="ve-size">
                ${sizes.map(s => `<option value="${s.value}" ${s.value === defaultSize ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
            <div class="ve-field">
              <label class="ve-label">风格</label>
              <select class="ve-style">
                ${styles.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- 方式三：Skill 生图 -->
        <div class="ve-method-panel ${this._currentMethod === 3 ? 'active' : ''}" data-panel="3">
          <div class="ve-skill-list">
            ${designSkills.length > 0
              ? designSkills.map(s => `<button class="ve-skill-item" data-skill-id="${s.id}">${s.icon} ${_esc(s.name)}</button>`).join('')
              : '<div class="ve-empty">暂无设计类 Skill，可在技能面板中添加</div>'
            }
          </div>
        </div>

        <!-- 生成按钮 -->
        <button class="ve-generate-btn">✨ 生成</button>

        <!-- 结果区（初始隐藏） -->
        <div class="ve-result" style="display:none">
          <div class="ve-result-img-wrap">
            <img class="ve-result-img" src="" alt="生成结果" />
          </div>
          <div class="ve-feedback-area">
            <textarea class="ve-feedback" rows="2" placeholder="输入修改意见..."></textarea>
            <div class="ve-result-actions">
              <button class="ve-iterate-btn">🔄 继续迭代</button>
              <button class="ve-save-btn">💾 保存</button>
            </div>
          </div>
        </div>
      `;

      this._el.innerHTML = html;
    }

    _bind() {
      const el = this._el;

      // Tab 切换
      el.querySelectorAll('.ve-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this._currentMethod = parseInt(tab.dataset.method);
          el.querySelectorAll('.ve-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          el.querySelectorAll('.ve-method-panel').forEach(p => p.classList.remove('active'));
          el.querySelector(`[data-panel="${this._currentMethod}"]`).classList.add('active');
        });
      });

      // 生成按钮
      el.querySelector('.ve-generate-btn').addEventListener('click', () => this._handleGenerate());

      // 迭代按钮
      el.querySelector('.ve-iterate-btn').addEventListener('click', () => this._handleIterate());

      // 保存按钮
      el.querySelector('.ve-save-btn').addEventListener('click', () => this._handleSave());

      // Skill 选择
      el.querySelectorAll('.ve-skill-item').forEach(btn => {
        btn.addEventListener('click', () => {
          el.querySelectorAll('.ve-skill-item').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }

    async _handleGenerate() {
      const el = this._el;
      const btn = el.querySelector('.ve-generate-btn');
      btn.disabled = true;
      btn.textContent = '⏳ 生成中...';

      try {
        const options = this._collectParams();
        const result = await this.visualGen.generate(options);
        this._lastResult = result;

        // 显示结果区
        const resultArea = el.querySelector('.ve-result');
        resultArea.style.display = 'block';
        el.querySelector('.ve-result-img').src = result.imageUrl;

        btn.textContent = '✨ 重新生成';
      } catch (e) {
        btn.textContent = '⚠️ 生成失败，点击重试';
      } finally {
        btn.disabled = false;
      }
    }

    async _handleIterate() {
      if (!this._lastResult) return;
      const el = this._el;
      const feedback = el.querySelector('.ve-feedback').value.trim();
      if (!feedback) { alert('请输入修改意见'); return; }

      const iterBtn = el.querySelector('.ve-iterate-btn');
      iterBtn.disabled = true;
      iterBtn.textContent = '⏳ 迭代中...';

      try {
        const result = await this.visualGen.iterate(this._lastResult.id, feedback);
        this._lastResult = result;
        el.querySelector('.ve-result-img').src = result.imageUrl;
        el.querySelector('.ve-feedback').value = '';
      } catch (e) {
        alert('迭代失败：' + e.message);
      } finally {
        iterBtn.disabled = false;
        iterBtn.textContent = '🔄 继续迭代';
      }
    }

    _handleSave() {
      if (!this._lastResult) return;
      alert('✅ 已保存到生图记录');
    }

    _collectParams() {
      const el = this._el;
      const base = {
        method: this._currentMethod,
        demandSummary: this._demandData?.aiSummary || '',
      };

      if (this._currentMethod === 2) {
        base.prompt = el.querySelector('.ve-prompt').value;
        base.negativePrompt = el.querySelector('.ve-negative').value;
        base.size = el.querySelector('.ve-size').value;
        base.style = el.querySelector('.ve-style').value;
      } else if (this._currentMethod === 3) {
        const selected = el.querySelector('.ve-skill-item.selected');
        base.skillId = selected ? selected.dataset.skillId : null;
        base.prompt = this._demandData?.aiSummary || '';
      } else {
        base.prompt = '素材库组合生成';
      }

      return base;
    }

    _buildDefaultPrompt(data) {
      const params = data.extractedParams || {};
      const parts = [];
      if (params.subject) parts.push(params.subject);
      if (data.demandType === 'banner') parts.push('营销 Banner, 哈啰品牌风格, 骑行场景');
      if (data.demandType === 'poster') parts.push('活动海报, 充满活力, 年轻时尚');
      if (data.demandType === 'icon') parts.push('扁平化图标, 简洁, 品牌蓝');
      if (data.demandType === 'themeCard') parts.push('场景卡片, 精致插画, 圆角卡片');
      if (parts.length === 0) parts.push('哈啰出行, 品牌风格, 高品质设计');
      return parts.join(', ');
    }
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  window.VisualExecutor = VisualExecutor;
})();
