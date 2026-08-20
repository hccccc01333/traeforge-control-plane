# TraeForge Real-World Cases

当前公开案例池包含 15 个案例，全部标记为 PUBLIC-REPORTED。这表示“社区公开报告过”，不表示 TraeForge 已经复现、诊断正确或已经解决。

public-cases.json 保存案例事实边界；tf-manifest.json 保存第一批 10 个可执行化方向。它们把产品问题和测试问题分开，避免把论坛里的用户结论直接当成我们的检测结论。

第一批 TF 基准覆盖 Skill frontmatter、UTF-8 BOM、YAML 特殊字符、多来源冲突、MCP 路径空格、可执行文件解析、工具预算、工具命名、Agent 调用和全局 Rule 重载。

这组 benchmark 把 TRAE 官方中文社区公开报告整理成可审计的回放案例。

它们不是“已复现 Bug”清单。每个案例必须区分：

```text
REPORTED → REPRODUCED → DIAGNOSED → FIXED → VERIFIED
```

原有 C001–C006 夹具仍保留为历史占位；新的公开案例以 public-cases.json 为准，首次状态统一为 PUBLIC-REPORTED。fixture 是根据公开描述构造的最小测试夹具，不是用户原始项目，也不代表已经复现原问题。

## 案例

| ID | 主题 | 当前状态 | TraeForge 主要检查 |
| --- | --- | --- | --- |
| A01–A08 | Skill、MCP、模式和迁移公开报告 | PUBLIC-REPORTED | 格式、编码、路径、工具预算、命名、能力边界 |
| B01–B07 | 需要运行时验证的 Rule、Skill、MCP 报告 | PUBLIC-REPORTED | 发现、注入、可见性、调用和环境差异 |
| TF-001–TF-010 | TraeForge 第一批基准定义 | NOT_RUN | 将公开痛点转成可验证证据 |

## 如何推进一个案例

1. 先阅读 `case.md` 和 `expected.json`，确认来源与证据边界。
2. 在不使用用户隐私数据的前提下运行 `fixture/`。
3. 用 TraeForge Doctor 记录检测结果，不直接把预期结果写成事实。
4. 只有有 ground truth 的可复现案例，才允许填写 `DIAGNOSED` 或 `FIXED`。
5. 修复后重新检测并记录 `VERIFIED`，同时保留失败和 UNKNOWN。

## 运行结构校验

## 运行最小 fixture

fixtures/TF-001 到 fixtures/TF-010 是脱敏、合成的最小输入，不是社区用户原始项目。运行器会输出检测器的证据分类：

    node .\benchmarks\run-fixtures.js

其中 PASS 表示检测器正确识别了 fixture 设计的问题；UNKNOWN 表示证据不足以证明 TRAE 运行时行为，正是 TF-009 和 TF-010 要保留的边界。

```powershell
node .\benchmarks\validate.js
```

校验器只检查案例字段、来源链接和状态合法性，不访问论坛、不上传文件，也不会修改 fixture。

## 证据规则

- 公开帖子 = `PUBLIC-REPORTED`，不等于 root cause 已确认。
- 用户在帖子里的自我定位或解决 = reported-user-resolution，不等于 TraeForge 的诊断已验证。
- 产品限制类案例可以进入案例池，但不得被包装成插件已经修复。
- fixture 通过 = TraeForge 能处理该种输入，不等于复现了原用户环境。
- `diagnosisCorrect` 只有在有 ground truth 时才填写 `yes` 或 `no`。
- 任何报告、日志和配置都不得包含 API Key、Token、密码、私人对话或不必要的设备标识。
