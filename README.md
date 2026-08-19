# TraeForge Control Plane

本项目是一个本地优先的 TRAE 痛点修复原型：把分散的 Skills、Rules、MCP 配置和运行时可见性，收敛到可检查、可预览、可回滚的工作流，并通过 TRAE 内置的 Control Plane UI 反馈“为什么当前能力可能不可用”。

## Components

- `trae-forge/` — TRAE Skill、TraePack 能力包和静态能力盘点
- `plugin/` — `.trae-plugin` 打包、校验、安装和版本注册工具（用于降低重复配置成本，不绑定企业版）
- `control-plane/` — TRAE VS Code-compatible Activity Bar UI 扩展

## Status

Current baseline: `v0.6.1`.

The current UI provides static preflight diagnostics for project/global splits, tool-budget risk, duplicate MCP metadata, and the runtime boundary. It also offers an explicit-confirmation stdio MCP probe that sends only `initialize` and `tools/list`, plus a redacted TRAE log evidence summary for rule discovery, MCP toolhost state, and observed tool calls. Agent compliance and the final complete tool set remain explicit unknowns when TRAE does not log them.

## Safety

- Installation defaults to preview mode.
- Applying changes requires explicit `-Apply` or UI confirmation.
- Existing project files are backed up before overwrite or MCP merge.
- The tooling does not delete files, modify TRAE executables, or edit TRAE private session databases.

See [trae-forge/CHANGELOG.md](trae-forge/CHANGELOG.md) for version history.
