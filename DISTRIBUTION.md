# 打包分发与自动更新指南

本工具用 **electron-builder** 打包，用 **electron-updater + GitHub Releases** 做自动更新。
你（发布者）发一个新版本，同事的机器人下次启动会自动下载并提示重启更新。

---

## 一、一次性准备（只做一次）

### 1. 安装依赖
```bash
cd docs/desktop-pet
npm install
```

### 2. 准备 GitHub 令牌（用于发布）
- 到 GitHub → Settings → Developer settings → Personal access tokens
- 生成一个有 `repo` 权限的 token
- 打包发布前在终端设置环境变量：
```bash
export GH_TOKEN=你的token
```

### 3. 让 Releases 可被同事下载
electron-updater 从 `github.com/Teemo-Wang/desktop-pet` 的 Releases 拉更新。
- 若仓库是 **public**：同事无需任何配置即可自动更新（最省事，推荐）。
- 若仓库是 **private**：同事机器需要能访问私有 Release（要配 token），比较麻烦。
  - 替代方案见文末「内网托管（generic）」。

---

## 二、发布一个新版本（每次更新走这套）

1. **改代码**（比如更新了机器人规则/能力）。
2. **升版本号**：编辑 `package.json` 的 `version`，例如 `1.0.0` → `1.0.1`。
   （必须每次递增，否则不会被识别为新版本）
3. **打包并发布到 GitHub Releases**：
```bash
export GH_TOKEN=你的token
npm run release
```
   - 会自动构建 Mac（dmg + zip）安装包，上传到一个 **draft（草稿）Release**。
4. 到 GitHub 仓库的 Releases 页面，把该 draft **Publish（发布）** 出去。
5. 完成。同事的机器人**下次启动**会自动检测到新版本 → 静默下载 → 弹窗「立即重启更新」。

> 只想本地出安装包、不发布：`npm run dist`（产物在 `dist/` 目录）。

---

## 三、同事怎么安装（第一次）

1. 你把 `dist/` 里的安装包发给同事：
   - Apple 芯片 Mac：`哈啰设计助手-x.x.x-arm64.dmg`
   - Intel Mac：`哈啰设计助手-x.x.x-x64.dmg`
   - Windows：`哈啰设计助手-x.x.x-x64.exe`（如开了 win 目标）
2. 双击安装，拖到「应用程序」。
3. **首次打开**：Mac 未签名会提示「无法验证开发者」——右键点 App 图标 → 打开 → 再点「打开」即可（只需一次）。
4. 打开后各自在 **「API 接入」** 里配置**自己的**凭据：
   - 钉钉机器人 AppKey / AppSecret（每人用自己的机器人应用）
   - 素材库 DesignHub 登录（用本人公司账号）
   - AI 模型 Key
   > 凭据只存在各自本机 `~/.hellobike-pet/`，不随安装包分发，互不影响。

之后你每次发新版本，他们**无需重装**，启动时自动更新。

---

## 四、更新机制说明（重要）

- 更新的是**程序本体**（代码、机器人规则默认值、能力）。
- 「机器人回复规则」如果同事**没在界面里手动编辑过**，会跟随你发布的默认规则更新；
  一旦对方点过「保存并生效」，就会用他自己的覆盖版（`~/.hellobike-pet/skill1-rules.md`），
  你的默认更新不再自动覆盖他（可点「恢复默认」拿回最新）。
- 用户数据（会话、任务、配置）保存在 `~/.hellobike-pet/`，更新不会清空。

---

## 五、已知限制

- **Mac 自动更新需要代码签名**：未签名的 App，electron-updater 在 macOS 上可能无法静默应用更新
  （会下载但装不上）。两种解法：
  1. 用 Apple 开发者证书签名 + 公证（正式做法，需 99 美元/年开发者账号）；
  2. 不签名时，每次发版让同事**手动下载新 dmg 覆盖安装**（把「自动更新」当「自动提醒 + 手动装」）。
  - Windows 未签名可以自动更新，只是首次装有 SmartScreen 提醒。
- 首个正式版建议先在 1-2 台机器验证「自动更新」链路跑通，再全员推。

---

## 六、可选：内网托管（不想用 GitHub）

若不便用 GitHub，可把 `publish` 换成 generic，指向内网静态服务器/对象存储：

```json
"publish": [
  { "provider": "generic", "url": "https://你的内网地址/desktop-pet/" }
]
```
然后 `npm run dist` 出包，把 `dist/` 里的安装包和 `latest-mac.yml` / `latest.yml` 一起上传到该地址即可。
