# Teemo T1 实施方案（先评估，未改代码）

日期：2026-08-14  
对照：`c:\Users\Teemo\Desktop\Teemo-Cursor-Plugin-Optimization-Task.md`  
状态：**只出方案，等你确认后再动手**

---

## 1. 结论（先看这段）

T1 可以做，而且应该做得很小。

**做：** 在现有聊天出图前面，加一层很薄的「能力 + ComfyUI 插件」。  
**不做：** 不重写 Agent、权限、Skill 路由、整个 Runtime，也不做插件市场、视频、云端评分。

验收仍是那句：

> 使用产品海报 Skill 做一张科技感新品 KV

系统自动：命中 Skill → 要 `image.generate` → 找到 ComfyUI 插件 → 跑对应工作流 → 图片回到聊天。  
你不用打开 ComfyUI、不用复制提示词、不用自己点工作流。

---

## 2. 现在代码实际怎么走

你日常用的是独立聊天窗 `Teemo-chat-window`，不是桌宠里那块旧聊天面板。

当前出图（`Teemo-chat-window.js` 大约 4188–4249 行）：

```
你说话
  → 关键词 / AI 判断「要不要出图」
  → 若本机 ComfyUI 开着：直接 comfyui.generate()
  → 否则：ai.generateImage()（云端）
```

Skill 现在只做两件事：

1. 普通聊天时，把 Skill 说明书塞进对话（Agent 已有）
2. 出图时，在 `buildComfyPrompt()` 里帮忙扩写成英文提示词

Skill **不会**选工作流。工作流永远用设置里「当前启用」的那一条（`activeWorkflowId`）。

这和任务文档要的差距只有这一段：

```
现在：聊天 → generateImage / comfyui.generate
目标：聊天 → Agent/Skill → image.generate → ComfyUI Plugin → 工作流
```

ComfyUI 服务本身（`src/services/Teemo-comfyui.js`）已经能导入 API 工作流、填提示词、出图。**不要重写它，只包一层。**

另外还有一条「运行时」里的固定 SDXL 工具（`comfyui_builtin_render`，权限很严）。那是 P4 安全通道，T1 **不要动、不要替换**。聊天出图继续走导入工作流这条。

---

## 3. 必须先说清的源码问题

Cursor 工作区 `I:\Vibe Coding\codex\Teemo-desktop-pet` 里：

- 有：聊天窗、`TeemoComfyUIService`、出图意图
- **缺：** `src/skills/`、`src/agent/`、`src/permissions/` 等 P0–P5 文件  
  （`main.js` 和聊天窗 HTML 已经在引用它们，但这个目录里读不到）

正式源码 `D:\Teemo助手\Teemo机器人项目\Teemo-source` 里：上述文件都在，而且也有 `Teemo-comfyui.js`。

**开工前置（仍不算改功能）：**  
T1 必须做在「Skill 路由 + 导入工作流」同时存在的代码上。建议以正式源码为准，或先把正式源码里已有的 Skill/Agent/权限文件原样同步到 Cursor 工作区。  
在残缺目录里只改聊天窗，T1 验收句过不去。

你确认后，我会先对齐文件，再加 Plugin 层。

---

## 4. T1 做哪些、不做哪些

### 做（最小切片）

| 步 | 做什么 | 不做什么 |
|----|--------|----------|
| 1 | 增加 Capability 登记：只注册 `image.generate`、`workflow.execute` | 不做 `video.generate`、不做评分式 Provider |
| 2 | 把现有 `TeemoComfyUIService` 包成 `teemo-comfyui` 插件 | 不重写 ComfyUI 连接、节点、队列 |
| 3 | Skill 清单增加可选声明：`requires`、`workflow` | 不重写 Skill 路由算法 |
| 4 | 聊天出图改为：Skill → Capability → 插件 | 不改旧桌宠聊天、不改 DesignHub |
| 5 | 插件可加载 / 可关闭；关闭后普通聊天照常 | 不改权限内核、不新增删文件/Git 能力 |

### 明确不做

- 重写 Agent Core / Permission / Skill 系统 / 整个 Runtime
- 为了模仿 DeepSeek 搭新框架
- 一次性把语雀、Eagle、DesignHub、钉钉都 Plugin 化
- 自动在 GPT Image / ComfyUI / Grok 之间打分
- 手机、个人素材库、反推、洗图（那些是 T2 以后）

---

## 5. 建议的最小改动路径（确认后按这个顺序）

### 第 0 步：对齐源码（前置）

把正式源码里聊天窗已经引用、但 Cursor 目录缺失的文件原样补齐。不改它们的逻辑。

