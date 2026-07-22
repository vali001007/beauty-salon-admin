import { Injectable } from '@nestjs/common';
import type {
  BrainDefinitionRef,
  BrainSemanticEntityReference,
  BrainSemanticIntent,
} from '../cognition/brain-semantic-intent.types.js';

export type BrainResultSetStatus = 'data' | 'empty';

export interface BrainModelResultReference {
  refId: string;
  entityType: string;
  entityKey: string;
  mention: string;
  rank: number;
  definitionRef?: BrainDefinitionRef<'entity'>;
}

export interface BrainResultReferenceScope {
  conversationId: number;
  userId: number;
  storeId: number;
}

export type BrainResultReferenceResolutionKind = 'resolved' | 'set' | 'empty' | 'ambiguous';

export interface BrainModelResultSet {
  setId: string;
  sourceRunId: number;
  sourceCapabilityKey?: string;
  sourceCapabilityVersion?: number;
  outputKey: string;
  entityType: string;
  status: BrainResultSetStatus;
  count: number;
  items: BrainModelResultReference[];
  scope?: BrainResultReferenceScope;
  createdAt: string;
}

interface MappingOutputSource {
  capabilityKey?: string;
  capabilityVersion?: number;
  mappingOutputs: Record<string, unknown>;
}

const MAX_RESULT_SETS = 12;
const MAX_RESULT_ITEMS = 50;
const RESULT_REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BrainResultReferenceService {
  buildResultSets(input: {
    runId: number;
    conversationId: number;
    userId: number;
    storeId: number;
    capabilityKey?: string;
    capabilityVersion?: number;
    intent?: BrainSemanticIntent;
    adapterMetadata?: Record<string, unknown>;
  }): BrainModelResultSet[] {
    if (!Number.isInteger(input.runId) || input.runId <= 0 || !input.adapterMetadata) return [];
    const createdAt = new Date().toISOString();
    const sources = this.mappingOutputSources(input.adapterMetadata, {
      capabilityKey: input.capabilityKey,
      capabilityVersion: input.capabilityVersion,
    });
    const resultSets: BrainModelResultSet[] = [];
    for (const source of sources) {
      for (const [outputKey, value] of Object.entries(source.mappingOutputs)) {
        if (!Array.isArray(value)) continue;
        const entityType = this.inferEntityType(outputKey, value);
        if (!entityType) continue;
        const definitionRef = this.entityDefinitionRef(input.intent, entityType);
        const items = value.slice(0, MAX_RESULT_ITEMS).flatMap((item, index) => {
          const normalized = this.normalizeItem(item, entityType);
          if (!normalized) return [];
          const refId = `run:${input.runId}:${this.safeKey(outputKey)}:${index + 1}`;
          return [
            {
              refId,
              entityType,
              entityKey: normalized.entityKey,
              mention: normalized.mention,
              rank: index + 1,
              ...(definitionRef ? { definitionRef: { ...definitionRef } } : {}),
            } satisfies BrainModelResultReference,
          ];
        });
        resultSets.push({
          setId: `run:${input.runId}:${this.safeKey(outputKey)}`,
          sourceRunId: input.runId,
          ...(source.capabilityKey ? { sourceCapabilityKey: source.capabilityKey } : {}),
          ...(source.capabilityVersion ? { sourceCapabilityVersion: source.capabilityVersion } : {}),
          outputKey,
          entityType,
          status: value.length > 0 ? 'data' : 'empty',
          count: value.length,
          items,
          scope: {
            conversationId: input.conversationId,
            userId: input.userId,
            storeId: input.storeId,
          },
          createdAt,
        });
        if (resultSets.length >= MAX_RESULT_SETS) return resultSets;
      }
    }
    return this.dedupeResultSets(resultSets);
  }

  resolveReference(input: {
    question: string;
    resultSets: readonly BrainModelResultSet[];
    scope?: BrainResultReferenceScope;
  }):
    | {
        kind: BrainResultReferenceResolutionKind;
        set: BrainModelResultSet;
        reference?: BrainModelResultReference;
      }
    | undefined {
    const active = input.resultSets
      .filter((set) => this.isFresh(set.createdAt) && (!input.scope || this.isScopedTo(set, input.scope)))
      .sort((left, right) => right.sourceRunId - left.sourceRunId);
    if (!active.length) return undefined;
    const requestedType = this.requestedEntityType(input.question);
    const candidates = requestedType
      ? active.filter((set) => this.entityTypesMatch(set.entityType, requestedType))
      : active;
    const selectedSet = candidates[0];
    if (!selectedSet) return undefined;
    if (selectedSet.status === 'empty') return { kind: 'empty', set: selectedSet };

    const ordinal = this.requestedRank(input.question);
    if (ordinal !== undefined) {
      const reference = selectedSet.items.find((item) => item.rank === ordinal);
      return reference ? { kind: 'resolved', set: selectedSet, reference } : { kind: 'ambiguous', set: selectedSet };
    }

    const mentionMatches = selectedSet.items.filter(
      (item) => item.mention.length >= 2 && input.question.includes(item.mention),
    );
    if (mentionMatches.length === 1) {
      return { kind: 'resolved', set: selectedSet, reference: mentionMatches[0] };
    }
    if (mentionMatches.length > 1) return { kind: 'ambiguous', set: selectedSet };

    if (this.requestsTopResult(input.question)) {
      const reference = selectedSet.items.find((item) => item.rank === 1);
      return reference ? { kind: 'resolved', set: selectedSet, reference } : { kind: 'ambiguous', set: selectedSet };
    }
    if (this.requestsWholeSet(input.question)) return { kind: 'set', set: selectedSet };
    if (selectedSet.items.length === 1) {
      return { kind: 'resolved', set: selectedSet, reference: selectedSet.items[0] };
    }
    if (this.usesSingularReference(input.question)) return { kind: 'ambiguous', set: selectedSet };
    return { kind: 'set', set: selectedSet };
  }

  isScopedTo(set: BrainModelResultSet, scope: BrainResultReferenceScope) {
    return Boolean(
      set.scope &&
      set.scope.conversationId === scope.conversationId &&
      set.scope.userId === scope.userId &&
      set.scope.storeId === scope.storeId,
    );
  }

  isPersistedInRunOutput(set: BrainModelResultSet, output: unknown) {
    const envelope = this.record(output);
    const metadata = this.record(envelope.adapterMetadata);
    if (!Array.isArray(metadata.resultSets)) return false;
    return metadata.resultSets
      .filter((candidate): candidate is BrainModelResultSet => isBrainModelResultSet(candidate))
      .some((candidate) => this.sameResultSet(candidate, set));
  }

  toConversationEntity(reference: BrainModelResultReference): BrainSemanticEntityReference | undefined {
    if (!reference.definitionRef) return undefined;
    return {
      entityType: reference.entityType,
      entityKey: reference.entityKey,
      mention: reference.mention,
      source: 'conversation',
      definitionRef: { ...reference.definitionRef },
      confidence: 1,
    };
  }

  isFollowUpReferenceQuestion(question: string, resultSets: readonly BrainModelResultSet[] = []) {
    return (
      /(?:第一名|排名第|最高|最好|最多|最少|她|他|她们|他们|它|它们|这些|其中|上轮|刚才|前面|消化掉|搭配什么活动)/.test(
        question,
      ) ||
      resultSets.some((set) => set.items.some((item) => item.mention.length >= 2 && question.includes(item.mention)))
    );
  }

  private mappingOutputSources(
    metadata: Record<string, unknown>,
    fallback: { capabilityKey?: string; capabilityVersion?: number },
  ): MappingOutputSource[] {
    const sources: MappingOutputSource[] = [];
    const direct = this.record(metadata.mappingOutputs);
    if (Object.keys(direct).length) sources.push({ ...fallback, mappingOutputs: direct });
    const observations = Array.isArray(metadata.observations) ? metadata.observations : [];
    for (const value of observations) {
      const observation = this.record(value);
      const data = this.record(observation.data);
      const nestedMetadata = this.record(data.metadata);
      const mappingOutputs = this.record(nestedMetadata.mappingOutputs);
      if (!Object.keys(mappingOutputs).length) continue;
      sources.push({
        capabilityKey:
          typeof observation.capabilityKey === 'string' ? observation.capabilityKey : fallback.capabilityKey,
        capabilityVersion: Number.isInteger(observation.capabilityVersion)
          ? (observation.capabilityVersion as number)
          : fallback.capabilityVersion,
        mappingOutputs,
      });
    }
    return sources;
  }

  private normalizeItem(value: unknown, entityType: string): { entityKey: string; mention: string } | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      return normalized ? { entityKey: normalized, mention: normalized } : undefined;
    }
    const item = this.record(value);
    if (!Object.keys(item).length) return undefined;
    const idKeys = [
      'entityKey',
      `${entityType}Id`,
      entityType === 'beautician' ? 'staffId' : '',
      entityType === 'beautician' ? 'beauticianId' : '',
      'id',
    ].filter(Boolean);
    const labelKeys = [
      'mention',
      'label',
      `${entityType}Name`,
      entityType === 'beautician' ? 'staff' : '',
      entityType === 'beautician' ? 'staffName' : '',
      entityType === 'beautician' ? 'beauticianName' : '',
      'name',
    ].filter(Boolean);
    const entityKey = this.firstScalar(item, idKeys);
    const mention = this.firstScalar(item, labelKeys);
    if (!entityKey || !mention) return undefined;
    return { entityKey, mention };
  }

  private inferEntityType(outputKey: string, values: unknown[]): string | undefined {
    const first = values.find((value) => value && typeof value === 'object' && !Array.isArray(value));
    const explicit = first ? this.record(first).entityType : undefined;
    if (typeof explicit === 'string' && explicit.trim()) return this.normalizeEntityType(explicit);
    const normalized = outputKey.toLowerCase();
    if (/customer|member|client/.test(normalized)) return 'customer';
    if (/staff|beautician|employee/.test(normalized)) return 'beautician';
    if (/product|batch|stock|inventory/.test(normalized)) return 'product';
    if (/project|service/.test(normalized)) return 'project';
    if (/reservation|appointment/.test(normalized)) return 'reservation';
    return undefined;
  }

  private entityDefinitionRef(
    intent: BrainSemanticIntent | undefined,
    entityType: string,
  ): BrainDefinitionRef<'entity'> | undefined {
    const entity = intent?.entities.find((candidate) => this.entityTypesMatch(candidate.entityType, entityType));
    return entity?.definitionRef ? { ...entity.definitionRef } : undefined;
  }

  private requestedEntityType(question: string): string | undefined {
    if (
      /(?:员工|美容师|业绩第一|第一名).*(?:通知|消息|鼓励)|(?:通知|消息|鼓励).*(?:员工|美容师|第一名)/.test(question)
    ) {
      return 'beautician';
    }
    if (
      /(?:临期|商品|产品|库存|它们|这些).*(?:活动|消化|处理)|(?:活动|消化|处理).*(?:临期|商品|产品|库存)/.test(question)
    ) {
      return 'product';
    }
    if (
      /(?:客户|客人|会员|她们|他们).*(?:消息|触达|召回|跟进)|(?:消息|触达|召回|跟进).*(?:客户|客人|会员|她们|他们)/.test(
        question,
      )
    ) {
      return 'customer';
    }
    return undefined;
  }

  private requestedRank(question: string): number | undefined {
    const match = question.match(/(?:第|排名第)\s*(\d+|一|二|三|四|五|六|七|八|九|十)\s*名?/);
    if (!match) return undefined;
    const chinese: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    return chinese[match[1]!] ?? Math.max(1, Number(match[1]) || 1);
  }

  private requestsTopResult(question: string) {
    return /(?:第一名|最高|最好|最多|最少|冠军|榜首)/.test(question);
  }

  private requestsWholeSet(question: string) {
    return /(?:她们|他们|它们|这些|这批|全部|所有|其中这些)/.test(question);
  }

  private usesSingularReference(question: string) {
    return /(?:给她|给他|给它|她发|他发|它做|这个|那个|该员工|该客户|该商品)/.test(question);
  }

  private entityTypesMatch(left: string, right: string) {
    return this.normalizeEntityType(left) === this.normalizeEntityType(right);
  }

  private normalizeEntityType(value: string) {
    const normalized = value.trim().toLowerCase();
    if (['staff', 'employee', 'beautician'].includes(normalized)) return 'beautician';
    if (['member', 'client', 'customer'].includes(normalized)) return 'customer';
    return normalized;
  }

  private firstScalar(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return undefined;
  }

  private isFresh(createdAt: string) {
    const created = new Date(createdAt).getTime();
    return Number.isFinite(created) && Date.now() - created <= RESULT_REFERENCE_TTL_MS;
  }

  private safeKey(value: string) {
    const normalized = value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64);
    return normalized || 'result';
  }

  private dedupeResultSets(resultSets: BrainModelResultSet[]) {
    const seen = new Set<string>();
    return resultSets.filter((set) => {
      const key = `${set.sourceRunId}:${set.sourceCapabilityKey ?? ''}:${set.outputKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sameResultSet(left: BrainModelResultSet, right: BrainModelResultSet) {
    return this.canonicalJson(left) === this.canonicalJson(right);
  }

  private canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
      .join(',')}}`;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}

export function isBrainModelResultSet(value: unknown): value is BrainModelResultSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const set = value as Record<string, unknown>;
  const allowed = new Set([
    'setId',
    'sourceRunId',
    'sourceCapabilityKey',
    'sourceCapabilityVersion',
    'outputKey',
    'entityType',
    'status',
    'count',
    'items',
    'scope',
    'createdAt',
  ]);
  if (!Reflect.ownKeys(set).every((key) => typeof key === 'string' && allowed.has(key))) return false;
  if (
    typeof set.setId !== 'string' ||
    !set.setId ||
    !Number.isInteger(set.sourceRunId) ||
    (set.sourceRunId as number) <= 0 ||
    typeof set.outputKey !== 'string' ||
    !set.outputKey ||
    typeof set.entityType !== 'string' ||
    !set.entityType ||
    !['data', 'empty'].includes(String(set.status)) ||
    !Number.isInteger(set.count) ||
    (set.count as number) < 0 ||
    !Array.isArray(set.items) ||
    set.items.length > MAX_RESULT_ITEMS ||
    typeof set.createdAt !== 'string' ||
    Number.isNaN(new Date(set.createdAt).getTime())
  ) {
    return false;
  }
  if (set.scope !== undefined && !isBrainResultReferenceScope(set.scope)) return false;
  if (
    set.sourceCapabilityKey !== undefined &&
    (typeof set.sourceCapabilityKey !== 'string' || !set.sourceCapabilityKey)
  ) {
    return false;
  }
  if (
    set.sourceCapabilityVersion !== undefined &&
    (!Number.isInteger(set.sourceCapabilityVersion) || (set.sourceCapabilityVersion as number) <= 0)
  ) {
    return false;
  }
  return set.items.every(isBrainModelResultReference);
}

function isBrainResultReferenceScope(value: unknown): value is BrainResultReferenceScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scope = value as Record<string, unknown>;
  const allowed = new Set(['conversationId', 'userId', 'storeId']);
  return Boolean(
    Reflect.ownKeys(scope).every((key) => typeof key === 'string' && allowed.has(key)) &&
    Number.isInteger(scope.conversationId) &&
    (scope.conversationId as number) > 0 &&
    Number.isInteger(scope.userId) &&
    (scope.userId as number) > 0 &&
    Number.isInteger(scope.storeId) &&
    (scope.storeId as number) > 0,
  );
}

