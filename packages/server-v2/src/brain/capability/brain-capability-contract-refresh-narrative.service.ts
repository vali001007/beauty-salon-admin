import type {
  BrainBusinessDefinitionSnapshotEntry,
  BrainCapabilityCanonicalSemanticsSource,
  BrainCapabilityNarrative,
  BrainCapabilityNarrativeGenerator,
} from './brain-capability-codegen.service.js';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';

type ContractSemanticSource = {
  kind: 'snapshot' | 'source';
  name: unknown;
  description: unknown;
  intents: unknown;
  examples: unknown;
  negativeExamples: unknown;
  synonyms: unknown;
  riskLevel?: unknown;
};

export class BrainCapabilityContractRefreshNarrativeService
  implements BrainCapabilityNarrativeGenerator, BrainCapabilityCanonicalSemanticsSource
{
  constructor(private readonly snapshots: ReadonlyMap<string, Record<string, unknown>>) {}

  async generate(input: Parameters<BrainCapabilityNarrativeGenerator['generate']>[0]): Promise<BrainCapabilityNarrative> {
    const source = this.resolveSource(input.capability);
    const positiveExamples = strings(source.examples);
    const negativeExamples = strings(source.negativeExamples);
    if (!positiveExamples.length || !negativeExamples.length) {
      throw new Error(`capability_contract_refresh_examples_missing:${input.capability.key}`);
    }
    return {
      description: input.canonicalSemantics.description,
      positiveExamples,
      negativeExamples,
      synonyms: strings(source.synonyms),
      successSchema: structuredClone(input.canonicalSemantics.successSchema),
      riskExplanation: source.kind === 'snapshot'
        ? '仅刷新已发布业务定义与实现依赖指纹，不改变权限、写入边界或确认策略。'
        : input.capability.readOnly
          ? '候选来自显式只读后端能力合同；权限、门店范围和无写入边界均由 Scanner 验证。'
          : '候选来自显式受控动作合同；权限、门店范围、用户确认和幂等要求均由 Scanner 验证。',
    };
  }

  resolve(input: {
    capability: BrainCapabilityCandidate;
    definitions: BrainBusinessDefinitionSnapshotEntry[];
    successSchema: Record<string, unknown>;
  }) {
    const source = this.resolveSource(input.capability);
    const examples = strings(source.examples);
    const negativeExamples = strings(source.negativeExamples);
    const intents = strings(source.intents);
    if (!examples.length || !negativeExamples.length || !intents.length) {
      throw new Error(`capability_contract_refresh_semantics_missing:${input.capability.key}`);
    }
    return {
      key: input.capability.key,
      name: requiredString(source.name, 'name'),
      description: requiredString(source.description, 'description'),
      domains: unique(input.definitions.map((definition) => definition.domain)),
      intents,
      riskLevel: source.kind === 'snapshot' ? requiredRiskLevel(source.riskLevel) : input.capability.riskLevel,
      requiredPermissions: [...input.capability.requiredPermissions],
      storeScope: requiredStoreScope(input.capability.storeScope),
      examples,
      negativeExamples,
      synonyms: strings(source.synonyms),
      successSchema: structuredClone(input.successSchema),
    };
  }

  private requireSnapshot(capability: BrainCapabilityCandidate) {
    const snapshot = this.snapshots.get(capability.key);
    if (!snapshot || snapshot.generatedCapability !== true) {
      throw new Error(`capability_contract_refresh_snapshot_missing:${capability.key}`);
    }
    if (
      snapshot.readOnly !== capability.readOnly ||
      snapshot.sideEffect !== capability.sideEffect ||
      snapshot.requiresConfirmation !== capability.requiresConfirmation ||
      snapshot.idempotency !== (capability.idempotency === 'required' ? 'required' : 'not_applicable') ||
      !sameStrings(strings(snapshot.requiredPermissions), capability.requiredPermissions)
    ) {
      throw new Error(`capability_contract_refresh_safety_drift:${capability.key}`);
    }
    return snapshot;
  }

  private resolveSource(capability: BrainCapabilityCandidate): ContractSemanticSource {
    const snapshot = this.snapshots.get(capability.key);
    if (snapshot) {
      const verified = this.requireSnapshot(capability);
      return {
        kind: 'snapshot',
        name: verified.name,
        description: verified.description,
        intents: verified.intents,
        examples: verified.examples,
        negativeExamples: verified.negativeExamples,
        synonyms: verified.synonyms,
        riskLevel: verified.riskLevel,
      };
    }
    const hints = capability.semanticHints;
    const governedSafetyContract =
      (capability.readOnly === true && capability.sideEffect === false && capability.requiresConfirmation === false &&
        capability.idempotency === 'not_applicable') ||
      (capability.readOnly === false && capability.sideEffect === true && capability.requiresConfirmation === true &&
        capability.idempotency === 'required' && capability.storeScope === 'required');
    if (
      capability.explicit !== true ||
      capability.status !== 'draft' ||
      capability.issues.length > 0 ||
      !governedSafetyContract ||
      !hints ||
      !hints.name.trim() ||
      !hints.description.trim() ||
      !hints.intents.length ||
      !hints.examples.length ||
      !hints.negativeExamples.length
    ) {
      throw new Error(`capability_contract_refresh_snapshot_missing:${capability.key}`);
    }
    return { kind: 'source', ...hints };
  }
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`capability_contract_refresh_${field}_missing`);
  return value.trim();
}

function requiredRiskLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  throw new Error('capability_contract_refresh_risk_level_invalid');
}

function requiredStoreScope(value: unknown): 'required' | 'optional' | 'none' {
  if (value === 'required' || value === 'optional' || value === 'none') return value;
  throw new Error('capability_contract_refresh_store_scope_invalid');
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}
