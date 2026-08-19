# TraeForge V0.4

TraeForge 是一个安装在 TRAE CN 本地的 Skill 和 Control Plane 原型，用来盘点、诊断、分发和管理 Skills、Rules、MCP 以及 CLI 工具。

## 本机安装位置

```text
C:\Users\Hzz\.trae-cn\skills\trae-forge\
```

## 当前实现

- 扫描项目级 `.trae/skills/`
- 扫描项目级 `.trae/rules/`
- 扫描项目级 `.trae/mcp.json`
- 扫描根目录 `AGENTS.md`
- 可选扫描项目 `scripts/`、`templates/`
- 可选扫描 `C:\Users\Hzz\.trae-cn\skills\`
- 可选只读扫描 `C:\Users\Hzz\.trae-cn\mcps\`
- 可选只读扫描已安装插件的 `.trae-plugin/plugin.json`
- 生成带哈希和依赖信息的 `manifest.json`
- 导出 `.traepack`
- 校验能力包 manifest、包内路径和每个文件的 SHA-256
- 生成不含绝对源路径和密钥原文的 JSON 盘点报告
- 导出前阻断疑似敏感信息
- 安装前预览差异
- 覆盖安装前创建备份
- `.trae-plugin` 插件包：统一携带 Skill、Rules、MCP 和二进制工具
- 插件包版本、文件哈希和本地注册表
- MCP 配置显式确认后自动合并到当前项目
- TRAE Activity Bar 中的 `TraeForge Control Plane` UI

## 当前不做

- 不读取 TRAE 加密会话数据库
- 不解析 TRAE 私有任务状态 API
- 不修改 TRAE 安装目录 `D:\Trae CN\`
- 不删除文件
- 不自动修改 `installed-plugins.json` 或 `plugin-config.json`
- 不通过能力包直接安装插件 manifest；插件文件只用于盘点和校验
- 不自动把插件二进制加入系统 PATH

## 后续方向

1. MCP 运行时探针：检查当前 Agent 实际看得到哪些工具
2. 社区插件目录和版本通道
3. 插件权限策略、签名和审批流
4. Control Plane 的版本回滚 UI