### 第 1 步：新建很薄的两层（新文件，Teemo 前缀）

建议放在 `src/` 下，才能被聊天窗加载（只放 `teemo/` 文件夹，软件加载不到）：

| 新文件 | 作用 |
|--------|------|
| `src/capability/TeemoCapabilityRegistry.js` | 登记「能力名称 → 哪个插件」；找不到时中文报错 |
| `src/plugins/TeemoPluginRuntime.js` | 启动时加载插件、关闭时卸载；关闭不影响聊天 |
| `src/plugins/TeemoComfyUIPlugin.js` | 包一层现有 `TeemoComfyUIService` |

插件接口按任务文档，保持最小：

- `activate()`：ComfyUI 在设置里开启时注册两个能力
- `deactivate()`：取消注册；之后走普通聊天
- `registerCapability()`：声明自己能提供 `image.generate`、`workflow.execute`
- `execute(capability, input)`：内部仍调用现有 `comfyui.generate()`

第一版默认：`image.generate` **只指向 ComfyUI 插件**。云端生图仍留着当 ComfyUI 没开时的旧退路，不做新的 Provider 评分。

### 第 2 步：Skill 只加字段，不换系统

在现有导入器里多读两个可选字段（没有就当普通 Skill）：

```yaml
name: 产品海报
requires:
  - image.generate
workflow:
  - product-poster-v1
```

改动点：

- `src/skills/TeemoSkillImporter.js`：读 `requires` / `workflow`
- `src/skills/TeemoSkillValidator.js`：允许这两个可选数组，缺省为空
- **不改** `TeemoSkillRouter.js` 的匹配算法（「使用 XX Skill」已经能命中）

再准备 **1 个演示 Skill**（名称带 Teemo，例如 `skills/Teemo-product-poster/SKILL.md`），专门给验收句用。  
工作流名字必须和设置里已导入的某一条对得上；对不上就中文告诉你「缺哪条工作流」，不报英文。

### 第 3 步：ComfyUI 服务只加一个小参数

文件：`src/services/Teemo-comfyui.js`

现在 `generate()` 只用设置里的「当前工作流」。  
T1 给它增加可选 `workflowId` / `workflowName`。没传则行为与现在完全一样。

### 第 4 步：聊天窗只改出图这一段

文件：

- `Teemo-chat-window/Teemo-chat-window.html`（多加载 3 个脚本）
- `Teemo-chat-window/Teemo-chat-window.js`（启动时 activate 插件；出图不再直接 `comfyui.generate`）

新流水线：

```
判断要出图（原有意图 或 Skill 声明了 image.generate）
  → Skill 路由（已有，不重写）
  → 看 Skill 是否要求 image.generate
  → Capability 找 ComfyUI 插件
  → 插件按 Skill 的 workflow 调用现有 generate()
  → 图片回聊天（沿用现有存档）
```

普通聊天、规划、读文件、灵感、认知：**原路不动**。

### 第 5 步：权限怎么遵守（不改权限内核）

任务要求：Agent → Permission → Plugin，插件不能绕过权限。

T1 采用**不改 Permission 文件**的做法：

- 插件 `activate()` 前检查设置里 ComfyUI 是否开启
- 关闭插件或未开启时，不注册能力；聊天仍可用
- 不把聊天出图接到 `comfyui_builtin_render`（那条工作流是写死的，会破坏「用你导入的工作流」）
- 不给插件开放删文件、Git、任意命令

这是有意的最小路径：遵守「禁止改变 Permission」，同时不绕过你已经设好的 ComfyUI 开关。

---

## 6. 涉及文件清单

### 新建

| 文件 | 原因 |
|------|------|
| `src/capability/TeemoCapabilityRegistry.js` | Capability 层 |
| `src/plugins/TeemoPluginRuntime.js` | 加载/关闭插件 |
| `src/plugins/TeemoComfyUIPlugin.js` | 第一个插件 |
| `skills/Teemo-product-poster/SKILL.md`（或同等 Teemo 命名） | 验收用 Skill |
| `teemo/Teemo-T1实施方案.md` | 本文 |

### 小改

| 文件 | 改什么 | 风险 |
|------|--------|------|
| `src/skills/TeemoSkillImporter.js` | 多读 requires / workflow | 低：旧 Skill 没有这些字段也能用 |
| `src/skills/TeemoSkillValidator.js` | 允许可选字段 | 低：缺省空数组 |
| `src/services/Teemo-comfyui.js` | generate 可指定工作流 | 低：不传参数则与现在相同 |
| `Teemo-chat-window/Teemo-chat-window.html` | 引入新脚本 | 低 |
| `Teemo-chat-window/Teemo-chat-window.js` | 启动插件 + 出图走 Capability | **中**：这是唯一行为变化点 |

