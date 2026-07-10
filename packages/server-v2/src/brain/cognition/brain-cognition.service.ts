import { Injectable } from '@nestjs/common';
import { EntityLinkerService, type BrainEntityCandidate } from './entity-linker.service.js';
import { IntentClassifierService, type BrainIntentClassification } from './intent-classifier.service.js';
import { TermNormalizerService, type BrainNormalizedTerm } from './term-normalizer.service.js';

export interface BrainCognitionInput {
  message: string;
  entityCandidates?: BrainEntityCandidate[];
}

export interface BrainCognitionResult {
  normalizedText: string;
  terms: BrainNormalizedTerm[];
  metrics: string[];
  dimensions: string[];
  entities: Array<{ slot: string; entityKey: string; label: string }>;
  unsupportedTerms: string[];
  intent: BrainIntentClassification;
  needsClarification: boolean;
  clarification?: {
    question: string;
    options: Array<{ id: string; label: string; value: { slot: string; candidate: string } }>;
  };
}

@Injectable()
export class BrainCognitionService {
  constructor(
    private readonly termNormalizer: TermNormalizerService,
    private readonly entityLinker: EntityLinkerService,
    private readonly intentClassifier: IntentClassifierService,
  ) {}

  understand(input: BrainCognitionInput): BrainCognitionResult {
    const normalized = this.termNormalizer.normalize(input.message);
    const linked = this.entityLinker.link(input.message, input.entityCandidates);
    const intent = this.intentClassifier.classify({
      text: input.message,
      metricKeys: normalized.metrics,
    });

    return {
      normalizedText: normalized.normalizedText,
      terms: normalized.terms,
      metrics: normalized.metrics,
      dimensions: normalized.dimensions,
      entities: linked.entities,
      unsupportedTerms: normalized.unsupportedTerms,
      intent,
      needsClarification: linked.conflicts.length > 0,
      clarification: linked.conflicts.length > 0 ? this.buildClarification(linked.conflicts) : undefined,
    };
  }

  private buildClarification(conflicts: Array<{ slot: string; candidates: string[] }>) {
    const fragments = conflicts.map((conflict) => `${conflict.slot}: ${conflict.candidates.join(' / ')}`);

    return {
      question: `我需要先确认这些信息：${fragments.join('；')}`,
      options: conflicts.flatMap((conflict) =>
        conflict.candidates.map((candidate) => ({
          id: `${conflict.slot}:${candidate}`,
          label: candidate,
          value: { slot: conflict.slot, candidate },
        })),
      ),
    };
  }
}
