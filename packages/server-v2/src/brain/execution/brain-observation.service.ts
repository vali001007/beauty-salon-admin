import { Injectable } from '@nestjs/common';
import type { BrainDomainAnswer } from '../domain/brain-domain-adapter.types.js';

export type BrainObservationStatus = 'completed' | 'no_data' | 'failed' | 'rejected';

export interface BrainObservation {
  nodeId: string;
  capabilityKey: string;
  capabilityVersion: number;
  status: BrainObservationStatus;
  grounding: BrainDomainAnswer['grounding'] | 'none';
  summary: string;
  data: Record<string, unknown>;
  citations: ReadonlyArray<BrainDomainAnswer['citations'][number]>;
  errorCode?: string;
  startedAt: string;
  completedAt: string;
}

@Injectable()
export class BrainObservationService {
  fromAnswer(input: {
    nodeId: string;
    capabilityKey: string;
    capabilityVersion: number;
    answer: BrainDomainAnswer;
    startedAt: Date;
    completedAt?: Date;
  }): BrainObservation {
    const status = this.answerStatus(input.answer);
    const metadata = input.answer.metadata ?? {};
    return Object.freeze({
      nodeId: input.nodeId,
      capabilityKey: input.capabilityKey,
      capabilityVersion: input.capabilityVersion,
      status,
      grounding: input.answer.grounding,
      summary: input.answer.answer,
      data: freezeJson({
        blocks: input.answer.blocks ?? [],
        metadata,
        suggestedActions: input.answer.suggestedActions ?? [],
        ...this.mappingOutputs(metadata),
      }),
      citations: freezeJson(input.answer.citations),
      startedAt: input.startedAt.toISOString(),
      completedAt: (input.completedAt ?? new Date()).toISOString(),
    });
  }

  fromError(input: {
    nodeId: string;
    capabilityKey: string;
    capabilityVersion: number;
    status: 'failed' | 'rejected';
    errorCode: string;
    startedAt: Date;
    completedAt?: Date;
  }): BrainObservation {
    return Object.freeze({
      nodeId: input.nodeId,
      capabilityKey: input.capabilityKey,
      capabilityVersion: input.capabilityVersion,
      status: input.status,
      grounding: 'none',
      summary: input.status === 'rejected' ? '执行被安全策略拒绝。' : '执行失败。',
      data: Object.freeze({}),
      citations: Object.freeze([]),
      errorCode: input.errorCode,
      startedAt: input.startedAt.toISOString(),
      completedAt: (input.completedAt ?? new Date()).toISOString(),
    });
  }

  private answerStatus(answer: BrainDomainAnswer): BrainObservationStatus {
    if (answer.status === 'failed') return 'failed';
    if ((answer.blocks ?? []).some((block) => block.kind === 'clarification')) return 'completed';
    if (answer.grounding === 'none') return 'no_data';
    const rowBlocks = (answer.blocks ?? []).filter(
      (block): block is Extract<NonNullable<BrainDomainAnswer['blocks']>[number], { kind: 'ranking' | 'table' }> =>
        block.kind === 'ranking' || block.kind === 'table',
    );
    if (rowBlocks.length && rowBlocks.every((block) => block.rows.length === 0)) return 'no_data';
    return 'completed';
  }

  private mappingOutputs(metadata: Record<string, unknown>): Record<string, unknown> {
    const value = metadata.mappingOutputs;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const outputs = { ...(value as Record<string, unknown>) };
    for (const [key, mappedValue] of Object.entries(value as Record<string, unknown>)) {
      const snakeCase = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (snakeCase !== key && outputs[snakeCase] === undefined) outputs[snakeCase] = mappedValue;
      const camelCase = key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
      if (camelCase !== key && outputs[camelCase] === undefined) outputs[camelCase] = mappedValue;
    }
    return outputs;
  }
}

function freezeJson<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 256_000) throw new Error('brain_observation_too_large');
  return deepFreeze(JSON.parse(serialized) as T);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
