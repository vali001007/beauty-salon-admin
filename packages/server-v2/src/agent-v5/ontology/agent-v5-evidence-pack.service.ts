import { Injectable } from '@nestjs/common';
import type { AgentEvidence } from '../../agent/agent.types.js';
import type { AgentV5EvidencePack, AgentV5RouteDecision } from '../agent-v5.types.js';

@Injectable()
export class AgentV5EvidencePackService {
  build(input: {
    route: AgentV5RouteDecision;
    partial?: Partial<AgentV5EvidencePack>;
    sampleSize?: number;
    risks?: string[];
    limitations?: string[];
  }): AgentV5EvidencePack {
    return {
      sources: this.unique(input.partial?.sources ?? input.route.capabilityCandidates),
      domains: this.unique(input.partial?.domains ?? input.route.domains),
      concepts: this.unique(input.partial?.concepts ?? input.route.concepts),
      entities: input.partial?.entities ?? input.route.entities.map((item) => ({
        type: item.type,
        id: item.id,
        name: item.name,
      })),
      filters: this.unique(input.partial?.filters ?? []),
      sampleSize: Number(input.partial?.sampleSize ?? input.sampleSize ?? 0),
      metrics: input.partial?.metrics ?? {},
      facts: input.partial?.facts ?? [],
      risks: this.unique([...(input.partial?.risks ?? []), ...(input.risks ?? [])]),
      limitations: this.unique([
        'Agent V5 独立运行，只通过 V5 adapter 复用底层服务，不递归调用旧版本 Agent。',
        '禁止自动发券、群发、改客户资产、扣库存、创建订单或改排班。',
        ...(input.partial?.limitations ?? []),
        ...(input.limitations ?? []),
      ]),
      quality: input.partial?.quality ?? {},
      memoryUsed: input.partial?.memoryUsed ?? [],
      clarification: input.partial?.clarification,
    };
  }

  toAgentEvidence(pack: AgentV5EvidencePack): AgentEvidence {
    return {
      source: pack.sources,
      sourceModels: pack.sources,
      sourceTables: pack.sources,
      metricDefinition: 'Agent V5 美业全业务 Ontology 证据包',
      filters: pack.filters,
      sampleSize: pack.sampleSize,
      limitations: pack.limitations,
      evidencePolicy: {
        domains: pack.domains,
        concepts: pack.concepts,
        entities: pack.entities,
        risks: pack.risks,
        quality: pack.quality,
        facts: pack.facts,
        memoryUsed: pack.memoryUsed,
        clarification: pack.clarification,
      },
    };
  }

  private unique(values: string[]) {
    return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
  }
}
