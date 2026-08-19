# TraeForge Plugin V0.8

这是一个本地优先的 TRAE 插件分发模块原型，不是 TraeForge 的主产品叙事。插件包扩展名为 `.trae-plugin`，内部是 ZIP，统一携带：

- `skills/`：一个或多个 `SKILL.md`
- `rules/`：项目级规则
- `mcp/`：MCP Server 配置，安装时可合并到当前项目 `.trae/mcp.json`
- `bin/`：插件自带的 CLI/MCP 二进制工具
- `assets/`：图标、模板等资源
- `plugin.json`：插件身份、版本、能力和文件哈希

## 创建插件

```powershell
pwsh -File .\scripts\traeplugin.ps1 -Command pack `
  -SourcePath .\my-plugin `
  -OutputPath .\my-plugin.trae-plugin
```

插件源目录示例：

```text
my-plugin/
├─ .trae-plugin/plugin.json
├─ skills/code-review/SKILL.md
├─ rules/review.md
├─ mcp/mcp.json
└─ bin/review-mcp.exe
```

## 校验、预览和安装

```powershell
pwsh -File .\scripts\traeplugin.ps1 -Command validate `
  -PluginPath .\my-plugin.trae-plugin -Json

pwsh -File .\scripts\traeplugin.ps1 -Command install `
  -PluginPath .\my-plugin.trae-plugin `
  -ProjectPath (Get-Location).Path -Json

# 用户明确确认后才应用
pwsh -File .\scripts\traeplugin.ps1 -Command install `
  -PluginPath .\my-plugin.trae-plugin `
  -ProjectPath (Get-Location).Path -Apply
```

安装会记录到：

```text
C:\Users\Hzz\.trae-cn\traeforge\registry.json
C:\Users\Hzz\.trae-cn\traeforge\plugins\<id>\<version>\
```

当前原型支持版本并存和 activeVersion 记录；覆盖已有项目文件前会备份到项目 `.trae/traeforge/backups/`。没有卸载命令，也不会删除文件。

## plugin.json 最小格式

```json
{
  "id": "acme.code-review",
  "name": "Acme Code Review",
  "version": "0.1.0",
  "description": "代码审查能力",
  "publisher": "Acme",
  "capabilities": ["skills", "rules", "mcp", "binaries"],
  "components": {
    "skills": ["skills/code-review/SKILL.md"],
    "rules": ["rules/review.md"],
    "mcp": ["mcp/mcp.json"],
    "binaries": ["bin/review-mcp.exe"]
  }
}
```

二进制工具不会自动加入系统 PATH；MCP 配置可以使用 `${pluginRoot}` 引用插件安装目录，例如：

```json
{
  "mcpServers": {
    "acme-review": {
      "command": "${pluginRoot}/payload/bin/review-mcp.exe"
    }
  }
}
```
