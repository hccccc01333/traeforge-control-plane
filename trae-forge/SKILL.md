---
name: trae-forge
description: 本地优先的 TRAE Agent 能力控制台。用于扫描、预检、诊断、校验、导出、生成 JSON 报告、预览安装和比较项目中的 Skills、Rules、MCP、脚本与模板，并管理 .trae-plugin 分发包；默认不删除文件，安装默认只预览。
---

# TraeForge

TraeForge 是一个面向 TRAE CN 的本地 Agent 能力控制台 Skill。它把项目中的 `.trae/skills`、`.trae/rules`、`.trae/mcp.json`、`AGENTS.md`、脚本和模板整理成可审查的 `.traepack` 文件，并提供 `.trae-plugin` 分发模块，把 Skill、Rules、MCP 配置和二进制工具统一分发。

## 安全边界

- 只处理明确指定的项目目录，以及用户显式启用的 `C:\Users\Hzz\.trae-cn` 全局能力目录。
- `-IncludeTraeGlobal` 只读扫描全局 Skills、MCP 文件和 `.trae-plugin/plugin.json`；不读取加密会话数据库、日志数据库或进程内存。
- 导出前扫描 API Key、Token、Password、Bearer Token 和私钥；发现疑似密钥时默认阻止导出，报告只保留命中类型和行号，不保留原文样本。
- 安装命令默认只显示预览。只有用户明确要求应用并传入 `-Apply` 时才写入文件。
- 不删除文件。覆盖安装前会先创建时间戳备份。
- 已安装插件 manifest 仅用于盘点和校验，不通过能力包直接安装；全局 MCP 文件可在明确 `-Apply` 时按路径安装。
- `.trae-plugin` 安装前必须先预览；应用时会把 Skill 写入全局 Skill 目录、Rules 写入当前项目、MCP 合并到当前项目 `.trae/mcp.json`，并登记版本。

## 触发方式

用户说“扫描当前 TRAE 能力”“导出 TraePack”“检查这个包”“预览安装这个能力包”或“比较本地配置和能力包”时，使用脚本完成实际操作。

脚本位置：`scripts/traepack.ps1`

## 常用操作

```powershell
# 扫描当前项目
pwsh -File scripts/traepack.ps1 -Command scan -ProjectPath (Get-Location).Path

# 导出当前项目能力包；默认包含项目级 TRAE 文件
pwsh -File scripts/traepack.ps1 -Command export -ProjectPath (Get-Location).Path -OutputPath .\my-agent.traepack

# 同时检查全局 TRAE Skill
pwsh -File scripts/traepack.ps1 -Command scan -ProjectPath (Get-Location).Path -IncludeGlobalSkills

# 只读盘点 TRAE 全局 Skills、MCP 和已安装插件 manifest
pwsh -File scripts/traepack.ps1 -Command scan -ProjectPath (Get-Location).Path -IncludeTraeGlobal -Json

# 生成不含密钥原文的机器可读报告
pwsh -File scripts/traepack.ps1 -Command report -ProjectPath (Get-Location).Path -IncludeTraeGlobal -OutputPath .\traeforge-report.json

# 检查能力包内容
pwsh -File scripts/traepack.ps1 -Command inspect -PackPath .\my-agent.traepack

# 校验能力包内文件是否缺失或被改动
pwsh -File scripts/traepack.ps1 -Command validate -PackPath .\my-agent.traepack -Json

# 打包 TRAE 插件（源目录需要 .trae-plugin/plugin.json）
pwsh -File scripts/traeplugin.ps1 -Command pack -SourcePath .\my-plugin -OutputPath .\my-plugin.trae-plugin

# 校验 TRAE 插件
pwsh -File scripts/traeplugin.ps1 -Command validate -PluginPath .\my-plugin.trae-plugin -Json

# 预览 TRAE 插件安装；默认不写入
pwsh -File scripts/traeplugin.ps1 -Command install -PluginPath .\my-plugin.trae-plugin -ProjectPath (Get-Location).Path -Json

# 用户明确确认后应用安装
pwsh -File scripts/traeplugin.ps1 -Command install -PluginPath .\my-plugin.trae-plugin -ProjectPath (Get-Location).Path -Apply

# 诊断“为什么当前 Agent 可能看不到能力”
pwsh -File scripts/traepack.ps1 -Command preflight -ProjectPath (Get-Location).Path -IncludeTraeGlobal -Json

# 生成 .trae/traeforge/contracts.json 后，验收规则、Skill、MCP 和工作流后置条件
# Contract Test 的 PASS 只代表可观察检查全部通过；日志没有证据时会返回 UNKNOWN。

# 预览安装；不写入文件
pwsh -File scripts/traepack.ps1 -Command install -PackPath .\my-agent.traepack -ProjectPath (Get-Location).Path

# 用户明确确认后才应用安装
pwsh -File scripts/traepack.ps1 -Command install -PackPath .\my-agent.traepack -ProjectPath (Get-Location).Path -Apply

# 比较能力包和当前项目
pwsh -File scripts/traepack.ps1 -Command diff -PackPath .\my-agent.traepack -ProjectPath (Get-Location).Path
```

## 输出解释

- `ADDED`：包里有、本机没有。
- `CHANGED`：同一路径存在，但内容哈希不同。
- `UNCHANGED`：内容哈希一致。
- `CONFLICT`：安装目标已存在且无法安全自动覆盖。
- `SECRET`：发现疑似敏感凭据，导出会被阻止。
- `valid: false`：能力包 manifest、包内路径或文件哈希校验失败。

先展示扫描和 Diff 结果，再向用户说明将写入哪些路径。不要在用户没有明确确认时添加 `-Apply`，也不要自行删除或清理旧文件。
