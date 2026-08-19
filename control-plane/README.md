# TraeForge Doctor V0.8

TRAE 的 Skill、Rule、MCP 不生效？打开 TraeForge Doctor，点一下检查，它会告诉你哪里出了问题、为什么，以及下一步怎么修。

这是一个直接接入 TRAE 的本地扩展原型。首屏只保留三个用户动作：当前状态、发现的问题、修复；复杂诊断仍在“查看技术详情”中提供。

## 用户能看到什么

- Skills、Rules、MCP 当前状态：正常、需确认或有问题
- 人话问题说明：文件存在、TRAE 是否加载、MCP Server 是否能启动
- `重新检测`
- 对全局 Skill 的安全修复：选择后复制到当前项目，覆盖前自动备份
- `查看技术详情`：MCP 探测、TRAE 日志和实际效果验收

## 底层能力

- 当前项目与 TRAE 全局能力盘点
- Skills、MCP 文件、插件 manifest 计数
- 静态可见性诊断
- 当前项目 stdio MCP 的运行时 `initialize/tools/list` 探测
- 读取 TRAE 最新日志的脱敏运行时证据摘要：规则发现计数、MCP runtime 状态和已发生工具调用
- V0.8 Contract Test：验收 Rule/Skill/MCP 和文件后置条件，未知状态不伪装成通过
- JSON 报告生成
- `.trae-plugin` 插件包选择、预览和确认安装
- 已注册本地插件列表

当前版本使用 TRAE 的 VS Code-compatible extension host，安装到：

```text
D:\Trae CN\resources\app\extensions\trae-forge-control-plane\
D:\TRAE SOLO CN\resources\app\extensions\trae-forge-control-plane\
```

重新启动对应 TRAE 后，在左侧 Activity Bar 打开 `TraeForge Doctor`。如果 Activity Bar 没有显示，也可以通过命令面板运行：

```text
TraeForge: Open Doctor
```

Doctor 首屏把底层 `preflight` 诊断翻译成用户能直接处理的问题。展开技术详情后，可对当前项目的 stdio MCP 做非业务调用探测，读取 TRAE 自己记录的规则加载计数、MCP toolhost 状态和已经发生的工具调用。日志只输出摘要，不展示对话正文、token 或原始日志。

日志证据仍有边界：它可以证明 TRAE 发现了多少规则、某个工具是否曾被调用，但不能单独证明模型是否遵守规则，也不能证明完整工具集合或远程 MCP 的最终状态。Contract Test 通过控制任务提示和可观察后置条件，把“模型是否遵守”转化为可验收的 PASS/FAIL/UNKNOWN，而不是声称可以强制模型服从。

契约文件路径：

```text
.trae/traeforge/contracts.json
```

示例见 `contracts.example.json`。
