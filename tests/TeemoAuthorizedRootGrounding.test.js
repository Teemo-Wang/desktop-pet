const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TeemoAuthorizedRootGrounding = require('../src/tools/file/TeemoAuthorizedRootGrounding');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoFileTools = require('../src/tools/file/TeemoFileTools');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code, `expected ${code}`);
}

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text)).digest('hex');
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-M2-grounding-'));
  const root = path.join(sandbox, 'one', 'Teemo-source');
  const duplicateRoot = path.join(sandbox, 'two', 'Teemo-source');
  const outside = path.join(sandbox, 'outside');
  const docs = path.join(root, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(duplicateRoot, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const content = 'Teemo M2 synthetic grounding content.';
  const testFile = path.join(docs, 'test.md');
  fs.writeFileSync(testFile, content, 'utf8');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'outside root secret', 'utf8');

  const fileService = new TeemoFileService();
  const grounding = new TeemoAuthorizedRootGrounding({ fileService });
  const summary = grounding.summarize([root]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].displayName, 'Teemo-source');
  assert.deepEqual(summary[0].capabilities, ['read', 'write']);
  assert(summary[0].aliases.includes('Teemo源码'));
  assert(summary[0].aliases.includes('当前项目'));
  assert(!Object.prototype.hasOwnProperty.call(summary[0], 'path'));
  assert(!Object.prototype.hasOwnProperty.call(summary[0], 'canonicalPath'));
  assert(!JSON.stringify(summary).includes(path.dirname(root)));
  const rootId = summary[0].rootId;

  assert.equal(grounding.resolveRootReference('Teemo-source', [root]).rootId, rootId);
  assert.equal(grounding.resolveRootReference('TEEMO-SOURCE', [root]).rootId, rootId);
  assert.equal(grounding.resolveRootReference('Teemo源码', [root]).rootId, rootId);
  assert.equal(grounding.resolveRootReference('当前项目', [root]).rootId, rootId);
  expectCode(() => grounding.resolveRootReference('Teemo-source', [root, duplicateRoot]), 'FILE_ROOT_REFERENCE_AMBIGUOUS');
  expectCode(() => grounding.groundToolArguments('read_file', { rootId, relativePath: 'docs/test.md' }, []), 'FILE_ROOT_REFERENCE_STALE');

  assert.equal(grounding.validateRelativePath('docs\\TeemoProjectKnowledge/INDEX.md'), 'docs/TeemoProjectKnowledge/INDEX.md');
  expectCode(() => grounding.validateRelativePath('../outside.md'), 'FILE_PATH_TRAVERSAL');
  expectCode(() => grounding.validateRelativePath('docs//test.md'), 'FILE_PATH_TRAVERSAL');
  expectCode(() => grounding.validateRelativePath('C:\\outside.md'), 'FILE_RELATIVE_PATH_ABSOLUTE');
  expectCode(() => grounding.validateRelativePath('docs/test.md:secret'), 'FILE_PATH_UNSAFE');

  const structured = grounding.groundToolArguments('read_file', { rootId, relativePath: 'docs/test.md' }, [root]);
  assert.equal(structured.rootId, rootId);
  assert.equal(structured.relativePath, 'docs/test.md');
  assert.equal(path.resolve(structured.path), path.resolve(testFile));
  assert.equal(fileService.prepareOperation('read_file', structured, [root]).snapshot.target, fileService.canonicalPath(testFile));

  const displayGrounded = grounding.groundToolArguments('read_file', { rootReference: 'teemo-source', relativePath: 'docs/test.md' }, [root]);
  const aliasGrounded = grounding.groundToolArguments('read_file', { rootReference: 'Teemo源码', relativePath: 'docs/test.md' }, [root]);
  assert.equal(displayGrounded.rootId, rootId);
  assert.equal(aliasGrounded.rootId, rootId);

  const dirtyProviderArgs = {
    rootId,
    rootReference: 'Teemo-source',
    relativePath: 'docs/test.md',
    path: testFile,
  };
  const normalizedDirty = grounding.normalizeToolArguments('read_file', dirtyProviderArgs, [root]);
  assert.deepEqual(normalizedDirty, { rootId, relativePath: 'docs/test.md' });
  const normalizedReference = grounding.normalizeToolArguments('read_file', {
    rootReference: 'Teemo-source', relativePath: 'docs/test.md',
  }, [root]);
  assert.deepEqual(normalizedReference, { rootId, relativePath: 'docs/test.md' });
  const normalizedSearchRoot = grounding.normalizeToolArguments('search_files', {
    rootId, query: 'settings',
  }, [root]);
  assert.deepEqual(normalizedSearchRoot, { rootId, relativePath: '', query: 'settings' });
  const normalizedLegacy = grounding.normalizeToolArguments('read_file', { path: testFile }, [root]);
  assert.deepEqual(normalizedLegacy, { rootId, relativePath: 'docs/test.md' });
  const normalizedStaleWithReference = grounding.normalizeToolArguments('read_file', {
    rootId: 'root_stale00000000', rootReference: 'Teemo-source', relativePath: 'docs/test.md',
  }, [root]);
  assert.deepEqual(normalizedStaleWithReference, { rootId, relativePath: 'docs/test.md' });
  const groundedDirty = grounding.groundToolArguments('read_file', dirtyProviderArgs, [root]);
  assert.equal(groundedDirty.rootId, rootId);
  assert.equal(groundedDirty.relativePath, 'docs/test.md');
  assert.equal(groundedDirty.rootReference, undefined);
  assert.equal(path.resolve(groundedDirty.path), path.resolve(testFile));

  const absolute = grounding.groundToolArguments('read_file', { path: testFile }, [root]);
  assert.equal(absolute.rootId, rootId);
  assert.equal(absolute.relativePath, 'docs/test.md');
  expectCode(() => grounding.groundToolArguments('read_file', { path: path.join(outside, 'secret.md') }, [root]), 'FILE_OUTSIDE_AUTHORIZED_ROOT');
  expectCode(() => grounding.groundToolArguments('read_file', { path: '\\\\server\\share\\secret.md' }, [root]), 'FILE_PATH_UNSAFE');
  expectCode(() => grounding.groundToolArguments('read_file', { path: '\\\\?\\C:\\secret.md' }, [root]), 'FILE_PATH_UNSAFE');
  expectCode(() => grounding.groundToolArguments('read_file', { path: `${testFile}:secret` }, [root]), 'FILE_PATH_UNSAFE');

  const link = path.join(root, 'outside-link');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const escaped = grounding.groundToolArguments('read_file', { rootId, relativePath: 'outside-link/secret.md' }, [root]);
  expectCode(() => fileService.prepareOperation('read_file', escaped, [root]), 'FILE_OUTSIDE_AUTHORIZED_ROOT');

  const fileClient = { prepare() {}, execute() {}, release() {} };
  const definitions = TeemoFileTools.createDefinitions({ fileClient });
  const definitionsByName = new Map(definitions.map(definition => [definition.name, definition]));
  const hash = sha256(content);
  const contractCases = {
    list_directory: { rootId, relativePath: 'docs' },
    read_file: { rootId, relativePath: 'docs/test.md' },
    search_files: { rootId, relativePath: 'docs', query: 'test' },
    search_text: { rootId, relativePath: 'docs', query: 'Teemo' },
    create_file: { rootId, relativePath: 'docs/new.md', content: 'new' },
    patch_file: { rootId, relativePath: 'docs/test.md', expectedSha256: hash, edits: [{ oldText: 'synthetic', newText: 'verified' }] },
    rename_file: { rootId, relativePath: 'docs/test.md', newRelativePath: 'docs/renamed.md', expectedSha256: hash },
    create_directory: { rootId, relativePath: 'docs/new-directory' },
  };
  assert.deepEqual([...definitionsByName.keys()].sort(), Object.keys(contractCases).sort());
  for (const [tool, args] of Object.entries(contractCases)) {
    const definition = definitionsByName.get(tool);
    assert(definition.inputSchema.properties.rootId, `${tool} missing rootId schema`);
    assert(definition.inputSchema.properties.relativePath, `${tool} missing relativePath schema`);
    assert(!definition.inputSchema.required.includes('path'), `${tool} still requires arguments.path`);
    assert.equal(TeemoToolRegistry.validateValue(args, definition.inputSchema), null, `${tool} schema rejected structured path`);
    const grounded = grounding.groundToolArguments(tool, args, [root]);
    assert.equal(grounded.rootId, rootId, `${tool} runtime grounding lost rootId`);
    assert.equal(typeof grounded.path, 'string', `${tool} runtime grounding did not produce trusted path`);
    if (tool === 'rename_file') assert.equal(typeof grounded.newPath, 'string');
  }

  expectCode(() => grounding.groundToolArguments('read_file', {}, [root]), 'FILE_PATH_CONTRACT_INVALID');
  expectCode(() => grounding.normalizeToolArguments('read_file', { rootReference: 'missing-root', relativePath: 'docs/test.md' }, [root]), 'FILE_ROOT_REFERENCE_INVALID');

  console.log(JSON.stringify({
    ok: true,
    ROOT_DISCOVERY: 'PASS',
    DISPLAY_NAME_GROUNDING: 'PASS',
    CASE_INSENSITIVE_GROUNDING: 'PASS',
    ALIAS_GROUNDING: 'PASS',
    AMBIGUOUS_ROOT: 'PASS',
    REVOKED_AND_STALE_ROOT: 'PASS',
    ABSOLUTE_PATH_GROUNDING: 'PASS',
    OUTSIDE_ROOT_FAIL_CLOSED: 'PASS',
    RELATIVE_PATH_SECURITY: 'PASS',
    SYMLINK_JUNCTION_CONTAINMENT: 'PASS',
    SAFE_FILE_TOOL_CONTRACT_UNIFIED: 'PASS',
    TOOL_ARGUMENT_NORMALIZATION: 'PASS',
    ROOTID_ONLY_AFTER_GROUNDING: 'PASS',
    ROOTREFERENCE_REMOVED_AFTER_RESOLUTION: 'PASS',
    LEGACY_PATH_REMOVED: 'PASS',
    ARGUMENTS_PATH_REQUIRED_ERROR: 'RESOLVED',
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
