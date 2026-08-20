const fs = require('fs');
const path = require('path');

const root = __dirname;
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema.json'), 'utf8'));
const caseDirs = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^C\d{3}-/.test(entry.name))
  .map((entry) => path.join(root, entry.name));
const fixtureRoot = path.join(root, 'fixtures');
const fixtureDirs = fs.existsSync(fixtureRoot)
  ? fs.readdirSync(fixtureRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^TF-\d{3}$/.test(entry.name))
    .map((entry) => entry.name)
  : [];
const errors = [];

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push('缺少 ' + label);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(label + ' JSON 无法解析：' + error.message);
    return null;
  }
}

const publicCases = readJson(path.join(root, 'public-cases.json'), 'public-cases.json');
if (Array.isArray(publicCases)) {
  if (publicCases.length !== 15) errors.push('公开案例数量应为 15，实际为 ' + publicCases.length);
  const ids = new Set();
  for (const item of publicCases) {
    const label = item.id || '未命名案例';
    if (ids.has(item.id)) errors.push(label + ' ID 重复');
    ids.add(item.id);
    for (const field of [
      'id', 'tier', 'category', 'status', 'source', 'reportedAt', 'traeVersion',
      'symptom', 'expectedDiagnosis', 'knownCause', 'groundTruthStatus',
      'reproducible', 'traeforgeDetected', 'diagnosisCorrect', 'autoFixAvailable',
      'postFixVerified', 'limitations'
    ]) {
      if (!(field in item)) errors.push(label + ' 缺少字段：' + field);
    }
    if (item.status !== 'PUBLIC-REPORTED') errors.push(label + ' 初始 status 必须是 PUBLIC-REPORTED');
    if (!item.source || !item.source.url || !item.source.title) errors.push(label + ' source 缺少 url/title');
    if (!Array.isArray(item.expectedDiagnosis)) errors.push(label + ' expectedDiagnosis 必须是数组');
    if (!Array.isArray(item.limitations) || item.limitations.length === 0) errors.push(label + ' limitations 必须是非空数组');
    for (const field of ['reproducible', 'traeforgeDetected', 'diagnosisCorrect', 'autoFixAvailable', 'postFixVerified']) {
      if (!schema.triState.includes(item[field])) errors.push(label + ' ' + field + ' 不合法：' + item[field]);
    }
  }
}

const manifest = readJson(path.join(root, 'tf-manifest.json'), 'tf-manifest.json');
if (Array.isArray(manifest)) {
  if (manifest.length !== 10) errors.push('TF 基准数量应为 10，实际为 ' + manifest.length);
  if (fixtureDirs.length !== manifest.length) errors.push('TF fixture 数量应为 ' + manifest.length + '，实际为 ' + fixtureDirs.length);
  const ids = new Set();
  for (const item of manifest) {
    const label = item.id || '未命名基准';
    if (ids.has(item.id)) errors.push(label + ' ID 重复');
    ids.add(item.id);
    for (const field of ['id', 'title', 'sourceCases', 'detector', 'expectedEvidence', 'status', 'limitations']) {
      if (!(field in item)) errors.push(label + ' 缺少字段：' + field);
    }
    if (!/^TF-\d{3}$/.test(item.id || '')) errors.push(label + ' ID 格式不合法');
    if (!Array.isArray(item.sourceCases) || item.sourceCases.length === 0) errors.push(label + ' sourceCases 必须是非空数组');
    if (!schema.benchmarkStatuses.includes(item.status)) errors.push(label + ' status 不合法：' + item.status);
    if (!Array.isArray(item.expectedEvidence) || item.expectedEvidence.length === 0) errors.push(label + ' expectedEvidence 必须是非空数组');
    if (!Array.isArray(item.limitations) || item.limitations.length === 0) errors.push(label + ' limitations 必须是非空数组');
    const fixturePath = path.join(root, 'fixtures', item.id, 'fixture.json');
    if (!fs.existsSync(fixturePath)) errors.push(label + ' 缺少最小 fixture：fixtures/' + item.id + '/fixture.json');
  }
}
for (const caseDir of caseDirs) {
  const expectedPath = path.join(caseDir, 'expected.json');
  const casePath = path.join(caseDir, 'case.md');
  if (!fs.existsSync(expectedPath)) { errors.push(`${path.basename(caseDir)} 缺少 expected.json`); continue; }
  if (!fs.existsSync(casePath)) errors.push(`${path.basename(caseDir)} 缺少 case.md`);
  let expected;
  try { expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8')); } catch (error) { errors.push(`${path.basename(caseDir)} JSON 无法解析：${error.message}`); continue; }
  for (const field of schema.required) if (!(field in expected)) errors.push(`${path.basename(caseDir)} 缺少字段：${field}`);
  if (!schema.statuses.includes(expected.status)) errors.push(`${path.basename(caseDir)} status 不合法：${expected.status}`);
  for (const field of ['reproducible', 'traeforgeDetected', 'diagnosisCorrect', 'autoFixAvailable', 'postFixVerified']) {
    if (!schema.triState.includes(expected[field])) errors.push(`${path.basename(caseDir)} ${field} 不合法：${expected[field]}`);
  }
  for (const field of schema.sourceRequired) if (!expected.source || !expected.source[field]) errors.push(`${path.basename(caseDir)} source 缺少字段：${field}`);
  if (!Array.isArray(expected.limitations)) errors.push(`${path.basename(caseDir)} limitations 必须是数组`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    publicCases: Array.isArray(publicCases) ? publicCases.length : 0,
    benchmarkCases: Array.isArray(manifest) ? manifest.length : 0,
    fixtureCount: fixtureDirs.length,
    legacyFixtureDirectories: caseDirs.length,
    status: 'valid'
  }));
}
