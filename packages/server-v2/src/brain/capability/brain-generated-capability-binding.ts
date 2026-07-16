import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { Ajv } from 'ajv';
import { canonicalizeBusinessDefinition } from '../../semantic-data/business-definition-projection-compiler.service.js';
import {
  FORBIDDEN_CAPABILITY_IDENTITY_ARG_KEYS,
  isForbiddenCapabilityIdentityArgKey,
} from './brain-capability-identity-args.js';
import type {
  BrainCapabilityCandidate,
  BrainCapabilitySourceEvidence,
  BrainCapabilityStoreScope,
} from './brain-capability-scan.types.js';

export interface BrainGeneratedCapabilityExecutorTarget {
  kind: 'controller' | 'service';
  className: string;
  methodName: string;
  sourcePath: string;
  exportedClass: boolean;
  methodAccess: 'public' | 'protected' | 'private';
  parameterCount: number;
  parameterTypes: string[];
  returnType: string;
}

export interface BrainGeneratedCapabilityExecutorBinding {
  schemaVersion: 1;
  capabilityKey: string;
  sourceFingerprint: string;
  bindingFingerprint: string;
  target: BrainGeneratedCapabilityExecutorTarget;
  generatedSourcePath: string;
  targetImportPath: string;
  requiredPermissions: string[];
  storeScope: BrainCapabilityStoreScope;
  requiresConfirmation: boolean;
  idempotency: BrainCapabilityCandidate['idempotency'];
  readOnly: boolean;
  sideEffect: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export function createGeneratedCapabilityBinding(input: {
  capability: BrainCapabilityCandidate;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}): BrainGeneratedCapabilityExecutorBinding {
  const target = resolveGeneratedCapabilityTarget(input.capability);
  if (!target.exportedClass) throw new Error('generated_capability_target_class_not_exported');
  if (target.methodAccess !== 'public') throw new Error('generated_capability_target_method_not_public');
  if (target.parameterCount < 0 || target.parameterCount > 2) {
    throw new Error('generated_capability_target_signature_unsupported');
  }
  const generatedSourcePath = `packages/server-v2/src/brain/capability/generated/${safeCapabilityKey(input.capability.key)}/binding.ts`;
  const targetImportPath = moduleImportPath(generatedSourcePath, target.sourcePath);
  const fingerprintInput = {
    schemaVersion: 1 as const,
    capabilityKey: input.capability.key,
    sourceFingerprint: input.capability.sourceFingerprint,
    target,
    generatedSourcePath,
    targetImportPath,
    requiredPermissions: [...input.capability.requiredPermissions].sort(),
    storeScope: input.capability.storeScope,
    requiresConfirmation: input.capability.requiresConfirmation,
    idempotency: input.capability.idempotency,
    readOnly: input.capability.readOnly,
    sideEffect: input.capability.sideEffect,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  };
  return {
    ...fingerprintInput,
    bindingFingerprint: sha256(fingerprintInput),
  };
}

export function resolveGeneratedCapabilityTarget(
  capability: BrainCapabilityCandidate,
): BrainGeneratedCapabilityExecutorTarget {
  const decoratorSymbols = new Set(
    capability.evidence.filter((item) => item.sourceType === 'decorator').map((item) => item.symbol),
  );
  const executable = capability.evidence.filter(
    (item) =>
      (item.sourceType === 'controller' || item.sourceType === 'service') &&
      (decoratorSymbols.size === 0 || decoratorSymbols.has(item.symbol)),
  );
  if (executable.length !== 1) throw new Error('generated_capability_executor_target_ambiguous');
  return parseExecutorTarget(executable[0]!);
}

export function createGeneratedCapabilityProposalFingerprint(input: {
  sourceFingerprint: string;
  manifest: unknown;
  executorBinding: BrainGeneratedCapabilityExecutorBinding;
  bindingSource: string;
  contractTestSource: string;
}): string {
  return sha256({
    sourceFingerprint: input.sourceFingerprint,
    manifest: input.manifest,
    executorBinding: input.executorBinding,
    bindingSourceFingerprint: sha256(input.bindingSource),
    contractTestSourceFingerprint: sha256(input.contractTestSource),
  });
}

export function renderGeneratedCapabilityBindingSource(binding: BrainGeneratedCapabilityExecutorBinding): string {
  const className = `${pascalCase(binding.capabilityKey)}GeneratedCapabilityBinding`;
  const argsType = renderArgsType(binding.inputSchema);
  const targetClass = binding.target.className;
  const targetMethod = binding.target.methodName;
  const targetMethodType = `Pick<${targetClass}, '${targetMethod}'>['${targetMethod}']`;
  const contextProvider =
    binding.target.parameterCount === 2
      ? [
          `export interface GeneratedCapabilityExecutionContextProvider {`,
          `  current(): Parameters<TargetMethod>[1];`,
          `}`,
          ``,
        ]
      : [];
  const constructor =
    binding.target.parameterCount === 2
      ? `  constructor(private readonly target: Pick<${targetClass}, '${targetMethod}'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}`
      : `  constructor(private readonly target: Pick<${targetClass}, '${targetMethod}'>) {}`;
  const invocation =
    binding.target.parameterCount === 0
      ? `    return this.target.${targetMethod}();`
      : binding.target.parameterCount === 1
        ? `    return this.target.${targetMethod}(args);`
        : `    return this.target.${targetMethod}(args, this.contextProvider.current());`;
  return [
    `import type { ${targetClass} } from ${JSON.stringify(binding.targetImportPath)};`,
    `import { assertGeneratedCapabilityArgs } from '../../brain-generated-capability-binding.js';`,
    ``,
    `export interface GeneratedCapabilityArgs ${argsType}`,
    ``,
    `type TargetMethod = ${targetMethodType};`,
    ``,
    ...contextProvider,
    `export const GENERATED_CAPABILITY_BINDING = Object.freeze(${JSON.stringify(binding, null, 2)} as const);`,
    ``,
    `export class ${className} {`,
    constructor,
    ``,
    `  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {`,
    `    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);`,
    invocation,
    `  }`,
    `}`,
    ``,
  ].join('\n');
}

export function renderGeneratedCapabilityContractTestSource(
  binding: BrainGeneratedCapabilityExecutorBinding,
): string {
  return [
    `import { GENERATED_CAPABILITY_BINDING } from './binding.js';`,
    ``,
    `export function assertGeneratedBindingContract(): void {`,
    `  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== ${JSON.stringify(binding.capabilityKey)}) {`,
    `    throw new Error('generated_binding_capability_key_mismatch');`,
    `  }`,
    `  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== ${JSON.stringify(binding.sourceFingerprint)}) {`,
    `    throw new Error('generated_binding_source_fingerprint_mismatch');`,
    `  }`,
    `  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== ${JSON.stringify(binding.bindingFingerprint)}) {`,
    `    throw new Error('generated_binding_fingerprint_mismatch');`,
    `  }`,
    `  if (GENERATED_CAPABILITY_BINDING.target.kind !== ${JSON.stringify(binding.target.kind)} ||`,
    `      GENERATED_CAPABILITY_BINDING.target.className !== ${JSON.stringify(binding.target.className)} ||`,
    `      GENERATED_CAPABILITY_BINDING.target.methodName !== ${JSON.stringify(binding.target.methodName)} ||`,
    `      GENERATED_CAPABILITY_BINDING.target.sourcePath !== ${JSON.stringify(binding.target.sourcePath)}) {`,
    `    throw new Error('generated_binding_target_mismatch');`,
    `  }`,
    `}`,
    ``,
    `assertGeneratedBindingContract();`,
    ``,
  ].join('\n');
}

export function publicCapabilityInputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const publicProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !isForbiddenCapabilityIdentityArgKey(key)),
  );
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string' && !isForbiddenCapabilityIdentityArgKey(key))
    : [];
  return {
    type: 'object',
    properties: publicProperties,
    required,
    additionalProperties: false,
  };
}

