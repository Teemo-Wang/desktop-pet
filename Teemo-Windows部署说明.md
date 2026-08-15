# Windows 部署说明

## 已适配内容

- 使用 Windows 应用图标，不再把 macOS `.icns` 传给 Windows 窗口。
- 使用主显示器真实工作区坐标，兼容多显示器和任务栏位置。
- Windows 置顶窗口使用受支持的 `normal` 层级。
- 设置稳定的 AppUserModelID，改善通知、快捷方式和窗口分组行为。
- NSIS 安装器创建桌面与开始菜单快捷方式，并保留卸载后的用户配置。
- 提供 `Teemo-start-windows.cmd` 双击启动入口。

## 本机开发启动

首次安装 Node.js 后需要重新打开终端。随后可直接双击：

```text
Teemo-start-windows.cmd
```

脚本会在依赖缺失时自动执行 `npm install`，然后启动桌宠。

## 构建 Windows 安装包

```powershell
npm run dist:win
```

安装包输出到 `dist` 文件夹。当前目标为 Windows x64，适合本机使用。

## 本地配置

- AI 与代理基础配置：项目内 `config.json`
- 语雀团队令牌：把 `yuque-teams.example.json` 复制为 `yuque-teams.local.json` 后填写
- 用户运行数据：`%USERPROFILE%\.hellobike-pet\`

不要把真实 API Key、AppSecret 或语雀 Token 提交到 Git。
