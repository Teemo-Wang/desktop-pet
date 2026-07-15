# 哈啰桌面 AI 助手（Desktop Pet）— 项目进度与规划

> 文档版本：v1.2 ｜ 更新日期：2026-07-10 ｜ 当前应用版本：**v1.1.0（功能试行阶段）**

---

## 一、项目定位

一个面向哈啰两轮事业部视觉设计师的 **桌面端 AI 工作助手**。以桌面宠物（IP 形象）为交互入口，整合 AI 对话、钉钉消息、语雀文档、待办管理等日常工作流，帮助设计师在不切换应用的情况下高效处理信息和设计任务。

| 维度 | 说明 |
|------|------|
| 用户群体 | 哈啰两轮设计中心的视觉设计师 |
| 核心价值 | 一个「始终在桌面的 AI 设计搭档」，减少上下文切换，把 AI 能力融入日常工作 |
| 产品形态 | Electron 桌面应用，透明悬浮窗 + 全屏鼠标穿透，IP 形象可自由拖拽 |

---

## 二、技术架构

| 维度 | 方案 |
|------|------|
| 运行时 | Electron 31+ |
| 渲染层 | 原生 HTML / CSS / JS（无框架） |
| 窗口模式 | 全屏透明 + 鼠标穿透（forward 模式） |
| AI 协议 | OpenAI 兼容协议（OpenAI / DeepSeek / 通义 / 智谱 / Kimi / 火山方舟等） |
| 数据持久化 | 本地 JSON 文件（`~/.hellobike-pet/`） |
| 网络代理 | config.json / 环境变量 / 系统代理 三级回退 |

### 代码结构

```
desktop-pet/
├── main.js                # Electron 主进程（窗口管理 / 代理 / 语雀 API / IPC）
├── index.html             # 渲染进程入口
├── config.json            # AI 模型 & 代理配置
├── pet.png                # IP 形象图片
├── start.command          # macOS 双击启动脚本
├── icon/                  # 应用图标 & Dock 图标
└── src/
    ├── app.js             # 渲染进程总入口，初始化所有模块
    ├── components/        # UI 组件层（16 个组件）
    ├── services/          # 业务逻辑层（15 个服务）
    ├── stores/            # 设置持久化
    ├── styles/            # 模块化 CSS（16 个文件）
    └── utils/             # 工具函数（上下文构建 / Markdown 渲染）
```

> ⚠️ 说明：根目录另存在一套旧版 `js/` 扁平结构代码，`src/` 为重构后的分层主力版本。若 `js/` 已废弃，建议后续清理以避免混淆。

---

## 三、当前开发进度

### ✅ 已完成模块

| 模块 | 说明 | 关键文件 |
|------|------|----------|
| 桌宠 IP 交互 | 自由拖拽、贴边收纳/弹回、悬停气泡、点击事件、右键菜单 | `src/components/pet.js` |
| 快捷 Dock | 点击 IP 弹出底部标签栏，支持 AI / 钉钉 / 语雀 / 待办 / 技能切换 | `src/components/quick-dock.js` |
| AI 聊天面板 | 多轮对话、流式输出、Markdown 渲染、快捷指令（需求分析/总结/文案/复盘/转待办） | `src/components/chat.js`、`src/services/ai.js` |
| AI 模型接入 | 支持 OpenAI 协议全家桶，含连接测试、流式 SSE、推理模型适配（reasoning_content） | `src/services/ai.js` |
| 钉钉消息 | 消息列表、未读计数、单条消息 AI 总结/需求分析/AI 接管回复 | `src/components/dingtalk.js`、`src/services/dingtalk.js` |
| AI 接管模式 | 全局接管 / 单会话接管，自动读取钉钉消息并生成回复建议 | `src/services/ai-takeover.js` |
| 语雀文档 | 通过公网 API 读取团队语雀文档，支持 URL 解析、文档内容摘要送 AI | `src/services/yuque*.js`、`main.js` |
| 待办管理 | CRUD、优先级、截止时间、到期提醒（30 分钟前通知）、AI 对话转待办 | `src/services/todos.js`、`src/components/todos.js` |
| 技能系统 | 内置 6 个设计技能（配色/文案/命名/评审/Banner/图标）+ 用户上传自定义 Skill | `src/services/skills.js`、`src/components/skills.js` |
| 今日简报 | 早安卡片（待办概览 + 一键开始今天）/ 晚报卡片（完成统计 + AI 小结） | `src/services/daily-brief.js`、`src/components/daily-brief.js` |
| 通知气泡 | 钉钉新消息 / 语雀更新 / 待办到期 → 桌宠头顶弹出气泡通知 | `src/components/notification.js` |
| 工作统计 | 每日待办完成/取消/消息处理次数记录，晚报对比昨日数据 | `src/services/work-stats.js` |
| 偏好设置 | 缩放大小、置顶开关、待机动画、隐私设置（消息预览显隐） | `src/components/preferences.js`、`src/stores/settings.js` |
| API 接入面板 | 可视化配置 AI 供应商/Key/模型，一键测试连接 | `src/components/api-connect.js` |
| 面板拉伸 | 面板可拖拽调整宽度 | `src/components/panel-resizer.js` |
| 对话历史 | 本地持久化聊天记录，多会话管理 | `src/services/chat-history.js` |
| 代理支持 | 三级代理回退机制，解决海外 API 网络不通问题 | `main.js`（setupProxy） |
| 语雀团队 Token | 内置 20+ 团队的读取令牌，覆盖两轮各业务线知识库 | `main.js`（YUQUE_TEAMS） |
| 规范沉淀 | 对话/钉钉中提出的规范自动/手动沉淀为独立规范技能，作为机器人回复的参考依据；支持查看/编辑/删除 | `src/services/rule-capture.js`、`src/services/skills.js`、`src/services/dingtalk-ai.js` |