export function assertGeneratedCapabilityArgs(schema: Record<string, unknown>, value: unknown): void {
  let validate: ReturnType<Ajv['compile']>;
  try {
    validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  } catch {
    throw new Error('generated_capability_args_schema_invalid');
  }
  if (!validate(value)) throw new Error('generated_capability_args_schema_invalid');
  const forbidden = findGeneratedControlMetadata(value);
  if (forbidden) throw new Error(`generated_capability_control_metadata_forbidden:${forbidden}`);
}

export function generatedBindingFingerprint(binding: BrainGeneratedCapabilityExecutorBinding): string {
  const { bindingFingerprint: _ignored, ...fingerprintInput } = binding;
  return sha256(fingerprintInput);
}

function parseExecutorTarget(evidence: BrainCapabilitySourceEvidence): BrainGeneratedCapabilityExecutorTarget {
  const value = evidence.data.executorTarget;
  if (!isRecord(value)) throw new Error('generated_capability_executor_target_missing');
  if (
    !['controller', 'service'].includes(String(value.kind)) ||
    !nonEmpty(value.className) ||
    !nonEmpty(value.methodName) ||
    !nonEmpty(value.sourcePath) ||
    value.exportedClass !== true ||
    !['public', 'protected', 'private'].includes(String(value.methodAccess)) ||
    !Number.isInteger(value.parameterCount) ||
    !Array.isArray(value.parameterTypes) ||
    value.parameterTypes.some((item) => typeof item !== 'string') ||
    !nonEmpty(value.returnType) ||
    value.sourcePath !== evidence.path ||
    `${value.className}.${value.methodName}` !== evidence.symbol
  ) {
    throw new Error('generated_capability_executor_target_invalid');
  }
  return {
    kind: value.kind as BrainGeneratedCapabilityExecutorTarget['kind'],
    className: value.className,
    methodName: value.methodName,
    sourcePath: value.sourcePath,
    exportedClass: value.exportedClass,
    methodAccess: value.methodAccess as BrainGeneratedCapabilityExecutorTarget['methodAccess'],
    parameterCount: value.parameterCount as number,
    parameterTypes: value.parameterTypes as string[],
    returnType: value.returnType,
  };
}

