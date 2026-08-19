# TraeForge Control Plane V0.4

这是一个直接接入 TRAE 的本地扩展原型。它在 Activity Bar 增加 `TraeForge` 入口，提供：

- 当前项目与 TRAE 全局能力盘点
- Skills、MCP 文件、插件 manifest 计数
- 静态可见性诊断
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

这版 UI 会输出项目/全局能力的 `preflight` 诊断，明确告诉用户配置分裂、预算风险和运行时未知边界。它还没有读取 TRAE 私有会话数据库，也不会假装知道 Agent 的最终工具暴露结果；运行时继承状态会明确标记为“需实际调用验证”。
