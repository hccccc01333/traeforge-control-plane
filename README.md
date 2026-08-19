# TraeForge — TRAE Agent Capability Control Plane

Skill、Rule、MCP 明明装了，TRAE 为什么还是不会用？TraeForge 用一套 Control Plane 把能力从“文件存在”追踪到“运行时调用”，再用 Contract Test 验收可观察结果。

这是一个本地优先的 TRAE 痛点修复原型：把分散的 Skills、Rules、MCP 配置和运行时可见性，收敛到可检查、可预览、可回滚、可验收的工作流。

## Components

- `trae-forge/` — TRAE Skill、TraePack 能力包和静态能力盘点
- `plugin/` — `.trae-plugin` 分发模块：打包、校验、安装和版本注册（用于降低重复配置成本，不绑定企业版）
- `control-plane/` — TRAE VS Code-compatible Activity Bar UI 扩展

## Status

Current baseline: `v0.7.0`.

The current UI provides static preflight diagnostics for project/global splits, tool-budget risk, duplicate MCP metadata, and the runtime boundary. It also offers an explicit-confirmation stdio MCP probe that sends only `initialize` and `tools/list`, a redacted TRAE log evidence summary, and Contract Test checks for Rule/Skill discovery, MCP exposure, observed tool calls, and file postconditions.

## Reality check

This repository is an honest local prototype, not a claim that TRAE's model runtime is already fixed.

It currently solves the file/runtime boundary: discovery, previews, backups, local package installation, static diagnostics, stdio MCP smoke probes, log-based evidence summaries, and observable contract checks.

It does not force a model to follow Rules, expose TRAE's complete private tool set, or make remote MCP behavior deterministic. When TRAE does not expose the corresponding evidence, the UI reports `UNKNOWN`; it never upgrades missing evidence to `PASS`.

## V0.7 contract loop

Put a manifest at `.trae/traeforge/contracts.json`, run the controlled task shown in the UI, then click `契约验收`. The Control Plane verifies observable postconditions and reports `PASS`, `FAIL`, or `UNKNOWN` for each test. See [contracts.example.json](control-plane/trae-forge-control-plane/contracts.example.json).

## Safety

- Installation defaults to preview mode.
- Applying changes requires explicit `-Apply` or UI confirmation.
- Existing project files are backed up before overwrite or MCP merge.
- The tooling does not delete files, modify TRAE executables, or edit TRAE private session databases.

See [trae-forge/CHANGELOG.md](trae-forge/CHANGELOG.md) for version history.
