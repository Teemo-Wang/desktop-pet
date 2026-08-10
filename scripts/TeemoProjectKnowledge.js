const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(projectRoot, 'docs', 'TeemoProjectKnowledge');
const currentStatePath = path.join(knowledgeRoot, 'CURRENT-STATE.md');
const mode = process.argv[2] || 'verify';
const autoStart = '<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:START -->';
const autoEnd = '<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:END -->';

function git(args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getSnapshot() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const porcelain = git(['status', '--porcelain=v1']);
  return {
    version: String(packageJson.version || ''),
    branch: git(['branch', '--show-current']) || 'DETACHED',
    head: git(['rev-parse', 'HEAD']),
    worktree: porcelain ? 'DIRTY' : 'CLEAN',
    recoveryTag: git(['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', 'HEAD']),
  };
}

function renderAutoSnapshot(snapshot) {
  return [
    autoStart,
    `- Version: \`${snapshot.version}\``,
    `- Latest Recovery Tag: \`${snapshot.recoveryTag}\``,
    '',
    '## Last Verified Git Snapshot',
    '',
    'This is a historical snapshot written when Project Knowledge was last synchronized. Git branch, HEAD, and worktree are real-time engineering facts and must be queried directly during Agent Pre-Flight.',
    '',
    `- Branch: \`${snapshot.branch}\``,
    `- HEAD: \`${snapshot.head}\``,
    `- Worktree: \`${snapshot.worktree}\``,
    autoEnd,
  ].join('\n');
}

function getStateContent() {
  if (!fs.existsSync(currentStatePath)) {
    throw new Error(`Missing Teemo Project Knowledge state: ${currentStatePath}`);
  }
  return fs.readFileSync(currentStatePath, 'utf8');
}

function sync() {
  const state = getStateContent();
  const startIndex = state.indexOf(autoStart);
  const endIndex = state.indexOf(autoEnd);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('CURRENT-STATE.md is missing the managed engineering snapshot markers.');
  }
  const snapshot = getSnapshot();
  const before = state.slice(0, startIndex);
  const after = state.slice(endIndex + autoEnd.length);
  const nextState = `${before}${renderAutoSnapshot(snapshot)}${after}`;
  if (nextState !== state) fs.writeFileSync(currentStatePath, nextState, 'utf8');
  console.log(`[Teemo Project Knowledge] sync: last verified ${snapshot.branch} ${snapshot.head} ${snapshot.worktree}`);
}

function verify() {
  const requiredFiles = [
    'INDEX.md',
    'CURRENT-STATE.md',
    'ROADMAP.md',
    'ARCHITECTURE.md',
    'DECISIONS.md',
    'CHANGELOG.md',
  ];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(knowledgeRoot, file))) {
      throw new Error(`Missing Teemo Project Knowledge file: ${file}`);
    }
  }
  if (!fs.existsSync(path.join(knowledgeRoot, 'HISTORY'))) {
    throw new Error('Missing Teemo Project Knowledge HISTORY directory.');
  }

  const state = getStateContent();
  const snapshot = getSnapshot();
  const installedVersionMatch = /Installed Version:\s*\r?\n`([^`]+)`/.exec(state);
  if (!installedVersionMatch || installedVersionMatch[1] !== snapshot.version) {
    throw new Error(`CURRENT-STATE.md Installed Version does not match package.json (${snapshot.version}).`);
  }
  const managedBlock = state.slice(state.indexOf(autoStart), state.indexOf(autoEnd) + autoEnd.length);
  const versionMatch = /- Version: `([^`]+)`/.exec(managedBlock);
  if (!versionMatch || versionMatch[1] !== snapshot.version) {
    throw new Error(`CURRENT-STATE.md version does not match package.json (${snapshot.version}). Run npm.cmd run project:knowledge:sync.`);
  }
  if (!/- Latest Recovery Tag: `[^`]+`/.test(managedBlock)) {
    throw new Error('CURRENT-STATE.md is missing Latest Recovery Tag. Run npm.cmd run project:knowledge:sync.');
  }

  const requiredStateClaims = [
    'Maintenance M1:',
    'PASS / BLOCKERS: 0',
    'P3-3:',
    'CLOSED / PASS',
    'P3-4:',
    'CLOSED / PASS',
    'P3-5:',
    'CLOSED / PASS',
    'P3-6:',
    'CLOSED / PASS',
    'Next Allowed Stage:',
    'P3 Final Acceptance Taskbook / Strict Review.',
  ];
  for (const claim of requiredStateClaims) {
    if (!state.includes(claim)) {
      throw new Error(`CURRENT-STATE.md is missing required current-state claim: ${claim}`);
    }
  }

  const index = fs.readFileSync(path.join(knowledgeRoot, 'INDEX.md'), 'utf8');
  for (const file of requiredFiles.filter(file => file !== 'INDEX.md')) {
    if (!index.includes(file)) {
      throw new Error(`INDEX.md does not reference ${file}.`);
    }
  }

  const currentTask = fs.readFileSync(path.join(projectRoot, 'CURRENT-TASK.md'), 'utf8');
  const projectStatus = fs.readFileSync(path.join(projectRoot, 'PROJECT-STATUS.md'), 'utf8');
  const currentTaskClaims = [
    'P3-6 Agent Uses Inspiration',
    'CLOSED / PASS',
    'P3 Final Acceptance Taskbook',
    'P3-5 More Inspiration Sources',
    'CLOSED / PASS / BLOCKERS: 0',
    'TeemoChatAgentToolCalling',
    'PASS / BLOCKERS: 0',
  ];
  for (const claim of currentTaskClaims) {
    if (!currentTask.includes(claim) || !projectStatus.includes(claim)) {
      throw new Error(`Current task/status documents conflict with Project Knowledge: ${claim}`);
    }
  }

  const agents = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  const requiredAgentRules = [
    'docs/TeemoProjectKnowledge/INDEX.md',
    'git status --short',
    'git branch --show-current',
    'git rev-parse HEAD',
    'project:knowledge:sync',
    'project:knowledge:verify',
  ];
  for (const rule of requiredAgentRules) {
    if (!agents.includes(rule)) {
      throw new Error(`AGENTS.md is missing required Project Knowledge rule: ${rule}`);
    }
  }
  console.log(`[Teemo Project Knowledge] verify: PASS (runtime Git ${snapshot.branch} ${snapshot.head} ${snapshot.worktree}; snapshot equality not required)`);
}

if (!['sync', 'verify'].includes(mode)) {
  throw new Error('Usage: node scripts/TeemoProjectKnowledge.js <sync|verify>');
}

if (mode === 'sync') sync();
if (mode === 'verify') verify();
