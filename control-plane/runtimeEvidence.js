const fs = require('fs');
const path = require('path');

const MAX_READ_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 120;

function userDataRoot() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(appData, 'Trae CN');
}

function latestLogSession(logRoot) {
  if (!fs.existsSync(logRoot)) return null;
  const sessions = fs.readdirSync(logRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{8}T\d{6}$/.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(logRoot, entry.name);
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(fullPath).mtimeMs; } catch { /* ignore a rotating log folder */ }
      return { name: entry.name, path: fullPath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  return sessions[0] || null;
}

function walkFiles(root, output = [], depth = 0) {
  if (output.length >= MAX_FILES || depth > 6 || !fs.existsSync(root)) return output;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (output.length >= MAX_FILES) break;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, output, depth + 1);
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function readBounded(filePath) {
  try {
    const size = fs.statSync(filePath).size;
    if (size <= MAX_READ_BYTES) return fs.readFileSync(filePath, 'utf8');
    const headBytes = Math.floor(MAX_READ_BYTES / 4);
    const tailBytes = MAX_READ_BYTES - headBytes;
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(headBytes);
      const tail = Buffer.alloc(tailBytes);
      fs.readSync(fd, head, 0, head.length, 0);
      fs.readSync(fd, tail, 0, tail.length, size - tail.length);
      return `${head.toString('utf8')}\n[traeforge-log-middle-omitted]\n${tail.toString('utf8')}`;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRules(lines) {
  const reports = [];
  const discoveries = [];
  for (const line of lines) {
    const discovery = line.match(/Rule discovery found (\d+) file\(s\) in:\s*(.+)$/i);
    if (discovery) {
      discoveries.push({ count: Number(discovery[1]), location: discovery[2].trim() });
    }
    if (!/icube_rules_report/i.test(line)) continue;
    const paramsMatch = line.match(/params:\s*(\{.*\})\s*$/);
    if (!paramsMatch) continue;
    try {
      const params = JSON.parse(paramsMatch[1]);
      reports.push({
        type: params.type || null,
        location: params.location || null,
        durationMs: numberOrNull(params.duration),
        userRuleCount: numberOrNull(params.user_rule_count),
        projectRuleCount: numberOrNull(params.project_rule_count),
        importAgentsMdEnabled: params.import_agents_md_enable === 1,
        importClaudeMdEnabled: params.import_claude_md_enable === 1,
        nestedRulesCount: numberOrNull(params.nested_rules_count),
        nestedTraeCount: numberOrNull(params.nested_trae_count),
        nestedAgentsCount: numberOrNull(params.nested_agents_count),
        nestedClaudeCount: numberOrNull(params.nested_claude_count)
      });
    } catch { /* keep the evidence summary usable when a log line is malformed */ }
  }
  const latest = reports[reports.length - 1] || null;
  return {
    status: latest ? 'observed' : 'not-observed',
    latest,
    discoveries: discoveries.slice(-10),
    reportsObserved: reports.length,
    injectionIntoContext: 'unknown',
    modelCompliance: 'unknown'
  };
}

function parseMcp(lines) {
  let lazyLoadMode = false;
  let workerStarted = false;
  const toolCalls = new Map();
  for (const line of lines) {
    if (/MCP_CONFIG_PATH not set, using lazy-load mode/i.test(line)) lazyLoadMode = true;
    if (/mcp_client::runtime_worker::worker: MCP dedicated runtime worker started/i.test(line)) workerStarted = true;
    const toolCall = line.match(/executeRequest success, toolcall\s+([^,]+),/i);
    if (toolCall) {
      const name = toolCall[1].trim();
      toolCalls.set(name, (toolCalls.get(name) || 0) + 1);
    }
  }
  return {
    runtimeStatus: workerStarted ? 'worker-started' : 'not-observed',
    configurationMode: lazyLoadMode ? 'lazy-load' : 'unknown',
    toolCallsObserved: Array.from(toolCalls.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    finalToolSet: 'unknown',
    remoteMcp: 'unknown'
  };
}

function readTraeRuntimeEvidence() {
  const logRoot = path.join(userDataRoot(), 'logs');
  const session = latestLogSession(logRoot);
  if (!session) {
    return {
      schemaVersion: 1,
      status: 'no-logs',
      source: { logRoot, session: null, filesRead: 0 },
      rules: { status: 'not-observed', latest: null, discoveries: [], reportsObserved: 0, injectionIntoContext: 'unknown', modelCompliance: 'unknown' },
      mcp: { runtimeStatus: 'not-observed', configurationMode: 'unknown', toolCallsObserved: [], finalToolSet: 'unknown', remoteMcp: 'unknown' },
      limitations: ['没有找到 TRAE 日志会话目录。']
    };
  }

  const candidates = walkFiles(session.path).filter((filePath) => {
    const name = path.basename(filePath).toLowerCase();
    return name === 'renderer.log' || name === 'main.log' || name === 'sharedprocess.log' || name === 'agent-hooks.log' || name === 'dynamicconfig.log' || name === 'toolhost.log' || name.includes('mcp-servers');
  });
  const lines = [];
  for (const filePath of candidates) {
    const content = readBounded(filePath);
    if (content) lines.push(...content.split(/\r?\n/));
  }
  const rules = parseRules(lines);
  const mcp = parseMcp(lines);
  return {
    schemaVersion: 1,
    status: 'observed',
    generatedAt: new Date().toISOString(),
    source: { logRoot, session: session.name, filesRead: candidates.length },
    rules,
    mcp,
    limitations: [
      '日志能证明 TRAE 发现了多少规则，但不能证明模型在每个回答中遵守了规则。',
      '日志中的已发生 toolcall 只能证明工具曾被调用，不能证明完整工具集合。',
      '远程 MCP 的最终连接状态和私有会话上下文仍可能没有公开日志事件。'
    ]
  };
}

module.exports = { readTraeRuntimeEvidence };
