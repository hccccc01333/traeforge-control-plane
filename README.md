# TraeForge Control Plane

本项目是一个本地优先的 TRAE 企业插件机制原型：用一个 `.trae-plugin` 包统一分发 Skills、Rules、MCP 配置、二进制工具和资源，并通过 TRAE 内置的 Control Plane UI 做盘点、预览和安装。

## Components

- `trae-forge/` — TRAE Skill、TraePack 能力包和静态能力盘点
- `plugin/` — `.trae-plugin` 打包、校验、安装和版本注册工具
- `control-plane/` — TRAE VS Code-compatible Activity Bar UI 扩展

## Status

Current baseline: `v0.3.0`.

The current UI provides static preflight. Runtime MCP exposure, agent routing, and MTC/CODE context continuity remain the next upgrade target.

## Safety

- Installation defaults to preview mode.
- Applying changes requires explicit `-Apply` or UI confirmation.
- Existing project files are backed up before overwrite or MCP merge.
- The tooling does not delete files, modify TRAE executables, or edit TRAE private session databases.

See [trae-forge/CHANGELOG.md](trae-forge/CHANGELOG.md) for version history.
