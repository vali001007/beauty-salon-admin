import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolResult } from './agent.types.js';

@Injectable()
export class AgentEvidenceService {
  merge(results: AgentToolResult[]): AgentEvidence | undefined {
    const evidences = results.map((result) => result.evidence).filter(Boolean) as AgentEvidence[];
    if (!evidences.length) return undefined;
    return {
      source: [...new Set(evidences.flatMap((item) => item.source ?? []))],
      sourceTables: [...new Set(evidences.flatMap((item) => item.sourceTables ?? item.source ?? []))],
      dateRange: evidences.map((item) => item.dateRange).filter(Boolean)[0],
      metricDefinition: evidences.map((item) => item.metricDefinition).filter(Boolean).join('；'),
      filters: [...new Set(evidences.flatMap((item) => item.filters ?? []))],
      sampleSize: evidences.reduce((total, item) => total + (Number(item.sampleSize) || 0), 0) || undefined,
      limitations: [...new Set(evidences.flatMap((item) => item.limitations ?? []))],
    };
  }
}
