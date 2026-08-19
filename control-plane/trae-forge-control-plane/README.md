# TraeForge Control Plane V0.6

这是一个直接接入 TRAE 的本地扩展原型。它在 Activity Bar 增加 `TraeForge` 入口，提供：

- 当前项目与 TRAE 全局能力盘点
- Skills、MCP 文件、插件 manifest 计数
- 静态可见性诊断
- 当前项目 stdio MCP 的运行时 `initialize/tools/list` 探测
- 读取 TRAE 最新日志的脱敏运行时证据摘要：规则发现计数、MCP runtime 状态和已发生工具调用
- JSON 报告生成
- `.trae-plugin` 插件包选择、预览和确认安装
- 已注册本地插件列表

当前版本使用 TRAE 的 VS Code-compatible extension host，安装到：

```text
D:\Trae CN\resources\app\extensions\trae-forge-control-plane\
D:\TRAE SOLO CN\resources\app\extensions\trae-forge-control-plane\
```

重新启动对应 TRAE 后，在左侧 Activity Bar 打开 `TraeForge`。如果 Activity Bar 没有显示，也可以通过命令面板运行：

```text
TraeForge: Open Control Plane
```

这版 UI 会输出项目/全局能力的 `preflight` 诊断，并可对当前项目的 stdio MCP 做非业务调用探测，明确告诉用户 Server 实际返回了哪些工具。点击“读取 TRAE 日志”后，还能看到 TRAE 自己记录的规则加载计数、MCP toolhost 状态和已经发生的工具调用。日志只输出摘要，不展示对话正文、token 或原始日志。

日志证据仍有边界：它可以证明 TRAE 发现了多少规则、某个工具是否曾被调用，但不能单独证明模型是否遵守规则，也不能证明完整工具集合或远程 MCP 的最终状态。
