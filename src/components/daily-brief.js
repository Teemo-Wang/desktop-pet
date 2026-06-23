/**
 * 早安/晚报卡片 UI 组件
 * 形态：浮在 IP 上方的玻璃态卡片，可关闭、可触发动作
 *
 * 用法：
 *   const card = new DailyBriefCard({ onAction });
 *   card.showMorning(briefData);
 *   card.showEvening(briefData);
 */
(function() {

  const FOCUS_LABEL = {
    overdue: { icon: '⚠️', text: '已逾期', tone: 'error' },
    dueToday: { icon: '⏰', text: '今天到期', tone: 'warning' },
    doing: { icon: '🔵', text: '进行中', tone: 'brand' },
    important: { icon: '🔴', text: '高优先级', tone: 'warning' },
  };

  class DailyBriefCard {
    constructor({ onAction } = {}) {
      this.el = null;
      this.onAction = onAction || (() => {});
      this.visible = false;
      this._createDOM();
    }

    _createDOM() {
      this.el = document.createElement('div');
      this.el.className = 'daily-brief';
      this.el.id = 'dailyBriefCard';
      document.querySelector('.app').appendChild(this.el);
    }

    /** 早安卡片 */
    showMorning(data) {
      this.el.innerHTML = this._renderMorning(data);
      this._bind();
      this._show();
    }

    /** 晚报卡片 */
    showEvening(data) {
      this.el.innerHTML = this._renderEvening(data);
      this._bind();
      this._show();
    }

    _show() {
      this._syncPosition();
      this.el.classList.add('visible');
      this.visible = true;
    }

    hide() {
      this.el.classList.remove('visible');
      this.visible = false;
    }

    /** 同步到 IP 上方居中（复用面板定位约定） */
    _syncPosition() {
      const petArea = document.getElementById('petArea');
      if (!petArea) return;
      const rect = petArea.getBoundingClientRect();
      const cardW = 320;
      const left = Math.max(8, rect.left + rect.width / 2 - cardW / 2);
      const bottom = window.innerHeight - rect.top + 12;
      this.el.style.left = Math.min(left, window.innerWidth - cardW - 8) + 'px';
      this.el.style.bottom = bottom + 'px';
    }

    _renderMorning(d) {
      const dateStr = _formatDate(d.date);
      return `
        <div class="db-head">
          <div class="db-head-main">
            <div class="db-greeting">🌞 ${d.greeting}</div>
            <div class="db-date">${dateStr}</div>
          </div>
          <button class="db-close" data-act="close" title="关闭">✕</button>
        </div>
        <div class="db-motto">${_escape(d.motto)}</div>
        ${this._renderFocused(d.focused)}
        <div class="db-summary">${_escape(d.summary)}</div>
        <div class="db-actions">
          ${d.startTodayCandidates && d.startTodayCandidates.length > 0
            ? `<button class="db-btn db-btn-primary" data-act="start-today">⚡ 一键开始今天 (${d.startTodayCandidates.length})</button>`
            : ''}
          <button class="db-btn" data-act="view-todos">查看全部待办</button>
        </div>
      `;
    }

    _renderEvening(d) {
      const dateStr = _formatDate(d.date);
      const compare = d.compareYesterday;
      const compareText = compare.completed > 0
        ? `比昨天多完成 ${compare.completed} 项 🎉`
        : compare.completed < 0
          ? `比昨天少了 ${-compare.completed} 项，明天加油 💪`
          : '与昨天持平，节奏稳定 ⚖️';

      return `
        <div class="db-head">
          <div class="db-head-main">
            <div class="db-greeting">🌙 ${d.greeting}</div>
            <div class="db-date">${dateStr} 工作小结</div>
          </div>
          <button class="db-close" data-act="close" title="关闭">✕</button>
        </div>

        <div class="db-stats">
          <div class="db-stat">
            <div class="db-stat-num">${d.completed.length}</div>
            <div class="db-stat-label">已完成</div>
          </div>
          <div class="db-stat">
            <div class="db-stat-num">${d.stats.messageHandled}</div>
            <div class="db-stat-label">处理消息</div>
          </div>
          <div class="db-stat">
            <div class="db-stat-num">${d.stillPending}</div>
            <div class="db-stat-label">待续</div>
          </div>
        </div>

        ${d.completed.length > 0 ? `
          <div class="db-section-title">今日完成</div>
          <div class="db-list">
            ${d.completed.slice(0, 5).map(t => `
              <div class="db-list-item">
                <span class="db-list-dot done">✓</span>
                <span class="db-list-text">${_escape(t.title)}</span>
              </div>
            `).join('')}
            ${d.completed.length > 5 ? `<div class="db-list-more">还有 ${d.completed.length - 5} 项</div>` : ''}
          </div>
        ` : ''}

        <div class="db-summary">${_escape(compareText)}</div>

        <div class="db-actions">
          <button class="db-btn db-btn-primary" data-act="ai-summary">🤖 AI 生成总结</button>
          <button class="db-btn" data-act="close">收工 👋</button>
        </div>
      `;
    }

    _renderFocused(focused) {
      if (!focused || focused.length === 0) {
        return `
          <div class="db-focused-empty">
            <div class="db-focused-empty-icon">✨</div>
            <div>今天暂无紧急事项，开个好局吧</div>
          </div>
        `;
      }

      return `
        <div class="db-focused">
          ${focused.map(item => {
            const meta = FOCUS_LABEL[item.kind] || { icon: '📌', text: '', tone: '' };
            const t = item.todo;
            const deadline = t.deadline ? window.TodoUtils.formatDeadline(t.deadline) : '';
            return `
              <div class="db-focused-item db-tone-${meta.tone}">
                <span class="db-focused-icon">${meta.icon}</span>
                <span class="db-focused-text">${_escape(t.title)}</span>
                ${deadline ? `<span class="db-focused-deadline">${deadline}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    _bind() {
      this.el.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'close') {
            this.hide();
          } else {
            this.onAction(act);
            this.hide();
          }
        });
      });
    }
  }

  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _formatDate(d) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${days[d.getDay()]}  ${d.getMonth() + 1}月${d.getDate()}日`;
  }

  window.DailyBriefCard = DailyBriefCard;
})();
