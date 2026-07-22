import type { BrainDomainAnswer } from '../domain/brain-domain-adapter.types.js';

export type BrainResponseBlock =
  | { kind: 'text'; text: string; citationIds?: string[] }
  | { kind: 'kpi'; items: Array<{ label: string; value: string; hint?: string }>; citationIds?: string[] }
  | { kind: 'ranking'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | { kind: 'table'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | {
      kind: 'chart';
      chartType: 'bar' | 'line';
      rows: Array<Record<string, unknown>>;
      xKey: string;
      yKeys: string[];
      citationIds?: string[];
    }
  | {
      kind: 'comparison';
      items: Array<{ label: string; current: string; previous: string; delta?: string }>;
      citationIds?: string[];
    }
  | {
      kind: 'diagnosis';
      findings: Array<{ title: string; detail: string; severity: 'info' | 'warning' | 'critical' }>;
      citationIds?: string[];
    }
  | { kind: 'clarification'; question: string; options: Array<{ id: string; label: string; value: unknown }> }
  | { kind: 'follow_up_questions'; questions: Array<{ id: string; label: string; value: string }> }
  | { kind: 'action_preview'; actions: unknown[] }
  | { kind: 'limitations'; items: string[] }
  | { kind: 'evidence'; citations: BrainDomainAnswer['citations'] };

export interface BrainResponseEnvelope {
  answer: string;
  blocks: BrainResponseBlock[];
  citations: BrainDomainAnswer['citations'];
  suggestedActions: unknown[];
  completion: { status: 'complete' | 'incomplete' | 'rejected'; missingCriteria: string[] };
}
