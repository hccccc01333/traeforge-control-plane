const fs = require('fs');
const path = require('path');

function projectMcpPath(projectPath) {
  return path.join(projectPath, '.trae', 'mcp.json');
}

function stripQuotes(value) {
  const text = String(value || '').trim();
  return text.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function executableCandidates(command) {
  const normalized = stripQuotes(command);
  if (!normalized) return [];
  const hasPath = normalized.includes('\\') || normalized.includes('/') || path.isAbsolute(normalized);
  if (hasPath) return [normalized];
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return pathEntries.flatMap((entry) => extensions.map((extension) => path.join(entry, normalized + extension)));
}

function findExecutable(command) {
  return executableCandidates(command).find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  }) || null;
}

function commonNodeCandidates() {
  const candidates = [];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const localAppData = process.env.LOCALAPPDATA || '';
    candidates.push(path.join(programFiles, 'nodejs', 'node.exe'));
    if (localAppData) candidates.push(path.join(localAppData, 'Programs', 'nodejs', 'node.exe'));
  } else {
    candidates.push('/usr/local/bin/node', '/usr/bin/node');
  }
  return candidates.filter((candidate, index, list) => list.indexOf(candidate) === index && fs.existsSync(candidate));
}

function suggestionFor(command) {
  const basename = path.basename(stripQuotes(command)).toLowerCase();
  if (basename === 'node' || basename === 'node.exe') return commonNodeCandidates()[0] || null;
  return null;
}

function readConfig(projectPath) {
  const configPath = projectMcpPath(projectPath);
  if (!fs.existsSync(configPath)) return { exists: false, valid: true, path: configPath, root: null, servers: new Map(), error: null };
  try {
    const root = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const serverRoot = root && root.mcpServers && typeof root.mcpServers === 'object' ? root.mcpServers : root;
    const servers = new Map(Object.entries(serverRoot || {}).map(([name, definition]) => [name, definition && typeof definition === 'object' ? definition : {}]));
    return { exists: true, valid: true, path: configPath, root, serverRoot, servers, error: null };
  } catch (error) {
    return { exists: true, valid: false, path: configPath, root: null, servers: new Map(), error: error.message };
  }
}

function commandIssue(serverName, command, suggestion, configPath) {
  return {
    id: 'mcp-command-not-found-' + serverName,
    server: serverName,
    severity: 'error',
    title: serverName + ' MCP 启动不了',
    detail: '找不到配置中的命令：' + command,
    action: suggestion ? '检测到本机可用 Node：' + suggestion : '检查 command、Node.js 和 PATH 后重新检测。',
    repairKind: suggestion ? 'mcp-command' : null,
    fixable: Boolean(suggestion),
    configPath,
    from: command,
    to: suggestion || null
  };
}

function diagnoseProjectMcp(projectPath) {
  const config = readConfig(projectPath);
  if (!config.exists) return { status: 'not-configured', path: config.path, issues: [], fixes: [] };
  if (!config.valid) {
    return {
      status: 'invalid-config',
      path: config.path,
      issues: [{ id: 'mcp-config-invalid', severity: 'error', title: 'MCP 配置文件有错误', detail: 'TRAE 无法解析 ' + config.path + '：' + config.error, action: '修复 JSON 后重新检测。', fixable: false }],
      fixes: []
    };
  }
  const issues = [];
  for (const [serverName, definition] of config.servers.entries()) {
    const remote = typeof definition.url === 'string' || typeof definition.serverUrl === 'string' || definition.type === 'sse' || definition.type === 'streamable-http';
    if (remote && !definition.command) continue;
    if (typeof definition.command !== 'string' || !definition.command.trim()) {
      issues.push({ id: 'mcp-command-missing-' + serverName, server: serverName, severity: 'error', title: serverName + ' MCP 缺少启动命令', detail: '当前 Server 没有 command，TRAE 无法启动 stdio MCP。', action: '补充正确的 command 后重新检测。', fixable: false });
      continue;
    }
    const command = stripQuotes(definition.command);
    if (findExecutable(command)) continue;
    issues.push(commandIssue(serverName, definition.command, suggestionFor(command), config.path));
  }
  return {
    status: issues.length ? 'issues' : 'ok',
    path: config.path,
    issues,
    fixes: issues.filter((item) => item.fixable).map((item) => ({ server: item.server, from: item.from, to: item.to, configPath: item.configPath }))
  };
}

function buildMcpFixPlan(projectPath, serverName) {
  const config = readConfig(projectPath);
  if (!config.exists || !config.valid || !config.servers.has(serverName)) return null;
  const definition = config.servers.get(serverName);
  if (!definition || typeof definition.command !== 'string') return null;
  const command = stripQuotes(definition.command);
  const to = suggestionFor(command);
  if (!to || findExecutable(command)) return null;
  return { projectPath, configPath: config.path, server: serverName, from: definition.command, to };
}

function applyMcpFix(plan) {
  if (!plan || !plan.configPath || !plan.server || !plan.to) throw new Error('MCP 修复计划不完整。');
  const root = JSON.parse(fs.readFileSync(plan.configPath, 'utf8'));
  const serverRoot = root && root.mcpServers && typeof root.mcpServers === 'object' ? root.mcpServers : root;
  if (!serverRoot[plan.server] || typeof serverRoot[plan.server] !== 'object') throw new Error('找不到 MCP Server：' + plan.server);
  const current = serverRoot[plan.server].command;
  if (current !== plan.from) throw new Error('MCP 配置已发生变化，请重新检测后再修复。');
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  const backup = path.join(plan.projectPath, '.trae', 'traeforge', 'backups', 'doctor', stamp, 'mcp.json');
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(plan.configPath, backup);
  serverRoot[plan.server].command = plan.to;
  fs.writeFileSync(plan.configPath, JSON.stringify(root, null, 2) + '\n', 'utf8');
  return { configPath: plan.configPath, backup, server: plan.server, from: plan.from, to: plan.to };
}

module.exports = { diagnoseProjectMcp, buildMcpFixPlan, applyMcpFix, findExecutable };
