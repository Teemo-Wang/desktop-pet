# Changelog

## v1.1.7 - 2026-08-09

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
