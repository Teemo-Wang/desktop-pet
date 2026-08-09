/*
 * TeemoToolRegistry
 * Model-neutral registry and execution boundary for Teemo Agent tools.
 */
(function (root, factory) {
  const TeemoToolRegistry = factory();
  if (root) root.TeemoToolRegistry = TeemoToolRegistry;
  if (typeof window !== 'undefined') window.TeemoToolRegistry = TeemoToolRegistry;
  if (typeof module === 'object' && module.exports) module.exports = TeemoToolRegistry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
  const JSON_SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
  const PERMISSIONS = new Set(['none', 'read', 'write', 'execute']);

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function makeToolCallId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `tool_call_${crypto.randomUUID()}`;
    }
    return `tool_call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function registryError(code, message) {
    const error = new Error(message);
    error.name = 'TeemoToolRegistryError';
    error.code = code;
    return error;
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function validateSchemaDefinition(schema, path = 'inputSchema', seen = new WeakSet()) {
    if (!isPlainObject(schema)) return `${path} must be an object`;
    if (seen.has(schema)) return `${path} must not contain circular references`;
    seen.add(schema);
    if (typeof schema.type !== 'string' || !JSON_SCHEMA_TYPES.has(schema.type)) {
      return `${path}.type must be a supported JSON Schema type`;
    }
    if (schema.type === 'object') {
      if (schema.properties != null && !isPlainObject(schema.properties)) {
        return `${path}.properties must be an object`;
      }
      if (schema.required != null && (!Array.isArray(schema.required) || schema.required.some(item => typeof item !== 'string'))) {
        return `${path}.required must be an array of strings`;
      }
      if (schema.additionalProperties != null && typeof schema.additionalProperties !== 'boolean') {
        return `${path}.additionalProperties must be a boolean`;
      }
      for (const [key, childSchema] of Object.entries(schema.properties || {})) {
        const error = validateSchemaDefinition(childSchema, `${path}.properties.${key}`, seen);
        if (error) return error;
      }
    }
    if (schema.type === 'array' && schema.items != null) {
      const error = validateSchemaDefinition(schema.items, `${path}.items`, seen);
      if (error) return error;
    }
    if (typeof schema.pattern === 'string') {
      try { new RegExp(schema.pattern); } catch (_) { return `${path}.pattern must be a valid regular expression`; }
    }
    seen.delete(schema);
    return null;
  }

  function matchesType(value, type) {
    if (type === 'object') return isPlainObject(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  }

  function validateValue(value, schema, path = 'arguments') {
    if (!matchesType(value, schema.type)) {
      return `${path} must be of type ${schema.type}`;
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(item => Object.is(item, value))) {
      return `${path} must match an allowed value`;
    }
    if (schema.type === 'object') {
      for (const required of schema.required || []) {
        if (!Object.prototype.hasOwnProperty.call(value, required)) return `${path}.${required} is required`;
      }
      const properties = schema.properties || {};
      if (schema.additionalProperties === false) {
        const extra = Object.keys(value).find(key => !Object.prototype.hasOwnProperty.call(properties, key));
        if (extra) return `${path}.${extra} is not allowed`;
      }
      for (const [key, childValue] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
        const error = validateValue(childValue, properties[key], `${path}.${key}`);
        if (error) return error;
      }
    }
    if (schema.type === 'array' && schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateValue(value[index], schema.items, `${path}[${index}]`);
        if (error) return error;
      }
    }
    if (schema.type === 'string') {
      if (Number.isInteger(schema.minLength) && value.length < schema.minLength) return `${path} is too short`;
      if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) return `${path} is too long`;
      if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern)).test(value)) return `${path} has an invalid format`;
    }
    if ((schema.type === 'number' || schema.type === 'integer')) {
      if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} is below minimum`;
      if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} is above maximum`;
    }
    return null;
  }

  function resultEnvelope({ ok, tool, toolCallId, startedAt, data, code, message, cancelled = false }) {
    const finishedAt = new Date().toISOString();
    const base = {
      ok,
      tool,
      toolCallId,
      status: ok ? 'completed' : (cancelled ? 'cancelled' : 'failed'),
      startedAt,
      finishedAt,
    };
    if (ok) return { ...base, data: data === undefined ? null : data };
    return { ...base, error: { code, message } };
  }

  function publicFailure(error, fallbackCode, fallbackMessage) {
    if (error && error.teemoSafe === true && typeof error.code === 'string') {
      return { code: error.code, message: String(error.message || fallbackMessage) };
    }
    return { code: fallbackCode, message: fallbackMessage };
  }

  class TeemoToolRegistry {
    constructor(options = {}) {
      this._tools = new Map();
      this.permissionService = options.permissionService || null;
    }

    register(definition) {
      if (!isPlainObject(definition)) {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool definition must be an object.');
      }
      const name = typeof definition.name === 'string' ? definition.name.trim() : '';
      if (!TOOL_NAME_PATTERN.test(name)) {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool name must use stable snake_case.');
      }
      if (this._tools.has(name)) {
        throw registryError('TOOL_ALREADY_REGISTERED', `Tool is already registered: ${name}`);
      }
      if (typeof definition.description !== 'string' || !definition.description.trim()) {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool description is required.');
      }
      const schemaError = validateSchemaDefinition(definition.inputSchema);
      if (schemaError) throw registryError('INVALID_TOOL_DEFINITION', schemaError);
      if (definition.inputSchema.type !== 'object') {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool inputSchema root type must be object.');
      }
      if (typeof definition.handler !== 'function') {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool handler must be a function.');
      }
      for (const hook of ['resolvePermissionResource', 'releasePermissionResource']) {
        if (definition[hook] != null && typeof definition[hook] !== 'function') {
          throw registryError('INVALID_TOOL_DEFINITION', `${hook} must be a function.`);
        }
      }
      if (definition.metadata != null && !isPlainObject(definition.metadata)) {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool metadata must be an object.');
      }
      let inputSchema;
      let metadata;
      try {
        inputSchema = clone(definition.inputSchema);
        metadata = clone(definition.metadata || {});
      } catch (_) {
        throw registryError('INVALID_TOOL_DEFINITION', 'Tool definition must be serializable.');
      }
      const stored = Object.freeze({
        name,
        description: definition.description.trim(),
        inputSchema,
        metadata,
        handler: definition.handler,
        resolvePermissionResource: typeof definition.resolvePermissionResource === 'function'
          ? definition.resolvePermissionResource
          : null,
        releasePermissionResource: typeof definition.releasePermissionResource === 'function'
          ? definition.releasePermissionResource
          : null,
      });
      this._tools.set(name, stored);
      return this.get(name);
    }

    has(name) {
      return this._tools.has(name);
    }

    get(name) {
      const definition = this._tools.get(name);
      if (!definition) return null;
      return {
        name: definition.name,
        description: definition.description,
        inputSchema: clone(definition.inputSchema),
        metadata: clone(definition.metadata),
        handler: definition.handler,
        resolvePermissionResource: definition.resolvePermissionResource,
        releasePermissionResource: definition.releasePermissionResource,
      };
    }

    list() {
      return Array.from(this._tools.keys());
    }

    listDefinitions() {
      return Array.from(this._tools.values(), definition => ({
        name: definition.name,
        description: definition.description,
        inputSchema: clone(definition.inputSchema),
      }));
    }

    async execute(name, args, context = {}) {
      const tool = typeof name === 'string' ? name : '';
      const toolCallId = makeToolCallId();
      const startedAt = new Date().toISOString();
      let definitionForRelease = null;
      let permissionResolution = null;
      try {
        const definition = this._tools.get(tool);
        if (!definition) {
          return resultEnvelope({
            ok: false, tool, toolCallId, startedAt,
            code: 'UNKNOWN_TOOL', message: `Unknown tool: ${tool || '(empty)'}`,
          });
        }
        const signal = context && context.signal;
        if (signal && signal.aborted) {
          return resultEnvelope({
            ok: false, tool, toolCallId, startedAt, cancelled: true,
            code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
          });
        }
        const input = args === undefined ? {} : args;
        const validationError = validateValue(input, definition.inputSchema);
        if (validationError) {
          return resultEnvelope({
            ok: false, tool, toolCallId, startedAt,
            code: 'TOOL_ARGUMENT_VALIDATION_FAILED', message: validationError,
          });
        }
        const permission = definition.metadata && definition.metadata.permission;
        if (!PERMISSIONS.has(permission)) {
          return resultEnvelope({
            ok: false, tool, toolCallId, startedAt,
            code: 'PERMISSION_CHECK_FAILED', message: 'Tool permission metadata is missing or invalid.',
          });
        }
        if (permission !== 'none') {
          if (typeof definition.resolvePermissionResource === 'function') {
            try {
              permissionResolution = await definition.resolvePermissionResource(input, Object.freeze({
                toolCallId,
                runId: context.runId || null,
                sessionId: context.sessionId || null,
                signal: signal || null,
              }));
              definitionForRelease = definition;
            } catch (error) {
              if ((signal && signal.aborted) || (error && /CANCELLED$/.test(String(error.code || '')))) {
                return resultEnvelope({
                  ok: false, tool, toolCallId, startedAt, cancelled: true,
                  code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
                });
              }
              const failure = publicFailure(error, 'FILE_RESOURCE_RESOLUTION_FAILED', 'Tool resource could not be resolved safely.');
              return resultEnvelope({
                ok: false, tool, toolCallId, startedAt,
                code: failure.code, message: failure.message,
              });
            }
            if (!isPlainObject(permissionResolution)
              || typeof permissionResolution.resource !== 'string'
              || !permissionResolution.resource.trim()) {
              return resultEnvelope({
                ok: false, tool, toolCallId, startedAt,
                code: 'FILE_RESOURCE_RESOLUTION_FAILED', message: 'Tool resource could not be resolved safely.',
              });
            }
          }
          const permissionService = this.permissionService;
          const authorize = permissionService && (
            typeof permissionService.authorize === 'function'
              ? permissionService.authorize.bind(permissionService)
              : (typeof permissionService.requestPermission === 'function'
                ? permissionService.requestPermission.bind(permissionService)
                : null)
          );
          if (!authorize) {
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt,
              code: 'PERMISSION_CHECK_FAILED', message: 'Permission service is unavailable.',
            });
          }
          let decision;
          try {
            decision = await authorize({
              toolCallId,
              runId: context.runId || null,
              sessionId: context.sessionId || null,
              toolName: tool,
              permission,
              resource: permissionResolution
                ? permissionResolution.resource
                : (definition.metadata.resource || null),
              requiresExecutionAuthorization: !!permissionResolution,
              reason: permissionResolution && permissionResolution.reason
                ? permissionResolution.reason
                : (definition.metadata.permissionReason || null),
            }, {
              signal: signal || null,
              timeoutMs: context.permissionTimeoutMs,
              onPrompt: request => {
                if (typeof context.onPermissionWaiting === 'function') context.onPermissionWaiting(request);
              },
            });
          } catch (_) {
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt,
              code: 'PERMISSION_CHECK_FAILED', message: 'Permission check failed closed.',
            });
          }
          if (signal && signal.aborted) {
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt, cancelled: true,
              code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
            });
          }
          if (!decision || decision.decision !== 'allow') {
            const reason = decision && decision.reason;
            if (reason === 'cancelled') {
              return resultEnvelope({
                ok: false, tool, toolCallId, startedAt, cancelled: true,
                code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
              });
            }
            if (reason === 'timeout') {
              return resultEnvelope({
                ok: false, tool, toolCallId, startedAt,
                code: 'PERMISSION_TIMEOUT', message: 'Permission request timed out.',
              });
            }
            if (reason === 'check_failed' || reason === 'permission_request_invalid') {
              return resultEnvelope({
                ok: false, tool, toolCallId, startedAt,
                code: 'PERMISSION_CHECK_FAILED', message: 'Permission check failed closed.',
              });
            }
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt,
              code: 'PERMISSION_DENIED', message: 'User denied permission for this tool.',
            });
          }
        }
        const executionContext = Object.freeze({
          runId: context.runId || null,
          sessionId: context.sessionId || null,
          step: Number.isInteger(context.step) ? context.step : null,
          signal: signal || null,
          permissionResource: permissionResolution ? permissionResolution.resource : null,
          permissionPreparation: permissionResolution ? permissionResolution.preparation : null,
        });
        try {
          const data = await definition.handler(input, executionContext);
          if (signal && signal.aborted) {
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt, cancelled: true,
              code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
            });
          }
          return resultEnvelope({ ok: true, tool, toolCallId, startedAt, data });
        } catch (error) {
          if ((signal && signal.aborted) || (error && error.name === 'AbortError')) {
            return resultEnvelope({
              ok: false, tool, toolCallId, startedAt, cancelled: true,
              code: 'TOOL_CANCELLED', message: 'Tool execution was cancelled.',
            });
          }
          const failure = publicFailure(error, 'TOOL_HANDLER_FAILED', 'Tool handler failed.');
          return resultEnvelope({
            ok: false, tool, toolCallId, startedAt,
            code: failure.code, message: failure.message,
          });
        }
      } catch (_) {
        return resultEnvelope({
          ok: false, tool, toolCallId, startedAt,
          code: 'TOOL_REGISTRY_INTERNAL_ERROR', message: 'Tool registry encountered an internal error.',
        });
      } finally {
        if (definitionForRelease && permissionResolution
          && typeof definitionForRelease.releasePermissionResource === 'function') {
          try {
            await definitionForRelease.releasePermissionResource(
              permissionResolution.preparation,
              Object.freeze({ toolCallId, runId: context.runId || null, sessionId: context.sessionId || null }),
            );
          } catch (_) {
            // Main keeps prepared resources owner-bound and short-lived; cleanup is best effort.
          }
        }
      }
    }
  }

  TeemoToolRegistry.validateValue = validateValue;
  return TeemoToolRegistry;
});
