const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { probeProjectMcp } = require('./mcpProbe');
const { readTraeRuntimeEvidence } = require('./runtimeEvidence');

const USER_HOME = process.env.USERPROFILE || process.env.HOME || '';
const SKILL_SCRIPT = path.join(USER_HOME, '.trae-cn', 'skills', 'trae-forge', 'scripts', 'traepack.ps1');
const PLUGIN_SCRIPT = path.join(USER_HOME, '.trae-cn', 'skills', 'trae-forge', 'scripts', 'traeplugin.ps1');

function workspacePath() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.length ? folders[0].uri.fsPath : USER_HOME;
}

function execPowerShell(args) {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(USER_HOME, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'powershell', 'pwsh.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(systemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'pwsh',
    'powershell.exe'
  ];
  const uniqueCandidates = [...new Set(candidates)];
  return new Promise((resolve, reject) => {
    const run = (index) => {
      if (index >= uniqueCandidates.length) {
        reject(new Error(`找不到 PowerShell 运行时。已探测：${uniqueCandidates.join('、')}`));
        return;
      }
      cp.execFile(uniqueCandidates[index], ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error && error.code === 'ENOENT') {
          run(index + 1);
          return;
        }
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()));
          return;
        }
        resolve((stdout || '').trim());
      });
    };
    run(0);
  });
}

async function runScan() {
  if (!fs.existsSync(SKILL_SCRIPT)) {
    throw new Error(`找不到 TraeForge 扫描脚本：${SKILL_SCRIPT}`);
  }
  const output = await execPowerShell([
    '-File', SKILL_SCRIPT,
    '-Command', 'scan',
    '-ProjectPath', workspacePath(),
    '-IncludeTraeGlobal', '-Json'
  ]);
  return JSON.parse(output);
}

async function runPreflight() {
  if (!fs.existsSync(SKILL_SCRIPT)) {
    throw new Error(`找不到 TraeForge 诊断脚本：${SKILL_SCRIPT}`);
  }
  const output = await execPowerShell([
    '-File', SKILL_SCRIPT,
    '-Command', 'preflight',
    '-ProjectPath', workspacePath(),
    '-IncludeTraeGlobal', '-Json'
  ]);
  return JSON.parse(output);
}

async function runPlugin(command, pluginPath, apply) {
  if (!fs.existsSync(PLUGIN_SCRIPT)) {
    throw new Error(`找不到 TraeForge 插件脚本：${PLUGIN_SCRIPT}`);
  }
  const args = [
    '-File', PLUGIN_SCRIPT,
    '-Command', command,
    '-ProjectPath', workspacePath()
  ];
  if (pluginPath) args.push('-PluginPath', pluginPath);
  if (!apply) args.push('-Json');
  if (apply) args.push('-Apply');
  const output = await execPowerShell(args);
  if (!apply) return JSON.parse(output);
  return { ok: true, output };
}

async function runReport() {
  if (!fs.existsSync(SKILL_SCRIPT)) throw new Error('TraeForge Skill 尚未安装。');
  const reportPath = path.join(workspacePath(), '.trae', 'traeforge', 'control-plane-report.json');
  await execPowerShell([
    '-File', SKILL_SCRIPT,
    '-Command', 'report',
    '-ProjectPath', workspacePath(),
    '-IncludeTraeGlobal',
    '-OutputPath', reportPath,
    '-Force'
  ]);
  return reportPath;
}

async function listPlugins() {
  if (!fs.existsSync(PLUGIN_SCRIPT)) return { plugins: [] };
  const output = await execPowerShell(['-File', PLUGIN_SCRIPT, '-Command', 'list', '-Json']);
  return JSON.parse(output);
}

class ControlPlaneViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = null;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.type === 'refresh') {
          await this.refresh();
        } else if (message.type === 'report') {
          const reportPath = await runReport();
          this.post({ type: 'notice', level: 'success', text: `报告已生成：${reportPath}` });
        } else if (message.type === 'install') {
          await this.pickAndInstall();
        } else if (message.type === 'probe') {
          await this.probeMcp();
        } else if (message.type === 'runtime') {
          await this.readRuntimeEvidence();
        }
      } catch (error) {
        this.post({ type: 'notice', level: 'error', text: error.message || String(error) });
      }
    });
    this.refresh();
  }

  post(message) {
    if (this.view) this.view.webview.postMessage(message);
  }

  async refresh() {
    this.post({ type: 'loading' });
    const [scan, preflight, plugins] = await Promise.all([runScan(), runPreflight(), listPlugins()]);
    this.post({ type: 'data', scan, preflight, plugins });
  }

  async pickAndInstall() {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: '选择 TRAE 插件包',
      filters: { 'TRAE Plugin': ['trae-plugin'] }
    });
    if (!files || !files.length) return;
    const pluginPath = files[0].fsPath;
    const preview = await runPlugin('install', pluginPath, false);
    const plan = (preview.plans || []).filter((item) => item.status !== 'UNCHANGED');
    const answer = await vscode.window.showWarningMessage(
      `插件 ${preview.plugin.name}@${preview.plugin.version} 将处理 ${plan.length} 项。是否应用？`,
      { modal: true },
      '应用安装'
    );
    if (answer !== '应用安装') {
      this.post({ type: 'notice', level: 'info', text: '已取消安装，预览未写入文件。' });
      return;
    }
    const result = await runPlugin('install', pluginPath, true);
    this.post({ type: 'notice', level: 'success', text: result.output || '插件安装完成。' });
    await this.refresh();
  }

  async probeMcp() {
    const answer = await vscode.window.showWarningMessage(
      '将启动当前项目配置的 stdio MCP，并只发送 initialize/tools/list，不调用业务工具。是否继续？',
      { modal: true },
      '开始探测'
    );
    if (answer !== '开始探测') {
      this.post({ type: 'notice', level: 'info', text: '已取消 MCP 探测。' });
      return;
    }
    this.post({ type: 'notice', level: 'info', text: '正在启动 MCP 探针，只请求工具列表……' });
    const probe = await probeProjectMcp(workspacePath());
    this.post({ type: 'probe', probe });
  }

  async readRuntimeEvidence() {
    this.post({ type: 'notice', level: 'info', text: '正在读取 TRAE 最新日志，只生成脱敏摘要……' });
    const evidence = readTraeRuntimeEvidence();
    this.post({ type: 'runtime', evidence });
  }

  html(webview) {
    const nonce = `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
:root { color-scheme: dark; --bg:#111827; --panel:#182235; --line:#2b3950; --muted:#91a0b8; --text:#ecf2ff; --accent:#60a5fa; --good:#34d399; --warn:#fbbf24; --bad:#fb7185; }
* { box-sizing:border-box; }
body { margin:0; padding:18px; color:var(--text); background:var(--bg); font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
h1 { margin:0; font-size:20px; letter-spacing:.2px; }
h2 { margin:20px 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.sub { color:var(--muted); margin:5px 0 16px; }
.toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
button { border:1px solid var(--line); background:#22304a; color:var(--text); padding:7px 10px; border-radius:6px; cursor:pointer; }
button:hover { border-color:var(--accent); }
.primary { background:#2563eb; border-color:#3b82f6; }
.badge { display:inline-flex; padding:3px 7px; border-radius:99px; background:#193b58; color:#93c5fd; font-size:11px; }
.cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; min-width:0; }
.label { color:var(--muted); font-size:11px; }
.value { font-size:22px; font-weight:650; margin-top:3px; }
.good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
table { width:100%; border-collapse:collapse; }
th,td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-size:11px; font-weight:500; }
td { word-break:break-word; }
tr:last-child td { border-bottom:0; }
.notice { margin:10px 0; padding:9px 10px; border-radius:6px; background:#1f2c43; color:var(--muted); white-space:pre-wrap; }
.notice.success { border-left:3px solid var(--good); } .notice.error { border-left:3px solid var(--bad); }
.empty { padding:18px; color:var(--muted); }
@media(max-width:680px){ .cards{grid-template-columns:repeat(2,minmax(0,1fr));} }
</style>
</head>
<body>
<h1>TraeForge Control Plane</h1>
<div class="sub">单循环主模式 · 能力可见性诊断 · 运行时日志证据 <span class="badge">用户痛点预检 V0.6</span></div>
<div class="toolbar"><button class="primary" id="refresh">刷新能力</button><button id="runtime">读取 TRAE 日志</button><button id="probe">探测 MCP 工具</button><button id="install">安装 .trae-plugin</button><button id="report">生成 JSON 报告</button></div>
<div id="notice" class="notice">正在读取当前项目和 TRAE 全局能力……</div>
<div id="cards" class="cards"></div>
<h2>有效能力预览</h2>
<div id="capabilities" class="panel"><div class="empty">等待扫描结果。</div></div>
<h2>运行时 MCP 探测</h2>
<div id="probeResult" class="panel"><div class="empty">点击“探测 MCP 工具”，查看当前项目 Server 实际返回的工具。</div></div>
<h2>运行时证据（只读摘要）</h2>
<div id="runtimeResult" class="panel"><div class="empty">点击“读取 TRAE 日志”，查看规则发现和已发生工具调用的摘要。</div></div>
<h2>已注册本地插件</h2>
<div id="plugins" class="panel"><div class="empty">暂无插件注册记录。</div></div>
<h2>为什么可能不可用</h2>
<div id="diagnosis" class="panel"><div class="empty">扫描后显示诊断。</div></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function notice(text, level='info') { $('notice').className = 'notice ' + level; $('notice').textContent = text; }
function render(data) {
  const summary = data.scan.summary || {};
  const preflight = data.preflight || {};
  const preflightSummary = preflight.summary || {};
  const files = data.scan.files || [];
  $('cards').innerHTML = [
    ['全部文件', summary.files || 0, ''],
    ['项目 MCP', preflightSummary.projectMcpServers || 0, preflightSummary.projectMcpServers ? 'good' : 'warn'],
    ['估算工具', preflightSummary.estimatedGlobalTools || 0, ''],
    ['诊断警告', preflightSummary.warnings || 0, preflightSummary.warnings ? 'warn' : 'good']
  ].map(([label,value,cls]) => '<div class="card"><div class="label">'+label+'</div><div class="value '+cls+'">'+value+'</div></div>').join('');
  const capabilities = preflight.capabilities || [];
  $('capabilities').innerHTML = '<table><thead><tr><th>能力层</th><th>数量</th><th>状态</th><th>为什么</th></tr></thead><tbody>' + capabilities.map((item) => '<tr><td>'+esc(item.label)+'</td><td>'+esc(item.count)+'</td><td>'+esc(item.status)+'</td><td>'+esc(item.why)+'</td></tr>').join('') + '</tbody></table>';
  const plugins = (data.plugins && data.plugins.plugins) || [];
  $('plugins').innerHTML = plugins.length ? '<table><thead><tr><th>ID</th><th>名称</th><th>活动版本</th></tr></thead><tbody>' + plugins.map((p) => '<tr><td>'+esc(p.id)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.activeVersion)+'</td></tr>').join('') + '</tbody></table>' : '<div class="empty">暂无插件注册记录。可以点击“安装 .trae-plugin”导入本地插件。</div>';
  const diagnostics = preflight.diagnostics || [];
  $('diagnosis').innerHTML = diagnostics.length ? diagnostics.map((item) => '<div class="notice '+(item.severity === 'error' ? 'error' : item.severity === 'warning' ? '' : 'success')+'"><strong>'+esc(item.title)+'</strong><br>'+esc(item.detail)+'<br><span class="label">建议：'+esc(item.action)+'</span></div>').join('') : '<div class="empty">未发现静态诊断项。</div>';
  notice('预检完成：'+(preflightSummary.warnings || 0)+' 条警告，运行时状态仍需实际调用验证。', preflightSummary.warnings ? 'info' : 'success');
}
function renderProbe(probe) {
  if (!probe || probe.status === 'not-configured') {
    $('probeResult').innerHTML = '<div class="empty">'+esc((probe && probe.error) || '当前项目没有可探测的 MCP。')+'</div>';
    return;
  }
  if (probe.status === 'invalid-config') {
    $('probeResult').innerHTML = '<div class="notice error">MCP 配置无法解析：'+esc(probe.error)+'</div>';
    return;
  }
  const rows = (probe.results || []).map((item) => '<tr><td>'+esc(item.server)+'</td><td>'+esc(item.status)+'</td><td>'+esc(item.toolCount)+'</td><td>'+esc((item.toolNames || []).join(', '))+'</td><td>'+esc(item.error || 'initialize/tools/list 成功')+'</td></tr>').join('');
  $('probeResult').innerHTML = '<table><thead><tr><th>Server</th><th>状态</th><th>工具数</th><th>工具名</th><th>说明</th></tr></thead><tbody>'+rows+'</tbody></table>';
  notice('MCP 探测完成：'+(probe.summary.ok || 0)+' 个成功，返回 '+(probe.summary.tools || 0)+' 个工具。', probe.summary.ok === probe.summary.configured ? 'success' : 'info');
}
function renderRuntime(evidence) {
  if (!evidence || evidence.status === 'no-logs') {
    $('runtimeResult').innerHTML = '<div class="empty">'+esc((evidence && evidence.limitations && evidence.limitations[0]) || '没有找到 TRAE 日志。')+'</div>';
    return;
  }
  const rules = evidence.rules || {};
  const latest = rules.latest || {};
  const mcp = evidence.mcp || {};
  const toolCalls = mcp.toolCallsObserved || [];
  const rows = [
    ['规则发现', rules.status || 'unknown', latest.userRuleCount === null || latest.userRuleCount === undefined ? '未记录' : '用户规则 '+latest.userRuleCount+'，项目规则 '+latest.projectRuleCount, latest.location || 'rules_initial_load'],
    ['规则注入当前上下文', rules.injectionIntoContext || 'unknown', '日志没有直接记录模型上下文注入', '未知'],
    ['模型是否遵守规则', rules.modelCompliance || 'unknown', '需要对话行为验收，日志摘要不能证明', '未知'],
    ['MCP Runtime', mcp.runtimeStatus || 'unknown', mcp.configurationMode || '配置模式未知', 'toolhost'],
    ['已发生工具调用', String(toolCalls.reduce((sum, item) => sum + item.count, 0)), toolCalls.map((item) => item.name+' ×'+item.count).join(', ') || '未观察到', 'TransportManager'],
    ['最终工具集合', mcp.finalToolSet || 'unknown', '已发生调用不等于完整可见集合', '未知'],
    ['远程 MCP', mcp.remoteMcp || 'unknown', '当前日志摘要没有完整连接/工具列表', '未知']
  ];
  $('runtimeResult').innerHTML = '<div class="notice success">日志会话：'+esc((evidence.source && evidence.source.session) || 'unknown')+'；读取文件：'+esc((evidence.source && evidence.source.filesRead) || 0)+' 个</div><table><thead><tr><th>证据项</th><th>状态</th><th>结果</th><th>来源</th></tr></thead><tbody>'+rows.map((row) => '<tr><td>'+esc(row[0])+'</td><td>'+esc(row[1])+'</td><td>'+esc(row[2])+'</td><td>'+esc(row[3])+'</td></tr>').join('')+'</tbody></table><div class="notice">'+(evidence.limitations || []).map(esc).join('<br>')+'</div>';
  notice('已读取 TRAE 日志摘要：规则加载证据 '+(rules.status === 'observed' ? '已发现' : '未发现')+'，模型遵守状态仍需行为验收。', 'info');
}
$('refresh').onclick = () => vscode.postMessage({type:'refresh'});
$('runtime').onclick = () => vscode.postMessage({type:'runtime'});
$('probe').onclick = () => vscode.postMessage({type:'probe'});
$('install').onclick = () => vscode.postMessage({type:'install'});
$('report').onclick = () => vscode.postMessage({type:'report'});
window.addEventListener('message', (event) => { const message = event.data; if(message.type === 'loading') notice('正在扫描当前项目和 TRAE 全局能力……'); if(message.type === 'data') render(message); if(message.type === 'probe') renderProbe(message.probe); if(message.type === 'runtime') renderRuntime(message.evidence); if(message.type === 'notice') notice(message.text, message.level); });
</script>
</body>
</html>`;
  }
}

function activate(context) {
  const provider = new ControlPlaneViewProvider(context.extensionUri);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('traeforge.controlPlane', provider));
  context.subscriptions.push(vscode.commands.registerCommand('traeforge.openControlPlane', () => {
    vscode.commands.executeCommand('workbench.view.extension.traeforge');
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