### 进度概览

- **核心交互链路**：✅ 已跑通
- **AI 对话 / 待办 / 技能系统**：✅ 可正常使用
- **语雀文档**：✅ 真实读取
- **规范沉淀与参考注入**：✅ 已跑通
- **钉钉消息**：🟡 模拟数据（Mock 阶段）

### 专项：规范沉淀与参考注入

> 场景：使用者 / 同事在对话或钉钉里提出「以后遵循某规范」时，系统把规则完整沉淀为一个**独立**的规范技能，作为机器人回复的**参考依据**（不并入默认回复规则），并支持随时手动调整/删除。

**捕获入口（三处，行为一致）**

| 入口 | 触发方式 | 说明 |
|------|---------|------|
| AI 聊天面板 | 自动 | 消息命中规范特征 → 后台非阻塞抽取，默认追加到「规范合集」 |
| AI 聊天面板 | 手动 | 「把刚才那条规范记下来 / 存成技能」→ 回溯最近对话抽取，回执真实结果 |
| 钉钉接管 | 自动 + 手动 | `buildTakeoverReply` 中同事消息自动沉淀；显式「存成技能」则回执确认 |

**关键设计**

- **默认追加、明确才新建**：所有规范默认汇入同一个「📚 规范合集」技能（固定 id `rule_collection`），仅当消息明确说「新建一个技能」时才单独成技能。
- **独立于默认规则**：捕获的规范是 `category==='rule'` 的自定义技能，**不修改** skill1「机器人回复规则」。
- **作为回复参考注入**：`SkillService.getReferenceRules()` 聚合所有规范技能正文，`dingtalk-ai.js` 的 `suggestReply` 将其作为「参考规范」段落注入机器人回复系统提示词。
- **可编辑/删除**：技能中心的规范技能提供「查看/编辑规则」（编辑 `systemPrompt`）与「删除此规范」。
- **成本与稳健**：关键词初筛（覆盖「遵循/规范」显式措辞 + 「当…时/每当/只要…」条件式指令 + 「以后…都…」常驻指令）先行，避免每条消息都调用 AI；AI 抽取有 `isRule` 兜底，误判只多一次调用、不生成脏技能；5 分钟指纹去重防重复建。

**涉及文件**：`src/services/rule-capture.js`（捕获服务）、`src/services/skills.js`（参考聚合 + 规则编辑）、`src/services/dingtalk-ai.js`（参考注入）、`src/components/chat.js`（聊天入口）、`src/components/skills.js`（编辑/删除 UI）、`src/app.js`（装配 + 钉钉入口 + UI 反馈）。

---

## 四、后续目标规划

### 🔧 待优化 / 规划中

| 方向 | 状态 | 优先级建议 |
|------|------|-----------|
| 真实钉钉 API 对接（替换 Mock 数据） | 🟡 Mock 阶段 | 高 |
| Claude 协议适配 | 🟡 预留接口 | 中 |
| 多模态：图片 / 截图识别 | 🟡 规划中 | 中 |
| IP 动效（Lottie 替代静态 PNG） | 🟡 规划中 | 中 |
| 打包分发（DMG / 自动更新） | 🟡 未开始 | 高 |
| 深色模式 | 🟡 未开始 | 低 |
| Figma 插件联动 | 🟡 概念阶段 | 中 |

### 阶段性目标拆解（建议）

**近期（打磨可用性 → 可分发）**
1. 钉钉真实 API 对接，打通消息读取与 AI 接管的完整闭环
2. 打包分发流程（DMG + 自动更新），让设计师可直接安装使用
3. 清理 `js/` 旧版代码，统一到 `src/` 分层架构

**中期（能力增强）**
4. 多模态截图识别，支持把设计稿/界面截图丢给 AI 分析
5. IP 动效升级（Lottie），让桌宠表情/状态更生动
6. Claude 协议适配，扩展模型选择
7. Figma 插件联动，与现有素材生成/替换工具打通

**远期（体验完善）**
8. 深色模式
9. 更丰富的技能市场与团队共享机制

---

## 五、风险与注意事项

1. **配置安全**：`config.json` 中 `apiKey` 为占位值（`sk-your-api-key-here`），真实 Key 应走本地配置，切勿提交至公开仓库。
2. **敏感令牌**：`yuque-teams.local.json` 内置团队读取 Token，注意纳入 `.gitignore`，避免泄露。
3. **代码双版本并存**：`js/`（旧）与 `src/`（新）需尽快收敛，降低维护成本。
4. **钉钉数据真实性**：当前为 Mock，对外演示时需说明，避免误判功能完成度。

---

## 六、启动方式

```bash
cd docs/desktop-pet
npm install
npm start
```

或 macOS 下双击 `start.command` 脚本启动。
