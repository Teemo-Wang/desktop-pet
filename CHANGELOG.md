# Changelog

## v1.1.7 - 2026-08-09

### P1-4 Permission Layer（等待 GPT 审阅）

- 新增 Main Process 中央 `TeemoPermissionService`、renderer IPC Client 和最小权限确认 UI。
- 建立 none/read/write/execute 风险等级、allow/prompt/deny Decision、once/session/resource scope、timeout、abort、fail closed 和内存 audit。
- Registry 在 handler 前统一授权；两个 renderer 的 Registry 实例共享同一 Main 权限事实源，且 pending 响应绑定发起 `webContents`。
- `echo` 与 `get_agent_runtime_info` 显式保持 permission=none；没有新增真实 File/Git/Shell/Network/ComfyUI Tool。
- 增加 `test:permissions` 与双 renderer Electron IPC 集成烟测；四套自动测试和完整应用双隔离烟测均通过。

### P1-3 Tool Registry（CLOSED / PASS）

- 新增模型无关的统一 `TeemoToolRegistry`、轻量 JSON Schema 校验、独立 toolCallId、受控执行 context、Abort 和统一 Tool Result envelope。
- 将无副作用的 `echo`、`get_agent_runtime_info` 迁移为共享内置 Tool Definitions；Agent Core 不再硬编码具体 Tool handler。
- 桌宠与独立聊天窗口在 renderer 启动时各创建一次稳定 Registry，并共享相同 Definition 来源。
- 增加 `registry.listDefinitions()` 安全导出，明确排除 handler、metadata 和内部 context，为未来 Provider Adapter 预留边界。
- 增加 `docs/P1-3-TOOL-REGISTRY.md` 和 `npm.cmd run test:tools`；未引入 Permission 或任何真实高权限 Tool。
- GPT 严格审阅确认 `BLOCKERS: 0`；阶段实现提交为 `5bed161`，恢复标签为 `v1.1.7-p1.3-tool-registry`。
- 后续约束：P1-4 的权限状态必须以中央服务为唯一事实源，不能随两个 renderer 的 Registry 实例各自复制。

### P1-2 Cognition + Context Builder（CLOSED / PASS）

- 新增 Teemo Profile、Recent Context、按 projectId 隔离的 Project Context 和 Observation 数据模型。
- 新增不调用模型的保守 Cognition Collector，支持重复证据升级、用户纠正 supersede 与敏感凭据拦截。
- 新增有预算的模型无关 Context Builder，并以可选依赖接入 Agent Core 的流式/非流式路径。
- Cognition 数据只通过 TeemoStorageService 保存到本地 `Teemo-cognition.json`；Builder/Collector 失败不影响普通聊天。
- 补齐旧外围服务对 `TEEMO_ASSISTANT_DATA_DIR` 的隔离支持，避免完整 Electron 烟测读取正式用户目录。
- GPT 审阅后收紧作用域：active project 下的模糊审美默认归项目；指代纠正只有唯一候选时才允许 supersede/migrate。
- GPT 复审确认 `BLOCKERS: 0`，P1-2 正式封板；恢复标签为 `v1.1.7-p1.2-cognition-context`。
- 增加 `docs/P1-2-COGNITION-CONTEXT.md` 和 `npm.cmd run test:cognition` 隔离验证入口。

### P1-1 Agent Core

- 新增模型无关的 `TeemoAgentCore` 基础执行循环、Run/Step 状态、统一 Action Contract、取消和最大步骤保护。
- 新增仅内存运行的 `echo`、`get_agent_runtime_info` 安全测试 Tool。
- 保持普通聊天流式输出、模型切换、历史会话、Skill 注入和附件上下文兼容。
- 增加 `docs/P1-1-AGENT-CORE.md` 和 `npm.cmd run test:agent-core` 验证入口。
- GPT 审阅后补齐并发 Run 隔离与非法 Action schema 校验，P1-1 已确认封板。

### P1 前稳定基线

- 更新当前使用 SOP、README 和项目状态文档，统一记录 Teemo助理 v1.1.7、P0 恢复点及 P1 开发入口。
- 扩展 `.gitignore`，预留用户配置、聊天历史、个人 Skill、上传文件、缓存和 Memory/Cognition 数据的保护边界。

### 产品命名

- 产品显示名称、安装包和快捷方式统一为 `Teemo助理`。
- Electron 应用标识更新为 `cn.teemo.assistant`。
- 旧“哈啰设计助手”仅保留在历史安装产物和兼容业务字符串中，不再用于新版本命名。

### 启动图标

- Windows 应用图标、安装包图标和快捷方式图标统一替换为 `D:\Teemo助手\Teemo.png`。

## v1.1.6-p0-closed - 2026-08-09

### 产品命名

- 后续产品显示名称、安装包和快捷方式统一为 `Teemo助理`。
- 旧“哈啰设计助手”仅作为历史安装产物名称，不再用于新版本。

### P0 收尾

- 建立唯一源码基线：`D:\Teemo助手\Teemo机器人项目\Teemo-source`
- 统一 AI、存储、本地文件三个核心 Service 入口
- 增加 `AGENTS.md`，规范多 AI 协作、数据保护、权限边界、Git 和测试流程
- 增加 StorageService 安全写入保护：读取失败不覆盖原文件，JSON 临时文件校验后替换
- 增加多 AI 工作区防覆盖规则
- 完成隔离 Storage、FileService、AIService 和 Electron smoke tests
- 从唯一源码完成 Windows clean install/build/package 验证

### 保留到 P1

- Agent Core
- Tool Calling
- 统一 Permission Layer 实现
- Memory / Teemo Cognition / Agent Creative Profile
- FileTool 写入、Patch、Git 和 Shell 执行能力

### 已知风险

- 当前依赖树 `npm ci` 报告 11 项 audit vulnerabilities（10 high、1 critical），后续单独处理。
- 旧兼容模块和外围存储逻辑暂未删除或完全迁移。
