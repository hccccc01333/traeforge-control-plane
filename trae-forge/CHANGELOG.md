# Changelog

## 0.8.0 — 2026-08-19

- 将 TRAE Activity Bar 入口重命名为 `TraeForge Doctor`。
- 首屏压缩为当前状态、发现的问题、修复三个用户区域。
- 将 Preflight、MCP Probe、Runtime Evidence、Contract Test 收进技术详情，底层能力继续保留。
- 增加全局 Skill 复制到项目的安全修复动作，目标已存在时先备份。
- 将 UNKNOWN、FAIL、PASS 翻译成“待确认、有问题、正常”等用户可读状态。

## 0.7.0 — 2026-08-19

- Added Contract Test manifests under `.trae/traeforge/contracts.json`.
- Added staged PASS/FAIL/UNKNOWN checks for Rule discovery, Skill files, MCP tool exposure, observed tool calls, and file postconditions.
- Added Control Plane UI for controlled-task prompts and observable contract results; unknown runtime behavior is never promoted to PASS.
- Unified public product messaging around the TRAE Agent Capability Control Plane.

## 0.6.1 — 2026-08-19

- Fixed Control Plane PowerShell JSON decoding so Chinese diagnostics remain readable across Windows code pages.

## 0.6.0 — 2026-08-19

- Added a read-only, redacted TRAE runtime evidence summary for rule discovery, MCP toolhost state, and observed tool calls.
- Added Control Plane UI for log evidence with explicit unknown states for model compliance and the final tool set.

## 0.5.0 — 2026-08-19

- Added a safe stdio MCP runtime probe using `initialize` and `tools/list` only.
- Added Control Plane UI for MCP probe results, tool counts, tool names, and failure reasons.
- Added explicit confirmation before starting configured MCP processes.

## 0.4.0 — 2026-08-19

- Added `preflight` and `doctor` diagnostics for project/global capability splits.
- Added static MCP tool-count and schema-size budget risk checks.
- Added explicit “runtime exposure still unknown” diagnostics instead of overstating static inventory.
- Updated Control Plane copy from enterprise distribution to community pain-point diagnosis.

## 0.3.0 — 2026-08-19

- Added the local `.trae-plugin` package format for Skills, Rules, MCP configuration, binaries, and assets.
- Added plugin pack, inspect, validate, install-preview, install, and registry workflows.
- Added the TRAE Control Plane extension with Activity Bar UI.
- Added PowerShell runtime auto-discovery for the TRAE extension host.
- Added static capability inventory and JSON reporting.

## 0.2.0 — 2026-08-19

- Added global TRAE Skills, MCP, and installed-plugin manifest scanning.
- Added package hash validation and redacted JSON reports.

## 0.1.0 — 2026-08-19

- Added local TraePack scanning, export, preview install, diff, and secret scanning.
