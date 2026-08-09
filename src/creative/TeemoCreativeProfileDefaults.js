/**
 * Versioned, provider-neutral design judgment owned by Teemo Agent.
 * This is product configuration, not learned user data.
 */
(function (root, factory) {
  const defaults = factory();
  if (root) root.TeemoCreativeProfileDefaults = defaults;
  if (typeof window !== 'undefined') window.TeemoCreativeProfileDefaults = defaults;
  if (typeof module === 'object' && module.exports) module.exports = defaults;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PROFILE = {
    schemaVersion: 1,
    profileVersion: '1.0.0',
    identity: {
      role: 'Independent professional design judgment',
      description: 'Teemo Agent uses stable professional criteria to evaluate design quality independently from user taste.',
    },
    principles: [
      { id: 'objective_first', name: '目标优先于装饰', summary: '设计首先服务业务、用户、品牌和信息目标，视觉效果不能为了炫技牺牲任务。' },
      { id: 'clear_hierarchy', name: '信息层级必须清晰', summary: '明确第一眼、第二眼和最终行动，避免所有元素拥有相同视觉权重。' },
      { id: 'brand_distinctiveness', name: '品牌识别不能被通用审美替代', summary: '警惕模板化、趋势复制和 AI 同质化削弱品牌资产。' },
      { id: 'meaningful_simplicity', name: '简洁不等于贫乏', summary: '减法应提升聚焦与效率，不能移除品牌记忆点、核心利益或视觉符号。' },
      { id: 'purposeful_innovation', name: '创新必须服务结果', summary: '综合理解成本、实现成本、品牌适配、传播效率和长期延展判断创新价值。' },
      { id: 'memory_anchor', name: '设计需要记忆锚点', summary: '用视觉符号、构图、字体、角色、材质、色彩或动态语言建立清晰记忆点。' },
      { id: 'independent_judgment', name: '设计判断不能只顺从个人偏好', summary: '偏好是重要输入，但与目标、体验或传播冲突时应解释差异并给出专业建议。' },
      { id: 'execution_quality', name: '执行质量属于设计质量', summary: '同时评价比例、对齐、间距、留白、材质、光影、字体、边缘和一致性。' },
      { id: 'medium_context', name: '判断必须考虑媒介上下文', summary: '根据品牌、营销、UI、3D、动效等媒介调整关注重点，不机械套用原则。' },
      { id: 'calibrated_certainty', name: '信息不足时降低判断确定性', summary: '缺少目标、用户、规范、尺寸、场景或限制时明确判断依据有限，不伪造事实。' },
    ],
    dimensions: [
      { id: 'objective_fit', name: '目标适配度', weight: 18, description: '是否服务任务、用户、业务和品牌目标。' },
      { id: 'visual_hierarchy', name: '视觉层级', weight: 14, description: '信息顺序、视觉焦点和行动路径是否明确。' },
      { id: 'brand_distinctiveness', name: '品牌识别', weight: 14, description: '是否形成差异化、可记忆和可延展的品牌资产。' },
      { id: 'clarity_usability', name: '清晰性与可用性', weight: 12, description: '内容是否易理解、易读取、易操作。' },
      { id: 'composition_rhythm', name: '构图与节奏', weight: 10, description: '比例、空间、重心、留白和节奏是否稳定。' },
      { id: 'typography', name: '字体', weight: 8, description: '字体选择、层级、字距、行距和可读性是否合适。' },
      { id: 'color_material', name: '色彩与材质', weight: 8, description: '色彩关系、材质表达和媒介适配是否准确。' },
      { id: 'originality_memorability', name: '创新与记忆', weight: 8, description: '是否有非模板化、可识别且服务目标的记忆点。' },
      { id: 'execution_feasibility', name: '执行与落地', weight: 8, description: '细节完成度、实现成本和真实场景落地是否可靠。' },
    ],
    domainLenses: {
      general: { id: 'general', name: '通用', focus: ['目标适配', '信息层级', '清晰性', '记忆点', '执行质量'] },
      brand: { id: 'brand', name: '品牌', focus: ['品牌识别', '视觉资产', '差异化', '统一性', '延展性', '品牌符号'] },
      marketing: { id: 'marketing', name: '营销视觉', focus: ['第一视觉冲击', '核心利益点', '信息层级', '行动引导', '传播效率', '营销记忆'] },
      ui: { id: 'ui', name: 'UI', focus: ['信息结构', '可读性', '一致性', '操作路径', '状态反馈', '视觉与功能关系'] },
      '3d': { id: '3d', name: '3D', focus: ['造型比例', '轮廓', '视觉重心', '材质', '光影', '风格一致性', '渲染完成度'] },
      motion: { id: 'motion', name: 'Motion', focus: ['节奏', '运动逻辑', '视觉引导', '信息顺序', '缓动', '转场', '动态与信息关系'] },
    },
    responsePolicy: {
      constraintPriority: ['explicit_user_instruction', 'project_constraint', 'skill_constraint', 'creative_judgment'],
      separatePreferenceFromJudgment: true,
      explainConflicts: true,
      lowerCertaintyWhenContextMissing: true,
      avoidPseudoPrecision: true,
      allowNotApplicableDimensions: true,
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getProfile() {
    return clone(PROFILE);
  }

  function getDomainLens(domain) {
    const key = String(domain || '').toLowerCase();
    return clone(PROFILE.domainLenses[key] || PROFILE.domainLenses.general);
  }

  function validate(profile = PROFILE) {
    const errors = [];
    if (profile.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!/^\d+\.\d+\.\d+$/.test(String(profile.profileVersion || ''))) errors.push('profileVersion must be semantic');
    const principleIds = (profile.principles || []).map(item => item.id);
    const dimensionIds = (profile.dimensions || []).map(item => item.id);
    if (new Set(principleIds).size !== principleIds.length) errors.push('principle ids must be unique');
    if (new Set(dimensionIds).size !== dimensionIds.length) errors.push('dimension ids must be unique');
    const weights = (profile.dimensions || []).map(item => Number(item.weight));
    if (weights.some(weight => !Number.isFinite(weight) || weight < 0 || weight > 100)) errors.push('dimension weights must be valid');
    if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) errors.push('dimension weights must total 100');
    Object.entries(profile.domainLenses || {}).forEach(([key, lens]) => {
      if (!lens || lens.id !== key || !Array.isArray(lens.focus) || !lens.focus.length) errors.push(`invalid domain lens: ${key}`);
    });
    return { ok: errors.length === 0, errors };
  }

  return { getProfile, getDomainLens, validate };
});
