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
    return Object.freeze({
      nodeId: input.nodeId,
      capabilityKey: input.capabilityKey,
      capabilityVersion: input.capabilityVersion,
      status,
      grounding: input.answer.grounding,
      summary: input.answer.answer,
      data: freezeJson({
        blocks: input.answer.blocks ?? [],
        metadata: input.answer.metadata ?? {},
        suggestedActions: input.answer.suggestedActions ?? [],
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
    if (answer.grounding === 'none') return 'no_data';
    const rowBlocks = (answer.blocks ?? []).filter(
      (block): block is Extract<NonNullable<BrainDomainAnswer['blocks']>[number], { kind: 'ranking' | 'table' }> =>
        block.kind === 'ranking' || block.kind === 'table',
    );
    if (rowBlocks.length && rowBlocks.every((block) => block.rows.length === 0)) return 'no_data';
    return 'completed';
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
