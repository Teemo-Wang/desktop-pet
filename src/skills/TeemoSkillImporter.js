/* Deterministic Raw Skill to Internal Manifest importer. It never writes Raw Skill. */
(function (root, factory) {
  const Importer = factory(root && root.TeemoSkillSpecification);
  if (root) root.TeemoSkillImporter = Importer;
  if (typeof window !== 'undefined') window.TeemoSkillImporter = Importer;
  if (typeof module === 'object' && module.exports) module.exports = Importer;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Specification) {
  const Spec = Specification || (typeof require === 'function' ? require('./TeemoSkillSpecification') : null);

  function parseFrontmatter(body) {
    const text = String(body || '').replace(/^\uFEFF/, '');
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    const fields = {};
    if (!match) return fields;
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!pair) continue;
      fields[pair[1].toLowerCase()] = pair[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return fields;
  }

  function splitList(value) {
    if (Array.isArray(value)) return Spec.normalizeList(value);
    const text = String(value || '').trim().replace(/^\[|\]$/g, '');
    return Spec.normalizeList(text.split(/[,，、;；|]/).map(item => item.trim().replace(/^['"]|['"]$/g, '')));
  }

  function splitIdentifiers(value) {
    if (Array.isArray(value)) return Spec.normalizeList(value);
    return Spec.normalizeList(String(value || '').trim().replace(/^\[|\]$/g, '').split(/[,，、;；|\s]+/));
  }

  function sectionItems(body, names) {
    const lines = String(body || '').split(/\r?\n/);
    const output = [];
    let collecting = false;
    for (const line of lines) {
      const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
      if (heading) {
        collecting = names.some(name => Spec.containsPhrase(heading[1], name));
        continue;
      }
      if (!collecting) continue;
      const bullet = line.match(/^\s*(?:[-*+] |\d+[.)]\s+)(.+?)\s*$/);
      if (bullet) output.push(bullet[1]);
      if (output.length >= 20) break;
    }
    return Spec.normalizeList(output, 20);
  }

  function inferRole(text) {
    const value = Spec.normalizeText(text);
    if (/(品牌|brand|哈啰|hellobike|视觉识别|vi\b)/i.test(value)) return 'brand';
    if (/(翻译|translate|格式化|format|导出|export|转换|convert|压缩|rename|命名)/i.test(value)) return 'utility';
    if (/(领域|domain|摄影|photograph|代码规范|coding standard|法律|财务|医学|运营视觉)/i.test(value)) return 'domain';
    return 'task';
  }

  function inferModalities(text) {
    const value = Spec.normalizeText(text);
    const input = [];
    const output = [];
    const pairs = [
      ['image', /(图片|图像|海报|视觉|image|photo|logo|改图)/i],
      ['video', /(视频|video|剪辑)/i],
      ['audio', /(音频|声音|audio)/i],
      ['pdf', /\bpdf\b/i],
      ['spreadsheet', /(表格|excel|spreadsheet|xlsx)/i],
      ['slides', /(幻灯片|ppt|slides|演示文稿)/i],
      ['code', /(代码|编程|coding|javascript|python|typescript)/i],
      ['document', /(文档|word|docx|markdown)/i],
    ];
    for (const [modality, pattern] of pairs) if (pattern.test(value)) input.push(modality);
    if (!input.length) input.push('text');
    if (/(生成图片|生图|海报|image generation|输出图片)/i.test(value)) output.push('image');
    else output.push('text');
    return { input, output };
  }

  function inferSensitivity(text) {
    const value = Spec.normalizeText(text);
    if (/(nsfw|adult|成人|色情|裸露)/i.test(value)) return 'adult';
    if (/(敏感|sensitive|医疗|法律|财务|政治)/i.test(value)) return 'sensitive';
    return 'general';
  }

  function aliasesFromName(name) {
    const aliases = [];
    const raw = String(name || '').trim();
    let match;
    const expression = /[（(【\[]([^）)】\]]+)[）)】\]]/g;
    while ((match = expression.exec(raw))) aliases.push(...splitList(match[1]));
    const core = raw.replace(/[（(【\[].*?[）)】\]]/g, '').replace(/(?:规范|技能|规则|指南|手册|模板|skill)$/i, '').trim();
    if (core && Spec.normalizeText(core) !== Spec.normalizeText(raw)) aliases.push(core);
    return Spec.normalizeList(aliases);
  }

  class TeemoSkillImporter {
    buildManifest(source, previous = null) {
      const rawBody = String(source && (source.rawBody != null ? source.rawBody : source.systemPrompt) || '');
      const fields = parseFrontmatter(rawBody);
      const name = String(source && source.name || fields.name || 'Untitled Skill').trim();
      const description = String(source && source.description || source && source.desc || fields.description || '').trim();
      const triggers = splitList(source && source.triggers || fields.triggers || fields.trigger);
      const aliases = Spec.normalizeList([...splitList(fields.aliases || fields.alias), ...aliasesFromName(name)]);
      const intents = Spec.normalizeList([...triggers, ...splitList(fields.intents || fields.intent), ...(description ? [description] : [])]);
      const positiveExamples = Spec.normalizeList([...splitList(fields.positiveexamples || fields.examples), ...sectionItems(rawBody, ['适用场景', '触发条件', '示例', 'examples', 'use cases'])]);
      const negativeExamples = Spec.normalizeList([...splitList(fields.negativeexamples), ...sectionItems(rawBody, ['不要使用', '不适用', 'negative examples', 'non-goal'])]);
      const exclusions = Spec.normalizeList([...splitList(fields.exclusions), ...sectionItems(rawBody, ['排除', 'exclusions'])]);
      const inferenceText = [name, description, triggers.join(' '), rawBody.slice(0, 4000)].join('\n');
      const reliable = Boolean(triggers.length || aliases.length || positiveExamples.length || (description.length >= 4 && !/^自定义\s*skill$/i.test(description)));
      const sourceRef = String(source && source.sourceRef || `legacy:${source && source.id || name}`);
      const skillId = String(source && source.id || previous && previous.skillId || Spec.stableSkillId(sourceRef, name));
      const generatedRouting = {
        status: reliable ? 'ready' : 'needs_review',
        role: fields.role && Spec.ROLES.includes(fields.role.toLowerCase()) ? fields.role.toLowerCase() : inferRole(inferenceText),
        domains: Spec.normalizeList([...splitList(fields.domains || fields.domain), ...splitList(source && source.domains)]),
        intents, aliases, positiveExamples, negativeExamples, exclusions,
        allowComposition: /^(true|yes|1)$/i.test(fields.allowcomposition || '') || Boolean(source && source.allowComposition),
        continuity: !/^(false|no|0)$/i.test(fields.continuity || ''),
        priority: Number.isInteger(Number(fields.priority)) ? Math.max(-1000, Math.min(1000, Number(fields.priority))) : 0,
      };
      const overrides = previous && previous.overrides && typeof previous.overrides === 'object' ? Spec.clone(previous.overrides) : {};
      const routingOverrideKeys = ['status', 'role', 'domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions', 'allowComposition', 'continuity', 'priority'];
      const routingOverrides = {};
      for (const key of routingOverrideKeys) if (Object.prototype.hasOwnProperty.call(overrides, key)) routingOverrides[key] = overrides[key];
      const routing = { ...generatedRouting, ...routingOverrides };
      for (const field of ['domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions']) routing[field] = Spec.normalizeList(routing[field]);
      const inferredModalities = inferModalities(inferenceText);
      const generatedModalities = {
        input: splitList(fields.inputmodalities || fields.modality).filter(item => Spec.MODALITIES.includes(item)).concat(inferredModalities.input).filter((item, index, list) => list.indexOf(item) === index),
        output: splitList(fields.outputmodalities).filter(item => Spec.MODALITIES.includes(item)).concat(inferredModalities.output).filter((item, index, list) => list.indexOf(item) === index),
      };
      const modalities = {
        input: Array.isArray(overrides.inputModalities) ? Spec.normalizeList(overrides.inputModalities).filter(item => Spec.MODALITIES.includes(item)) : generatedModalities.input,
        output: Array.isArray(overrides.outputModalities) ? Spec.normalizeList(overrides.outputModalities).filter(item => Spec.MODALITIES.includes(item)) : generatedModalities.output,
      };
      const generatedContent = { domains: splitList(fields.contentdomains || fields.domains || fields.domain), sensitivity: inferSensitivity(inferenceText) };
      const content = { ...generatedContent, sensitivity: Spec.SENSITIVITIES.includes(overrides.sensitivity) ? overrides.sensitivity : generatedContent.sensitivity };
      return {
        skillId, name, skillVersion: fields.version || fields.skillversion || null,
        source: { sourceRef, contentHash: Spec.hashText(rawBody) },
        routing,
        modalities,
        requirements: {
          toolsRequired: splitIdentifiers(fields.toolsrequired || fields.requiredtools || fields['allowed-tools']),
          toolsOptional: splitIdentifiers(fields.toolsoptional),
          permissions: splitIdentifiers(fields.permissions),
          dependencies: splitIdentifiers(fields.dependencies),
          capabilities: splitIdentifiers(source && source.requires || fields.requires || fields.capabilities),
          workflows: splitIdentifiers(source && source.workflow || fields.workflow || fields.workflows),
        },
        content,
        overrides,
        generatedRouting,
        generatedModalities,
        generatedContent,
      };
    }
  }

  TeemoSkillImporter.parseFrontmatter = parseFrontmatter;
  return TeemoSkillImporter;
});
