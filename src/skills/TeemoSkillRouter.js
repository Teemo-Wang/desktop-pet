/* Deterministic, provider-neutral Skill Router. No LLM, embedding, tool execution or permission calls. */
(function (root, factory) {
  const Router = factory(root && root.TeemoSkillSpecification);
  if (root) root.TeemoSkillRouter = Router;
  if (typeof window !== 'undefined') window.TeemoSkillRouter = Router;
  if (typeof module === 'object' && module.exports) module.exports = Router;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Specification) {
  const Spec = Specification || (typeof require === 'function' ? require('./TeemoSkillSpecification') : null);

  function requestText(request) {
    if (request && request.text != null) return String(request.text);
    const messages = request && Array.isArray(request.messages) ? request.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (!messages[index] || messages[index].role !== 'user') continue;
      const content = messages[index].content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.filter(item => item && item.type === 'text').map(item => item.text || '').join('\n');
    }
    return '';
  }

  function normalizedModalities(value) {
    const list = Spec.normalizeList(Array.isArray(value) ? value : ['text']).map(item => item.toLowerCase());
    return list.filter(item => Spec.MODALITIES.includes(item)).length ? list.filter(item => Spec.MODALITIES.includes(item)) : ['unknown'];
  }

  function matchedItems(text, values) { return (values || []).filter(item => Spec.containsPhrase(text, item)); }
  function reason(code, skillId, detail) { return { code, skillId, ...(detail ? { detail } : {}) }; }
  function isGenericFollowUp(text) {
    const value = Spec.normalizeText(text);
    if (!value || value.length > 36) return false;
    return /^(继续|再来|再试|然后|那|这个|它|人物|颜色|标题|尺寸|版式|字体|画面|再|还是|改成|换成|大一点|小一点|亮一点|暗一点)/.test(value)
      || /(再大一点|再小一点|继续优化|继续修改|换一个|调整一下|接着来|然后呢)$/.test(value);
  }
  function isNonTask(text) {
    const value = Spec.normalizeText(text);
    return /^(你好|嗨|谢谢|感谢|再见|今天星期几|现在几点|你是谁|在吗|哈哈)/.test(value);
  }

  class TeemoSkillRouter {
    constructor(options = {}) {
      this.manifestService = options.manifestService || null;
      this.sessionState = options.sessionState || null;
      this.toolRegistry = options.toolRegistry || null;
      this.maxSkills = Math.min(3, Math.max(1, Number(options.maxSkills) || 3));
    }

    _toolAvailable(name, request) {
      if (request && Array.isArray(request.availableTools)) return request.availableTools.includes(name);
      const registry = request && request.toolRegistry || this.toolRegistry;
      return Boolean(registry && typeof registry.has === 'function' && registry.has(name));
    }

    _explicit(manifests, text, explicitSkillId) {
      if (explicitSkillId) return manifests.filter(item => item.skillId === String(explicitSkillId));
      const normalized = Spec.normalizeText(text);
      if (!normalized) return [];
      return manifests.filter(item => {
        const names = [item.name, ...(item.routing.aliases || [])].map(Spec.normalizeText).filter(value => value.length >= 2);
        return names.some(name => normalized.includes(name));
      });
    }

    _evaluate(manifest, text, modalities, projectText, request) {
      const excluded = [];
      const routing = manifest.routing;
      if (routing.status !== 'ready') excluded.push(routing.status === 'disabled' ? 'disabled' : 'needs_review');
      const exclusions = matchedItems(text, routing.exclusions);
      if (exclusions.length) excluded.push('excluded_by_manifest');
      const missingTools = (manifest.requirements.toolsRequired || []).filter(name => !this._toolAvailable(name, request));
      if (missingTools.length) excluded.push('missing_required_tool');
      const dependencies = manifest.requirements.dependencies || [];
      const availableDependencies = request && Array.isArray(request.availableDependencies) ? request.availableDependencies : [];
      if (dependencies.some(name => !availableDependencies.includes(name))) excluded.push('dependency_unavailable');
      const acceptedModalities = manifest.modalities.input || [];
      const modalityMatch = modalities.some(item => acceptedModalities.includes(item) || acceptedModalities.includes('mixed'));
      if (modalities.some(item => item !== 'text' && item !== 'unknown') && acceptedModalities.length && !modalityMatch && !acceptedModalities.includes('text')) excluded.push('modality_impossible');
      const positive = matchedItems(text, routing.positiveExamples);
      const negative = matchedItems(text, routing.negativeExamples);
      const intents = matchedItems(text, routing.intents);
      const aliases = matchedItems(text, routing.aliases);
      const domains = matchedItems(text, routing.domains);
      const projectDomains = matchedItems(projectText, routing.domains);
      const attachmentStrong = modalityMatch && modalities.some(item => item !== 'text' && item !== 'unknown') && /^(把|将|请|帮我|改|调整|分析|处理|生成|优化|看看|评价)/.test(Spec.normalizeText(text));
      const evidence = {
        positive: positive.length, intent: intents.length, alias: aliases.length,
        modality: attachmentStrong ? 1 : 0, domain: domains.length,
        project: projectDomains.length, negative: negative.length,
      };
      const viable = !excluded.length && !negative.length && Boolean(evidence.positive || evidence.intent || evidence.alias || evidence.modality);
      const tuple = [evidence.positive, evidence.intent, evidence.alias, evidence.modality, evidence.domain, evidence.project, Number(routing.priority) || 0];
      return { manifest, excluded, missingTools, evidence, viable, tuple };
    }

    _compare(left, right) {
      for (let index = 0; index < left.tuple.length; index += 1) {
        if (left.tuple[index] !== right.tuple[index]) return right.tuple[index] - left.tuple[index];
      }
      return left.manifest.skillId.localeCompare(right.manifest.skillId);
    }

    _routeExplicit(matches, text, request) {
      if (matches.length !== 1) {
        return Spec.emptyResult({
          reasons: [reason('ambiguous_candidates', null, 'explicit_name')],
          ambiguousCandidates: matches.map(item => item.skillId).sort(),
        });
      }
      const manifest = matches[0];
      if (manifest.routing.status === 'disabled') return Spec.emptyResult({ excluded: [reason('disabled', manifest.skillId)] });
      const missing = (manifest.requirements.toolsRequired || []).filter(name => !this._toolAvailable(name, request));
      if (missing.length) return Spec.emptyResult({ excluded: [reason('missing_required_tool', manifest.skillId, missing.join(', '))] });
      return {
        type: 'single_skill', selectedSkillIds: [manifest.skillId], confidence: 'high',
        reasons: [reason('explicit_skill_name', manifest.skillId, manifest.name)], excluded: [],
        continuityUsed: false, ambiguousCandidates: [], explicit: true,
      };
    }

    route(request = {}) {
      const text = requestText(request);
      const modalities = normalizedModalities(request.modalities);
      const projectText = JSON.stringify(request.projectContext || '');
      const snapshot = request.registrySnapshot || (this.manifestService && this.manifestService.reload ? this.manifestService.reload() : null);
      if (!snapshot || snapshot.ok === false) return Spec.emptyResult({ error: snapshot && snapshot.error || { code: 'SKILL_REGISTRY_UNREADABLE' } });
      const manifests = (snapshot.skills || []).slice();
      const explicitMatches = this._explicit(manifests, text, request.explicitSkillId);
      if (request.explicitSkillId || explicitMatches.length) {
        const result = this._routeExplicit(explicitMatches, text, request);
        if (this.sessionState && request.sessionId) {
          if (result.selectedSkillIds.length) this.sessionState.set(request.sessionId, result, { explicit: true });
          else this.sessionState.clear(request.sessionId);
        }
        return result;
      }

      const evaluated = manifests.map(item => this._evaluate(item, text, modalities, projectText, request));
      const excluded = [];
      for (const item of evaluated) for (const code of item.excluded) excluded.push(reason(code, item.manifest.skillId, code === 'missing_required_tool' ? item.missingTools.join(', ') : null));
      const viable = evaluated.filter(item => item.viable).sort((a, b) => this._compare(a, b));

      if (!viable.length && this.sessionState && request.sessionId && isGenericFollowUp(text) && !isNonTask(text)) {
        const active = this.sessionState.get(request.sessionId);
        const activeManifests = active && active.selectedSkillIds.map(id => manifests.find(item => item.skillId === id)).filter(item => item && item.routing.status === 'ready' && item.routing.continuity);
        if (activeManifests && activeManifests.length) {
          return {
            type: activeManifests.length > 1 ? 'multi_skill' : 'single_skill',
            selectedSkillIds: activeManifests.map(item => item.skillId), confidence: 'medium',
            reasons: activeManifests.map(item => reason('active_skill_continuity', item.skillId)), excluded,
            continuityUsed: true, ambiguousCandidates: [],
          };
        }
      }

      if (!viable.length) {
        if (this.sessionState && request.sessionId && (isNonTask(text) || !isGenericFollowUp(text))) this.sessionState.clear(request.sessionId);
        return Spec.emptyResult({ excluded, reasons: isNonTask(text) ? [reason('non_task_turn')] : [] });
      }

      const primary = viable.find(item => item.manifest.routing.role === 'task') || viable[0];
      const sameRole = viable.filter(item => item.manifest.routing.role === primary.manifest.routing.role);
      const signature = item => item.tuple.slice(0, 6).join('|');
      const ambiguous = sameRole.filter(item => signature(item) === signature(primary));
      if (ambiguous.length > 1) {
        if (this.sessionState && request.sessionId) this.sessionState.clear(request.sessionId);
        return Spec.emptyResult({
          excluded, reasons: [reason('ambiguous_candidates')],
          ambiguousCandidates: ambiguous.map(item => item.manifest.skillId).sort(),
        });
      }

      const selected = [primary];
      if (primary.manifest.routing.allowComposition) {
        const usedRoles = new Set([primary.manifest.routing.role]);
        for (const candidate of viable.filter(item => item !== primary)) {
          const role = candidate.manifest.routing.role;
          if (selected.length >= this.maxSkills || usedRoles.has(role) || !candidate.manifest.routing.allowComposition) continue;
          selected.push(candidate);
          usedRoles.add(role);
        }
      }
      selected.sort((a, b) => Spec.ROLE_ORDER[a.manifest.routing.role] - Spec.ROLE_ORDER[b.manifest.routing.role] || a.manifest.skillId.localeCompare(b.manifest.skillId));
      const reasonList = [];
      for (const item of selected) {
        if (item.evidence.positive) reasonList.push(reason('positive_example_match', item.manifest.skillId));
        if (item.evidence.intent) reasonList.push(reason('intent_match', item.manifest.skillId));
        if (item.evidence.alias) reasonList.push(reason('alias_match', item.manifest.skillId));
        if (item.evidence.modality) reasonList.push(reason(`${modalities.find(modality => modality !== 'text') || 'attachment'}_input_match`, item.manifest.skillId));
        if (item.evidence.project) reasonList.push(reason('project_domain_match', item.manifest.skillId));
      }
      const confidence = primary.evidence.positive || (primary.evidence.intent && primary.evidence.alias) ? 'high' : 'medium';
      const result = {
        type: selected.length > 1 ? 'multi_skill' : 'single_skill',
        selectedSkillIds: selected.map(item => item.manifest.skillId), confidence, reasons: reasonList,
        excluded, continuityUsed: false, ambiguousCandidates: [],
      };
      if (this.sessionState && request.sessionId) this.sessionState.set(request.sessionId, result);
      return result;
    }

    previewRoute(request = {}) { return this.route({ ...request, sessionId: null }); }
  }

  TeemoSkillRouter.isGenericFollowUp = isGenericFollowUp;
  TeemoSkillRouter.isNonTask = isNonTask;
  return TeemoSkillRouter;
});
