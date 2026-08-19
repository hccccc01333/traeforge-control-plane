const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROBE_TIMEOUT_MS = 8000;

function redact(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._\-/+=]{20,}/gi, 'Bearer [redacted-token]')
    .replace(/(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
}

function projectMcpPath(projectPath) {
  return path.join(projectPath, '.trae', 'mcp.json');
}

function readProjectServers(projectPath) {
  const configPath = projectMcpPath(projectPath);
  if (!fs.existsSync(configPath)) {
    return { exists: false, valid: true, path: configPath, servers: [], error: null };
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const serverMap = config.mcpServers || config;
    const servers = Object.entries(serverMap || {}).map(([name, definition]) => ({
      name,
      definition: definition && typeof definition === 'object' ? definition : {}
    }));
    return { exists: true, valid: true, path: configPath, servers, error: null };
  } catch (error) {
    return { exists: true, valid: false, path: configPath, servers: [], error: error.message };
  }
}

function sendJsonLine(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function probeServer(server, projectPath) {
  const definition = server.definition || {};
  const command = typeof definition.command === 'string' ? definition.command : '';
  const hasUrl = typeof definition.url === 'string' || typeof definition.serverUrl === 'string' || definition.type === 'sse' || definition.type === 'streamable-http';
  if (hasUrl && !command) {
    return Promise.resolve({
      server: server.name,
      status: 'unsupported',
      launcher: 'remote',
      toolCount: 0,
      toolNames: [],
      error: '当前探针只支持 stdio MCP；远程 MCP 暂未探测。'
    });
  }
  if (!command) {
    return Promise.resolve({
      server: server.name,
      status: 'unsupported',
      launcher: 'unknown',
      toolCount: 0,
      toolNames: [],
      error: 'MCP 配置没有 command，无法启动 stdio 探针。'
    });
  }

  const args = Array.isArray(definition.args) ? definition.args.map(String) : [];
  const env = { ...process.env };
  if (definition.env && typeof definition.env === 'object') {
    for (const [key, value] of Object.entries(definition.env)) env[key] = String(value);
  }
  const launcher = path.basename(command);

  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    let stderr = '';
    let timer;
    let child;
    const result = {
      server: server.name,
      status: 'failed',
      launcher,
      toolCount: 0,
      toolNames: [],
      error: null,
      durationMs: 0
    };
    const startedAt = Date.now();
    const finish = (status, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      result.status = status;
      result.durationMs = Date.now() - startedAt;
      if (error) result.error = redact(error).slice(0, 600);
      if (child && !child.killed) child.kill();
      resolve(result);
    };
    const handleMessage = (message) => {
      if (message.id === 1) {
        if (message.error) {
          finish('failed', message.error.message || 'initialize 失败');
          return;
        }
        try {
          sendJsonLine(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
          sendJsonLine(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } catch (error) {
          finish('failed', error.message);
        }
      } else if (message.id === 2) {
        if (message.error) {
          finish('failed', message.error.message || 'tools/list 失败');
          return;
        }
        const tools = message.result && Array.isArray(message.result.tools) ? message.result.tools : [];
        result.toolCount = tools.length;
        result.toolNames = tools.map((tool) => tool && tool.name).filter(Boolean).slice(0, 200);
        result.hasNextCursor = Boolean(message.result && message.result.nextCursor);
        finish('ok');
      }
    };
    const handleStdout = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { handleMessage(JSON.parse(line)); } catch { /* ignore non-JSON server logs */ }
      }
    };
    try {
      child = spawn(command, args, { cwd: projectPath, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout.on('data', handleStdout);
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => finish('failed', error.message));
      child.on('close', (code) => {
        if (!settled) finish('failed', stderr.trim() || `进程退出，代码 ${code}`);
      });
      sendJsonLine(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'traeforge-doctor', version: '0.8.0' }
        }
      });
      timer = setTimeout(() => finish('timeout', 'MCP 探针超时；服务器没有在限定时间内返回 initialize/tools/list。'), PROBE_TIMEOUT_MS);
    } catch (error) {
      finish('failed', error.message);
    }
  });
}

async function probeProjectMcp(projectPath) {
  const overview = readProjectServers(projectPath);
  if (!overview.valid) {
    return {
      status: 'invalid-config',
      path: overview.path,
      configured: true,
      results: [],
      summary: { configured: 0, probed: 0, ok: 0, tools: 0 },
      error: overview.error
    };
  }
  if (!overview.exists || overview.servers.length === 0) {
    return {
      status: 'not-configured',
      path: overview.path,
      configured: false,
      results: [],
      summary: { configured: 0, probed: 0, ok: 0, tools: 0 },
      error: '当前项目没有可探测的 .trae/mcp.json Server。'
    };
  }
  const results = await Promise.all(overview.servers.map((server) => probeServer(server, projectPath)));
  return {
    status: results.every((item) => item.status === 'ok') ? 'ok' : 'partial',
    path: overview.path,
    configured: true,
    results,
    summary: {
      configured: results.length,
      probed: results.filter((item) => item.status !== 'unsupported').length,
      ok: results.filter((item) => item.status === 'ok').length,
      tools: results.reduce((sum, item) => sum + (item.toolCount || 0), 0)
    },
    error: null
  };
}

module.exports = { probeProjectMcp };
