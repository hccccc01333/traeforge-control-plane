const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

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
    const [scan, plugins] = await Promise.all([runScan(), listPlugins()]);
    this.post({ type: 'data', scan, plugins });
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
<div class="sub">单循环主模式 · 内部能力路由 · 本地企业插件机制 <span class="badge">静态预检 V0.3</span></div>
<div class="toolbar"><button class="primary" id="refresh">刷新能力</button><button id="install">安装 .trae-plugin</button><button id="report">生成 JSON 报告</button></div>
<div id="notice" class="notice">正在读取当前项目和 TRAE 全局能力……</div>
<div id="cards" class="cards"></div>
<h2>有效能力预览</h2>
<div id="capabilities" class="panel"><div class="empty">等待扫描结果。</div></div>
<h2>已注册企业插件</h2>
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
  const files = data.scan.files || [];
  const groups = {};
  files.forEach((file) => {
    const key = file.packagePath.startsWith('global/skills/') ? '全局 Skills' : file.packagePath.startsWith('global/mcps/') ? '全局 MCP 文件' : file.packagePath.startsWith('global/plugin-manifests/') ? '已安装插件 manifest' : '项目能力';
    groups[key] = (groups[key] || 0) + 1;
  });
  $('cards').innerHTML = [
    ['全部文件', summary.files || 0, ''],
    ['项目能力', summary.projectFiles || 0, ''],
    ['全局能力', summary.globalFiles || 0, ''],
    ['敏感命中', summary.secretFindings || 0, summary.secretFindings ? 'bad' : 'good']
  ].map(([label,value,cls]) => '<div class="card"><div class="label">'+label+'</div><div class="value '+cls+'">'+value+'</div></div>').join('');
  $('capabilities').innerHTML = '<table><thead><tr><th>能力层</th><th>数量</th><th>当前判断</th></tr></thead><tbody>' + Object.entries(groups).map(([name,count]) => '<tr><td>'+esc(name)+'</td><td>'+count+'</td><td>'+esc(name === '项目能力' ? '当前工作区配置' : '已发现；运行时是否暴露需继续探测')+'</td></tr>').join('') + '</tbody></table>';
  const plugins = (data.plugins && data.plugins.plugins) || [];
  $('plugins').innerHTML = plugins.length ? '<table><thead><tr><th>ID</th><th>名称</th><th>活动版本</th></tr></thead><tbody>' + plugins.map((p) => '<tr><td>'+esc(p.id)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.activeVersion)+'</td></tr>').join('') + '</tbody></table>' : '<div class="empty">暂无插件注册记录。可以点击“安装 .trae-plugin”导入企业插件。</div>';
  const reasons = [];
  if (summary.globalFiles) reasons.push('全局 Skills/MCP 已找到，但当前版本只能完成静态盘点；TRAE 当前 Agent 是否实际继承它们，还需要运行时探针。');
  if (!summary.projectFiles) reasons.push('当前工作区没有项目级 TRAE 文件；如果当前模式不继承全局能力，Agent 可能看不到这些配置。');
  if (summary.secretFindings) reasons.push('检测到疑似敏感信息，插件导出或安装前应先脱敏。');
  if (!reasons.length) reasons.push('当前未发现静态配置异常。运行时调用失败时，下一步应查看工具暴露和 Agent 路由诊断。');
  $('diagnosis').innerHTML = reasons.map((reason) => '<div class="notice">'+esc(reason)+'</div>').join('');
  notice('扫描完成：'+(summary.files || 0)+' 个文件，敏感命中 '+(summary.secretFindings || 0)+'。','success');
}
$('refresh').onclick = () => vscode.postMessage({type:'refresh'});
$('install').onclick = () => vscode.postMessage({type:'install'});
$('report').onclick = () => vscode.postMessage({type:'report'});
window.addEventListener('message', (event) => { const message = event.data; if(message.type === 'loading') notice('正在扫描当前项目和 TRAE 全局能力……'); if(message.type === 'data') render(message); if(message.type === 'notice') notice(message.text, message.level); });
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
