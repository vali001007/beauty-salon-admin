import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphSnapshot,
} from '../src/agent-v2/knowledge-graph/knowledge-graph.types.js';

type EvalDraft = {
  id?: string;
  question?: string;
  expectedCapabilityId?: string;
  expectedIntent?: string;
  failureCategory?: string;
  priority?: string;
  confirmationNeeded?: string[];
};

type EnhancementCandidate = {
  id: string;
  type: 'synonym' | 'fk_business_meaning' | 'review_item';
  status: 'review_required';
  source: 'llm_generated';
  confidence: number;
  targetNodeId?: string;
  sourceNodeId?: string;
  relationType?: string;
  value: string;
  label: string;
  reason: string;
  sourceQuestions?: string[];
  payload: Record<string, unknown>;
};

const serverRoot = resolve(process.cwd());
const workspaceRoot = resolve(serverRoot, '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const graphPath = resolve(docsRoot, 'knowledge-graph.json');
const evalDraftsPath = resolve(docsRoot, 'agent-v2-eval-drafts.json');
const outputJsonPath = resolve(docsRoot, 'knowledge-graph-enhancement-candidates.json');
const outputReportPath = resolve(docsRoot, 'knowledge-graph-enhancement-candidates.md');

async function main() {
  const generatedAt = formatShanghaiTime(new Date());
  const snapshot = readJson<KnowledgeGraphSnapshot>(graphPath);
  const evalDrafts = readEvalDrafts(evalDraftsPath);
  const unsupportedQuestions = extractUnsupportedQuestions(evalDrafts);
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const businessObjects = snapshot.nodes.filter((node) => node.type === 'BusinessObject');
  const existingSynonymKeys = new Set(
    snapshot.edges
      .filter((edge) => edge.type === 'SYNONYM_OF')
      .map((edge) => `${edge.to}:${normalize(edge.label ?? nodeName(nodesById.get(edge.from)))}`),
  );

  const synonymCandidates = buildSynonymCandidates(unsupportedQuestions, businessObjects, existingSynonymKeys);
  const fkCandidates = buildFkBusinessMeaningCandidates(snapshot.edges, nodesById);
  const reviewItems = buildReviewItems(unsupportedQuestions, businessObjects);
  const candidates = [...synonymCandidates, ...fkCandidates, ...reviewItems];
  const output = {
    generatedAt,
    sourceFiles: {
      graph: relativePath(graphPath),
      evalDrafts: relativePath(evalDraftsPath),
    },
    mode: 'offline_review_candidates',
    safety: {
      writesActiveGraph: false,
      writesDatabase: false,
      candidateStatus: 'review_required',
      mergePath: '管理员审核后写入 AgentKnowledgeGraphOverride，下次 kg:generate 合入。',
    },
    summary: {
      businessObjectCount: businessObjects.length,
      unsupportedQuestionCount: unsupportedQuestions.length,
      synonymCandidates: synonymCandidates.length,
      fkBusinessMeaningCandidates: fkCandidates.length,
      reviewItems: reviewItems.length,
      totalCandidates: candidates.length,
    },
    candidates,
  };

  writeJson(outputJsonPath, output);
  writeText(outputReportPath, renderMarkdownReport(output));
  console.log(JSON.stringify({
    generatedAt,
    unsupportedQuestions: unsupportedQuestions.length,
    synonymCandidates: synonymCandidates.length,
    fkBusinessMeaningCandidates: fkCandidates.length,
    reviewItems: reviewItems.length,
    outputFiles: [outputJsonPath, outputReportPath].map(relativePath),
  }, null, 2));
}

function buildSynonymCandidates(
  questions: EvalDraft[],
  businessObjects: KnowledgeGraphNode[],
  existingSynonymKeys: Set<string>,
): EnhancementCandidate[] {
  const objectByName = new Map(businessObjects.map((node) => [node.name, node]));
  const hints = [
    { terms: ['客人', '到店客人', '来店客人'], objectName: 'Customer', label: '客户口语别名' },
    { terms: ['店里情况', '门店情况', '经营情况', '经营状态'], objectName: 'BusinessOverview', label: '经营概览口语别名' },
    { terms: ['在店', '还在店', '到店'], objectName: 'Reservation', label: '到店状态口语别名' },
    { terms: ['营业额', '流水', '实收', '收款'], objectName: 'FinanceMetric', label: '财务指标口语别名' },
    { terms: ['员工表现', '人效', '服务效率'], objectName: 'Beautician', label: '员工绩效口语别名' },
    { terms: ['卡包', '疗程卡', '套餐卡'], objectName: 'MemberCard', label: '次卡口语别名' },
    { terms: ['券', '优惠券', '权益'], objectName: 'MarketingActivity', label: '优惠权益口语别名' },
    { terms: ['库存风险', '快过期', '临期'], objectName: 'InventoryProduct', label: '库存风险口语别名' },
  ];
  const candidates: EnhancementCandidate[] = [];
  for (const hint of hints) {
    const target = objectByName.get(hint.objectName);
    if (!target) continue;
    const sourceQuestions = questions
      .filter((draft) => hint.terms.some((term) => String(draft.question ?? '').includes(term)))
      .map((draft) => String(draft.question))
      .slice(0, 8);
    if (!sourceQuestions.length) continue;
    for (const term of hint.terms) {
      const key = `${target.id}:${normalize(term)}`;
      if (existingSynonymKeys.has(key)) continue;
      candidates.push({
        id: `synonym:${target.id}:${normalize(term)}`,
        type: 'synonym',
        status: 'review_required',
        source: 'llm_generated',
        confidence: 0.72,
        targetNodeId: target.id,
        relationType: 'SYNONYM_OF',
        value: term,
        label: hint.label,
        reason: `从未覆盖/待确认问法中抽取到“${term}”，建议作为 ${target.displayName ?? target.name} 的人工审核同义词候选。`,
        sourceQuestions,
        payload: {
          overrideType: 'synonym',
          lowConfidenceCandidate: true,
          activeGraphImpact: 'none_until_reviewed',
          targetDisplayName: target.displayName ?? target.name,
        },
      });
    }
  }
  return uniqueById(candidates).slice(0, 80);
}

function buildFkBusinessMeaningCandidates(
  edges: KnowledgeGraphEdge[],
  nodesById: Map<string, KnowledgeGraphNode>,
): EnhancementCandidate[] {
  return edges
    .filter((edge) => edge.type === 'FK_RELATION')
    .slice(0, 120)
    .map((edge) => {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      const label = edge.label || 'relation';
      const value = `${nodeName(from)} 通过 ${label} 关联 ${nodeName(to)}`;
      return {
        id: `fk-meaning:${edge.id}`,
        type: 'fk_business_meaning',
        status: 'review_required',
        source: 'llm_generated',
        confidence: 0.68,
        sourceNodeId: edge.from,
        targetNodeId: edge.to,
        relationType: 'FK_RELATION',
        value,
        label: 'FK 业务含义候选',
        reason: '为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。',
        payload: {
          edgeId: edge.id,
          originalLabel: edge.label ?? '',
          lowConfidenceCandidate: true,
          activeGraphImpact: 'none_until_reviewed',
        },
      } satisfies EnhancementCandidate;
    });
}

function buildReviewItems(questions: EvalDraft[], businessObjects: KnowledgeGraphNode[]): EnhancementCandidate[] {
  return questions
    .filter((draft) => isCapabilityGap(draft))
    .slice(0, 80)
    .map((draft) => {
      const matchedObjects = businessObjects
        .filter((object) => questionMatchesBusinessObject(String(draft.question ?? ''), object))
        .map((object) => object.id)
        .slice(0, 5);
      return {
        id: `review:${draft.id ?? normalize(String(draft.question ?? '')).slice(0, 24)}`,
        type: 'review_item',
        status: 'review_required',
        source: 'llm_generated',
        confidence: matchedObjects.length ? 0.66 : 0.54,
        relationType: 'REVIEW_REQUIRED',
        value: String(draft.question ?? ''),
        label: '未覆盖问法治理项',
        reason: matchedObjects.length
          ? '该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。'
          : '该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。',
        sourceQuestions: [String(draft.question ?? '')],
        payload: {
          questionId: draft.id,
          priority: draft.priority,
          failureCategory: draft.failureCategory,
          expectedCapabilityId: draft.expectedCapabilityId,
          matchedObjectIds: matchedObjects,
          confirmationNeeded: draft.confirmationNeeded ?? [],
          activeGraphImpact: 'none_until_reviewed',
        },
      } satisfies EnhancementCandidate;
    });
}

function renderMarkdownReport(output: {
  generatedAt: string;
  sourceFiles: Record<string, string>;
  summary: Record<string, number>;
  safety: Record<string, unknown>;
  candidates: EnhancementCandidate[];
}) {
  const synonymCandidates = output.candidates.filter((candidate) => candidate.type === 'synonym');
  const fkCandidates = output.candidates.filter((candidate) => candidate.type === 'fk_business_meaning');
  const reviewItems = output.candidates.filter((candidate) => candidate.type === 'review_item');
  const lines = [
    '# Agent V2 知识图谱离线增强候选',
    '',
    `生成时间：${output.generatedAt}`,
    `图谱来源：${output.sourceFiles.graph}`,
    `评测草稿来源：${output.sourceFiles.evalDrafts}`,
    '',
    '## 安全边界',
    '',
    '- 只输出候选文件，不写生产库，不改 active graph。',
    '- 所有候选状态均为 `review_required`，需要管理员审核。',
    '- 低置信度候选必须写入人工覆盖表后，才会在下次 `kg:generate` 合入。',
    '',
    '## 汇总',
    '',
    ...Object.entries(output.summary).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## 同义词候选',
    '',
    ...(synonymCandidates.length ? synonymCandidates.slice(0, 40).map(formatCandidateLine) : ['- 无']),
    '',
    '## FK 业务含义候选',
    '',
    ...(fkCandidates.length ? fkCandidates.slice(0, 40).map(formatCandidateLine) : ['- 无']),
    '',
    '## 待审核治理项',
    '',
    ...(reviewItems.length ? reviewItems.slice(0, 40).map(formatCandidateLine) : ['- 无']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function extractUnsupportedQuestions(drafts: EvalDraft[]) {
  return drafts.filter((draft) => {
    const capabilityId = String(draft.expectedCapabilityId ?? '');
    const intent = String(draft.expectedIntent ?? '');
    const category = String(draft.failureCategory ?? '');
    return capabilityId.includes('unmapped') || intent.includes('needs_capability') || /缺失|未覆盖|待确认/.test(category);
  });
}

function isCapabilityGap(draft: EvalDraft) {
  const capabilityId = String(draft.expectedCapabilityId ?? '');
  const category = String(draft.failureCategory ?? '');
  return capabilityId.includes('unmapped') || /能力缺失|未覆盖/.test(category);
}

function questionMatchesBusinessObject(question: string, object: KnowledgeGraphNode) {
  const aliases = Array.isArray(object.properties?.aliases) ? object.properties.aliases.map(String) : [];
  const values = [object.displayName, object.name, ...aliases].filter(Boolean).map(String);
  return values.some((value) => value && question.includes(value));
}

function readEvalDrafts(path: string): EvalDraft[] {
  const raw = readJson<{ drafts?: EvalDraft[] }>(path);
  return Array.isArray(raw.drafts) ? raw.drafts : [];
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`Required file not found: ${relativePath(path)}. Run kg:generate first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatCandidateLine(candidate: EnhancementCandidate) {
  return `- ${candidate.value} -> ${candidate.targetNodeId ?? candidate.sourceNodeId ?? '-'}；confidence=${candidate.confidence}；${candidate.reason}`;
}

function nodeName(node?: KnowledgeGraphNode) {
  return node?.displayName ?? node?.name ?? '未知节点';
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{Script=Han}a-z0-9_.:-]+/giu, '-');
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatShanghaiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} Asia/Shanghai`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
