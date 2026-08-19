# Changelog

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
