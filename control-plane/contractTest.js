const fs = require('fs');
const path = require('path');

const CONTRACT_RELATIVE_PATH = path.join('.trae', 'traeforge', 'contracts.json');

function contractPath(projectPath) {
  return path.join(projectPath, CONTRACT_RELATIVE_PATH);
}

function safeProjectFile(projectPath, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) return { error: '缺少项目相对路径。' };
  const root = path.resolve(projectPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return { error: '契约路径必须位于当前项目内。' };
  return { path: target };
}

function loadContract(projectPath) {
  const filePath = contractPath(projectPath);
  if (!fs.existsSync(filePath)) return { status: 'not-configured', path: filePath, manifest: null, error: '当前项目没有 .trae/traeforge/contracts.json。' };
  try {
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tests = Array.isArray(manifest.tests) ? manifest.tests : Array.isArray(manifest.contracts) ? manifest.contracts : [];
    if (!tests.length) return { status: 'invalid', path: filePath, manifest, error: '契约文件没有 tests 数组。' };
    return { status: 'loaded', path: filePath, manifest: { ...manifest, tests }, error: null };
  } catch (error) {
    return { status: 'invalid', path: filePath, manifest: null, error: `契约 JSON 无法解析：${error.message}` };
  }
}

function result(status, detail, check) {
  return { status, type: check.type || 'unknown', detail };
}

function evaluateFileCheck(projectPath, check) {
  const target = safeProjectFile(projectPath, check.path);
  if (target.error) return result('fail', target.error, check);
  if (check.type === 'file-exists') {
    return result(fs.existsSync(target.path) ? 'pass' : 'fail', fs.existsSync(target.path) ? `文件存在：${check.path}` : `文件不存在：${check.path}`, check);
  }
  if (!fs.existsSync(target.path)) return result('fail', `文件不存在：${check.path}`, check);
  let content;
  try { content = fs.readFileSync(target.path, 'utf8'); } catch (error) { return result('fail', `无法读取文件：${error.message}`, check); }
  if (typeof check.contains === 'string') return result(content.includes(check.contains) ? 'pass' : 'fail', content.includes(check.contains) ? `文件包含预期文本：${check.path}` : `文件未包含预期文本：${check.path}`, check);
  if (typeof check.pattern === 'string') {
    try {
      const matched = new RegExp(check.pattern, check.flags || '').test(content);
      return result(matched ? 'pass' : 'fail', matched ? `文件匹配预期模式：${check.path}` : `文件未匹配预期模式：${check.path}`, check);
    } catch (error) { return result('fail', `契约正则无效：${error.message}`, check); }
  }
  return result('fail', 'file-content 缺少 contains 或 pattern。', check);
}

function evaluateRuleDiscovery(check, runtimeEvidence) {
  if (!runtimeEvidence || runtimeEvidence.status !== 'observed' || !runtimeEvidence.rules || !runtimeEvidence.rules.latest) return result('unknown', '没有可用的 TRAE 规则加载日志。', check);
  const latest = runtimeEvidence.rules.latest;
  const scope = check.scope || 'any';
  const counts = {
    user: Number(latest.userRuleCount || 0),
    project: Number(latest.projectRuleCount || 0),
    any: Number(latest.userRuleCount || 0) + Number(latest.projectRuleCount || 0)
  };
  const count = counts[scope];
  if (count === undefined) return result('fail', `不支持的规则作用域：${scope}`, check);
  return result(count > 0 ? 'pass' : 'fail', count > 0 ? `TRAE 日志发现 ${count} 条 ${scope} 规则。` : `TRAE 日志发现 ${count} 条 ${scope} 规则。`, check);
}

function evaluateSkillDiscovery(projectPath, check) {
  if (typeof check.name !== 'string' || !check.name.trim()) return result('fail', 'skill-discovered 缺少 name。', check);
  const scope = check.scope || 'any';
  const roots = [];
  if (scope === 'project' || scope === 'any') roots.push({ scope: 'project', path: path.join(projectPath, '.trae', 'skills', check.name, 'SKILL.md') });
  if (scope === 'global' || scope === 'any') roots.push({ scope: 'global', path: path.join(process.env.USERPROFILE || process.env.HOME || '', '.trae-cn', 'skills', check.name, 'SKILL.md') });
  const found = roots.filter((item) => fs.existsSync(item.path));
  return result(found.length ? 'pass' : 'fail', found.length ? `已发现 Skill 文件：${found.map((item) => item.scope).join('、')}。` : `没有发现 Skill 文件：${check.name}`, check);
}

