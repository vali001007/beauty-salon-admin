import { Injectable } from '@nestjs/common';
import { AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT } from '../knowledge-graph/generated/knowledge-graph.generated.js';
import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphNodeType } from '../knowledge-graph/knowledge-graph.types.js';
import type {
  KnowledgeGraphCapabilityHint,
  KnowledgeGraphDomainHint,
  KnowledgeGraphIntentContext,
  KnowledgeGraphObjectHint,
} from './agent-v2-intent.types.js';

@Injectable()
export class KnowledgeGraphIntentContextService {
  private readonly nodesById = new Map(AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.map((node) => [node.id, node]));
  private readonly outgoingEdges = groupEdgesByFrom(AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges);
  private readonly incomingEdges = groupEdgesByTo(AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges);
  private readonly fillerTerms = this.wordNodesByCategory('filler').map((node) => node.name);

  buildContext(question: string): KnowledgeGraphIntentContext {
    const normalizedQuestion = normalize(question);
    const cleanedQuestion = stripTerms(normalizedQuestion, this.fillerTerms);
    const synonymExpansion = this.synonymExpansion(normalizedQuestion);
    const objectHints = this.objectHints(synonymExpansion, normalizedQuestion);
    const domainHints = this.domainHints(objectHints, normalizedQuestion);
    const capabilityHints = this.capabilityHints(normalizedQuestion, objectHints, domainHints);
    const exclusions = this.exclusions(capabilityHints);
    const fieldHints = this.fieldHints(objectHints);

    return {
      question,
      normalizedQuestion,
      cleanedQuestion,
      synonymExpansion,
      objectHints,
      domainHints,
      capabilityHints,
      exclusions,
      fieldHints,
    };
  }

  private synonymExpansion(question: string) {
    return AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges
      .filter((edge) => edge.type === 'SYNONYM_OF' || edge.type === 'TRIGGERS')
      .map((edge) => {
        const word = this.nodesById.get(edge.from);
        const target = this.nodesById.get(edge.to);
        if (!word || !target) return null;
        if (!termMatchesQuestion(question, word.name)) return null;
        return {
          term: word.name,
          targetId: target.id,
          targetType: target.type,
        };
      })
      .filter((item): item is { term: string; targetId: string; targetType: KnowledgeGraphNodeType } => Boolean(item));
  }

