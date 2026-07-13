import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolResult } from '../../agent/agent.types.js';

@Injectable()
export class AgentV2EvidenceService {
  merge(results: AgentToolResult[]): AgentEvidence | undefined {
    const evidences = results.map((result) => result.evidence).filter(Boolean) as AgentEvidence[];
    if (!evidences.length) return undefined;
    const dataValues = results.map((result) => result.data);
    const fieldAudits = dataValues.map((data) => this.asRecord(data)?.fieldPolicyApplied).map((value) => this.asRecord(value)).filter(Boolean) as Record<string, unknown>[];
    const evidencePolicies = dataValues.map((data) => this.asRecord(data)?.evidencePolicyApplied).map((value) => this.asRecord(value)).filter(Boolean) as Record<string, unknown>[];
    const queryTraces = this.findObjectsByKeyDeep(dataValues, 'queryTrace', 20);
    const sqlSummaries = this.findObjectsByKeyDeep([dataValues, queryTraces], 'sqlSummary', 20);
    const fieldPolicy = this.mergeFieldPolicyAudits([
      ...fieldAudits,
      ...evidences.map((item) => this.asRecord(item.fieldPolicyApplied)).filter(Boolean) as Record<string, unknown>[],
    ]);

    return {
      source: this.unique(evidences.flatMap((item) => item.source ?? [])),
      sourceModels: this.unique(evidences.flatMap((item) => item.sourceModels ?? item.sourceTables ?? item.source ?? [])),
      sourceApis: this.unique(evidences.flatMap((item) => item.sourceApis ?? [])),
      sourceTables: this.unique(evidences.flatMap((item) => item.sourceTables ?? item.source ?? [])),
      timeRange: evidences.map((item) => item.timeRange ?? item.dateRange).filter(Boolean)[0],
      dateRange: evidences.map((item) => item.dateRange).filter(Boolean)[0],
      storeScope: evidences.map((item) => item.storeScope).filter(Boolean)[0],
      metricDefinition: evidences.map((item) => item.metricDefinition).filter(Boolean).join('；'),
      filters: this.unique(evidences.flatMap((item) => item.filters ?? [])),
      sampleSize: evidences.reduce((total, item) => total + (Number(item.sampleSize) || 0), 0) || undefined,
      limitations: this.unique([
        ...evidences.flatMap((item) => item.limitations ?? []),
        'V2 EvidenceService 已合并工具证据、字段策略审计、通用查询 trace 和脱敏 SQL 摘要。',
      ]),
      fieldPolicy,
      fieldPolicyApplied: fieldPolicy,
      evidencePolicy: evidencePolicies[0],
      queryTraceId: evidences.map((item) => item.queryTraceId).filter(Boolean)[0] ?? this.queryTraceIdFromTraces(queryTraces),
      queryTraces: queryTraces.length ? queryTraces : undefined,
      sqlSummaries: sqlSummaries.length ? sqlSummaries : undefined,
    };
  }

  private mergeFieldPolicyAudits(audits: Record<string, unknown>[]): AgentEvidence['fieldPolicy'] | undefined {
    if (!audits.length) return undefined;
    return {
      allowedFields: this.unique(audits.flatMap((audit) => this.stringArray(audit.allowedFields))),
      maskedFields: this.unique(audits.flatMap((audit) => this.stringArray(audit.maskedFields))),
      deniedFields: this.unique(audits.flatMap((audit) => this.stringArray(audit.deniedFields))),
      droppedFields: this.unique(audits.flatMap((audit) => this.stringArray(audit.droppedFields))),
    };
  }

  private findObjectsByKeyDeep(values: unknown[], key: string, limit: number) {
    const results: Record<string, unknown>[] = [];
    for (const value of values) {
      this.collectObjectsByKeyDeep(value, key, results, limit);
      if (results.length >= limit) break;
    }
    return results;
  }

  private collectObjectsByKeyDeep(value: unknown, key: string, results: Record<string, unknown>[], limit: number) {
    if (results.length >= limit || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) this.collectObjectsByKeyDeep(item, key, results, limit);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const nested = this.asRecord(record[key]);
    if (nested) results.push(nested);
    for (const nestedValue of Object.values(record)) {
      this.collectObjectsByKeyDeep(nestedValue, key, results, limit);
      if (results.length >= limit) break;
    }
  }

  private unique(values: unknown[]) {
    return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.map((item) => String(item ?? '')).filter(Boolean) : [];
  }

  private queryTraceIdFromTraces(traces: Record<string, unknown>[]) {
    const trace = traces[0];
    if (!trace) return undefined;
    const explicitTraceId = trace.traceId ?? trace.queryTraceId;
    if (typeof explicitTraceId === 'string' && explicitTraceId.trim()) return explicitTraceId;
    const queryKey = typeof trace.queryKey === 'string' ? trace.queryKey : '';
    const sourceModel = typeof trace.sourceModel === 'string' ? trace.sourceModel : '';
    const kind = typeof trace.kind === 'string' ? trace.kind : '';
    const parts = ['generic_query_engine', queryKey, sourceModel, kind].filter(Boolean);
    return parts.length > 1 ? parts.join(':') : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }
}