function evaluateToolExposed(check, mcpProbe) {
  if (!mcpProbe) return result('unknown', '尚未运行 MCP initialize/tools/list 探针。', check);
  if (mcpProbe.status === 'not-configured') return result('fail', '当前项目没有可探测的 MCP 配置。', check);
  const server = (mcpProbe.results || []).find((item) => item.server === check.server);
  if (!server) return result('fail', `探针没有返回 Server：${check.server}`, check);
  if (server.status !== 'ok') return result('fail', `Server ${check.server} 探测状态为 ${server.status}：${server.error || '未知错误'}`, check);
  const exposed = (server.toolNames || []).includes(check.tool);
  return result(exposed ? 'pass' : 'fail', exposed ? `工具已由 tools/list 暴露：${check.tool}` : `tools/list 未返回工具：${check.tool}`, check);
}

function evaluateToolCall(check, runtimeEvidence) {
  if (!runtimeEvidence || runtimeEvidence.status !== 'observed') return result('unknown', '没有可用的 TRAE 工具调用日志。', check);
  const calls = (runtimeEvidence.mcp && runtimeEvidence.mcp.toolCallsObserved) || [];
  const observed = calls.find((item) => item.name === check.tool);
  if (observed) return result('pass', `TRAE 日志观察到工具调用：${check.tool} ×${observed.count}`, check);
  if (!calls.length) return result('unknown', '日志会话中没有观察到工具调用，可能尚未执行控制任务。', check);
  return result('fail', `日志中没有观察到预期工具调用：${check.tool}`, check);
}

function evaluateCheck(projectPath, check, context) {
  if (!check || typeof check.type !== 'string') return result('fail', '契约检查缺少 type。', check || {});
  if (check.type === 'file-exists' || check.type === 'file-content') return evaluateFileCheck(projectPath, check);
  if (check.type === 'rule-discovered') return evaluateRuleDiscovery(check, context.runtimeEvidence);
  if (check.type === 'skill-discovered') return evaluateSkillDiscovery(projectPath, check);
  if (check.type === 'tool-exposed') return evaluateToolExposed(check, context.mcpProbe);
  if (check.type === 'tool-called') return evaluateToolCall(check, context.runtimeEvidence);
  return result('fail', `不支持的契约检查类型：${check.type}`, check);
}

function evaluateContracts(projectPath, context = {}) {
  const loaded = loadContract(projectPath);
  if (loaded.status !== 'loaded') return { ...loaded, tests: [], summary: { overall: loaded.status === 'not-configured' ? 'not-configured' : 'fail', pass: 0, fail: loaded.status === 'invalid' ? 1 : 0, unknown: 0, tests: 0, checks: 0 } };
  const tests = loaded.manifest.tests.map((test, index) => {
    const checks = Array.isArray(test.checks) ? test.checks : [];
    const results = checks.map((check) => evaluateCheck(projectPath, check, context));
    const status = results.some((item) => item.status === 'fail') ? 'fail' : results.some((item) => item.status === 'unknown') || !results.length ? 'unknown' : 'pass';
    return { id: test.id || `contract-${index + 1}`, kind: test.kind || 'workflow', description: test.description || '', prompt: test.prompt || '', status, checks: results };
  });
  const summary = {
    overall: tests.some((test) => test.status === 'fail') ? 'fail' : tests.some((test) => test.status === 'unknown') ? 'unknown' : 'pass',
    pass: tests.filter((test) => test.status === 'pass').length,
    fail: tests.filter((test) => test.status === 'fail').length,
    unknown: tests.filter((test) => test.status === 'unknown').length,
    tests: tests.length,
    checks: tests.reduce((sum, test) => sum + test.checks.length, 0)
  };
  return { status: 'evaluated', path: loaded.path, name: loaded.manifest.name || 'TraeForge Contract Tests', generatedAt: new Date().toISOString(), tests, summary };
}

module.exports = { CONTRACT_RELATIVE_PATH, loadContract, evaluateContracts };
