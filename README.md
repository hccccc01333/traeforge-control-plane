# TraeForge Doctor — TRAE 能力体检插件

Skill、Rule、MCP 明明装了，TRAE 为什么还是不会用？打开 TraeForge Doctor，点一下就告诉你哪里出了问题、为什么，以及下一步怎么修。

这是一个本地优先的 TRAE 用户痛点修复插件。复杂的 Preflight、MCP Probe、Runtime Evidence 和 Contract Test 都保留在底层，但普通用户首先只看到状态、问题和修复。

## Components

- `trae-forge/` — TRAE Skill、TraePack 能力包和静态能力盘点
- `plugin/` — `.trae-plugin` 分发模块：打包、校验、安装和版本注册（用于降低重复配置成本，不绑定企业版）
- `control-plane/` — `TraeForge Doctor` TRAE VS Code-compatible Activity Bar 扩展

## Status

Current baseline: `v0.9.0`.

The current Doctor UI shows human-readable status for Skills, Rules, and MCP, lists problems with concrete next steps, and offers safe repair flows for global Skills and missing local Node commands in MCP configuration. Advanced details still provide static preflight diagnostics, an explicit-confirmation stdio MCP probe, a redacted TRAE log evidence summary, and Contract Test checks.

## Reality check

This repository is an honest local prototype, not a claim that TRAE's model runtime is already fixed.

It currently solves the first user workflow: inspect the problem, explain the likely cause, and take a safe repair action where the cause is known. The underlying engine covers discovery, previews, backups, local package installation, static diagnostics, MCP command resolution, stdio MCP smoke probes, log-based evidence summaries, and observable contract checks.

It does not force a model to follow Rules, expose TRAE's complete private tool set, or make remote MCP behavior deterministic. When TRAE does not expose the corresponding evidence, the UI reports `UNKNOWN`; it never upgrades missing evidence to `PASS`.

## V0.9 Doctor workflow

Open `TraeForge Doctor`, click `重新检测`, read the plain-language problem, and use `自动修复` when a safe action is available. For deeper verification, put a manifest at `.trae/traeforge/contracts.json`, then use `查看技术详情` to run MCP checks or actual-effect acceptance. See [contracts.example.json](control-plane/trae-forge-control-plane/contracts.example.json).

## Safety

- Installation defaults to preview mode.
- Applying changes requires explicit `-Apply` or UI confirmation.
- Existing project files are backed up before overwrite or MCP merge.
- The tooling does not delete files, modify TRAE executables, or edit TRAE private session databases.

See [trae-forge/CHANGELOG.md](trae-forge/CHANGELOG.md) for version history.