  private objectHints(
    synonymExpansion: Array<{ term: string; targetId: string; targetType: string }>,
    question: string,
  ): KnowledgeGraphObjectHint[] {
    const scores = new Map<string, KnowledgeGraphObjectHint>();
    for (const item of synonymExpansion) {
      if (item.targetType !== 'BusinessObject') continue;
      const node = this.nodesById.get(item.targetId);
      if (!node) continue;
      const current = scores.get(node.id) ?? {
        objectId: node.id,
        objectType: node.name,
        displayName: node.displayName ?? node.name,
        matchedTerms: [],
        sourceModels: this.sourceModelsFor(node.id),
        score: 0,
      };
      current.matchedTerms.push(item.term);
      current.score += 0.32;
      scores.set(node.id, current);
    }

    for (const node of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((item) => item.type === 'BusinessObject')) {
      const displayName = normalize(node.displayName ?? node.name);
      if (!displayName || !question.includes(displayName)) continue;
      const current = scores.get(node.id) ?? {
        objectId: node.id,
        objectType: node.name,
        displayName: node.displayName ?? node.name,
        matchedTerms: [],
        sourceModels: this.sourceModelsFor(node.id),
        score: 0,
      };
      current.matchedTerms.push(node.displayName ?? node.name);
      current.score += 0.4;
      scores.set(node.id, current);
    }

    return [...scores.values()]
      .map((hint) => ({ ...hint, matchedTerms: unique(hint.matchedTerms), score: Number(Math.min(1, hint.score).toFixed(2)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }

  private domainHints(
    objectHints: KnowledgeGraphObjectHint[],
    question: string,
  ): KnowledgeGraphDomainHint[] {
    const scores = new Map<string, KnowledgeGraphDomainHint>();
    for (const object of objectHints) {
      const belongsTo = this.outgoingEdges.get(object.objectId)?.filter((edge) => edge.type === 'BELONGS_TO') ?? [];
      for (const edge of belongsTo) {
        const domain = this.nodesById.get(edge.to);
        if (!domain) continue;
        const current = scores.get(domain.name) ?? {
          domain: domain.name,
          displayName: domain.displayName ?? domain.name,
          score: 0,
          reasons: [],
        };
        current.score += object.score * 0.7;
        current.reasons.push(`object:${object.displayName}`);
        scores.set(domain.name, current);
      }
    }

    for (const domain of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((node) => node.type === 'Domain')) {
      const displayName = normalize(domain.displayName ?? domain.name);
      if (!displayName || !question.includes(displayName)) continue;
      const current = scores.get(domain.name) ?? {
        domain: domain.name,
        displayName: domain.displayName ?? domain.name,
        score: 0,
        reasons: [],
      };
      current.score += 0.32;
      current.reasons.push(`keyword:${domain.displayName ?? domain.name}`);
      scores.set(domain.name, current);
    }

    return [...scores.values()]
      .map((hint) => ({ ...hint, reasons: unique(hint.reasons), score: Number(Math.min(1, hint.score).toFixed(2)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }

  private capabilityHints(
    question: string,
    objectHints: KnowledgeGraphObjectHint[],
    domainHints: KnowledgeGraphDomainHint[],
  ): KnowledgeGraphCapabilityHint[] {
    const scores = new Map<string, KnowledgeGraphCapabilityHint>();
    const domainSet = new Set(domainHints.map((hint) => hint.domain));
    const objectModelSet = new Set(objectHints.flatMap((hint) => hint.sourceModels));

    for (const edge of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((item) => item.type === 'TRIGGERS')) {
      const word = this.nodesById.get(edge.from);
      const capability = this.nodesById.get(edge.to);
      if (!word || !capability || capability.type !== 'Capability') continue;
      if (!termMatchesQuestion(question, word.name)) continue;
      const current = this.ensureCapabilityHint(scores, capability);
      current.triggerTerms.push(word.name);
      current.score += 0.28;
    }

    for (const capability of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter((node) => node.type === 'Capability')) {
      const properties = capability.properties ?? {};
      const domain = String(properties.domain ?? '');
      if (domain && domainSet.has(domain)) {
        const current = this.ensureCapabilityHint(scores, capability);
        current.score += 0.12;
      }
      const sourceModels = this.sourceModelsFor(capability.id);
      if (sourceModels.some((model) => objectModelSet.has(model))) {
        const current = this.ensureCapabilityHint(scores, capability);
        current.score += 0.18;
      }
    }

    return [...scores.values()]
      .map((hint) => ({
        ...hint,
        triggerTerms: unique(hint.triggerTerms),
        score: Number(Math.min(1, hint.score).toFixed(2)),
      }))
      .filter((hint) => hint.score >= 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  private ensureCapabilityHint(scores: Map<string, KnowledgeGraphCapabilityHint>, capability: KnowledgeGraphNode) {
    const properties = capability.properties ?? {};
    const current = scores.get(capability.name) ?? {
      capabilityId: capability.name,
      displayName: capability.displayName ?? capability.name,
      domain: String(properties.domain ?? 'unknown'),
      outputKinds: Array.isArray(properties.outputKinds) ? properties.outputKinds.map(String) : [],
      triggerTerms: [],
      score: 0,
    };
    scores.set(capability.name, current);
    return current;
  }

  private exclusions(capabilityHints: KnowledgeGraphCapabilityHint[]) {
    const hinted = new Set(capabilityHints.map((hint) => `capability:${normalize(hint.capabilityId)}`));
    return AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges
      .filter((edge) => edge.type === 'EXCLUDES' && hinted.has(edge.from))
      .map((edge) => {
        const from = this.nodesById.get(edge.from);
        const to = this.nodesById.get(edge.to);
        if (!from || !to) return null;
        return {
          fromCapabilityId: from.name,
          toCapabilityId: to.name,
          reason: edge.label ?? 'negativeExamples',
        };
      })
      .filter((item): item is { fromCapabilityId: string; toCapabilityId: string; reason: string } => Boolean(item));
  }

  private fieldHints(objectHints: KnowledgeGraphObjectHint[]) {
    const fields: Array<{ model: string; field: string; displayName: string }> = [];
    for (const object of objectHints) {
      const sourceModels = new Set(object.sourceModels);
      for (const edge of AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((item) => item.type === 'HAS_FIELD')) {
        const model = this.nodesById.get(edge.from);
        const field = this.nodesById.get(edge.to);
        if (!model || !field || !sourceModels.has(model.name)) continue;
        fields.push({
          model: model.name,
          field: String(field.properties?.field ?? field.name.split('.').pop() ?? field.name),
          displayName: field.displayName ?? field.name,
        });
      }
    }
    return fields.slice(0, 80);
  }

  private sourceModelsFor(nodeId: string) {
    return (this.outgoingEdges.get(nodeId) ?? [])
      .filter((edge) => edge.type === 'COMPOSED_OF')
      .map((edge) => this.nodesById.get(edge.to)?.name)
      .filter((name): name is string => Boolean(name));
  }

  private wordNodesByCategory(category: string) {
    return AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.filter(
      (node) => node.type === 'Word' && String(node.properties?.category ?? '') === category,
    );
  }
}

function groupEdgesByFrom(edges: KnowledgeGraphEdge[]) {
  return edges.reduce<Map<string, KnowledgeGraphEdge[]>>((map, edge) => {
    const current = map.get(edge.from) ?? [];
    current.push(edge);
    map.set(edge.from, current);
    return map;
  }, new Map());
}

function groupEdgesByTo(edges: KnowledgeGraphEdge[]) {
  return edges.reduce<Map<string, KnowledgeGraphEdge[]>>((map, edge) => {
    const current = map.get(edge.to) ?? [];
    current.push(edge);
    map.set(edge.to, current);
    return map;
  }, new Map());
}

function normalize(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function stripTerms(text: string, terms: string[]) {
  return terms.reduce((result, term) => result.replaceAll(normalize(term), ''), text);
}

function termMatchesQuestion(question: string, term: string) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  if (question.includes(normalizedTerm)) return true;
  if (normalizedTerm.length < 5) return false;
  const termChars = [...new Set([...normalizedTerm].filter((char) => /[\u4e00-\u9fa5a-z0-9]/i.test(char)))];
  if (termChars.length < 4) return false;
  const questionChars = [...new Set([...question].filter((char) => /[\u4e00-\u9fa5a-z0-9]/i.test(char)))];
  const overlap = termChars.filter((char) => question.includes(char)).length;
  return overlap / termChars.length >= 0.9 && overlap / Math.max(questionChars.length, 1) >= 0.55;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
