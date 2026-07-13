import { Injectable } from '@nestjs/common';

export interface BrainMemoryConsolidationPolicy {
  sourceSubjectKey: string;
  targetSubjectKey: string;
  minEvidence: number;
  confidence: number;
  project: (events: Array<{ subjectKey: string; content: Record<string, unknown> }>) => Record<string, unknown>;
}

const defaultPolicies: BrainMemoryConsolidationPolicy[] = [
  {
    sourceSubjectKey: 'store.traffic.weekend_full',
    targetSubjectKey: 'store.profile.weekend_peak',
    minEvidence: 3,
    confidence: 0.85,
    project: (events) => ({ value: true, evidenceCount: events.length }),
  },
  {
    sourceSubjectKey: 'customer.preference.repeated',
    targetSubjectKey: 'customer.profile.stable_preference',
    minEvidence: 3,
    confidence: 0.82,
    project: (events) => ({ evidenceCount: events.length, latest: events.at(-1)?.content ?? {} }),
  },
];

@Injectable()
export class BrainMemoryConsolidationService {
  consolidate(
    events: Array<{ subjectKey: string; content: Record<string, unknown> }>,
    policies: BrainMemoryConsolidationPolicy[] = defaultPolicies,
  ) {
    return policies.flatMap((policy) => {
      const evidence = events.filter((event) => event.subjectKey === policy.sourceSubjectKey);
      if (evidence.length < policy.minEvidence) return [];
      return [
        {
          subjectKey: policy.targetSubjectKey,
          content: policy.project(evidence),
          confidence: policy.confidence,
          evidence: evidence.map((event) => event.content),
        },
      ];
    });
  }

  summarizeEpisodicToSemantic(events: Array<{ subjectKey: string; content: Record<string, unknown> }>) {
    return this.consolidate(events).map(({ evidence: _evidence, ...memory }) => memory);
  }
}
