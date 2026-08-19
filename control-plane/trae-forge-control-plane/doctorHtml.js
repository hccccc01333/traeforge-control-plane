function createDoctorHtml() {
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
:root { color-scheme: dark; --bg:#101722; --panel:#172131; --panel-2:#1d2a3d; --line:#2c3b51; --muted:#9aa9bf; --text:#f2f6ff; --accent:#78aafc; --good:#39d59a; --warn:#f5c45b; --bad:#ff7c8e; }
* { box-sizing:border-box; }
body { margin:0; padding:20px; color:var(--text); background:var(--bg); font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
button { border:1px solid var(--line); background:var(--panel-2); color:var(--text); padding:8px 12px; border-radius:7px; cursor:pointer; font:inherit; }
button:hover { border-color:var(--accent); }
button.primary { background:#3578e5; border-color:#5592f5; font-weight:600; }
button.ghost { background:transparent; }
h1 { margin:0; font-size:22px; letter-spacing:-.01em; }
h2 { margin:24px 0 10px; font-size:14px; }
p { margin:0; }
.hero { padding:18px; border:1px solid #304766; border-radius:12px; background:linear-gradient(135deg,#1b2d49,#172131 68%); }
.eyebrow { color:#9bc4ff; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; margin-bottom:5px; }
.hero p { color:var(--muted); margin:6px 0 16px; }
.actions { display:flex; gap:8px; flex-wrap:wrap; }
.cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; }
.card { position:relative; min-width:0; padding:13px; background:var(--panel); border:1px solid var(--line); border-radius:9px; }
.card .label { color:var(--muted); font-size:12px; }
.card .value { display:flex; align-items:center; gap:7px; margin-top:4px; font-size:24px; font-weight:700; }
.card .note { color:var(--muted); font-size:11px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.stateIcon { font-size:15px; }
.good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); } .unknown { color:var(--accent); } .empty { color:var(--muted); }
.issueList { display:grid; gap:9px; }
.issue { display:flex; gap:11px; align-items:flex-start; padding:13px; background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--warn); border-radius:8px; }
.issue.error { border-left-color:var(--bad); } .issue.info { border-left-color:var(--accent); }
.issueIcon { flex:0 0 auto; font-size:17px; line-height:1.3; }
.issueBody { min-width:0; flex:1; }
.issueTitle { font-weight:650; margin-bottom:3px; }
.issueDetail { color:var(--muted); white-space:pre-wrap; }
.issueAction { color:#cbd9ee; font-size:12px; margin-top:6px; }
.issueTools { display:flex; gap:6px; flex-wrap:wrap; margin-top:9px; }
.tag { display:inline-block; padding:1px 6px; border-radius:99px; background:#27364b; color:var(--muted); font-size:10px; margin-left:5px; vertical-align:2px; }
.emptyBox { padding:20px; color:var(--muted); background:var(--panel); border:1px solid var(--line); border-radius:8px; }
details { margin-top:24px; border-top:1px solid var(--line); padding-top:12px; }
summary { color:var(--muted); cursor:pointer; }
.advancedBlock { margin-top:12px; padding:12px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
.advancedBlock h3 { margin:0 0 8px; font-size:12px; color:var(--muted); }
.notice { padding:9px 10px; margin:8px 0; border-radius:6px; background:#202e43; color:var(--muted); white-space:pre-wrap; }
.notice.success { border-left:3px solid var(--good); } .notice.error { border-left:3px solid var(--bad); }
table { width:100%; border-collapse:collapse; }
th,td { padding:8px 9px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; word-break:break-word; }
th { color:var(--muted); font-size:11px; font-weight:500; }
tr:last-child td { border-bottom:0; }
.label { color:var(--muted); font-size:11px; }
@media(max-width:680px){ .cards{grid-template-columns:repeat(2,minmax(0,1fr));} .issue{flex-wrap:wrap;} }
</style>
</head>
<body>
<section class="hero">
  <div class="eyebrow">TraeForge Doctor</div>
  <h1>你的 TRAE 能力，哪里没生效？</h1>
  <p>一键检查 Skill、Rule、MCP，告诉你问题在哪里，以及下一步怎么修。</p>
  <div class="actions"><button class="primary" id="refresh">重新检测</button><button id="repair">自动修复</button></div>
</section>

<h2>当前状态</h2>
<div id="cards" class="cards"><div class="emptyBox">正在检查 TRAE 能力……</div></div>

<h2>发现的问题</h2>
<div id="issues" class="issueList"><div class="emptyBox">正在分析问题……</div></div>

<details id="advanced">
  <summary>查看技术详情</summary>
  <div class="advancedBlock"><h3>能力配置</h3><div id="capabilities"><div class="emptyBox">暂无数据。</div></div></div>
  <div class="advancedBlock"><h3>MCP 能不能用</h3><div class="actions"><button id="probe">检查 MCP</button></div><div id="probeResult"><div class="emptyBox">只发送 initialize/tools/list，不调用业务工具。</div></div></div>
  <div class="advancedBlock"><h3>TRAE 有没有加载</h3><div class="actions"><button id="runtime">读取 TRAE 日志</button></div><div id="runtimeResult"><div class="emptyBox">日志摘要会显示规则发现和已经发生的工具调用。</div></div></div>
  <div class="advancedBlock"><h3>功能是否真的生效</h3><div class="actions"><button id="contract">验收实际效果</button></div><div id="contractResult"><div class="emptyBox">配置 .trae/traeforge/contracts.json 后，可以验收文件后置条件和工具调用。</div></div></div>
  <div class="advancedBlock"><h3>其他工具</h3><div class="actions"><button id="install">安装 .trae-plugin</button><button id="report">生成 JSON 报告</button></div><div id="plugins"><div class="emptyBox">暂无插件注册记录。</div></div></div>
</details>

<div id="notice" class="notice" style="margin-top:14px">正在读取当前项目和 TRAE 全局能力……</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let lastData = null;
let lastProbe = null;
const $ = (id) => document.getElementById(id);
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function notice(text, level='info') { $('notice').className = 'notice ' + level; $('notice').textContent = text; }
function stateIcon(state) { return state === 'good' ? '✓' : state === 'bad' ? '✕' : state === 'warn' ? '⚠' : state === 'unknown' ? '?' : '—'; }
function stateLabel(state) { return state === 'good' ? '正常' : state === 'bad' ? '有问题' : state === 'warn' ? '需确认' : state === 'unknown' ? '待检查' : '未配置'; }
function cardHtml(item) { return '<div class="card"><div class="label">'+esc(item.label)+'</div><div class="value '+item.state+'"><span class="stateIcon">'+stateIcon(item.state)+'</span>'+esc(item.value)+'</div><div class="note">'+esc(item.note)+' · '+stateLabel(item.state)+'</div></div>'; }
function capability(preflight, id) { return (preflight.capabilities || []).find((item) => item.id === id) || { count:0, status:'missing' }; }
function ruleFileCount(scan) { return (scan.files || []).filter((file) => /^project\\/rules\\//i.test(file.packagePath || '')).length; }
function buildState(data) {
  const summary = data.preflight && data.preflight.summary || {};
  const preflight = data.preflight || {};
  const skillsProject = capability(preflight, 'project-skills');
  const skillsGlobal = capability(preflight, 'global-skills');
  const skillCount = Number(skillsProject.count || 0) + Number(skillsGlobal.count || 0);
  const skillState = Number(skillsProject.count || 0) > 0 ? 'good' : Number(skillsGlobal.count || 0) > 0 ? 'warn' : 'empty';
  const skillNote = Number(skillsProject.count || 0) > 0 ? '项目 Skill 已发现' : Number(skillsGlobal.count || 0) > 0 ? '只有全局 Skill，继承待确认' : '还没有 Skill';
  const staticRules = ruleFileCount(data.scan || {});
  const latestRules = data.runtime && data.runtime.rules && data.runtime.rules.latest;
  const observedRules = latestRules ? Number(latestRules.userRuleCount || 0) + Number(latestRules.projectRuleCount || 0) : 0;
  const ruleCount = observedRules || staticRules;
  const ruleState = observedRules > 0 ? 'good' : staticRules > 0 ? 'warn' : 'empty';
  const ruleNote = observedRules > 0 ? 'TRAE 日志发现规则' : staticRules > 0 ? '文件存在，但 TRAE 是否加载待确认' : '还没有 Rule';
  const projectMcp = Number(summary.projectMcpServers || 0);
  const globalMcp = Number(summary.globalMcpServers || 0);
  let mcpState = 'empty'; let mcpValue = projectMcp || globalMcp; let mcpNote = mcpValue ? '已发现配置，点击检查是否能启动' : '还没有 MCP';
  if (lastProbe) { mcpValue = Number(lastProbe.summary && lastProbe.summary.configured || 0); mcpState = lastProbe.summary && lastProbe.summary.ok === lastProbe.summary.configured ? 'good' : 'bad'; mcpNote = mcpState === 'good' ? 'Server 启动并返回工具' : '至少一个 Server 启动失败'; } else if ((data.mcpDiagnosis && data.mcpDiagnosis.issues || []).length) mcpState = 'bad'; else if (mcpValue) mcpState = 'warn';
  const problems = buildIssues(data);
  return { cards: [{label:'Skills',value:skillCount,state:skillState,note:skillNote},{label:'Rules',value:ruleCount,state:ruleState,note:ruleNote},{label:'MCP',value:mcpValue,state:mcpState,note:mcpNote},{label:'发现问题',value:problems.length,state:problems.length ? 'warn' : 'good',note:problems.length ? '需要处理' : '暂未发现问题'}], problems };
}
function humanize(item) {
  const map = {
    'project-mcp-invalid': ['MCP 配置文件有错误', 'TRAE 读不懂当前项目的 .trae/mcp.json。', '修复 JSON 后重新检测。'],
    'global-project-split': ['MCP 还没有接入当前项目', 'TRAE 找到了全局 MCP，但当前项目没有 .trae/mcp.json，所以当前 Agent 可能看不到它们。', '把需要使用的 MCP 配到当前项目，或点击“检查 MCP”确认。'],
    'global-skill-inheritance-unknown': ['Skill 可能没有被当前项目加载', 'Skill 文件在全局目录里，但 TRAE 是否把它带进当前项目还不能确认。', '可用“自动修复”把选中的 Skill 复制到当前项目。'],
    'tool-budget-risk': ['MCP 工具太多，可能挤占上下文', '工具已经连接，但描述过多时 Agent 可能看不见关键工具。', '关闭当前任务不需要的 MCP 后重新检测。'],
    'schema-budget-risk': ['MCP 描述可能太大', '工具说明占用的上下文空间较多，可能影响 Agent 选择工具。', '精简工具描述，或按任务拆分 MCP。'],
    'runtime-boundary': ['还没确认 TRAE 是否真的加载', '文件存在不等于当前 Agent 已经使用它。', '展开技术详情，读取 TRAE 日志或检查 MCP。']
  };
  if (map[item.id]) return { id:item.id, severity:item.severity, title:map[item.id][0], detail:map[item.id][1], action:map[item.id][2] };
  if (/^duplicate-mcp-/.test(item.id)) return { id:item.id, severity:item.severity, title:'MCP 名称重复，来源可能冲突', detail:item.detail, action:'保留一个来源，或在当前项目明确指定。' };
  return { id:item.id, severity:item.severity, title:item.title, detail:item.detail, action:item.action, repairKind:item.repairKind || null, server:item.server || null };
}
function buildIssues(data) {
  const preflight = data.preflight || {};
  const diagnostics = (preflight.diagnostics || []).filter((item) => item.severity === 'warning' || item.severity === 'error').map(humanize);
  if (data.mcpDiagnosis && data.mcpDiagnosis.status === 'issues') (data.mcpDiagnosis.issues || []).forEach((item) => diagnostics.push(humanize(item)));
  if (lastProbe && lastProbe.results) lastProbe.results.filter((item) => item.status !== 'ok').forEach((item) => { if (!diagnostics.some((existing) => existing.server === item.server && existing.severity === 'error')) diagnostics.push({id:'mcp-probe-'+item.server,severity:'error',title:item.server+' MCP 不可用',detail:item.error || 'Server 没有正常返回工具列表。',action:'检查 command、Node.js 和 PATH 后重新检测。',repairKind:'mcp-command',server:item.server}); });
  return diagnostics;
}
function render(data) {
  lastData = data;
  const state = buildState(data);
  $('cards').innerHTML = state.cards.map(cardHtml).join('');
  if (!state.problems.length) $('issues').innerHTML = '<div class="emptyBox"><strong>暂未发现明确问题</strong><br>如果你仍然觉得能力没有生效，请展开“查看技术详情”做一次 MCP 检查或实际效果验收。</div>';
  else $('issues').innerHTML = state.problems.map((item) => '<article class="issue '+esc(item.severity)+'"><div class="issueIcon '+(item.severity === 'error' ? 'bad' : 'warn')+'">'+(item.severity === 'error' ? '✕' : '⚠')+'</div><div class="issueBody"><div class="issueTitle">'+esc(item.title)+'<span class="tag">'+(item.severity === 'error' ? '发现问题' : '需要确认')+'</span></div><div class="issueDetail">'+esc(item.detail)+'</div><div class="issueAction">建议：'+esc(item.action)+'</div><div class="issueTools"><button class="ghost" data-details="true">查看原因</button>'+(item.id === 'global-skill-inheritance-unknown' ? '<button data-repair="true">复制 Skill 到项目</button>' : item.repairKind ? '<button data-repair="true" data-repair-kind="'+esc(item.repairKind)+'" data-server="'+esc(item.server || '')+'">预览修复</button>' : '')+'</div></div></article>').join('');
  const capabilities = (data.preflight && data.preflight.capabilities) || [];
  $('capabilities').innerHTML = '<table><thead><tr><th>能力</th><th>数量</th><th>状态</th><th>说明</th></tr></thead><tbody>'+capabilities.map((item) => '<tr><td>'+esc(item.label)+'</td><td>'+esc(item.count)+'</td><td>'+esc(item.status)+'</td><td>'+esc(item.why)+'</td></tr>').join('')+'</tbody></table>';
  const plugins = (data.plugins && data.plugins.plugins) || [];
  $('plugins').innerHTML = plugins.length ? '<table><thead><tr><th>ID</th><th>名称</th><th>版本</th></tr></thead><tbody>'+plugins.map((p) => '<tr><td>'+esc(p.id)+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.activeVersion)+'</td></tr>').join('')+'</tbody></table>' : '<div class="emptyBox">暂无插件注册记录。</div>';
  if (data.runtime) renderRuntime(data.runtime);
  const problemText = state.problems.length ? '发现 '+state.problems.length+' 个需要处理的问题。' : '检查完成，暂未发现明确问题。';
  notice(problemText, state.problems.some((item) => item.severity === 'error') ? 'error' : state.problems.length ? 'info' : 'success');
}
function renderProbe(probe) {
  if (!probe || probe.status === 'not-configured') { $('probeResult').innerHTML = '<div class="emptyBox">'+esc((probe && probe.error) || '当前项目没有可探测的 MCP。')+'</div>'; return; }
  if (probe.status === 'invalid-config') { $('probeResult').innerHTML = '<div class="notice error">MCP 配置无法解析：'+esc(probe.error)+'</div>'; return; }
  const rows = (probe.results || []).map((item) => '<tr><td>'+esc(item.server)+'</td><td>'+esc(item.status)+'</td><td>'+esc(item.toolCount)+'</td><td>'+esc((item.toolNames || []).join(', '))+'</td><td>'+esc(item.error || 'initialize/tools/list 成功')+'</td></tr>').join('');
  $('probeResult').innerHTML = '<table><thead><tr><th>Server</th><th>状态</th><th>工具数</th><th>工具名</th><th>说明</th></tr></thead><tbody>'+rows+'</tbody></table>';
  notice('MCP 检查完成：'+(probe.summary.ok || 0)+' 个 Server 正常，返回 '+(probe.summary.tools || 0)+' 个工具。', probe.summary.ok === probe.summary.configured ? 'success' : 'error');
  if (lastData) render(lastData);
}
function renderRuntime(evidence) {
  if (!evidence || evidence.status === 'no-logs') { $('runtimeResult').innerHTML = '<div class="emptyBox">'+esc((evidence && evidence.limitations && evidence.limitations[0]) || '没有找到 TRAE 日志。')+'</div>'; return; }
  const rules = evidence.rules || {}; const latest = rules.latest || {}; const mcp = evidence.mcp || {}; const calls = mcp.toolCallsObserved || [];
  const rows = [['规则加载',rules.status || 'unknown',latest.userRuleCount == null ? '日志没有记录规则数量' : '用户规则 '+latest.userRuleCount+'，项目规则 '+latest.projectRuleCount,'rules_initial_load'],['模型是否遵守规则',rules.modelCompliance || 'unknown','日志不能单独证明模型遵守','需要实际效果验收'],['MCP Runtime',mcp.runtimeStatus || 'unknown',mcp.configurationMode || '未知','toolhost'],['已经发生的工具调用',String(calls.reduce((sum,item) => sum + item.count,0)),calls.map((item) => item.name+' ×'+item.count).join(', ') || '未观察到','TransportManager'],['完整工具集合',mcp.finalToolSet || 'unknown','TRAE 没有公开完整集合','未知']];
  $('runtimeResult').innerHTML = '<div class="notice success">日志会话：'+esc((evidence.source && evidence.source.session) || 'unknown')+'；读取 '+esc((evidence.source && evidence.source.filesRead) || 0)+' 个文件</div><table><thead><tr><th>检查项</th><th>状态</th><th>结果</th><th>来源</th></tr></thead><tbody>'+rows.map((row) => '<tr><td>'+esc(row[0])+'</td><td>'+esc(row[1])+'</td><td>'+esc(row[2])+'</td><td>'+esc(row[3])+'</td></tr>').join('')+'</tbody></table>';
}
function renderContracts(result) {
  if (!result || result.status === 'not-configured') { $('contractResult').innerHTML = '<div class="emptyBox">'+esc((result && result.error) || '未配置契约文件。')+'<br><span class="label">示例路径：.trae/traeforge/contracts.json</span></div>'; return; }
  if (result.status === 'invalid') { $('contractResult').innerHTML = '<div class="notice error">'+esc(result.error)+'</div>'; return; }
  const summary = result.summary || {};
  $('contractResult').innerHTML = '<div class="notice '+(summary.overall === 'pass' ? 'success' : summary.overall === 'fail' ? 'error' : '')+'"><strong>总体：'+esc((summary.overall || 'unknown').toUpperCase())+'</strong> · 通过 '+esc(summary.pass)+' · 失败 '+esc(summary.fail)+' · 未知 '+esc(summary.unknown)+'</div>'+(result.tests || []).map((test) => '<div class="notice"><strong>'+esc(test.id)+'</strong> · '+esc(test.status)+'<br>'+esc(test.description || '')+'<br>'+((test.checks || []).map((check) => esc(check.status.toUpperCase())+' · '+esc(check.detail)).join('<br>'))+'</div>').join('');
}
$('refresh').onclick = () => vscode.postMessage({type:'refresh'});
$('repair').onclick = () => vscode.postMessage({type:'repair'});
$('probe').onclick = () => vscode.postMessage({type:'probe'});
$('runtime').onclick = () => vscode.postMessage({type:'runtime'});
$('contract').onclick = () => vscode.postMessage({type:'contract'});
$('install').onclick = () => vscode.postMessage({type:'install'});
$('report').onclick = () => vscode.postMessage({type:'report'});
 $('issues').addEventListener('click', (event) => { const target = event.target.closest('button'); if (!target) return; if (target.dataset.details) $('advanced').open = true; if (target.dataset.repair) vscode.postMessage({type:'repair',kind:target.dataset.repairKind,server:target.dataset.server}); });
window.addEventListener('message', (event) => { const message = event.data; if (message.type === 'loading') notice('正在检查当前项目和 TRAE 能力……'); if (message.type === 'data') render(message); if (message.type === 'probe') { lastProbe = message.probe; renderProbe(message.probe); } if (message.type === 'runtime') { if (lastData) lastData.runtime = message.evidence; renderRuntime(message.evidence); if (lastData) render(lastData); } if (message.type === 'contract') renderContracts(message.result); if (message.type === 'notice') notice(message.text, message.level); });
</script>
</body>
</html>`;
}

module.exports = { createDoctorHtml };
