import { Injectable } from '@nestjs/common';
import { BrainMemoryRepository } from './brain-memory.repository.js';

interface ClarificationConflict {
  slot: string;
  candidates: string[];
}

@Injectable()
export class BrainMemoryService {
  constructor(private readonly repository: BrainMemoryRepository) {}

  extractMemoryCandidates(text: string) {
    const candidates: Array<{
      type: 'procedural' | 'episodic' | 'semantic';
      subjectKey: string;
      content: Record<string, unknown>;
      confidence: number;
    }> = [];

    if (text.includes('先看毛利再看流水')) {
      candidates.push({
        type: 'procedural',
        subjectKey: 'store.preference.metric_order',
        content: { preference: '先看毛利再看流水' },
        confidence: 0.8,
      });
    }

    return candidates;
  }

  buildClarification(conflicts: ClarificationConflict[]) {
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