### 禁止改

| 文件 | 原因 |
|------|------|
| `src/agent/TeemoAgentCore.js` | 禁止重写 Agent |
| `src/permissions/TeemoPermissionService.js` 及 IPC | 禁止改权限 |
| `src/skills/TeemoSkillRouter.js` | 禁止重写 Skill 系统 |
| `src/runtime/TeemoComfyWorkflowService.js` | 固定 SDXL 安全通道，不是 T1 |
| `src/cognition/*`、`src/creative/*` | 回归范围，T2 再修误记 |
| `src/inspiration/*` | 已是 Connector，不要再包一层 |
| `src/app.js`、`src/components/chat.js` | 旧面板 / DesignHub 关键词，不进 T1 |
| `src/services/ai.js` 的云端 generateImage | 第一版不改 Provider 评分 |

---

## 7. 风险点

| 风险 | 会怎样 | 怎么降 |
|------|--------|--------|
| 两套源码不一致 | 在缺文件的工作区改完，正式版没有 Skill 路由 | 先对齐，再改；改完同步两份 |
| 两套聊天 | 只改新窗口，旧面板仍直接出图 | T1 只保证新窗口；旧面板保持原样 |
| 两套 ComfyUI | 误接到固定 SDXL 工具 | 插件只包 `TeemoComfyUIService` |
| Skill 名字对不上 | 「使用产品海报 Skill」命中不到 | 演示 Skill 名称/别名写成「产品海报」 |
| 工作流名字对不上 | 插件找不到 `product-poster-v1` | 中文报错，并回退说明「当前启用的工作流是哪条」；不擅自乱跑 |
| 出图误触发 | 普通聊天被当成生图 | 仍要「明确出图」或「Skill 声明了 image.generate 且用户明确要图」；不确定则聊天 |
| 关闭插件 | 影响普通聊天 | deactivate 只取消两个能力；Agent 聊天不依赖它们 |
| 权限被改坏 | P0–P5 回退 | 本阶段不改任何 Permission 文件 |
| 旧 Skill 清单校验失败 | 加字段后旧数据读不出来 | 新字段必须可选，缺省为空 |

---

## 8. 验收与测试（确认后按此测）

### 必须过

1. **插件能加载**：启动聊天窗后，Capability 里能看到 `image.generate`
2. **插件能关闭**：设置里关掉 ComfyUI 或卸载插件后，普通聊天仍可用
3. **找不到能力**：关掉插件后还要求出图，中文说明「生图能力不可用」，不是英文报错
4. **Skill 能声明能力**：演示 Skill 的 `requires: image.generate` 能被读到
5. **工作流能跑**：本机 ComfyUI 开着、已导入对应工作流时，验收句能出图并出现在聊天里

### 不能坏

- 普通聊天
- 读本地文件（需批准的那条）
- Permission 弹窗与批准模式
- Skill 中心导入/切换
- Cognition / Creative Profile 页面

### 建议你这边配合的一次真机条件

- ComfyUI 已开（`127.0.0.1:8188`）
- 设置里已导入 **1 条** 你常用的文生图工作流
- 把该工作流的名称或备注告诉我，或接受演示 Skill 先绑定「当前启用的工作流」

若你暂时没有叫 `product-poster-v1` 的工作流：第一版允许演示 Skill 写「用当前启用工作流」，先跑通闭环，再绑死名字。

---

## 9. 需要你拍板的 3 件事

1. **实施目录**  
   A. 先把正式源码缺失文件同步进 Cursor 工作区，然后在工作区改（推荐，方便你在这边看）  
   B. 直接在正式源码改，再拷回工作区

2. **工作流绑定**  
   A. 演示 Skill 先用「当前启用的工作流」（改动最小，最快验收）  
   B. 必须按 Skill 里的工作流名字精确匹配（更符合文档，但你要先有一条对应的导入工作流）

3. **云端生图**  
   A. ComfyUI 不可用时，仍走现在的云端退路（推荐）  
   B. T1 只允许 ComfyUI，没有插件就明确失败

默认我会按：**1-A、2-A、3-A**。

---

## 10. 确认后我才会做的事

你回复「按默认做」或给出上面 3 题的选择后，才开始：

1. 对齐缺失源码（原样，不改逻辑）
2. 加 Capability + ComfyUI 插件
3. Skill 可选声明 + 1 个 Teemo 演示 Skill
4. 聊天出图改走插件
5. 按第 8 节自测清单核对（能在本机跑的部分）

在你确认之前，**不会改任何产品代码**。
