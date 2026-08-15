const assert = require('node:assert/strict');
const TeemoAuthorizedRootGrounding = require('../src/tools/file/TeemoAuthorizedRootGrounding');
const TeemoFileService = require('../src/services/TeemoFileService');
const fs = require('fs');
const os = require('os');
const path = require('path');

function extractLocalDocumentPath(text) {
  const extensions = '(?:txt|md|json|csv|log|html|css|js|ts|jsx|tsx|py|java|c|cpp|h|yaml|yml|xml|sql|sh|ps1|pdf|docx)';
  const source = String(text || '');
  const quoted = source.match(new RegExp('["“\']([A-Za-z]:\\\\[^"”\'\\r\\n]+?\\.' + extensions + ')["”\']', 'i'));
  if (quoted) return quoted[1];
  const embedded = source.match(new RegExp(
    '([A-Za-z]:\\\\(?:[^\\\\/:*?"<>|\\r\\n]+\\\\)*[^\\\\/:*?"<>|\\r\\n]+\\.' + extensions + ')',
    'i',
  ));
  return embedded ? embedded[1] : '';
}

const sample = '先读取D:\\Teemo助手\\Teemo机器人项目\\Teemo-source\\docs\\TeemoProjectKnowledge\\INDEX.md\n这里有我的自己的机器人的信息，和hermes对比一下';
assert.equal(
  extractLocalDocumentPath(sample),
  'D:\\Teemo助手\\Teemo机器人项目\\Teemo-source\\docs\\TeemoProjectKnowledge\\INDEX.md',
);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-coerce-'));
const root = path.join(sandbox, 'D-drive-sim');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const filePath = path.join(root, 'docs', 'INDEX.md');
fs.writeFileSync(filePath, '# hello', 'utf8');
const grounding = new TeemoAuthorizedRootGrounding({ fileService: new TeemoFileService() });
const normalized = grounding.normalizeToolArguments('read_file', {
  relativePath: filePath,
}, [root]);
assert.equal(normalized.relativePath, 'docs/INDEX.md');
assert.ok(normalized.rootId);
console.log('Teemo absolute path preload / coerce tests passed');
