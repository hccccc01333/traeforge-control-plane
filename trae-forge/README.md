# TraeForge Doctor V0.8

Skill、Rule、MCP 明明装了，TRAE 为什么还是不会用？TraeForge Doctor 点一下就告诉你哪里出了问题、为什么，以及下一步怎么修。

TraeForge Doctor 是安装在 TRAE CN 本地的用户入口；底层继续保留能力盘点、运行时探测、日志证据和 Contract Test，用来支撑可解释的诊断结果。

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
- TRAE Activity Bar 中的 `TraeForge Doctor` UI
- 当前项目 stdio MCP 的运行时工具列表探测
- 读取 TRAE 日志并生成脱敏运行时证据摘要
- Contract Test：作为底层诊断引擎，用控制任务和可观察后置条件验收 Rule、Skill、MCP 和工作流

## 当前不做

- 不解密或读取 TRAE 加密会话数据库正文
- 不解析 TRAE 私有任务状态 API
- 不修改 TRAE 安装目录 `D:\Trae CN\`
- 不删除文件
- 不自动修改 `installed-plugins.json` 或 `plugin-config.json`
- 不通过能力包直接安装插件 manifest；插件文件只用于盘点和校验
- 不自动把插件二进制加入系统 PATH

## 后续方向

1. Agent 行为验收：用可重复任务对比规则发现、工具调用和最终产出
2. 社区插件目录和版本通道
3. 插件权限策略、签名和审批流
4. Control Plane 的版本回滚 UI