function isBrainModelResultReference(value: unknown): value is BrainModelResultReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  const allowed = new Set(['refId', 'entityType', 'entityKey', 'mention', 'rank', 'definitionRef']);
  if (!Reflect.ownKeys(ref).every((key) => typeof key === 'string' && allowed.has(key))) return false;
  return Boolean(
    typeof ref.refId === 'string' &&
    ref.refId &&
    typeof ref.entityType === 'string' &&
    ref.entityType &&
    typeof ref.entityKey === 'string' &&
    ref.entityKey &&
    typeof ref.mention === 'string' &&
    ref.mention &&
    ref.mention.length <= 120 &&
    Number.isInteger(ref.rank) &&
    (ref.rank as number) > 0 &&
    (ref.definitionRef === undefined || isEntityDefinitionRef(ref.definitionRef)),
  );
}

function isEntityDefinitionRef(value: unknown): value is BrainDefinitionRef<'entity'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  const allowed = new Set([
    'definitionType',
    'definitionKey',
    'definitionVersion',
    'definitionFingerprint',
    'sourceFingerprint',
  ]);
  return Boolean(
    Reflect.ownKeys(ref).every((key) => typeof key === 'string' && allowed.has(key)) &&
    ref.definitionType === 'entity' &&
    typeof ref.definitionKey === 'string' &&
    ref.definitionKey &&
    Number.isInteger(ref.definitionVersion) &&
    (ref.definitionVersion as number) > 0 &&
    typeof ref.definitionFingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(ref.definitionFingerprint) &&
    typeof ref.sourceFingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(ref.sourceFingerprint),
  );
}
