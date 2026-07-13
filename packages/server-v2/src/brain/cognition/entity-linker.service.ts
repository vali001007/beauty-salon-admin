import { Injectable } from '@nestjs/common';

export interface BrainEntityCandidate {
  slot: string;
  entityKey: string;
  label: string;
  aliases: string[];
}

export interface BrainResolvedEntity {
  slot: string;
  entityKey: string;
  label: string;
}

export interface BrainEntityConflict {
  slot: string;
  candidates: string[];
}

export interface BrainEntityLinkResult {
  entities: BrainResolvedEntity[];
  conflicts: BrainEntityConflict[];
}

@Injectable()
export class EntityLinkerService {
  link(text: string, candidates: BrainEntityCandidate[] = []): BrainEntityLinkResult {
    const matchedBySlot = new Map<string, BrainEntityCandidate[]>();

    for (const candidate of candidates) {
      if (!candidate.aliases.some((alias) => text.includes(alias))) {
        continue;
      }

      const existing = matchedBySlot.get(candidate.slot) ?? [];
      existing.push(candidate);
      matchedBySlot.set(candidate.slot, existing);
    }

    const entities: BrainResolvedEntity[] = [];
    const conflicts: BrainEntityConflict[] = [];

    for (const [slot, matched] of matchedBySlot.entries()) {
      if (matched.length === 1) {
        entities.push({
          slot,
          entityKey: matched[0].entityKey,
          label: matched[0].label,
        });
        continue;
      }

      conflicts.push({
        slot,
        candidates: matched.map((candidate) => candidate.label),
      });
    }

    return { entities, conflicts };
  }
}
