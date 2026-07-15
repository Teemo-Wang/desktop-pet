# 桌宠项目 · 继续优化指南（交接文档）

> 用途：在**新对话**里用 `#File` 引用本文件（或直接把内容粘给 AI），即可快速接上进度继续优化。
> 最后更新：2026-07（第二轮，规范生图专项）｜当前版本 v1.1.1

---

## 0. 最新进度速览（第二轮，务必先读）

**本轮聚焦「按品牌规范生图」，已完成：**

1. **钉钉引用回复识别**（`dingtalk-bridge.js`）：新增 `_extractQuote()` 容错解析被引用消息，图片下载码并入 `imageDownloadCodes`；透出 `quotedText`；文本含疑似引用字段时打诊断日志。
2. **发图结果记入参考图**（`app.js` `sendReplyToConv`）：机器人每次发出结果图后幂等写入 `task-context` 当前参考图 → 用户「引用这张图/按这个改」能取到正确原图（跳过找素材候选图与 data:URL）。
3. **通用规范生图引擎** `_specVisualFromTemplate(convId, text, cfg, userRef, composeOpts)`（`app.js`）：banner/弹窗/宽幅共用；新增板块只加一份 cfg。两条路径——路径 A（用户主视觉→版式合成→图生图）、路径 B（搜 DesignHub 模板→图生图）。
4. **三个规范板块**（都是引擎的薄配置）：
   - 头图氛围 **1170×879** `_specBannerFromTemplate`（左文右图）
   - 宽幅横幅 **702×180** `_specWideBannerFromTemplate`（头图延展；附图=整图合成，延展现有图=裁右侧主视觉）
   - 弹窗 **594×790** `_specPopupFromTemplate`（竖版，主视觉居中偏下）
5. **用户主视觉版式合成** `_composeSpecCanvas()`（Canvas）：把主视觉按规范摆位（右侧/居中偏下）+ `srcRegion` 源裁剪（延展时取右侧主视觉丢弃旧文案）+ 区域 clip（不侵入文案留白区）+ 背景采样色填充。解决「外部图直接图生图主体被放中间」。
6. **参考图回溯** `_resolveSpecUserRef()`：当前消息没带图时回溯最近 12 条对方发的图 → 解决「图文分两条发」取不到主视觉。
7. **规范 skill 注入生图**：新增 `skills/蓝莓头图banner规范.md`（1170×879 规范）；`_findSpecRuleText/_injectSpecRule` 按技能名找到该 skill 正文并注入 seedream 提示词（**改 md 即改生图**）。目前仅头图板块挂了 `ruleKeywords`。
   - ⚠️ 生效前提：该 `.md` 必须**上传到技能中心**（运行时从 `~/.hellobike-pet/skills.json` 按名查找）。

**🟡 当前需要真实验收：模板多样性与规范头图链路**
- 1170×879 Banner 现已将 4 个 DesignHub 搜索词的候选合并去重，使用无偏随机选择两张不同模板；候选不足两张时只输出一版，禁止静默复用同一模板。
- 两版分别追加自然户外/开阔动态的差异化创作方向，仍遵守左文右图、Logo、标题、CTA 与安全区规则。
- 钉钉测试后查看日志：`[specVisual:规范banner] 模板池=... 精准模板=... 选中=模板A / 模板B`；确认两张参考模板名称不同。
- 检查最终 PNG：保留 1170×879、左文右图与文案安全区，但两版应在环境、光线、镜头和人物活动感上明显不同。

---

---

## 一、项目是什么

哈啰两轮设计中心的**桌面 AI 助手（桌宠"小哈"）**，Electron 应用。整合：AI 对话、钉钉机器人（实名 AI 助理）、语雀文档、待办、技能系统、DesignHub 素材库改图、AI 生图。

- 运行时：Electron 31，原生 HTML/CSS/JS（无框架）
- 数据/配置：`~/.hellobike-pet/`（settings.json、skills.json、task-context.json、chat-history.json 等）
- 启动：`cd docs/desktop-pet && npm start`
- 当前版本：v1.1.1

## 二、关键目录/文件

```
docs/desktop-pet/
├── main.js                 # 主进程：窗口/代理/语雀IPC/钉钉Stream/生图相关IPC/全局错误兜底
├── dingtalk-bridge.js      # 钉钉 Stream 长连接 + 单聊/群聊发消息/发图(oToMessages vs groupMessages)
├── material-bridge.js      # DesignHub：登录/搜索/AI改图(dhGenerateVariant)/图片下载
├── src/
│   ├── app.js              # 渲染进程总入口 + buildTakeoverReply（意图路由）
│   │                        #   规范生图引擎：_specVisualFromTemplate / _spec{Banner,WideBanner,Popup}FromTemplate
│   │                        #   版式合成：_composeSpecCanvas ｜ 参考图回溯：_resolveSpecUserRef
│   │                        #   规范注入：_findSpecRuleText / _injectSpecRule
│   ├── ../skills/蓝莓头图banner规范.md  # 1170×879 头图规范(可编辑);需上传技能中心才生效
│   ├── services/
│   │   ├── ai.js           # 模型统一接入（send/stream/generateImage）；生图尺寸/模型family处理
│   │   ├── dingtalk-ai.js  # 钉钉消息 AI 层：decideAction(意图)/suggestReply/analyze
│   │   ├── skills.js       # 技能系统：getRules/getReferenceRules/findRelevantSkill
│   │   ├── material-service.js # DesignHub 渲染层：search/generateVariant/fetchImageAsDataUrl
│   │   ├── task-context.js # 会话任务上下文：改图任务/当前版本/参考图
│   │   └── yuque*.js        # 语雀读取/搜索
│   └── components/
│       ├── api-connect.js  # API 接入面板（供应商切换/生图模型多标签/独立Key地址）
│       ├── chat.js         # AI 对话面板（文生图/图生图/技能自动加载）
│       └── ...
```

