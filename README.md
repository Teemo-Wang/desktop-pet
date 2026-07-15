# 哈啰桌面 AI 助手（Desktop Pet）

## 项目背景

这是一个面向哈啰两轮事业部视觉设计师的 **桌面端 AI 工作助手**，以桌面宠物（IP 形象）为交互入口，整合 AI 对话、钉钉消息、语雀文档、待办管理等日常工作流，帮助设计师在不切换应用的情况下高效处理信息和设计任务。

### 定位
- **用户群体**：哈啰两轮设计中心的视觉设计师
- **核心价值**：一个「始终在桌面的 AI 设计搭档」，减少上下文切换，把 AI 能力融入日常工作
- **形态**：Electron 桌面端应用，透明悬浮窗 + 全屏穿透，IP 形象可自由拖拽

### 技术选型
| 维度 | 方案 |
|------|------|
| 运行时 | Electron 31+ |
| 渲染层 | 原生 HTML/CSS/JS（无框架） |
| 窗口模式 | 全屏透明 + 鼠标穿透（forward 模式） |
| AI 协议 | OpenAI 兼容协议（支持 OpenAI / DeepSeek / 通义 / 智谱 / Kimi / 火山方舟等） |
| 数据持久化 | 本地 JSON 文件（`~/.hellobike-pet/`） |
| 网络代理 | config.json / 环境变量 / 系统代理三级回退 |

---

## 功能模块与当前进度

### ✅ 已完成

| 模块 | 说明 | 关键文件 |
|------|------|----------|
| **桌宠 IP 交互** | 自由拖拽、贴边收纳/弹回、悬停气泡、点击事件、右键菜单 | `src/components/pet.js` |
| **快捷 Dock** | 点击 IP 弹出底部标签栏，支持 AI / 钉钉 / 语雀 / 待办 / 技能切换 | `src/components/quick-dock.js` |
| **AI 聊天面板** | 多轮对话、流式输出、Markdown 渲染、快捷指令（需求分析/总结/文案/复盘/转待办） | `src/components/chat.js`、`src/services/ai.js` |
| **AI 模型接入** | 支持 OpenAI 协议全家桶，含连接测试、流式 SSE、推理模型适配（reasoning_content） | `src/services/ai.js` |
| **钉钉消息** | 消息列表、未读计数、单条消息 AI 总结/需求分析/AI 接管回复 | `src/components/dingtalk.js`、`src/services/dingtalk.js` |
| **AI 接管模式** | 全局接管 / 单会话接管，自动读取钉钉消息并生成回复建议 | `src/services/ai-takeover.js` |
| **语雀文档** | 通过公网 API 读取团队语雀文档，支持 URL 解析、文档内容摘要送 AI | `src/services/yuque*.js`、`main.js`（主进程请求） |
| **待办管理** | CRUD、优先级、截止时间、到期提醒（30分钟前通知）、AI 对话转待办 | `src/services/todos.js`、`src/components/todos.js` |
| **技能系统** | 内置 6 个设计技能（配色/文案/命名/评审/Banner/图标）+ 用户上传自定义 Skill | `src/services/skills.js`、`src/components/skills.js` |
| **今日简报** | 早安卡片（待办概览+一键开始今天）/ 晚报卡片（完成统计+AI 小结） | `src/services/daily-brief.js`、`src/components/daily-brief.js` |
| **通知气泡** | 钉钉新消息/语雀更新/待办到期 → 桌宠头顶弹出气泡通知 | `src/components/notification.js` |
| **工作统计** | 每日待办完成/取消/消息处理次数记录，晚报对比昨日数据 | `src/services/work-stats.js` |
| **偏好设置** | 缩放大小、置顶开关、待机动画、隐私设置（消息预览显隐） | `src/components/preferences.js`、`src/stores/settings.js` |
| **API 接入面板** | 可视化配置 AI 供应商/Key/模型，一键测试连接 | `src/components/api-connect.js` |
| **面板拉伸** | 面板可拖拽调整宽度 | `src/components/panel-resizer.js` |
| **对话历史** | 本地持久化聊天记录，多会话管理 | `src/services/chat-history.js` |
| **代理支持** | 三级代理回退机制，解决海外 API 网络不通问题 | `main.js`（setupProxy） |
| **语雀团队 Token** | 内置 20+ 团队的读取令牌，覆盖两轮各业务线知识库 | `main.js`（YUQUE_TEAMS） |

### 🔧 待优化 / 规划中

| 方向 | 状态 |
|------|------|
| 真实钉钉 API 对接（目前为模拟数据） | 🟡 Mock 阶段 |
| Claude 协议适配 | 🟡 预留接口 |
| 多模态：图片/截图识别 | 🟡 规划中 |
| IP 动效（Lottie 替代静态 PNG） | 🟡 规划中 |
| 打包分发（DMG / 自动更新） | 🟡 未开始 |
| 深色模式 | 🟡 未开始 |
| Figma 插件联动 | 🟡 概念阶段 |

---

## 项目结构

```
desktop-pet/
├── main.js                # Electron 主进程（窗口管理/代理/语雀API/IPC）
├── index.html             # 渲染进程入口
├── config.json            # AI 模型 & 代理配置
├── package.json           # 项目依赖
├── pet.png                # IP 形象图片
├── start.command          # macOS 双击启动脚本
├── icon/                  # 应用图标 & Dock 图标
├── src/
│   ├── app.js             # 渲染进程总入口，初始化所有模块
│   ├── components/        # UI 组件层（13个组件）
│   │   ├── pet.js         # 桌宠拖拽/贴边/交互
│   │   ├── chat.js        # AI 聊天面板
│   │   ├── quick-dock.js  # 快捷标签栏
│   │   ├── dingtalk.js    # 钉钉面板
│   │   ├── yuque.js       # 语雀面板
│   │   ├── todos.js       # 待办面板
│   │   ├── skills.js      # 技能面板
│   │   ├── daily-brief.js # 早安/晚报卡片
│   │   ├── notification.js # 通知气泡
│   │   └── ...
│   ├── services/          # 业务逻辑层（13个服务）
│   │   ├── ai.js          # AI 模型统一接入
│   │   ├── ai-takeover.js # AI 接管钉钉消息
│   │   ├── todos.js       # 待办数据管理
│   │   ├── skills.js      # 技能系统
│   │   ├── daily-brief.js # 日报数据聚合
│   │   ├── yuque*.js      # 语雀相关（4个文件）
│   │   └── ...
│   ├── stores/            # 设置持久化
│   ├── styles/            # CSS 样式（13个模块化文件）
│   └── utils/             # 工具函数（上下文构建/Markdown 渲染）
└── node_modules/          # 依赖
```

---

## 启动方式

```bash
cd docs/desktop-pet
npm install
npm start
```

或 macOS 双击 `start.command` 脚本。

---

## 当前版本

**v1.1.0** — 在 v1.0 基础上新增：群聊 @机器人发图修复（群内正确回图，不再误发私聊）、无关话题自由对话开关（偏好设置「允许闲聊」）、语雀全文检索（按标题/正文跨团队搜索）、生图入口暂时隐藏（保留代码待启用）。

**v1.0.0** — 功能 Demo 阶段，核心交互链路已跑通，AI 对话、待办管理、技能系统可正常使用。钉钉消息为模拟数据，语雀文档为真实读取。
