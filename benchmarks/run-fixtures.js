const fs = require('fs');
const path = require('path');

const root = __dirname;
const fixtureRoot = path.join(root, 'fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tf-manifest.json'), 'utf8'));
const manifestById = new Map(manifest.map((item) => [item.id, item]));

function result(status, classification, evidence, detail) {
  return { status, classification, evidence, detail };
}

function runDetector(fixture) {
  const input = fixture.input || {};
  switch (fixture.detector) {
    case 'skill-frontmatter': {
      const frontmatter = input.skill && input.skill.frontmatter ? input.skill.frontmatter : {};
      const unsupported = (input.unsupportedFields || []).filter((field) => Object.prototype.hasOwnProperty.call(frontmatter, field));
      return result(
        unsupported.length === (input.unsupportedFields || []).length ? 'PASS' : 'FAIL',
        unsupported.length ? 'issue-detected' : 'no-issue',
        { unsupportedFields: unsupported },
        '检查 Skill frontmatter 字段兼容性。'
      );
    }
    case 'encoding-and-frontmatter': {
      const hasBom = String(input.rawPrefixHex || '').toUpperCase() === 'EFBBBF';
      return result(hasBom ? 'PASS' : 'FAIL', hasBom ? 'issue-detected' : 'no-issue', { rawPrefixHex: input.rawPrefixHex || null, hasBom }, '检查 UTF-8 BOM。');
    }
    case 'frontmatter-parser': {
      const text = String(input.frontmatterText || '');
      const field = String(input.field || 'description');
      const fieldLine = text.split(/\r?\n/).find((line) => line.startsWith(field + ':')) || '';
      const risk = fieldLine.includes(':', field.length + 1) && !/^[^:]+:\s*["']/.test(fieldLine);
      return result(risk ? 'PASS' : 'FAIL', risk ? 'issue-detected' : 'no-issue', { field, fieldLine, risk: risk ? 'unquoted-colon' : null }, '检查 YAML-like frontmatter 特殊字符风险。');
    }
    case 'inventory-hash-conflict': {
      const groups = new Map();
      for (const item of input.skills || []) {
        if (!groups.has(item.name)) groups.set(item.name, []);
        groups.get(item.name).push(item);
      }
      const conflicts = [...groups.entries()]
        .filter((entry) => new Set(entry[1].map((item) => item.contentHash || item.version || item.source)).size > 1)
        .map((entry) => ({ name: entry[0], sources: entry[1] }));
      return result(conflicts.length ? 'PASS' : 'FAIL', conflicts.length ? 'issue-detected' : 'no-issue', { conflicts }, '检查多来源 Skill 冲突。');
    }
    case 'command-argument-boundary': {
      const mismatch = Boolean(input.rawCommand && input.rawCommand.includes(' ') && input.parsedExecutable !== input.rawCommand);
      return result(mismatch ? 'PASS' : 'FAIL', mismatch ? 'issue-detected' : 'no-issue', { rawCommand: input.rawCommand, parsedExecutable: input.parsedExecutable, mismatch }, '检查 command 的路径和参数边界。');
    }
    case 'mcp-command-resolution': {
      const unresolved = !(input.pathHits || []).length;
      const candidateAvailable = (input.candidatePaths || []).length > 0;
      return result(unresolved && candidateAvailable ? 'PASS' : 'FAIL', unresolved && candidateAvailable ? 'issue-detected' : 'no-issue', { command: input.command, pathHits: input.pathHits || [], candidatePaths: input.candidatePaths || [] }, '检查 MCP executable 解析和候选路径。');
    }
    case 'tool-count-and-schema-budget': {
      const limits = input.limits || {};
      const toolOverflow = Number(input.toolCount || 0) > Number(limits.maxTools || Infinity);
      const descriptionOverflow = Number(input.descriptionChars || 0) > Number(limits.maxDescriptionChars || Infinity);
      return result(toolOverflow || descriptionOverflow ? 'PASS' : 'FAIL', toolOverflow || descriptionOverflow ? 'issue-detected' : 'no-issue', { toolOverflow, descriptionOverflow, toolCount: input.toolCount, descriptionChars: input.descriptionChars, visibleToolCount: input.visibleToolCount }, '检查 MCP 工具数量和描述预算。');
    }
    case 'server-tool-name-length': {
      const combinedName = String(input.serverName || '') + '_' + String(input.toolName || '');
      const overflow = combinedName.length > Number(input.maxCombinedLength || Infinity);
      return result(overflow ? 'PASS' : 'FAIL', overflow ? 'issue-detected' : 'no-issue', { serverName: input.serverName, toolName: input.toolName, combinedLength: combinedName.length, maxCombinedLength: input.maxCombinedLength }, '检查 server/tool 拼接名称长度。');
    }
    case 'tool-exposed-vs-tool-called': {
      const tool = input.expectedTool;
      const exposed = Boolean(input.serverStarted) && (input.toolsListed || []).includes(tool) && (input.finalVisibleTools || []).includes(tool);
      const called = (input.toolCalls || []).includes(tool);
      return result(exposed && !called ? 'UNKNOWN' : called ? 'PASS' : 'FAIL', exposed && !called ? 'behavior-unproven' : called ? 'behavior-observed' : 'runtime-evidence-incomplete', { serverStarted: input.serverStarted, exposed, called, expectedTool: tool }, '工具可见但没有调用证据，不能推断 Agent 行为。');
    }
    case 'rule-discovery-vs-postcondition': {
      const discovered = input.ruleDiscovered === true;
      const injected = input.contextInjected === true;
      const behavior = input.behaviorObserved === true;
      return result(discovered && !injected && !behavior ? 'UNKNOWN' : discovered && injected && behavior ? 'PASS' : 'FAIL', discovered && !injected && !behavior ? 'behavior-unproven' : discovered && injected && behavior ? 'behavior-observed' : 'runtime-evidence-incomplete', { ruleDiscovered: discovered, contextInjected: input.contextInjected, behaviorObserved: input.behaviorObserved, rulePath: input.rulePath }, '规则发现不等于上下文注入或模型遵守。');
    }
    default:
      return result('FAIL', 'unsupported-detector', {}, '未支持的 detector：' + fixture.detector);
  }
}

const fixtureDirs = fs.readdirSync(fixtureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^TF-\d{3}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const results = [];
const errors = [];

for (const id of fixtureDirs) {
  const fixturePath = path.join(fixtureRoot, id, 'fixture.json');
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    errors.push(id + ': fixture JSON 无法解析：' + error.message);
    continue;
  }
  const manifestItem = manifestById.get(id);
  if (!manifestItem) errors.push(id + ': 不在 tf-manifest.json 中');
  if (fixture.id !== id) errors.push(id + ': fixture.id 不匹配');
  if (manifestItem && fixture.detector !== manifestItem.detector) errors.push(id + ': detector 与 manifest 不匹配');
  const actual = runDetector(fixture);
  const expected = fixture.expected || {};
  const matched = actual.status === expected.status && actual.classification === expected.classification;
  if (!matched) errors.push(id + ': 预期 ' + expected.status + '/' + expected.classification + '，实际 ' + actual.status + '/' + actual.classification);
  results.push({ id, detector: fixture.detector, expected, actual, matched });
}

const missing = manifest.map((item) => item.id).filter((id) => !fixtureDirs.includes(id));
for (const id of missing) errors.push(id + ': 缺少 fixture 目录');

const output = {
  fixtureCount: fixtureDirs.length,
  passed: results.filter((item) => item.matched).length,
  failed: errors.length,
  results
};
console.log(JSON.stringify(output, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