## 三、本轮已完成的改动（重要）

1. **群聊发图修复**：群 @机器人发图走 `groupMessages/send`(openConversationId)，单聊走 `oToMessages/batchSend`(userId)。
2. **无关话题自由对话**：偏好设置加「允许闲聊」开关（work.allowChitchat），无关话题切通用 AI 对话。
3. **语雀全文检索**：main.js 新增 `yuque-search` IPC（官方 /api/v2/search），跨团队搜索。
4. **生图 API 入口开关**：`api-connect.js` 的 `SHOW_IMAGE_MODEL`（当前 true）。
5. **生图模型独立配置**：生图有独立 apiKey/baseUrl/options（多模型标签切换 + 删除×）。与对话供应商解耦。
6. **生图尺寸处理**（ai.js generateImage）：
   - 尺寸填 0/空 → 自适应；改图时按原图比例适配
   - 显式「宽x高」→ `_fitImageGenSize` 等比适配到 seedream 合规像素(≥368万)，再 `_resizeToExact` 降采样到精确尺寸
   - 模型 family 区分：**GPT-Image 系列不支持图生图/response_format**；seedream 支持
7. **全局错误兜底**（main.js）：`uncaughtException`/`unhandledRejection` 拦截网络类错误，关闭应用不再弹「A JavaScript error occurred」。
8. **AI 对话框文生图**：纯文字造图不再让聊天模型编造假图，改为真实调 generateImage。
9. **技能自动加载**：`skillService.findRelevantSkill(text)`，对话时命中技能名则注入该技能内容。
10. **规范 banner 全自动模板改图**（app.js `_specBannerFromTemplate`）：
    - 检测「按规范生成 banner」→ 自动搜 DesignHub「顶部氛围 1170_879」左文右图模板
    - 模板下载成图片 → 喂给 **seedream 图生图**（构图参考 + 内容/文字 AI 自由发挥）→ 出 2 版
    - DesignHub 改图作兜底
11. **意图理解提升**：有进行中改图任务时，画面描述型指令（"父与子/傍晚/背向/文案白色"）自动识别为改图迭代；`decideAction` 短超时 15s 快速回退关键词。

## 四、当前配置注意点（用户环境）

- **对话模型**：火山方舟 `doubao-seed-2-1-pro-260628`（地址 `https://ark.cn-beijing.volces.com/api/v3`）。⚠️ 之前用哈啰网关会频繁超时，务必用火山方舟。
- **生图模型**：哈啰生图服务，Key `sk-****（存本地，不入库）`，地址见内部生图服务网关，模型 Doubao-Seedream-4.5/5.0-lite（GPT-Image-2 只能纯文生图，不支持图生图）。
- **DesignHub**：需保持已登录（改图/搜模板依赖）。
- 生图 Key 和地址必须匹配同一平台，别混用（曾出现哈啰 Key 配火山地址的错配）。

## 五、已知限制 / 待办

| 方向 | 说明 | 优先级 |
|------|------|--------|
| **模板多样性真实验收** | 代码已汇总四组关键词、去重并随机选两张不同模板；需通过钉钉真实生成，确认日志中模板 A/B 名称不同、结果在环境/光线/人物活动感上明显不同。 | 🔴 最高（下一步） |
| **模板候选不足** | 当前每个搜索词只取第 1 页 20 条；若日志显示模板池仍不足两张，再扩展关键词或加入翻页搜索。 | 中 |
| **头图生成可控性** | Seedream 仍不能保证像素级文字与 Logo；当前采用「不同模板图生图 + 规范提示词」平衡重构度与版式遵从度。用户已明确拒绝 Canvas 精确排版和双 AI 图层合成，未经再次确认不得恢复。 | 观察 |
| **弹窗 594×790 / 宽幅 702×180 板块** | 已接入通用引擎，可用（真机验收待做）。 | 已完成 |
| **规范→提示词缓存** | 每次扩写慢，可把规范扩写成的提示词缓存复用。 | 中 |
| **网络稳定性** | 火山方舟/外部 API 偶发 SSL 握手失败(net_error -100)，建议查代理。 | 观察 |
| **打包自动更新** | Mac 未签名，自动更新装不上；需 Apple 开发者证书签名+公证。 | 低 |

## 六、开发/调试习惯（沿用）

- 改完 JS：`node --check <file>` 校验语法。
- 重启看效果：`pkill -f "desktop-pet/node_modules/electron"` 后 `npm start`。
- 看运行日志：进程 stdout 有 `[renderer:WARN]`、`[buildReply]`、`[specVisual:规范banner]`、`[dhGenerateVariant]` 等诊断日志。
- 打包：`npm run dist:mac`（target 已设 universal，产物在 dist/）。

## 七、新对话怎么快速开始

在新对话里说明诉求，并附上：
> 参考 #CONTINUE-HERE-继续优化指南.md，我要继续优化桌宠项目的 [具体功能]。

AI 就能据此快速定位相关文件继续。当前应优先从钉钉复测模板池和两版差异开始；如实际候选仍不足，再针对 DesignHub 命名、关键词或翻页策略优化。