function renderArgsType(schema: Record<string, unknown>): string {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []);
  const lines = Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `  readonly ${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${typescriptType(value)};`);
  return `{\n  readonly [key: string]: unknown;${lines.length ? `\n${lines.join('\n')}` : ''}\n}`;
}

function typescriptType(value: unknown): string {
  if (!isRecord(value)) return 'unknown';
  if (value.type === 'string') return 'string';
  if (value.type === 'number' || value.type === 'integer') return 'number';
  if (value.type === 'boolean') return 'boolean';
  if (value.type === 'array') return `Array<${typescriptType(value.items)}>`;
  if (value.type === 'object') return 'Record<string, unknown>';
  return 'unknown';
}

function pascalCase(value: string): string {
  const result = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((item) => `${item.charAt(0).toUpperCase()}${item.slice(1)}`)
    .join('');
  return result || 'Generated';
}

function safeCapabilityKey(value: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) throw new Error('generated_capability_key_path_invalid');
  return value;
}

function moduleImportPath(generatedSourcePath: string, targetSourcePath: string): string {
  const relativePath = posix.relative(posix.dirname(generatedSourcePath), targetSourcePath).replace(/\.(tsx?|mts|cts)$/i, '.js');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function findGeneratedControlMetadata(value: unknown): string | undefined {
  const seen = new WeakSet<object>();
  const visit = (current: unknown, path: string): string | undefined => {
    if (typeof current === 'string') return forbiddenControlString(current) ? path || current : undefined;
    if (!current || typeof current !== 'object') return undefined;
    if (seen.has(current)) return path || 'cycle';
    seen.add(current);
    try {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index += 1) {
          const forbidden = visit(current[index], `${path}[${index}]`);
          if (forbidden) return forbidden;
        }
        return undefined;
      }
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string') return path || String(key);
        const nextPath = path ? `${path}.${key}` : key;
        if (forbiddenControlKey(key)) return nextPath;
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return nextPath;
        const forbidden = visit(descriptor.value, nextPath);
        if (forbidden) return forbidden;
      }
      return undefined;
    } finally {
      seen.delete(current);
    }
  };
  return visit(value, '');
}

function forbiddenControlKey(value: string): boolean {
  const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return [
    ...FORBIDDEN_CAPABILITY_IDENTITY_ARG_KEYS,
    'controller',
    'path',
    'http',
    'url',
    'sourcepath',
    'classname',
    'methodname',
  ].some((token) => normalized === token || normalized.endsWith(token));
}

function forbiddenControlString(value: string): boolean {
  const trimmed = value.trim();
  const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/https?:\/\//i.test(value) || /^file:\/\//i.test(trimmed) || /(^|[\s:=?&])\/?api\//i.test(value)) {
    return true;
  }
  if (
    /^[a-z]:[\\/]/i.test(trimmed) ||
    /^\\\\/.test(trimmed) ||
    /^\//.test(trimmed) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(trimmed) ||
    /^[^\s]+[\\/][^\s]+$/.test(trimmed)
  ) {
    return true;
  }
  if (
    ['storeid', 'userid', 'permissions', 'roles', 'controller', 'sourcepath', 'classname', 'methodname'].some(
      (token) => normalized.includes(token),
    )
  ) {
    return true;
  }
  return /(^|[\s_./:=?&-])(path|http|https|url)([\s_./:=?&-]|$)/i.test(value);
}

function sha256(value: unknown): string {
  const source = typeof value === 'string' ? value : canonicalizeBusinessDefinition(value);
  return createHash('sha256').update(source).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
