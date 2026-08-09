const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoStorageService = require('../src/services/TeemoStorageService');
const TeemoCognitionService = require('../src/cognition/TeemoCognitionService');
const TeemoCognitionCollector = require('../src/cognition/TeemoCognitionCollector');
const TeemoContextBuilder = require('../src/cognition/TeemoContextBuilder');

async function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-cognition-management-'));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function serviceAt(dir) {
  return new TeemoCognitionService({ dataDir: dir });
}

async function main() {
  await withTempDir(async dir => {
    const service = serviceAt(dir);
    let snapshot = service.getManagementSnapshot();
    assert.equal(snapshot.enabled, true);
    assert.equal(snapshot.profile.length, 0);

    const global = service.manualCreate({ content: '设计方案默认优先考虑简洁和可落地', scope: 'global', category: 'preference' }, { expectedRevision: snapshot.revision });
    assert.equal(global.ok, true);
    assert.equal(global.cognition.scope, 'global');
    assert.equal(global.observation.source, 'user_manual');

    const recent = service.manualCreate({ content: '最近偏好高反射金属材质', scope: 'recent' }, { expectedRevision: global.snapshot.revision });
    assert.equal(recent.ok, true);
    const project = service.manualCreate({ content: '卡片视觉使用蓝色科技感', scope: 'project', projectId: 'project-a' }, { expectedRevision: recent.snapshot.revision });
    assert.equal(project.ok, true);
    assert.equal(service.getProfile().length, 1);
    assert.equal(service.getRecentContext().length, 1);
    assert.equal(service.getProjectContext('project-a').length, 1);
    assert.equal(service.listObservations({ includeSuperseded: true }).length, 3);

    const missingProject = service.manualCreate({ content: '只属于某个项目', scope: 'project' }, { expectedRevision: project.snapshot.revision });
    assert.equal(missingProject.code, 'PROJECT_REQUIRED');

    const beforeEditObservationId = recent.cognition.observationId;
    const edited = service.updateCognitionEntry({
      domain: 'recent',
      id: recent.cognition.id,
      content: '最近偏好高反射、克制的金属材质',
    }, { expectedRevision: project.snapshot.revision });
    assert.equal(edited.ok, true);
    assert.notEqual(edited.cognition.observationId, beforeEditObservationId);
    const observationsAfterEdit = service.listObservations({ includeSuperseded: true });
    assert.equal(observationsAfterEdit.find(item => item.id === beforeEditObservationId).status, 'superseded');
    assert.equal(observationsAfterEdit.find(item => item.id === beforeEditObservationId).supersededReason, 'user_edit');
    assert.equal(service.getRecentContext()[0].content, '最近偏好高反射、克制的金属材质');

    const evidence = service.getEvidenceForEntry({ domain: 'recent', id: edited.cognition.id });
    assert.equal(evidence.ok, true);
    assert.ok(evidence.evidence.length >= 2);

    const movedToProject = service.moveCognitionEntry({
      domain: 'profile',
      id: global.cognition.id,
      targetScope: 'project',
      targetProjectId: 'project-a',
    }, { expectedRevision: edited.snapshot.revision });
    assert.equal(movedToProject.ok, true);
    assert.equal(service.getProfile().length, 0);
    assert.equal(service.getProjectContext('project-a').length, 2);

    const movedToGlobal = service.moveCognitionEntry({
      domain: 'project',
      projectId: 'project-a',
      id: movedToProject.cognition.id,
      targetScope: 'global',
    }, { expectedRevision: movedToProject.snapshot.revision });
    assert.equal(movedToGlobal.ok, true);
    assert.equal(service.getProfile().length, 1);
    assert.equal(service.getProjectContext('project-a').some(item => item.fingerprint === movedToGlobal.cognition.fingerprint), false);

    const builderFromAnotherWindow = new TeemoContextBuilder({ cognitionService: serviceAt(dir) });
    let bundle = builderFromAnotherWindow.build({ messages: [] });
    assert.ok(bundle.systemMessage.content.includes('设计方案默认优先考虑简洁和可落地'));

    const superseded = service.supersedeCognitionEntry({ domain: 'profile', id: movedToGlobal.cognition.id }, { expectedRevision: movedToGlobal.snapshot.revision });
    assert.equal(superseded.ok, true);
    bundle = builderFromAnotherWindow.build({ messages: [] });
    assert.ok(!bundle.systemMessage || !bundle.systemMessage.content.includes('设计方案默认优先考虑简洁和可落地'));

    const sensitive = service.manualCreate({ content: 'API Key: sk-abcdefghijklmnop', scope: 'global' }, { expectedRevision: superseded.snapshot.revision });
    assert.equal(sensitive.code, 'COGNITION_SENSITIVE');

    const staleRevision = superseded.snapshot.revision;
    const otherWindow = serviceAt(dir);
    const otherCreate = otherWindow.manualCreate({ content: '习惯先探索多个方向再收敛', scope: 'global' }, { expectedRevision: staleRevision });
    assert.equal(otherCreate.ok, true);
    const staleWrite = service.manualCreate({ content: '这条不能覆盖另一窗口', scope: 'recent' }, { expectedRevision: staleRevision });
    assert.equal(staleWrite.code, 'COGNITION_CHANGED');
    assert.equal(serviceAt(dir).getRecentContext().some(item => item.content === '这条不能覆盖另一窗口'), false);

    const disabled = otherWindow.setEnabled(false, { expectedRevision: otherCreate.snapshot.revision });
    assert.equal(disabled.ok, true);
    const collector = new TeemoCognitionCollector({ cognitionService: serviceAt(dir) });
    const collection = await collector.collectTurn({ userMessage: '以后默认喜欢红色设计' });
    assert.equal(collection.skipped, 'disabled');
    bundle = builderFromAnotherWindow.build({ messages: [] });
    assert.equal(bundle.cognitionEnabled, false);
    assert.ok(!bundle.systemMessage || !bundle.systemMessage.content.includes('习惯先探索多个方向再收敛'));
    assert.ok(serviceAt(dir).getProfile().length > 0, '关闭开关不能删除已有认知');
  });

  await withTempDir(async dir => {
    const service = serviceAt(dir);
    const snapshot = service.getManagementSnapshot();
    const longContent = [
      `设计工作与专业方向\n${'偏好清晰的信息层级、明确的品牌识别和可落地的设计方案。'.repeat(24)}`,
      `工具与创作流程\n${'经常使用 ComfyUI 和设计工具完成视觉探索，并重视流程效率。'.repeat(22)}最终确认信息。`,
    ].join('\n\n');
    const preview = service.previewManualContent(longContent);
    assert.ok(preview.length > 1000);
    assert.ok(preview.itemCount >= 4);

    const batch = service.manualCreateBatch({ content: longContent, scope: 'global', category: 'preference' }, { expectedRevision: snapshot.revision });
    assert.equal(batch.ok, true);
    assert.equal(batch.createdCount, preview.itemCount);
    assert.equal(batch.snapshot.revision, snapshot.revision + 1, '批量新增只应持久化一次');
    assert.ok(batch.cognitions.every(item => item.content.length <= preview.itemMaxChars));
    assert.ok(service.getProfile().some(item => item.content.includes('最终确认信息')));

    const duplicate = service.manualCreateBatch({ content: longContent, scope: 'global', category: 'preference' }, { expectedRevision: batch.snapshot.revision });
    assert.equal(duplicate.code, 'COGNITION_DUPLICATE');
    assert.equal(service.getState().revision, batch.snapshot.revision);

    const mixed = service.manualCreateBatch({ content: `${longContent}\n\n新增的独立工作习惯。`, scope: 'global', category: 'workflow' }, { expectedRevision: batch.snapshot.revision });
    assert.equal(mixed.ok, true);
    assert.equal(mixed.createdCount, preview.itemCount + 1, 'category is part of the composite identity');
    assert.equal(mixed.duplicateCount, 0);
    assert.ok(service.getProfile().some(item => item.content === '新增的独立工作习惯。'));

    const sensitive = service.manualCreateBatch({ content: '个人资料\n\nAPI Key: sk-abcdefghijklmnop', scope: 'global' }, { expectedRevision: mixed.snapshot.revision });
    assert.equal(sensitive.code, 'COGNITION_SENSITIVE');
    const tooLong = service.manualCreateBatch({ content: '字'.repeat(preview.maxChars + 1), scope: 'global' }, { expectedRevision: mixed.snapshot.revision });
    assert.equal(tooLong.code, 'COGNITION_TOO_LONG');
    assert.equal(service.getState().revision, mixed.snapshot.revision);
  });

  await withTempDir(async dir => {
    const file = path.join(dir, 'Teemo-cognition.json');
    const invalid = '{ invalid cognition json';
    fs.writeFileSync(file, invalid, 'utf8');
    const storage = new TeemoStorageService({ dataDir: dir });
    const service = new TeemoCognitionService({ storage });
    assert.throws(() => service.manualCreate({ content: '不能覆盖损坏文件', scope: 'global' }), /拒绝覆盖读取失败/);
    assert.equal(fs.readFileSync(file, 'utf8'), invalid);
  });

  console.log('Teemo Cognition Management tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
