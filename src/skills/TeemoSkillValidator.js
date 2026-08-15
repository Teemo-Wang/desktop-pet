/* Fail-closed validator for Teemo Skill Specification v1 manifests. */
(function (root, factory) {
  const Validator = factory(root && root.TeemoSkillSpecification);
  if (root) root.TeemoSkillValidator = Validator;
  if (typeof window !== 'undefined') window.TeemoSkillValidator = Validator;
  if (typeof module === 'object' && module.exports) module.exports = Validator;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Specification) {
  const Spec = Specification || (typeof require === 'function' ? require('./TeemoSkillSpecification') : null);

  function isObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
  function stringArray(value, field, errors) {
    if (!Array.isArray(value)) { errors.push(`${field} must be an array`); return; }
    if (value.length > Spec.ARRAY_LIMIT) errors.push(`${field} exceeds ${Spec.ARRAY_LIMIT} items`);
    if (value.some(item => typeof item !== 'string')) errors.push(`${field} must contain strings only`);
  }

  class TeemoSkillValidator {
    validateManifest(manifest, options = {}) {
      const errors = [];
      if (!isObject(manifest)) return { valid: false, errors: ['manifest must be an object'] };
      if (!String(manifest.skillId || '').trim()) errors.push('skillId is required');
      if (!String(manifest.name || '').trim()) errors.push('name is required');
      if (!isObject(manifest.source)) errors.push('source is required');
      else {
        if (!String(manifest.source.sourceRef || '').trim()) errors.push('source.sourceRef is required');
        if (!/^(?:[a-f0-9]{64}|fallback-[a-f0-9]{8})$/.test(String(manifest.source.contentHash || ''))) errors.push('source.contentHash is invalid');
        if (options.rawBody != null && Spec.hashText(options.rawBody) !== manifest.source.contentHash) errors.push('source.contentHash does not match raw body');
      }
      if (!isObject(manifest.routing)) errors.push('routing is required');
      else {
        if (!Spec.STATUSES.includes(manifest.routing.status)) errors.push('routing.status is invalid');
        if (!Spec.ROLES.includes(manifest.routing.role)) errors.push('routing.role is invalid');
        for (const field of ['domains', 'intents', 'aliases', 'positiveExamples', 'negativeExamples', 'exclusions']) {
          stringArray(manifest.routing[field], `routing.${field}`, errors);
        }
        if (typeof manifest.routing.allowComposition !== 'boolean') errors.push('routing.allowComposition must be boolean');
        if (typeof manifest.routing.continuity !== 'boolean') errors.push('routing.continuity must be boolean');
        if (!Number.isInteger(manifest.routing.priority) || Math.abs(manifest.routing.priority) > 1000) errors.push('routing.priority is invalid');
      }
      if (!isObject(manifest.modalities)) errors.push('modalities is required');
      else {
        for (const field of ['input', 'output']) {
          stringArray(manifest.modalities[field], `modalities.${field}`, errors);
          if (Array.isArray(manifest.modalities[field]) && manifest.modalities[field].some(item => !Spec.MODALITIES.includes(item))) errors.push(`modalities.${field} contains invalid modality`);
        }
      }
      if (!isObject(manifest.requirements)) errors.push('requirements is required');
      else {
        for (const field of ['toolsRequired', 'toolsOptional', 'permissions', 'dependencies']) {
          stringArray(manifest.requirements[field], `requirements.${field}`, errors);
        }
        for (const field of ['capabilities', 'workflows']) {
          if (manifest.requirements[field] != null) stringArray(manifest.requirements[field], `requirements.${field}`, errors);
        }
      }
      if (!isObject(manifest.content) || !Spec.SENSITIVITIES.includes(manifest.content.sensitivity)) errors.push('content.sensitivity is invalid');
      if (manifest.content && Array.isArray(manifest.content.domains)) stringArray(manifest.content.domains, 'content.domains', errors);
      if (!isObject(manifest.overrides)) errors.push('overrides must be an object');
      return { valid: errors.length === 0, errors };
    }

    validateRegistryEnvelope(registry) {
      const errors = [];
      if (!isObject(registry)) return { valid: false, errors: ['registry must be an object'] };
      if (registry.schemaVersion !== Spec.schemaVersion) errors.push('schemaVersion is unsupported');
      if (!Number.isInteger(registry.revision) || registry.revision < 0) errors.push('revision is invalid');
      if (!Array.isArray(registry.skills)) errors.push('skills must be an array');
      const ids = new Set();
      for (const manifest of Array.isArray(registry.skills) ? registry.skills : []) {
        const id = manifest && manifest.skillId;
        if (id && ids.has(id)) errors.push(`duplicate skillId: ${id}`);
        if (id) ids.add(id);
      }
      return { valid: errors.length === 0, errors };
    }

    validateRegistry(registry) {
      const envelope = this.validateRegistryEnvelope(registry);
      const errors = [...envelope.errors];
      for (const manifest of registry && Array.isArray(registry.skills) ? registry.skills : []) {
        const result = this.validateManifest(manifest);
        if (!result.valid) errors.push(`${manifest && manifest.skillId || '(unknown)'}: ${result.errors.join('; ')}`);
      }
      return { valid: errors.length === 0, errors };
    }
  }

  return TeemoSkillValidator;
});
