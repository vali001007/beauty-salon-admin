import { useCallback, useEffect, useMemo, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { useLocation, useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  DollarSign,
  ExternalLink,
  GitBranch,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createAgentKnowledgeGraphExclude,
  createAgentKnowledgeGraphSynonym,
  createAgentV2GrayRule,
  deleteAgentKnowledgeGraphExclude,
  deleteAgentKnowledgeGraphSynonym,
  deleteAgentV2GrayRule,
  debugAgentGovernanceCompare,
  debugAgentGovernanceExecute,
  getAgentCapabilityDrafts,
  getAgentCapabilityManifestVersions,
  getAgentToolQueryKeys,
  dryRunAgentV2TextToSql,
  getAgentGovernanceAutoPublishLog,
  getAgentGovernanceAutoPublishLogs,
  getAgentGovernanceCapabilityHealth,
  getAgentGovernanceCapabilityHeatMap,
  getAgentGovernanceEvalCases,
  getAgentGovernanceEvalRunHistory,
  getAgentGovernanceEvalRunFailures,
  getAgentGovernanceEvalRuns,
  getAgentGovernanceHealth,
  getAgentGovernanceRunDetail,
  getAgentGovernanceRuns,
  getAgentGovernanceRunStats,
  getAgentGovernanceUncoveredTop,
  getAgentV2TextToSqlCandidates,
  getAgentV2TextToSqlRun,
  getAgentV2TextToSqlRuns,
  getAgentV2TextToSqlSemanticViews,
  getAgentV2TextToSqlStatus,
  getAgentV2GrayRules,
  getAgentKnowledgeGraphGaps,
  getAgentKnowledgeGraphExcludes,
  getAgentKnowledgeGraphNode,
  getAgentKnowledgeGraphNodes,
  getAgentKnowledgeGraphPath,
  getAgentKnowledgeGraphSummary,
  getAgentKnowledgeGraphSynonyms,
  getAgentKnowledgeGraphVisualize,
  importLatestAgentGovernanceEvalRun,
  inspectAgentV2TextToSqlGuard,
  promoteAgentV2TextToSqlCandidate,
  promoteAgentV2TextToSqlRun,
  replayAgentGovernanceEvalRunFailure,
  runAgentGovernanceEvalDryRunBatch,
  simulateAgentGovernanceManifest,
} from '@/api';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { usePermission } from '@/hooks/usePermission';
import type {
  AgentGovernanceAutoPublishRun,
  AgentGovernanceCapabilityHealth,
  AgentGovernanceCapabilityHeatMapItem,
  AgentGovernanceDebugContext,
  AgentGovernanceDebugRequest,
  AgentGovernanceDebugResult,
  AgentGovernanceEvalCase,
  AgentGovernanceEvalFailureReplayResult,
  AgentGovernanceEvalGateReport,
  AgentGovernanceEvalRunFailure,
  AgentGovernanceEvalRunFailureList,
  AgentGovernanceEvalRunRecord,
  AgentGovernanceDebugComparison,
  AgentGovernanceHealthMetrics,
  AgentGovernanceListResult,
  AgentGovernanceGraphTrace,
  AgentGovernanceManifestSimulation,
  AgentGovernancePolicyTrace,
  AgentGovernanceQueryReplay,
  AgentGovernanceRunDetail,
  AgentGovernanceRunStats,
  AgentGovernanceUncoveredQuestion,
  AgentV2TextToSqlCandidate,
  AgentV2TextToSqlGuardInspectResult,
  AgentV2TextToSqlRun,
  AgentV2TextToSqlRunResult,
  AgentV2TextToSqlSemanticView,
  AgentV2TextToSqlStatus,
  AgentV2GrayRule,
  CreateAgentV2GrayRuleInput,
  AgentKnowledgeGraphGap,
  AgentKnowledgeGraphEdge,
  AgentKnowledgeGraphNode,
  AgentKnowledgeGraphNodeDetail,
  AgentKnowledgeGraphOverride,
  AgentKnowledgeGraphPathResult,
  AgentKnowledgeGraphSummary,
  AgentKnowledgeGraphVisualizeResult,
} from '@/types/agentGovernance';
import type {
  AgentCapabilityDraftListResult,
  AgentCapabilityManifestVersion,
  AgentToolQueryKeyItem,
} from '@/types/agentCapabilityCenter';
import type { AgentRunRecord } from '@/types/agent';

type TabKey = 'overview' | 'runs' | 'knowledge' | 'capabilities' | 'gray' | 'eval' | 'textSql' | 'debug';
type DebugMode = 'execute' | 'toolReplay' | 'compare' | 'simulate';
type DebugSimulationEnabled = 'inherit' | 'enabled' | 'disabled';
type GraphSimulationNode = AgentKnowledgeGraphNode & { x?: number; y?: number; fx?: number | null; fy?: number | null };
type GraphSimulationLink = AgentKnowledgeGraphEdge & { source: string | GraphSimulationNode; target: string | GraphSimulationNode };
type GrayRuleDraft = {
  name: string;
  mode: string;
  priority: string;
  storeIds: string;
  personaCodes: string;
  roles: string;
  entrypoints: string;
  capabilityIds: string;
  reason: string;
};

const RUN_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'waiting_approval', label: '待确认' },
  { value: 'running_tool', label: '执行中' },
  { value: 'cancelled', label: '已取消' },
];

const NODE_TYPE_OPTIONS = [
  { value: 'all', label: '全部节点' },
  { value: 'Domain', label: '业务域' },
  { value: 'BusinessObject', label: '业务对象' },
  { value: 'DataModel', label: '数据模型' },
  { value: 'Field', label: '字段' },
  { value: 'Capability', label: '能力' },
  { value: 'Word', label: '词' },
  { value: 'PermissionCode', label: '权限' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: '全部优先级' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
];

const DEBUG_GRAY_MODE_OPTIONS = [
  { value: 'legacy_regex', label: '旧正则' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'kg_llm_preferred', label: '新链路优先' },
  { value: 'kg_llm_only', label: '仅新链路' },
  { value: 'legacy_retired', label: '旧链路退役' },
];

const GRAY_RULE_STATUS_OPTIONS = [
  { value: 'active', label: '生效中' },
  { value: 'deleted', label: '已删除' },
  { value: 'all', label: '全部状态' },
];

const DEBUG_ROLE_OPTIONS = [
  { value: 'manager', label: '店长' },
  { value: 'reception', label: '前台' },
  { value: 'beautician', label: '美容师' },
];

const UNCOVERED_QUESTION_STOP_WORDS = [
  '这个月',
  '本月',
  '今天',
  '昨天',
  '最近',
  '哪些',
  '哪个',
  '帮我',
  '看一下',
  '看下',
  '有没有',
  '怎么样',
  '多少',
  '一直',
  '不来用',
  '的',
  '了',
  '吗',
  '呢',
];

const TAB_ROUTE_PATHS: Record<TabKey, string> = {
  overview: '/system/agent-governance',
  runs: '/system/agent-governance/runs',
  knowledge: '/system/agent-governance/knowledge-graph',
  capabilities: '/system/agent-governance/capabilities',
  gray: '/system/agent-governance/gray-rules',
  eval: '/system/agent-governance/eval',
  textSql: '/system/agent-governance/text-to-sql',
  debug: '/system/agent-governance/debug',
};

function getTabFromPath(pathname: string): TabKey {
  if (pathname.includes('/system/agent-governance/runs')) return 'runs';
  if (pathname.includes('/system/agent-governance/knowledge-graph')) return 'knowledge';
  if (pathname.includes('/system/agent-governance/capabilities')) return 'capabilities';
  if (pathname.includes('/system/agent-governance/auto-publish')) return 'capabilities';
  if (pathname.includes('/system/agent-governance/gray-rules')) return 'gray';
  if (pathname.includes('/system/agent-governance/eval')) return 'eval';
  if (pathname.includes('/system/agent-governance/text-to-sql')) return 'textSql';
  if (pathname.includes('/system/agent-governance/debug')) return 'debug';
  return 'overview';
}

function getRunIdFromPath(pathname: string) {
  const match = pathname.match(/\/system\/agent-governance\/runs\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatJson(value: unknown) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function maskSensitiveDisplayText(value: string) {
  return value.replace(/1[3-9]\d{9}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`);
}

function redactSensitiveInlineText(value: string) {
  return maskSensitiveDisplayText(value)
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s"'，。；;]+/gi, '[redacted-db-url]')
    .replace(/\b(?:https?:\/\/)[^\s"'，。；;]*(?:token|secret|password|key)=[^\s"'，。；;]+/gi, '[redacted-url]')
    .replace(/\b(token|secret|password|api[_-]?key)=([^\s"'，。；;]+)/gi, (_match, key: string) => `${key}=[redacted]`);
}

function isSensitiveDisplayKey(key?: string) {
  return Boolean(key && /(phone|mobile|wechat|idcard|idCard|identity|certificate|address|email|openid|unionid|password|token|secret)/i.test(key));
}

function isFieldNameListKey(key?: string) {
  return Boolean(key && /^(allowedFields|maskedFields|deniedFields|droppedFields|requiredFields|selectedFields)$/i.test(key));
}

function redactSensitiveDisplayValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (isFieldNameListKey(key) || key === 'field') return value;
    if (!isSensitiveDisplayKey(key)) return maskSensitiveDisplayText(value);
    const masked = maskSensitiveDisplayText(value);
    if (/(phone|mobile)/i.test(key ?? '')) return masked;
    return value.trim() ? '已脱敏' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return isSensitiveDisplayKey(key) ? '已脱敏' : value;
  }
  if (Array.isArray(value)) {
    if (isFieldNameListKey(key)) return value;
    return value.map((item) => redactSensitiveDisplayValue(item, key));
  }
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      redactSensitiveDisplayValue(entryValue, entryKey),
    ]),
  );
}

function formatSafeJson(value: unknown) {
  return formatJson(redactSensitiveDisplayValue(value));
}

function redactTextToSqlTrace(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^(generatedSql|safeSql|sql)$/i.test(key ?? '')) return '仅管理员可查看';
    return maskSensitiveDisplayText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => redactTextToSqlTrace(item, key));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      redactTextToSqlTrace(entryValue, entryKey),
    ]),
  );
}

function formatTextToSqlTrace(value: unknown, canShowRawSql: boolean) {
  return canShowRawSql ? formatJson(value) : formatJson(redactTextToSqlTrace(value));
}

function getTextToSqlGuardSqlDisplay(result: AgentV2TextToSqlGuardInspectResult, canShowRawSql: boolean) {
  if (canShowRawSql) return result.safeSql ?? result.redactedSql ?? '-';
  return result.redactedSql ?? (result.safeSql ? 'SQL 已隐藏，仅管理员可查看' : '-');
}

function formatPercent(value: unknown) {
  if (typeof value !== 'number') return '-';
  return `${Math.round(value * 1000) / 10}%`;
}

function formatMetric(value: unknown) {
  if (typeof value === 'number') return value <= 1 ? formatPercent(value) : String(value);
  if (value && typeof value === 'object' && 'status' in value) {
    return String((value as { status?: string }).status ?? '-');
  }
  return value === undefined || value === null ? '-' : String(value);
}

function formatMs(value: number | null | undefined) {
  if (value === undefined || value === null) return '-';
  return `${value} ms`;
}

function formatCostMetric(cost?: AgentGovernanceHealthMetrics['cost']) {
  if (!cost || cost.status === 'not_measured') return '未采样';
  if (typeof cost.estimatedUsd === 'number' && cost.estimatedUsd > 0) {
    return `$${cost.estimatedUsd.toFixed(4)}`;
  }
  if (typeof cost.totalTokens === 'number' && cost.totalTokens > 0) {
    return `${cost.totalTokens.toLocaleString('zh-CN')} tokens`;
  }
  if (typeof cost.totalChars === 'number' && cost.totalChars > 0) {
    return `${cost.totalChars.toLocaleString('zh-CN')} chars`;
  }
  return '未采样';
}

function getEvalRunSummary(run: AgentGovernanceEvalRunRecord) {
  const summary = run.resultJson?.summary;
  if (summary && typeof summary === 'object') {
    const record = summary as Record<string, unknown>;
    if (record.totalQuestions || record.p0Questions) {
      return `${String(record.p0Questions ?? '-')} P0 / ${String(record.totalQuestions ?? '-')} 题`;
    }
  }
  return run.errorMessage ?? '-';
}

function getStatusLabel(status: string) {
  return RUN_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? GRAY_RULE_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function getStatusClass(status?: string) {
  if (status === 'completed' || status === 'success' || status === 'published' || status === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'failed' || status === 'blocked' || status === 'rejected' || status === 'deleted') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (status === 'waiting_approval' || status === 'running_tool' || status === 'running' || status === 'pending') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getSeverityClass(severity?: string) {
  if (severity === 'blocker') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function splitTextList(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitNumberList(value: string) {
  return Array.from(new Set(splitTextList(value).map((item) => Number(item)).filter((item) => Number.isFinite(item))));
}

function formatList(value: Array<string | number> | undefined) {
  return value?.length ? value.map((item) => redactSensitiveInlineText(String(item))).join(', ') : '全部';
}

function getDraftStatusLabel(status: string) {
  if (status === 'draft') return '待治理';
  if (status === 'needs_changes') return '待补齐';
  if (status === 'approved') return '已审核';
  if (status === 'rejected') return '已驳回';
  if (status === 'published') return '已发布';
  return status || '-';
}

function getReleaseStrategyLabel(strategy: string) {
  if (strategy === 'auto_publish') return '自动发布';
  if (strategy === 'approval_required') return '人工审核';
  if (strategy === 'write_blocked') return '写操作拦截';
  return strategy || '-';
}

function getRiskLevelLabel(riskLevel: string) {
  if (riskLevel === 'low') return '低风险';
  if (riskLevel === 'medium') return '中风险';
  if (riskLevel === 'high') return '高风险';
  return riskLevel || '-';
}

function stringifyForDiagnosis(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getFailureDiagnosis(input: {
  status?: string | null;
  errorMessage?: string | null;
  planJson?: unknown;
  resultJson?: unknown;
  evidenceJson?: unknown;
  replay?: unknown;
}) {
  const status = String(input.status ?? '').toLowerCase();
  const text = [
    input.status,
    input.errorMessage,
    stringifyForDiagnosis(input.planJson),
    stringifyForDiagnosis(input.resultJson),
    stringifyForDiagnosis(input.evidenceJson),
    stringifyForDiagnosis(input.replay),
  ].join(' ').toLowerCase();

  if (['completed', 'success', 'passed'].includes(status) && !input.errorMessage) {
    return { label: '正常', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }
  if (/permission|unauthorized|forbidden|policy.*deny|access_denied|权限|越权|拒绝/.test(text)) {
    return { label: '权限拒绝', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (/contract|schema|render|block|output_kind|契约|渲染|结构/.test(text)) {
    return { label: '契约失败', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (/llm|model|prompt|completion|openai|anthropic|rate limit|timeout|parse_intent|模型|大模型|解析/.test(text)) {
    return { label: 'LLM 错误', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (/unsupported_capability|missing_capability|not_candidate|capability_missing|能力缺失|未命中能力|unsupported/.test(text)) {
    return { label: '能力缺失', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (/knowledge|graph|synonym|object_hint|domain_hint|kg_|图谱|同义词|实体|语义/.test(text)) {
    return { label: '图谱缺口', className: 'border-sky-200 bg-sky-50 text-sky-700' };
  }
  return { label: '待分析', className: 'border-slate-200 bg-slate-50 text-slate-700' };
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">{label}</div>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function JsonBlock({ title, value, maxHeight = 'max-h-80' }: { title: string; value: unknown; maxHeight?: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700">{title}</div>
      <pre className={`${maxHeight} overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-gray-700`}>
        {formatSafeJson(value)}
      </pre>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')).filter(Boolean) : [];
}

function getKnowledgeNodeLabel(node: AgentKnowledgeGraphNode) {
  return node.displayName ?? node.name ?? node.id;
}

function getCapabilityCenterUrl(node: AgentKnowledgeGraphNode) {
  const properties = asRecord(node.properties);
  const propertyCapabilityId = typeof properties?.capabilityId === 'string' ? properties.capabilityId : '';
  const capabilityId = propertyCapabilityId || node.name || node.id.replace(/^capability:/, '');
  return `/system/agent-capabilities?capabilityId=${encodeURIComponent(capabilityId)}`;
}

function getWordGovernanceTarget(detail: AgentKnowledgeGraphNodeDetail) {
  const relation = detail.outgoing.find((edge) => edge.type === 'SYNONYM_OF' || edge.type === 'TRIGGERS');
  if (relation?.to) return relation.to;
  return detail.relatedNodes?.find((node) => node.type !== 'Word')?.id ?? '';
}

function isIsolatedGraphNode(detail: AgentKnowledgeGraphNodeDetail) {
  return !detail.outgoing.length && !detail.incoming.length;
}

function graphGapMatchesNode(gap: AgentKnowledgeGraphGap, nodeId: string) {
  return (
    gap.targetId === nodeId ||
    gap.detail.includes(nodeId) ||
    gap.title.includes(nodeId) ||
    gap.suggestedFix.includes(nodeId)
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferUncoveredGovernanceTerm(question: string) {
  let normalized = question.replace(/[，。！？、,.?]/g, ' ');
  for (const word of UNCOVERED_QUESTION_STOP_WORDS) {
    normalized = normalized.replace(new RegExp(escapeRegExp(word), 'g'), ' ');
  }
  const tokens = normalized.match(/[\u4e00-\u9fa5A-Za-z0-9_]+/g) ?? [];
  const candidates = tokens
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  candidates.sort((a, b) => Math.min(b.length, 8) - Math.min(a.length, 8));
  return candidates[0] ?? (question.trim().slice(0, 8) || '未覆盖问法');
}

function collectObjectsByKey(value: unknown, key: string, results: Record<string, unknown>[] = [], limit = 20) {
  if (results.length >= limit || value === null || value === undefined) return results;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectsByKey(item, key, results, limit);
    return results;
  }
  if (typeof value !== 'object') return results;
  const record = value as Record<string, unknown>;
  const nested = asRecord(record[key]);
  if (nested) results.push(nested);
  for (const nestedValue of Object.values(record)) {
    collectObjectsByKey(nestedValue, key, results, limit);
    if (results.length >= limit) break;
  }
  return results;
}

function getRunEvidenceAudit(detail: AgentGovernanceRunDetail) {
  const evidence = asRecord(detail.run.evidenceJson);
  const replay = asRecord(detail.replay);
  const fieldPolicy = asRecord(evidence?.fieldPolicy);
  const queryTraces = recordArray(evidence?.queryTraces).length
    ? recordArray(evidence?.queryTraces)
    : collectObjectsByKey(replay, 'queryTrace');
  const sqlSummaries = recordArray(evidence?.sqlSummaries).length
    ? recordArray(evidence?.sqlSummaries)
    : collectObjectsByKey([evidence, replay], 'sqlSummary');
  return {
    evidence,
    fieldPolicy,
    queryTraces,
    sqlSummaries,
    limitations: stringArray(evidence?.limitations),
    sourceTables: stringArray(evidence?.sourceTables),
    filters: stringArray(evidence?.filters),
  };
}

function EvidenceAuditPanel({ detail }: { detail: AgentGovernanceRunDetail }) {
  const audit = getRunEvidenceAudit(detail);
  if (!audit.evidence && !audit.queryTraces.length && !audit.sqlSummaries.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">
        暂无结构化证据审计
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          证据审计
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-sky-200 bg-sky-50 text-sky-700">Trace {audit.queryTraces.length}</Badge>
          <Badge className="border-slate-200 bg-slate-50 text-slate-700">SQL {audit.sqlSummaries.length}</Badge>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">来源表</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{formatList(audit.sourceTables)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">样本量</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{String(audit.evidence?.sampleSize ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">过滤条件</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-800">{formatList(audit.filters)}</div>
        </div>
      </div>

      {audit.fieldPolicy ? (
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-gray-500">允许字段</div>
            <div className="mt-1 text-sm font-medium text-gray-800">{stringArray(audit.fieldPolicy.allowedFields).length}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-gray-500">脱敏字段</div>
            <div className="mt-1 text-sm font-medium text-gray-800">{formatList(stringArray(audit.fieldPolicy.maskedFields))}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-gray-500">拒绝字段</div>
            <div className="mt-1 text-sm font-medium text-gray-800">{formatList(stringArray(audit.fieldPolicy.deniedFields))}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-gray-500">丢弃字段</div>
            <div className="mt-1 text-sm font-medium text-gray-800">{formatList(stringArray(audit.fieldPolicy.droppedFields))}</div>
          </div>
        </div>
      ) : null}

      {audit.queryTraces.length ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">查询轨迹</div>
          {audit.queryTraces.slice(0, 3).map((trace, index) => (
            <div key={`${String(trace.queryKey ?? 'trace')}-${index}`} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-slate-200 bg-slate-50 text-slate-700">{String(trace.kind ?? 'query')}</Badge>
                <span className="font-mono text-xs text-gray-600">{String(trace.queryKey ?? '-')}</span>
                <span className="text-gray-500">{String(trace.sourceModel ?? '-')}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">{formatList(stringArray(trace.filters).map(maskSensitiveDisplayText))}</div>
            </div>
          ))}
        </div>
      ) : null}

      {audit.sqlSummaries.length ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">SQL 摘要</div>
          {audit.sqlSummaries.slice(0, 2).map((summary, index) => (
            <pre key={`${String(summary.model ?? 'sql')}-${index}`} className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-gray-700">
              {maskSensitiveDisplayText(String(summary.statementPreview ?? formatSafeJson(summary)))}
            </pre>
          ))}
        </div>
      ) : null}

      {audit.limitations.length ? (
        <div className="mt-4 rounded-lg border border-border p-3 text-xs text-gray-600">
          {audit.limitations.slice(0, 4).map((item) => <div key={item}>· {item}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function getRunReplayPhases(detail: AgentGovernanceRunDetail) {
  return recordArray(asRecord(detail.replay)?.phases);
}

function getRunReplayPhase(phases: Record<string, unknown>[], key: string) {
  return phases.find((phase) => phase.key === key) ?? null;
}

function getRunReplayPhaseData(phases: Record<string, unknown>[], key: string) {
  return asRecord(getRunReplayPhase(phases, key)?.data);
}

function getPhaseLabel(key: string) {
  const labels: Record<string, string> = {
    planner: 'Planner',
    kg_preprocessing: '图谱预处理',
    llm_prompt_response: 'LLM',
    manifest_mapping: 'Manifest 映射',
    policy_boundary: 'Policy',
    tool_execution: '工具执行',
    contract_and_rendering: '契约渲染',
    evidence_trace: '证据包',
    final_answer: '最终答案',
  };
  return labels[key] ?? key;
}

function durationMs(start?: unknown, end?: unknown) {
  if (!start || !end) return null;
  const startedAt = new Date(String(start)).getTime();
  const endedAt = new Date(String(end)).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
  return endedAt - startedAt;
}

function RunDetailTracePanel({ detail }: { detail: AgentGovernanceRunDetail }) {
  const phases = getRunReplayPhases(detail);
  const graphTrace = getRunReplayPhaseData(phases, 'kg_preprocessing');
  const selectedIntent = asRecord(graphTrace?.selectedIntent);
  const manifestMapping = getRunReplayPhaseData(phases, 'manifest_mapping');
  const policyTrace = getRunReplayPhaseData(phases, 'policy_boundary');
  const toolExecution = getRunReplayPhaseData(phases, 'tool_execution');
  const toolSteps = recordArray(toolExecution?.toolSteps);
  const queryTraces = recordArray(toolExecution?.queryTraces);
  const sqlSummaries = recordArray(toolExecution?.sqlSummaries);
  const contract = getRunReplayPhaseData(phases, 'contract_and_rendering');
  const runLatency = durationMs(detail.run.startedAt ?? detail.run.createdAt, detail.run.completedAt);
  const diagnosis = getFailureDiagnosis({ ...detail.run, replay: detail.replay });
  const latencyRows = [
    ...phases.map((phase) => ({
      name: getPhaseLabel(String(phase.key ?? 'phase')),
      status: String(phase.status ?? '-'),
      latencyMs: durationMs(phase.startedAt, phase.endedAt),
    })),
    ...detail.toolCalls.map((tool) => ({
      name: tool.toolName,
      status: tool.status,
      latencyMs: typeof tool.latencyMs === 'number' ? tool.latencyMs : durationMs(tool.createdAt, tool.completedAt),
    })),
  ].filter((item) => item.latencyMs !== null);

  const queryReplay = {
    requested: true,
    available: queryTraces.length > 0 || sqlSummaries.length > 0,
    queryTraces,
    sqlSummaries,
    note: '运行审计从工具执行链路中抽取 queryTrace / sqlSummary，作为本次回答的查询证据包。',
  } as AgentGovernanceQueryReplay;

  if (!phases.length && !detail.steps.length && !detail.toolCalls.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">
        暂无结构化链路回放
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Activity className="h-4 w-4 text-sky-600" />
            运行链路摘要
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={diagnosis.className}>定位 {diagnosis.label}</Badge>
            <Badge className="border-slate-200 bg-slate-50 text-slate-700">总耗时 {formatMs(runLatency)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {phases.map((phase) => (
            <Badge key={String(phase.key)} className={getStatusClass(String(phase.status ?? 'unknown'))}>
              {getPhaseLabel(String(phase.key))} · {String(phase.status ?? '-')}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Network className="h-4 w-4 text-indigo-600" />
            意图追溯
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">归一化问题</div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-800">{String(graphTrace?.normalizedQuestion ?? detail.run.userInput ?? '-')}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">对象 / 动作</div>
              <div className="mt-1 text-sm font-medium text-gray-800">{formatList(stringArray(selectedIntent?.objects))} / {String(selectedIntent?.action ?? '-')}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">领域</div>
              <div className="mt-1 text-sm font-medium text-gray-800">{String(selectedIntent?.domain ?? '-')}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">候选能力</div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-800">{formatList(stringArray(selectedIntent?.candidateCapabilities))}</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border p-3">
            <div className="text-xs text-gray-500">最终命中</div>
            <div className="mt-1 font-mono text-xs font-medium text-gray-800">{String(manifestMapping?.selectedCapabilityId ?? '-')}</div>
            <div className="mt-1 text-xs text-gray-500">{String(manifestMapping?.reason ?? manifestMapping?.displayName ?? '')}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Activity className="h-4 w-4 text-emerald-600" />
            延迟分解
          </div>
          <div className="space-y-2">
            {latencyRows.slice(0, 10).map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-800">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.status}</div>
                </div>
                <span className="whitespace-nowrap font-mono text-xs text-gray-700">{formatMs(item.latencyMs)}</span>
              </div>
            ))}
            {!latencyRows.length ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">暂无可计算延迟</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Bot className="h-4 w-4 text-sky-600" />
            工具执行链路
          </div>
          <Badge className="border-sky-200 bg-sky-50 text-sky-700">工具 {detail.toolCalls.length || toolSteps.length}</Badge>
        </div>
        <div className="space-y-2">
          {(toolSteps.length ? toolSteps : detail.toolCalls).map((tool, index) => {
            const name = String(tool.name ?? tool.toolName ?? `tool-${index + 1}`);
            const status = String(tool.status ?? '-');
            const input = tool.input ?? tool.inputJson ?? tool.argsJson;
            const output = tool.output ?? tool.outputJson ?? tool.resultJson;
            return (
              <div key={`${name}-${index}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-gray-800">{name}</span>
                  <Badge className={getStatusClass(status)}>{status}</Badge>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-gray-600">{maskSensitiveDisplayText(formatSafeJson(input ?? {}))}</pre>
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-gray-600">{maskSensitiveDisplayText(formatSafeJson(output ?? {}))}</pre>
                </div>
              </div>
            );
          })}
          {!toolSteps.length && !detail.toolCalls.length ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">本次未执行工具</div> : null}
        </div>
      </div>

      <QueryReplayPanel replay={queryReplay} title="查询证据包" />
      <PolicyDecisionPanel trace={policyTrace as AgentGovernancePolicyTrace | null} />
      <JsonBlock title="契约与渲染" value={contract ?? { status: 'missing' }} maxHeight="max-h-48" />
    </div>
  );
}

function QueryReplayPanel({ replay, title = 'Query Plan / SQL 摘要' }: { replay?: AgentGovernanceQueryReplay | null; title?: string }) {
  if (!replay?.requested) return null;
  const queryTraces = recordArray(replay.queryTraces);
  const sqlSummaries = recordArray(replay.sqlSummaries);
  const available = replay.available || queryTraces.length > 0 || sqlSummaries.length > 0;
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Database className="h-4 w-4 text-sky-600" />
          {title}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-sky-200 bg-sky-50 text-sky-700">Trace {queryTraces.length}</Badge>
          <Badge className="border-slate-200 bg-slate-50 text-slate-700">SQL {sqlSummaries.length}</Badge>
        </div>
      </div>

      {!available ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">
          {replay.note ?? replay.reason ?? '本次只读工具结果没有 queryTrace 或 sqlSummary。'}
        </div>
      ) : null}

      {queryTraces.length ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">查询轨迹</div>
          {queryTraces.slice(0, 4).map((trace, index) => (
            <div key={`${String(trace.queryKey ?? 'trace')}-${index}`} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-slate-200 bg-slate-50 text-slate-700">{String(trace.kind ?? 'query')}</Badge>
                <span className="font-mono text-xs text-gray-600">{String(trace.queryKey ?? '-')}</span>
                <span className="text-gray-500">{String(trace.sourceModel ?? trace.model ?? '-')}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">{formatList(stringArray(trace.filters).map(maskSensitiveDisplayText))}</div>
            </div>
          ))}
        </div>
      ) : null}

      {sqlSummaries.length ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">SQL 摘要</div>
          {sqlSummaries.slice(0, 3).map((summary, index) => (
            <pre key={`${String(summary.model ?? 'sql')}-${index}`} className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-gray-700">
              {maskSensitiveDisplayText(String(summary.statementPreview ?? formatSafeJson(summary)))}
            </pre>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DebugContextPanel({ context }: { context?: AgentGovernanceDebugContext | null }) {
  if (!context) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <SlidersHorizontal className="h-4 w-4 text-sky-600" />
          调试输入
        </div>
        <Badge className="border-slate-200 bg-slate-50 text-slate-700">{context.dryRun ? 'Dry-run' : 'Live'}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">门店</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{String(context.storeId ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">角色</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{context.role ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">入口</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{context.entrypoint ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">灰度模式</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{context.grayMode ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">Manifest 版本</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{context.manifestVersion ?? context.activeManifestVersion ?? '-'}</div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border p-3">
        <div className="text-xs text-gray-500">问题</div>
        <div className="mt-1 text-sm font-medium text-gray-800">{context.question}</div>
      </div>
    </div>
  );
}

function GraphPreprocessPanel({ trace }: { trace?: AgentGovernanceGraphTrace | null }) {
  if (!trace) return null;
  const counts = trace.graphContextCounts ?? {};
  const selectedIntent = trace.selectedIntent ?? {};
  const objectHints = recordArray(trace.objectHints);
  const domainHints = recordArray(trace.domainHints);
  const capabilityHints = recordArray(trace.capabilityHints);
  const exclusions = recordArray(trace.exclusions);
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Network className="h-4 w-4 text-violet-600" />
          图谱预处理
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-sky-200 bg-sky-50 text-sky-700">Object {counts.objectHints ?? objectHints.length}</Badge>
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Capability {counts.capabilityHints ?? capabilityHints.length}</Badge>
          <Badge className="border-slate-200 bg-slate-50 text-slate-700">{trace.cacheHit ? 'Cache hit' : trace.source ?? '-'}</Badge>
        </div>
      </div>

      {!trace.available ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">
          {trace.reason ?? '当前调试结果没有图谱预处理 trace。'}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">归一化问题</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{trace.normalizedQuestion ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">对象</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{formatList(selectedIntent.objects)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">领域 / 动作</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{String(selectedIntent.domain ?? '-')}/{String(selectedIntent.action ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">候选能力</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{formatList(selectedIntent.candidateCapabilities)}</div>
        </div>
      </div>

      {objectHints.length || domainHints.length || capabilityHints.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">对象提示</div>
            <div className="space-y-2">
              {objectHints.slice(0, 3).map((hint, index) => (
                <div key={`${String(hint.objectId ?? 'object')}-${index}`} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{String(hint.displayName ?? hint.objectType ?? '-')}</span>
                  <span className="ml-2 text-gray-500">{formatList(stringArray(hint.matchedTerms))}</span>
                </div>
              ))}
              {!objectHints.length ? <div className="text-xs text-gray-500">无对象提示</div> : null}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">领域提示</div>
            <div className="space-y-2">
              {domainHints.slice(0, 3).map((hint, index) => (
                <div key={`${String(hint.domain ?? 'domain')}-${index}`} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{String(hint.displayName ?? hint.domain ?? '-')}</span>
                  <span className="ml-2 text-gray-500">{formatList(stringArray(hint.reasons))}</span>
                </div>
              ))}
              {!domainHints.length ? <div className="text-xs text-gray-500">无领域提示</div> : null}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">能力提示</div>
            <div className="space-y-2">
              {capabilityHints.slice(0, 3).map((hint, index) => (
                <div key={`${String(hint.capabilityId ?? 'capability')}-${index}`} className="text-xs text-gray-600">
                  <span className="font-mono text-gray-800">{String(hint.capabilityId ?? '-')}</span>
                  <span className="ml-2 text-gray-500">{formatList(stringArray(hint.triggerTerms))}</span>
                </div>
              ))}
              {!capabilityHints.length ? <div className="text-xs text-gray-500">无能力提示</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {exclusions.length ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 text-sm font-medium text-amber-900">互斥提醒</div>
          {exclusions.slice(0, 3).map((item, index) => (
            <div key={`${String(item.fromCapabilityId ?? 'exclude')}-${index}`} className="text-xs text-amber-800">
              {String(item.fromCapabilityId ?? '-')} → {String(item.toCapabilityId ?? '-')}：{String(item.reason ?? '-')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatCountMap(value: unknown) {
  const record = asRecord(value);
  if (!record) return '-';
  const entries = Object.entries(record);
  return entries.length ? entries.map(([key, count]) => `${key}: ${String(count)}`).join(', ') : '-';
}

function getCompareFlagLabel(value?: boolean) {
  return value ? '有差异' : '一致';
}

function getCompareFlagClass(value?: boolean) {
  return value ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getSummaryText(value: unknown, key: string) {
  const record = asRecord(value);
  return record ? String(record[key] ?? '-') : '-';
}

function getSummaryOutputKinds(value: unknown) {
  const outputShape = asRecord(asRecord(value)?.outputShape);
  return stringArray(outputShape?.requiredKinds);
}

function ComparisonSummaryPanel({ comparison }: { comparison?: AgentGovernanceDebugComparison | null }) {
  if (!comparison) return null;
  const legacyVsKg = comparison.legacyVsKgLlm;
  const consistency = comparison.consistency;
  const differences = asRecord(comparison.differences) ?? {};
  const latency = asRecord(differences.latencyMs);
  const cost = asRecord(differences.costEstimate);
  const versionComparison = comparison.manifestVersionComparison;
  const verdict = comparison.verdict;
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <GitBranch className="h-4 w-4 text-sky-600" />
          对比结论
        </div>
        <Badge className={verdict?.localDryRunStable ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
          {verdict?.localDryRunStable ? '本地稳定' : '需继续观察'}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">Manifest 版本</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{comparison.manifestVersions?.active ?? 'builtin'}</div>
          <Badge className={`mt-2 ${getCompareFlagClass(comparison.manifestVersions?.changedAcrossModes)}`}>
            {getCompareFlagLabel(comparison.manifestVersions?.changedAcrossModes)}
          </Badge>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">legacy regex</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{getSummaryText(legacyVsKg?.legacy, 'selectedCapabilityId')}</div>
          <div className="mt-1 text-xs text-gray-500">{getSummaryText(legacyVsKg?.legacy, 'finalEngine')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">kg_llm</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{getSummaryText(legacyVsKg?.kgLlm, 'selectedCapabilityId')}</div>
          <div className="mt-1 text-xs text-gray-500">{getSummaryText(legacyVsKg?.kgLlm, 'finalEngine')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">5 次一致性</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{consistency?.stable ? '稳定' : '不稳定'}</div>
          <div className="mt-1 text-xs text-gray-500">{String(consistency?.iterations ?? 0)} 次 dry-run</div>
        </div>
      </div>

      {versionComparison ? (
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-gray-700">Manifest 版本对比</div>
            <Badge className={versionComparison.targetAvailable ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}>
              {versionComparison.targetAvailable ? '目标版本可用' : '目标版本不可用'}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">Active / Target</div>
              <div className="mt-1 truncate text-sm font-medium text-gray-800">{versionComparison.activeVersion ?? '-'}</div>
              <div className="mt-1 truncate text-xs text-gray-500">{versionComparison.targetVersion ?? versionComparison.requestedVersion ?? '-'}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">命中能力</div>
              <Badge className={`mt-2 ${getCompareFlagClass(versionComparison.changedCapability)}`}>{getCompareFlagLabel(versionComparison.changedCapability)}</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">输出形态</div>
              <Badge className={`mt-2 ${getCompareFlagClass(versionComparison.changedOutputShape)}`}>{getCompareFlagLabel(versionComparison.changedOutputShape)}</Badge>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">证据来源</div>
              <Badge className={`mt-2 ${getCompareFlagClass(versionComparison.changedEvidence)}`}>{getCompareFlagLabel(versionComparison.changedEvidence)}</Badge>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">Active 命中</div>
              <div className="mt-1 truncate font-mono text-xs text-gray-700">{getSummaryText(versionComparison.active, 'selectedCapabilityId')}</div>
              <div className="mt-1 text-xs text-gray-500">{formatList(getSummaryOutputKinds(versionComparison.active))}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-gray-500">Target 命中</div>
              <div className="mt-1 truncate font-mono text-xs text-gray-700">{getSummaryText(versionComparison.target, 'selectedCapabilityId')}</div>
              <div className="mt-1 text-xs text-gray-500">{formatList(getSummaryOutputKinds(versionComparison.target))}</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            新增能力 {versionComparison.addedCapabilities?.length ?? 0} 个，移除能力 {versionComparison.removedCapabilities?.length ?? 0} 个。{versionComparison.note ?? ''}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">命中能力差异</div>
          <Badge className={`mt-2 ${getCompareFlagClass(legacyVsKg?.changedCapability)}`}>{getCompareFlagLabel(legacyVsKg?.changedCapability)}</Badge>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">输出形态差异</div>
          <Badge className={`mt-2 ${getCompareFlagClass(legacyVsKg?.changedOutputShape)}`}>{getCompareFlagLabel(legacyVsKg?.changedOutputShape)}</Badge>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">证据差异</div>
          <Badge className={`mt-2 ${getCompareFlagClass(legacyVsKg?.changedEvidence)}`}>{getCompareFlagLabel(legacyVsKg?.changedEvidence)}</Badge>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">延迟 / 成本</div>
          <div className="mt-1 text-sm font-medium text-gray-800">
            {String(asRecord(latency?.byMode)?.kg_llm_only ?? '-')}ms / {String(asRecord(cost?.byMode)?.kg_llm_only ?? '-')} chars
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border p-3">
        <div className="text-xs text-gray-500">一致性采样</div>
        <div className="mt-1 text-sm text-gray-700">{formatCountMap(consistency?.capabilityCounts)}</div>
        <div className="mt-1 text-xs text-gray-500">{formatCountMap(consistency?.finalEngineCounts)}</div>
      </div>

      {verdict?.reasons?.length ? (
        <div className="mt-3 rounded-lg border border-border p-3 text-xs text-gray-600">
          {verdict.reasons.slice(0, 4).map((reason) => <div key={reason}>· {reason}</div>)}
          {verdict.productionEvidenceRequired ? <div className="mt-2 text-amber-700">{verdict.productionEvidenceRequired}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function getSimulationEffectLabel(effect?: string) {
  if (effect === 'selected_by_temporary_manifest') return '临时命中';
  if (effect === 'excluded_by_temporary_manifest') return '临时排除';
  if (effect === 'manifest_missing_executor') return '缺少执行器';
  if (effect === 'no_selection_change') return '无命中变化';
  return effect ?? '未应用';
}

function getSimulationEffectClass(effect?: string) {
  if (effect === 'selected_by_temporary_manifest') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (effect === 'excluded_by_temporary_manifest') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (effect === 'manifest_missing_executor') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function formatSimulationPatchList(value: unknown) {
  const items = stringArray(value);
  return items.length ? formatList(items) : '-';
}

function ManifestSimulationPanel({ simulation }: { simulation?: AgentGovernanceManifestSimulation | null }) {
  if (!simulation) return null;
  const patch = simulation.patch ?? {};
  const changedFields = simulation.changedFields ?? [];
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Manifest 模拟
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={getSimulationEffectClass(simulation.effect)}>{getSimulationEffectLabel(simulation.effect)}</Badge>
          <Badge className="border-sky-200 bg-sky-50 text-sky-700">{simulation.temporaryOnly ? '仅本次调试' : '可持久化'}</Badge>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">目标能力</div>
          <div className="mt-1 truncate font-mono text-xs font-medium text-gray-800">{simulation.capabilityId ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">模拟后命中</div>
          <div className="mt-1 truncate font-mono text-xs font-medium text-gray-800">{simulation.simulatedSelectedCapabilityId ?? '未命中'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">触发词命中</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{simulation.triggerMatched ? '是' : '否'}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">负例命中</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{simulation.negativeMatched ? '是' : '否'}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">临时状态</div>
          <div className="mt-1 text-sm font-medium text-gray-800">
            {typeof patch.enabled === 'boolean' ? (patch.enabled ? '启用' : '禁用') : '继承'}
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">triggerKeywords</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{formatSimulationPatchList(patch.triggerKeywords)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">negativeExamples</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{formatSimulationPatchList(patch.negativeExamples)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">outputKinds</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{formatSimulationPatchList(patch.outputKinds)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0 text-xs text-gray-600">
          <div>变更字段：{changedFields.length ? changedFields.join(', ') : '-'}</div>
          <div className="mt-1 truncate">{simulation.note ?? simulation.reason ?? '模拟只影响本次调试 session。'}</div>
        </div>
        {simulation.formalEditUrl ? (
          <a
            href={simulation.formalEditUrl}
            className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium text-gray-700 hover:bg-accent"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            跳转能力中心
          </a>
        ) : null}
      </div>
    </div>
  );
}

function getPolicyStatusLabel(status?: string) {
  if (status === 'pass') return '允许执行';
  if (status === 'review') return '需要确认';
  if (status === 'deny') return '已阻断';
  if (status === 'not_applicable') return '不适用';
  return status ?? '-';
}

function getPolicyStatusClass(status?: string) {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'deny') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function PolicyDecisionPanel({ trace }: { trace?: AgentGovernancePolicyTrace | null }) {
  if (!trace?.available) return null;
  const capability = asRecord(trace.capability);
  const tool = asRecord(trace.tool);
  const checks = Array.isArray(trace.checks) ? trace.checks : [];
  const fieldPolicy = trace.fieldPolicySummary ?? {};
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Policy 决策
        </div>
        <Badge className={getPolicyStatusClass(trace.overallStatus)}>{getPolicyStatusLabel(trace.overallStatus)}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">能力</div>
          <div className="mt-1 truncate text-sm font-medium text-gray-800">{String(capability?.capabilityId ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">发布策略</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{String(capability?.releaseStrategy ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">工具风险</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{String(tool?.riskLevel ?? capability?.riskLevel ?? '-')}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">审批</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{trace.requiresApproval ? '需要' : '不需要'}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">允许字段</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{formatList(fieldPolicy.allow)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">脱敏字段</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{formatList(fieldPolicy.mask)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-gray-500">拒绝字段</div>
          <div className="mt-1 text-sm font-medium text-gray-800">{formatList(fieldPolicy.deny)}</div>
        </div>
      </div>

      {checks.length ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">检查项</div>
          {checks.map((check) => (
            <div key={check.name} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className={getPolicyStatusClass(check.status)}>{getPolicyStatusLabel(check.status)}</Badge>
                <span className="font-mono text-xs text-gray-600">{check.name}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">{maskSensitiveDisplayText(check.reason)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-gray-500">
        {text}
      </TableCell>
    </TableRow>
  );
}

function graphColor(type: string) {
  if (type === 'Capability') return '#2563eb';
  if (type === 'DataModel') return '#059669';
  if (type === 'BusinessObject') return '#d97706';
  if (type === 'Field') return '#64748b';
  if (type === 'PermissionCode') return '#be123c';
  if (type === 'Word') return '#7c3aed';
  return '#334155';
}

function graphEdgeColor(type: string) {
  if (type === 'EXCLUDES') return '#dc2626';
  if (type === 'SYNONYM_OF' || type === 'TRIGGERS') return '#7c3aed';
  if (type === 'FK_RELATION' || type === 'COMPOSED_OF') return '#059669';
  if (type === 'REQUIRES_PERM') return '#be123c';
  return '#cbd5e1';
}

function graphEdgeDash(type: string) {
  if (type === 'SYNONYM_OF' || type === 'EXCLUDES') return '5 4';
  if (type === 'TRIGGERS') return '3 4';
  return undefined;
}

function KnowledgeGraphPreview({
  nodes,
  edges,
  focusId,
  onNodeClick,
}: {
  nodes: AgentKnowledgeGraphNode[];
  edges: AgentKnowledgeGraphEdge[];
  focusId?: string;
  onNodeClick: (node: AgentKnowledgeGraphNode) => void;
}) {
  const visibleNodes = nodes.slice(0, 140);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)).slice(0, 260);
  const centerX = 360;
  const centerY = 190;
  const positions = useMemo(() => {
    const simulationNodes: GraphSimulationNode[] = visibleNodes.map((node, index) => {
      const angle = (index / Math.max(1, visibleNodes.length)) * Math.PI * 2;
      const isFocus = node.id === focusId;
      return {
        ...node,
        x: centerX + Math.cos(angle) * 130,
        y: centerY + Math.sin(angle) * 130,
        fx: isFocus ? centerX : null,
        fy: isFocus ? centerY : null,
      };
    });
    const simulationLinks: GraphSimulationLink[] = visibleEdges.map((edge) => ({ ...edge, source: edge.from, target: edge.to }));
    const simulation = forceSimulation<GraphSimulationNode>(simulationNodes)
      .force('link', forceLink<GraphSimulationNode, GraphSimulationLink>(simulationLinks).id((node) => node.id).distance((edge) => {
        const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
        const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
        return sourceId === focusId || targetId === focusId ? 72 : 92;
      }).strength(0.32))
      .force('charge', forceManyBody<GraphSimulationNode>().strength(-170))
      .force('center', forceCenter<GraphSimulationNode>(centerX, centerY))
      .force('collide', forceCollide<GraphSimulationNode>().radius((node) => (node.id === focusId ? 34 : 24)).strength(0.8))
      .stop();
    for (let index = 0; index < 110; index += 1) simulation.tick();
    simulation.stop();
    return new Map(
      simulationNodes.map((node) => [
        node.id,
        {
          x: Math.max(36, Math.min(684, node.x ?? centerX)),
          y: Math.max(28, Math.min(352, node.y ?? centerY)),
        },
      ]),
    );
  }, [visibleNodes, visibleEdges, focusId]);

  if (!visibleNodes.length) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-gray-500">暂无可视化节点</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <svg viewBox="0 0 720 380" className="h-[300px] w-full">
        <rect width="720" height="380" fill="transparent" />
        {visibleEdges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={graphEdgeColor(edge.type)}
              strokeWidth={edge.from === focusId || edge.to === focusId ? 1.8 : 1}
              strokeDasharray={graphEdgeDash(edge.type)}
              opacity={edge.from === focusId || edge.to === focusId ? 0.78 : 0.42}
            />
          );
        })}
        {visibleNodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          const selected = node.id === focusId;
          const radius = selected ? 12 : node.type === 'Capability' ? 9 : 7;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              onClick={() => onNodeClick(node)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onNodeClick(node);
              }}
              className="cursor-pointer"
            >
              {selected ? <circle cx={point.x} cy={point.y} r={17} fill="none" stroke="#0f172a" strokeWidth={2} opacity="0.7" /> : null}
              <circle cx={point.x} cy={point.y} r={radius} fill={graphColor(node.type)} opacity="0.92" />
              <text x={point.x + 10} y={point.y + 4} className="fill-gray-700 text-[10px]">
                {(node.displayName ?? node.name).slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2 text-xs text-gray-600">
        {['COMPOSED_OF', 'FK_RELATION', 'SYNONYM_OF', 'EXCLUDES', 'REQUIRES_PERM'].map((type) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: graphEdgeColor(type) }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AgentGovernanceCenter() {
  const location = useLocation();
  const navigate = useNavigate();
  const canManageAgentGovernance = usePermission('core:agent-governance:manage');
  const [activeTab, setActiveTab] = useState<TabKey>(() => getTabFromPath(location.pathname));
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [runStats, setRunStats] = useState<AgentGovernanceRunStats | null>(null);
  const [health, setHealth] = useState<AgentGovernanceHealthMetrics | null>(null);
  const [kgSummary, setKgSummary] = useState<AgentKnowledgeGraphSummary | null>(null);
  const [capabilityHealth, setCapabilityHealth] = useState<AgentGovernanceCapabilityHealth | null>(null);
  const [evalReport, setEvalReport] = useState<AgentGovernanceEvalGateReport | null>(null);
  const [uncovered, setUncovered] = useState<AgentGovernanceUncoveredQuestion[]>([]);
  const [latestAutoRuns, setLatestAutoRuns] = useState<AgentGovernanceAutoPublishRun[]>([]);

  const [runFilters, setRunFilters] = useState({ status: 'all', keyword: '' });
  const [runPage, setRunPage] = useState(1);
  const [runs, setRuns] = useState<AgentGovernanceListResult<AgentRunRecord> | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runDetail, setRunDetail] = useState<AgentGovernanceRunDetail | null>(null);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  const [kgFilters, setKgFilters] = useState({ type: 'all', keyword: '' });
  const [kgPage, setKgPage] = useState(1);
  const [kgNodes, setKgNodes] = useState<AgentGovernanceListResult<AgentKnowledgeGraphNode> | null>(null);
  const [kgGaps, setKgGaps] = useState<AgentKnowledgeGraphGap[]>([]);
  const [localKgGaps, setLocalKgGaps] = useState<AgentKnowledgeGraphGap[]>([]);
  const [kgVisualize, setKgVisualize] = useState<AgentKnowledgeGraphVisualizeResult | null>(null);
  const [kgFocusNodeId, setKgFocusNodeId] = useState('');
  const [kgGapFocusNodeId, setKgGapFocusNodeId] = useState('');
  const [kgSynonyms, setKgSynonyms] = useState<AgentGovernanceListResult<AgentKnowledgeGraphOverride> | null>(null);
  const [kgExcludes, setKgExcludes] = useState<AgentGovernanceListResult<AgentKnowledgeGraphOverride> | null>(null);
  const [kgPathFrom, setKgPathFrom] = useState('');
  const [kgPathTo, setKgPathTo] = useState('');
  const [kgPathResult, setKgPathResult] = useState<AgentKnowledgeGraphPathResult | null>(null);
  const [kgPathLoading, setKgPathLoading] = useState(false);
  const [kgLoading, setKgLoading] = useState(false);
  const [nodeDetail, setNodeDetail] = useState<AgentKnowledgeGraphNodeDetail | null>(null);
  const [nodeDetailOpen, setNodeDetailOpen] = useState(false);
  const [kgSynonymTarget, setKgSynonymTarget] = useState('');
  const [kgSynonymValue, setKgSynonymValue] = useState('');
  const [kgSynonymReason, setKgSynonymReason] = useState('');
  const [kgExcludeFrom, setKgExcludeFrom] = useState('');
  const [kgExcludeTo, setKgExcludeTo] = useState('');
  const [kgExcludeReason, setKgExcludeReason] = useState('');
  const [kgOverrideSaving, setKgOverrideSaving] = useState<'synonym' | 'exclude' | null>(null);

  const [capabilityHeatMap, setCapabilityHeatMap] = useState<AgentGovernanceCapabilityHeatMapItem[]>([]);
  const [capabilityDrafts, setCapabilityDrafts] = useState<AgentCapabilityDraftListResult | null>(null);
  const [capabilityManifestVersions, setCapabilityManifestVersions] = useState<AgentCapabilityManifestVersion[]>([]);
  const [capabilityQueryKeys, setCapabilityQueryKeys] = useState<AgentToolQueryKeyItem[]>([]);
  const [autoPublishRuns, setAutoPublishRuns] = useState<AgentGovernanceListResult<AgentGovernanceAutoPublishRun> | null>(null);
  const [autoPublishDetail, setAutoPublishDetail] = useState<AgentGovernanceAutoPublishRun | null>(null);
  const [autoPublishDetailOpen, setAutoPublishDetailOpen] = useState(false);
  const [capabilityLoading, setCapabilityLoading] = useState(false);

  const [grayRuleFilters, setGrayRuleFilters] = useState({ status: 'active', mode: 'all' });
  const [grayRulePage, setGrayRulePage] = useState(1);
  const [grayRules, setGrayRules] = useState<AgentGovernanceListResult<AgentV2GrayRule> | null>(null);
  const [grayRulesLoading, setGrayRulesLoading] = useState(false);
  const [grayRuleSaving, setGrayRuleSaving] = useState(false);
  const [grayRuleDeletingId, setGrayRuleDeletingId] = useState<number | null>(null);
  const [grayRuleDraft, setGrayRuleDraft] = useState<GrayRuleDraft>({
    name: '',
    mode: 'kg_llm_preferred',
    priority: '100',
    storeIds: '',
    personaCodes: '',
    roles: '',
    entrypoints: 'agent_governance_debug',
    capabilityIds: '',
    reason: '',
  });

  const [evalPriority, setEvalPriority] = useState('all');
  const [evalPage, setEvalPage] = useState(1);
  const [evalCases, setEvalCases] = useState<AgentGovernanceListResult<AgentGovernanceEvalCase> | null>(null);
  const [evalRuns, setEvalRuns] = useState<AgentGovernanceListResult<AgentGovernanceEvalRunRecord> | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalImporting, setEvalImporting] = useState(false);
  const [evalBatchRunning, setEvalBatchRunning] = useState(false);
  const [evalFailureRun, setEvalFailureRun] = useState<AgentGovernanceEvalRunRecord | null>(null);
  const [evalFailures, setEvalFailures] = useState<AgentGovernanceEvalRunFailureList | null>(null);
  const [evalFailuresOpen, setEvalFailuresOpen] = useState(false);
  const [evalFailuresLoading, setEvalFailuresLoading] = useState(false);
  const [evalReplayLoadingKey, setEvalReplayLoadingKey] = useState<string | null>(null);
  const [evalReplayResult, setEvalReplayResult] = useState<AgentGovernanceEvalFailureReplayResult | null>(null);

  const [textSqlRuns, setTextSqlRuns] = useState<AgentGovernanceListResult<AgentV2TextToSqlRun> | null>(null);
  const [textSqlViews, setTextSqlViews] = useState<AgentV2TextToSqlSemanticView[]>([]);
  const [textSqlCandidates, setTextSqlCandidates] = useState<AgentV2TextToSqlCandidate[]>([]);
  const [textSqlConfigStatus, setTextSqlConfigStatus] = useState<AgentV2TextToSqlStatus | null>(null);
  const [textSqlStatus, setTextSqlStatus] = useState('all');
  const [textSqlPage, setTextSqlPage] = useState(1);
  const [textSqlLoading, setTextSqlLoading] = useState(false);
  const [textSqlPromotingKey, setTextSqlPromotingKey] = useState<string | null>(null);
  const [textSqlRunDetail, setTextSqlRunDetail] = useState<AgentV2TextToSqlRun | null>(null);
  const [textSqlQuestion, setTextSqlQuestion] = useState('本月销量最好的商品');
  const [textSqlStoreId, setTextSqlStoreId] = useState('1');
  const [textSqlDryRunResult, setTextSqlDryRunResult] = useState<AgentV2TextToSqlRunResult | null>(null);
  const [textSqlDryRunning, setTextSqlDryRunning] = useState(false);
  const [textSqlInspectSql, setTextSqlInspectSql] = useState('SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10;');
  const [textSqlGuardResult, setTextSqlGuardResult] = useState<AgentV2TextToSqlGuardInspectResult | null>(null);
  const [textSqlGuardLoading, setTextSqlGuardLoading] = useState(false);

  const [debugQuestion, setDebugQuestion] = useState('哪些客户买了次卡但最近一直不来用');
  const [debugGrayMode, setDebugGrayMode] = useState('kg_llm_preferred');
  const [debugRole, setDebugRole] = useState('manager');
  const [debugStoreId, setDebugStoreId] = useState('1');
  const [debugEntrypoint, setDebugEntrypoint] = useState('agent_governance_debug');
  const [debugCompareManifestVersion, setDebugCompareManifestVersion] = useState('');
  const [debugSimulationCapabilityId, setDebugSimulationCapabilityId] = useState('card.package.inactive-customers.list');
  const [debugSimulationEnabled, setDebugSimulationEnabled] = useState<DebugSimulationEnabled>('inherit');
  const [debugSimulationTriggerKeywords, setDebugSimulationTriggerKeywords] = useState('');
  const [debugSimulationNegativeExamples, setDebugSimulationNegativeExamples] = useState('');
  const [debugSimulationOutputKinds, setDebugSimulationOutputKinds] = useState('');
  const [debugResult, setDebugResult] = useState<AgentGovernanceDebugResult | null>(null);
  const [debugLoading, setDebugLoading] = useState<DebugMode | null>(null);

  const runPageSize = 15;
  const kgPageSize = 20;
  const grayRulePageSize = 12;
  const evalPageSize = 20;
  const textSqlPageSize = 12;
  const p0Accuracy = evalReport?.metrics?.p0Accuracy;
  const textSqlBlockedSummary = useMemo(() => {
    const runs = textSqlRuns?.items ?? [];
    const blocked = runs.filter((item) => item.status === 'blocked');
    const failed = runs.filter((item) => item.status === 'failed');
    const noData = runs.filter((item) => item.status === 'no_data');
    const reasonCounts = blocked.reduce<Record<string, number>>((acc, item) => {
      const key = item.blockedReason || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reason} x${count}`);
    return {
      blockedCount: blocked.length,
      failedCount: failed.length,
      noDataCount: noData.length,
      blockedReports: textSqlCandidates.filter((item) => item.status === 'blocked_report').length,
      topReasons,
    };
  }, [textSqlCandidates, textSqlRuns?.items]);
  const fallbackCount = evalReport?.metrics?.p0FallbackCount;
  const highRiskAutoPublish = evalReport?.metrics?.highRiskAutoPublish;
  const unauthorizedEvidenceCount = evalReport?.metrics?.unauthorizedEvidenceCount;
  const sortedHeatMap = useMemo(
    () => [...capabilityHeatMap].sort((a, b) => b.count - a.count).slice(0, 12),
    [capabilityHeatMap],
  );
  const capabilityDraftStatus = capabilityDrafts?.stats.byStatus ?? {};
  const activeManifestVersion =
    capabilityHealth?.activeManifestVersion ??
    capabilityDrafts?.activeManifestVersion ??
    capabilityManifestVersions.find((version) => version.status === 'active')?.version ??
    null;
  const queryKeyDomainCount = new Set(capabilityQueryKeys.map((item) => item.domain).filter(Boolean)).size;
  const allKgGaps = useMemo(
    () => [
      ...localKgGaps,
      ...kgGaps.filter((gap) => !localKgGaps.some((localGap) => localGap.code === gap.code && localGap.targetId === gap.targetId)),
    ],
    [kgGaps, localKgGaps],
  );
  const visibleKgGaps = useMemo(
    () => (kgGapFocusNodeId ? allKgGaps.filter((gap) => graphGapMatchesNode(gap, kgGapFocusNodeId)) : allKgGaps),
    [allKgGaps, kgGapFocusNodeId],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const [stats, graph, runtimeHealth, capabilityRuntimeHealth, report, logs, uncoveredTop] = await Promise.all([
        getAgentGovernanceRunStats(),
        getAgentKnowledgeGraphSummary(),
        getAgentGovernanceHealth({ days: 7 }),
        getAgentGovernanceCapabilityHealth(),
        getAgentGovernanceEvalRuns(),
        getAgentGovernanceAutoPublishLogs({ page: 1, pageSize: 5 }),
        getAgentGovernanceUncoveredTop({ limit: 5 }),
      ]);
      setRunStats(stats);
      setKgSummary(graph);
      setHealth(runtimeHealth);
      setCapabilityHealth(capabilityRuntimeHealth);
      setEvalReport(report);
      setLatestAutoRuns(logs.items);
      setUncovered(uncoveredTop);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent 治理总览加载失败');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      setRuns(await getAgentGovernanceRuns({ ...runFilters, page: runPage, pageSize: runPageSize }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '运行审计加载失败');
    } finally {
      setRunsLoading(false);
    }
  }, [runFilters, runPage]);

  const loadKnowledge = useCallback(async () => {
    setKgLoading(true);
    try {
      const [summary, nodes, gaps, visualize, synonyms, excludes] = await Promise.all([
        getAgentKnowledgeGraphSummary(),
        getAgentKnowledgeGraphNodes({ ...kgFilters, page: kgPage, pageSize: kgPageSize }),
        getAgentKnowledgeGraphGaps(),
        getAgentKnowledgeGraphVisualize(kgFocusNodeId ? { focusId: kgFocusNodeId, depth: 2, limit: 140 } : { type: kgFilters.type, limit: 120 }),
        getAgentKnowledgeGraphSynonyms({ page: 1, pageSize: 8 }),
        getAgentKnowledgeGraphExcludes({ page: 1, pageSize: 8 }),
      ]);
      setKgSummary(summary);
      setKgNodes(nodes);
      setKgGaps(gaps);
      setKgVisualize(visualize);
      setKgSynonyms(synonyms);
      setKgExcludes(excludes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '知识图谱加载失败');
    } finally {
      setKgLoading(false);
    }
  }, [kgFilters, kgFocusNodeId, kgPage]);

  const loadCapabilities = useCallback(async () => {
    setCapabilityLoading(true);
    try {
      const [health, heatMap, logs, drafts, versions, queryKeys] = await Promise.all([
        getAgentGovernanceCapabilityHealth(),
        getAgentGovernanceCapabilityHeatMap(),
        getAgentGovernanceAutoPublishLogs({ page: 1, pageSize: 20 }),
        getAgentCapabilityDrafts({ page: 1, pageSize: 5, status: 'all', domain: 'all', riskLevel: 'all', releaseStrategy: 'all' }),
        getAgentCapabilityManifestVersions(),
        getAgentToolQueryKeys(),
      ]);
      setCapabilityHealth(health);
      setCapabilityHeatMap(heatMap);
      setAutoPublishRuns(logs);
      setCapabilityDrafts(drafts);
      setCapabilityManifestVersions(versions);
      setCapabilityQueryKeys(queryKeys);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '能力健康加载失败');
    } finally {
      setCapabilityLoading(false);
    }
  }, []);

  const loadGrayRules = useCallback(async () => {
    setGrayRulesLoading(true);
    try {
      setGrayRules(await getAgentV2GrayRules({
        page: grayRulePage,
        pageSize: grayRulePageSize,
        status: grayRuleFilters.status,
        mode: grayRuleFilters.mode,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '灰度规则加载失败');
    } finally {
      setGrayRulesLoading(false);
    }
  }, [grayRuleFilters, grayRulePage]);

  const loadEval = useCallback(async () => {
    setEvalLoading(true);
    try {
      const [report, cases, history] = await Promise.all([
        getAgentGovernanceEvalRuns(),
        getAgentGovernanceEvalCases({ priority: evalPriority, page: evalPage, pageSize: evalPageSize }),
        getAgentGovernanceEvalRunHistory({ page: 1, pageSize: 8 }),
      ]);
      setEvalReport(report);
      setEvalCases(cases);
      setEvalRuns(history);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评测数据加载失败');
    } finally {
      setEvalLoading(false);
    }
  }, [evalPage, evalPriority]);

  const loadTextSql = useCallback(async () => {
    setTextSqlLoading(true);
    try {
      const [runs, views, candidates, configStatus] = await Promise.all([
        getAgentV2TextToSqlRuns({
          page: textSqlPage,
          pageSize: textSqlPageSize,
          status: textSqlStatus === 'all' ? undefined : textSqlStatus,
        }),
        getAgentV2TextToSqlSemanticViews({ includePlanned: true, includeAdmin: true }),
        getAgentV2TextToSqlCandidates({ limit: 500, minHitCount: 1 }),
        getAgentV2TextToSqlStatus(),
      ]);
      setTextSqlRuns(runs);
      setTextSqlViews(views);
      setTextSqlCandidates(candidates);
      setTextSqlConfigStatus(configStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '受控 Text-to-SQL 加载失败');
    } finally {
      setTextSqlLoading(false);
    }
  }, [textSqlPage, textSqlPageSize, textSqlStatus]);

  const selectTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    const path = TAB_ROUTE_PATHS[tab];
    if (location.pathname !== path) navigate(path);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const tab = getTabFromPath(location.pathname);
    setActiveTab((current) => (current === tab ? current : tab));
  }, [location.pathname]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === 'runs') void loadRuns();
  }, [activeTab, loadRuns]);

  useEffect(() => {
    if (activeTab === 'knowledge') void loadKnowledge();
  }, [activeTab, loadKnowledge]);

  useEffect(() => {
    if (activeTab === 'capabilities') void loadCapabilities();
  }, [activeTab, loadCapabilities]);

  useEffect(() => {
    if (activeTab === 'gray') void loadGrayRules();
  }, [activeTab, loadGrayRules]);

  useEffect(() => {
    if (activeTab === 'eval') void loadEval();
  }, [activeTab, loadEval]);

  useEffect(() => {
    if (activeTab === 'textSql') void loadTextSql();
  }, [activeTab, loadTextSql]);

  useEffect(() => {
    const runId = getRunIdFromPath(location.pathname);
    if (!runId) return;
    if (runDetailOpen && runDetail?.run?.id === runId) return;
    if (runDetailLoading) return;
    void openRunDetail(runId);
  }, [location.pathname, runDetail?.run?.id, runDetailLoading, runDetailOpen]);

  async function openRunDetail(id: number) {
    setRunDetailOpen(true);
    setRunDetail(null);
    setRunDetailLoading(true);
    try {
      setRunDetail(await getAgentGovernanceRunDetail(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '运行详情加载失败');
      setRunDetailOpen(false);
    } finally {
      setRunDetailLoading(false);
    }
  }

  async function openTextSqlRunDetail(id: number) {
    try {
      setTextSqlRunDetail(await getAgentV2TextToSqlRun(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '受控 Text-to-SQL 详情加载失败');
    }
  }

  async function runTextSqlDryRun() {
    setTextSqlDryRunning(true);
    try {
      const storeId = Number(textSqlStoreId);
      const result = await dryRunAgentV2TextToSql({
        question: textSqlQuestion,
        storeId: Number.isFinite(storeId) ? storeId : undefined,
        mode: 'dry_run',
      });
      setTextSqlDryRunResult(result);
      toast.success(result.status === 'blocked' ? 'dry-run 已返回阻断原因' : 'dry-run 已生成查询计划');
      void loadTextSql();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '受控 Text-to-SQL dry-run 失败');
    } finally {
      setTextSqlDryRunning(false);
    }
  }

  async function inspectTextSqlGuard() {
    setTextSqlGuardLoading(true);
    try {
      const storeId = Number(textSqlStoreId);
      const result = await inspectAgentV2TextToSqlGuard({
        sql: textSqlInspectSql,
        storeId: Number.isFinite(storeId) ? storeId : undefined,
      });
      setTextSqlGuardResult(result);
      toast.success(result.status === 'pass' ? 'Guard 检查通过' : 'Guard 已阻断');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Guard 检查失败');
    } finally {
      setTextSqlGuardLoading(false);
    }
  }

  async function promoteTextSqlCandidate(candidate: AgentV2TextToSqlCandidate) {
    setTextSqlPromotingKey(candidate.clusterKey);
    try {
      const draft = await promoteAgentV2TextToSqlCandidate(candidate.clusterKey);
      const capabilityId = String(draft.capabilityId ?? candidate.suggestedCapabilityId);
      toast.success(`已沉淀到能力中心待治理：${capabilityId}`);
      void loadTextSql();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '候选能力沉淀失败');
    } finally {
      setTextSqlPromotingKey(null);
    }
  }

  async function promoteTextSqlRun(run: AgentV2TextToSqlRun) {
    const loadingKey = `run:${run.id}`;
    setTextSqlPromotingKey(loadingKey);
    try {
      const draft = await promoteAgentV2TextToSqlRun(run.id);
      const capabilityId = String(draft.capabilityId ?? `run:${run.id}`);
      toast.success(`已沉淀到能力中心待治理：${capabilityId}`);
      await openTextSqlRunDetail(run.id);
      void loadTextSql();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '审计运行沉淀失败');
    } finally {
      setTextSqlPromotingKey(null);
    }
  }

  async function openNodeDetail(id: string) {
    setKgFocusNodeId(id);
    setNodeDetailOpen(true);
    setNodeDetail(null);
    try {
      setNodeDetail(await getAgentKnowledgeGraphNode(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '节点详情加载失败');
      setNodeDetailOpen(false);
    }
  }

  function applyNodeToGovernance(nodeId: string, target: 'synonym' | 'excludeFrom' | 'excludeTo' | 'pathFrom' | 'pathTo') {
    if (target === 'synonym') setKgSynonymTarget(nodeId);
    if (target === 'excludeFrom') setKgExcludeFrom(nodeId);
    if (target === 'excludeTo') setKgExcludeTo(nodeId);
    if (target === 'pathFrom') setKgPathFrom(nodeId);
    if (target === 'pathTo') setKgPathTo(nodeId);
    toast.success('节点已填入表单');
  }

  function applyWordNodeToSynonym(detail: AgentKnowledgeGraphNodeDetail) {
    const targetNodeId = getWordGovernanceTarget(detail);
    setKgSynonymTarget(targetNodeId);
    setKgSynonymValue(getKnowledgeNodeLabel(detail.node));
    setKgSynonymReason(`从图谱 Word 节点 ${detail.node.id} 发起同义词治理`);
    toast.success(targetNodeId ? 'Word 节点已填入同义词治理' : '已填入同义词，请补充目标节点');
  }

  function createGapAlertFromNode(detail: AgentKnowledgeGraphNodeDetail) {
    const nodeId = detail.node.id;
    const gap: AgentKnowledgeGraphGap = {
      code: `isolated_node:${nodeId}`,
      severity: 'warning',
      title: '孤立节点待治理',
      detail: `${getKnowledgeNodeLabel(detail.node)} 当前没有入边或出边，需要补业务对象、模型、能力、词库或权限关系。`,
      targetId: nodeId,
      sourcePath: detail.node.sourcePath,
      suggestedFix: '补充同义词、互斥关系、模型映射或能力映射；如节点不应继续参与问数，请在图谱来源中下线。',
    };
    setLocalKgGaps((current) => (current.some((item) => item.code === gap.code && item.targetId === nodeId) ? current : [gap, ...current]));
    setKgGapFocusNodeId(nodeId);
    toast.success('已生成本地缺口告警');
  }

  function debugUncoveredQuestion(item: AgentGovernanceUncoveredQuestion) {
    setDebugQuestion(item.question);
    setDebugGrayMode('kg_llm_preferred');
    setDebugEntrypoint('agent_governance_uncovered_debug');
    selectTab('debug');
    toast.success('未覆盖问法已带入单题调试');
  }

  function governUncoveredQuestion(item: AgentGovernanceUncoveredQuestion) {
    const term = inferUncoveredGovernanceTerm(item.question);
    const targetId = `word:${term}`;
    const gap: AgentKnowledgeGraphGap = {
      code: `uncovered_question:${targetId}`,
      severity: 'warning',
      title: '未覆盖问法待治理',
      detail: `问题“${item.question}”当前进入未覆盖聚合，建议先治理“${term}”的同义词、业务对象或能力映射。`,
      targetId,
      suggestedFix: '如已有业务对象，先补同义词覆盖；如没有可用能力，进入能力中心新增或修订 capability。',
    };
    setLocalKgGaps((current) => (current.some((item) => item.code === gap.code && item.targetId === targetId) ? current : [gap, ...current]));
    setKgFilters({ type: 'all', keyword: term });
    setKgPage(1);
    setKgGapFocusNodeId(targetId);
    setKgSynonymValue(term);
    setKgSynonymTarget('');
    setKgSynonymReason(`从未覆盖问法“${item.question}”发起图谱治理`);
    selectTab('knowledge');
    toast.success('未覆盖问法已带入图谱治理');
  }

  async function runKnowledgePath() {
    if (!kgPathFrom.trim() || !kgPathTo.trim()) {
      toast.error('请输入起点和终点节点 ID');
      return;
    }
    setKgPathLoading(true);
    try {
      setKgPathResult(await getAgentKnowledgeGraphPath({ from: kgPathFrom.trim(), to: kgPathTo.trim(), maxDepth: 5 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '路径查询失败');
    } finally {
      setKgPathLoading(false);
    }
  }

  async function createKgSynonym() {
    const targetNodeId = kgSynonymTarget.trim();
    const synonym = kgSynonymValue.trim();
    if (!targetNodeId || !synonym) {
      toast.error('请输入目标节点 ID 和同义词');
      return;
    }
    setKgOverrideSaving('synonym');
    try {
      await createAgentKnowledgeGraphSynonym({ targetNodeId, synonym, reason: kgSynonymReason.trim() || undefined });
      setKgSynonymValue('');
      setKgSynonymReason('');
      toast.success('同义词覆盖已保存');
      await loadKnowledge();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '同义词覆盖保存失败');
    } finally {
      setKgOverrideSaving(null);
    }
  }

  async function createKgExclude() {
    const sourceNodeId = kgExcludeFrom.trim();
    const targetNodeId = kgExcludeTo.trim();
    if (!sourceNodeId || !targetNodeId) {
      toast.error('请输入互斥来源和目标节点 ID');
      return;
    }
    setKgOverrideSaving('exclude');
    try {
      await createAgentKnowledgeGraphExclude({ sourceNodeId, targetNodeId, reason: kgExcludeReason.trim() || undefined });
      setKgExcludeReason('');
      toast.success('互斥覆盖已保存');
      await loadKnowledge();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '互斥覆盖保存失败');
    } finally {
      setKgOverrideSaving(null);
    }
  }

  async function deleteKgOverride(type: 'synonym' | 'exclude', id: number) {
    try {
      if (type === 'synonym') {
        await deleteAgentKnowledgeGraphSynonym(id);
      } else {
        await deleteAgentKnowledgeGraphExclude(id);
      }
      toast.success('覆盖已删除');
      await loadKnowledge();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '覆盖删除失败');
    }
  }

  function updateGrayRuleDraft(field: keyof GrayRuleDraft, value: string) {
    setGrayRuleDraft((current) => ({ ...current, [field]: value }));
  }

  async function createGrayRule() {
    const name = grayRuleDraft.name.trim();
    if (!name) {
      toast.error('请输入灰度规则名称');
      return;
    }

    const priority = Number(grayRuleDraft.priority || 100);
    if (!Number.isFinite(priority)) {
      toast.error('优先级必须是数字');
      return;
    }

    const payload: CreateAgentV2GrayRuleInput = {
      name,
      mode: grayRuleDraft.mode,
      priority,
      storeIds: splitNumberList(grayRuleDraft.storeIds),
      personaCodes: splitTextList(grayRuleDraft.personaCodes),
      roles: splitTextList(grayRuleDraft.roles),
      entrypoints: splitTextList(grayRuleDraft.entrypoints),
      capabilityIds: splitTextList(grayRuleDraft.capabilityIds),
      reason: grayRuleDraft.reason.trim() || undefined,
    };

    setGrayRuleSaving(true);
    try {
      await createAgentV2GrayRule(payload);
      setGrayRuleDraft((current) => ({ ...current, name: '', storeIds: '', personaCodes: '', roles: '', capabilityIds: '', reason: '' }));
      setGrayRuleFilters({ status: 'active', mode: 'all' });
      setGrayRulePage(1);
      setGrayRules(await getAgentV2GrayRules({ page: 1, pageSize: grayRulePageSize, status: 'active', mode: 'all' }));
      toast.success('灰度规则已保存，运行时缓存已刷新');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '灰度规则保存失败');
    } finally {
      setGrayRuleSaving(false);
    }
  }

  async function deleteGrayRule(id: number) {
    setGrayRuleDeletingId(id);
    try {
      await deleteAgentV2GrayRule(id);
      toast.success('灰度规则已删除，运行时缓存已刷新');
      await loadGrayRules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '灰度规则删除失败');
    } finally {
      setGrayRuleDeletingId(null);
    }
  }

  async function openAutoPublishDetail(id: number) {
    setAutoPublishDetailOpen(true);
    setAutoPublishDetail(null);
    try {
      setAutoPublishDetail(await getAgentGovernanceAutoPublishLog(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '自动发布日志加载失败');
      setAutoPublishDetailOpen(false);
    }
  }

  async function runDebug(mode: DebugMode) {
    const question = debugQuestion.trim();
    if (!question) {
      toast.error('请输入要调试的问题');
      return;
    }
    setDebugLoading(mode);
    try {
      const parsedStoreId = Number(debugStoreId);
      const simulationTriggerKeywords = splitTextList(debugSimulationTriggerKeywords);
      const simulationNegativeExamples = splitTextList(debugSimulationNegativeExamples);
      const simulationOutputKinds = splitTextList(debugSimulationOutputKinds);
      const simulationCapabilityId = debugSimulationCapabilityId.trim();
      const compareManifestVersion = debugCompareManifestVersion.trim();
      const payload: AgentGovernanceDebugRequest = {
        question,
        grayMode: debugGrayMode,
        role: debugRole,
        ...(Number.isFinite(parsedStoreId) && parsedStoreId > 0 ? { storeId: parsedStoreId } : {}),
        entrypoint: debugEntrypoint,
        ...(mode === 'toolReplay' ? { toolReplay: true } : {}),
        ...(mode === 'compare' && compareManifestVersion ? { compareManifestVersion } : {}),
        ...(mode === 'simulate' && simulationCapabilityId ? { capabilityId: simulationCapabilityId } : {}),
        ...(mode === 'simulate' && debugSimulationEnabled !== 'inherit' ? { enabled: debugSimulationEnabled === 'enabled' } : {}),
        ...(mode === 'simulate' && simulationTriggerKeywords.length ? { triggerKeywords: simulationTriggerKeywords } : {}),
        ...(mode === 'simulate' && simulationNegativeExamples.length ? { negativeExamples: simulationNegativeExamples } : {}),
        ...(mode === 'simulate' && simulationOutputKinds.length ? { outputKinds: simulationOutputKinds } : {}),
      };
      const result =
        mode === 'compare'
          ? await debugAgentGovernanceCompare(payload)
          : mode === 'simulate'
            ? await simulateAgentGovernanceManifest(payload)
            : await debugAgentGovernanceExecute(payload);
      setDebugResult(result);
      toast.success(mode === 'toolReplay' ? '只读工具执行已生成' : '调试计划已生成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '调试失败');
    } finally {
      setDebugLoading(null);
    }
  }

  async function importLatestEvalRun() {
    setEvalImporting(true);
    try {
      const result = await importLatestAgentGovernanceEvalRun();
      toast.success(`已导入评测运行 #${result.id}`);
      await loadEval();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评测运行导入失败');
    } finally {
      setEvalImporting(false);
    }
  }

  async function runEvalDryRunBatch() {
    setEvalBatchRunning(true);
    try {
      const result = await runAgentGovernanceEvalDryRunBatch({
        priority: evalPriority === 'all' ? 'P0' : evalPriority,
        limit: 25,
        role: debugRole,
        entrypoint: 'agent_governance_eval_batch',
        grayMode: debugGrayMode,
        note: 'manual governance center dry-run batch',
      });
      toast.success(`批量 dry-run 已生成评测运行 #${result.id}`);
      await loadEval();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '批量 dry-run 评测失败');
    } finally {
      setEvalBatchRunning(false);
    }
  }

  async function openEvalFailures(run: AgentGovernanceEvalRunRecord) {
    setEvalFailureRun(run);
    setEvalFailures(null);
    setEvalReplayResult(null);
    setEvalFailuresOpen(true);
    setEvalFailuresLoading(true);
    try {
      setEvalFailures(await getAgentGovernanceEvalRunFailures(run.id, { page: 1, pageSize: 20 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '失败样例加载失败');
      setEvalFailuresOpen(false);
    } finally {
      setEvalFailuresLoading(false);
    }
  }

  async function replayEvalFailure(failure: AgentGovernanceEvalRunFailure, options: { toolReplay?: boolean } = {}) {
    if (!evalFailureRun) return;
    const key = `${failure.category}:${failure.index ?? failure.id ?? 'first'}:${options.toolReplay ? 'tool' : 'dry'}`;
    setEvalReplayLoadingKey(key);
    try {
      const result = await replayAgentGovernanceEvalRunFailure(evalFailureRun.id, {
        failureId: failure.id ?? undefined,
        category: failure.category,
        index: failure.index,
        role: debugRole,
        entrypoint: 'agent_governance_eval_replay',
        grayMode: debugGrayMode,
        ...(options.toolReplay ? { toolReplay: true } : {}),
      });
      setEvalReplayResult(result);
      setDebugQuestion(result.replay.question);
      setDebugResult(result.replay);
      toast.success(options.toolReplay ? '失败样例只读工具回放已生成' : '失败样例 dry-run 回放已生成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '失败样例回放失败');
    } finally {
      setEvalReplayLoadingKey(null);
    }
  }

  function refreshActiveTab() {
    if (activeTab === 'overview') void loadOverview();
    if (activeTab === 'runs') void loadRuns();
    if (activeTab === 'knowledge') void loadKnowledge();
    if (activeTab === 'capabilities') void loadCapabilities();
    if (activeTab === 'gray') void loadGrayRules();
    if (activeTab === 'eval') void loadEval();
    if (activeTab === 'textSql') void loadTextSql();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / AI 治理中心</div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">AI 治理中心</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={kgSummary?.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}>
              图谱 {kgSummary?.passed ? '通过' : '待处理'}
            </Badge>
            <Badge className={evalReport?.summary?.pass ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
              评测 {evalReport?.summary?.pass ? '通过' : '待复核'}
            </Badge>
            <Badge className="border-sky-200 bg-sky-50 text-sky-700">
              Manifest {capabilityHealth?.activeManifestVersion ?? '-'}
            </Badge>
          </div>
        </div>
        <Button variant="outline" onClick={refreshActiveTab} disabled={overviewLoading || runsLoading || kgLoading || capabilityLoading || grayRulesLoading || evalLoading || textSqlLoading}>
          {(overviewLoading || runsLoading || kgLoading || capabilityLoading || grayRulesLoading || evalLoading || textSqlLoading) ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          刷新
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => selectTab(value as TabKey)} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="runs">运行审计</TabsTrigger>
          <TabsTrigger value="knowledge">知识图谱</TabsTrigger>
          <TabsTrigger value="capabilities">能力治理</TabsTrigger>
          <TabsTrigger value="gray">灰度规则</TabsTrigger>
          <TabsTrigger value="eval">评测门禁</TabsTrigger>
          <TabsTrigger value="textSql">受控SQL</TabsTrigger>
          <TabsTrigger value="debug">单题调试</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="7天运行数" value={health?.runs.total ?? runStats?.total ?? '-'} icon={Activity} tone="sky" />
            <StatTile label="成功率" value={formatPercent(health?.runs.successRate)} icon={CheckCircle2} tone={(health?.runs.successRate ?? 1) >= 0.98 ? 'emerald' : 'amber'} />
            <StatTile label="运行 P99" value={formatMs(health?.runs.runLatencyP99Ms)} icon={Activity} tone="slate" />
            <StatTile label="P0 正确率" value={formatMetric(p0Accuracy)} icon={ShieldCheck} tone="emerald" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatTile label="工具 P99" value={formatMs(health?.tools.toolLatencyP99Ms)} icon={Bot} tone="slate" />
            <StatTile label="成本观测" value={formatCostMetric(health?.cost)} icon={DollarSign} tone={health?.cost?.status === 'measured' ? 'emerald' : 'slate'} />
            <StatTile label="高风险自动执行" value={health?.risks.highRiskAutoExecutionCount ?? 0} icon={XCircle} tone={(health?.risks.highRiskAutoExecutionCount ?? 0) > 0 ? 'rose' : 'emerald'} />
            <StatTile label="KG 回退旧链路" value={health?.strategy.legacyFallbackCount ?? 0} icon={GitBranch} tone={(health?.strategy.legacyFallbackCount ?? 0) > 0 ? 'amber' : 'emerald'} />
            <StatTile label="缓存命中率" value={health?.cache.status === 'measured' ? formatPercent(health.cache.hitRate ?? 0) : '未采样'} icon={Database} tone="sky" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm xl:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  高频未覆盖问法
                </div>
                <Button variant="ghost" size="sm" onClick={() => selectTab('runs')}>查看审计</Button>
              </div>
              <div className="space-y-2">
                {uncovered.length ? uncovered.map((item) => (
                  <div key={`${item.question}-${item.latestAt}`} className="rounded-lg border border-border bg-background p-3">
                    <div className="line-clamp-2 text-sm font-medium text-gray-800">{item.question}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.count} 次 · 最近 {formatDateTime(item.latestAt)} · {item.lastError ?? '无错误摘要'}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => debugUncoveredQuestion(item)}>
                        单题调试
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => governUncoveredQuestion(item)}>
                        图谱治理
                      </Button>
                      <a
                        href="/system/agent-capabilities"
                        className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium text-gray-700 hover:bg-accent"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        能力治理
                      </a>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无失败聚合数据</div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <GitBranch className="h-4 w-4 text-sky-600" />
                  自动发布近况
                </div>
                <div className="space-y-2">
                  {latestAutoRuns.length ? latestAutoRuns.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openAutoPublishDetail(item.id)}
                      className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-800">{item.runNo}</span>
                        <Badge className={getStatusClass(item.status)}>{getStatusLabel(item.status)}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{formatDateTime(item.startedAt)}</div>
                    </button>
                  )) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无自动发布记录</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Target className="h-4 w-4 text-violet-600" />
                  治理待办
                </div>
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => selectTab('capabilities')}
                    className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">待审核能力</span>
                      <Badge className={asNumber(capabilityHealth?.byReleaseStrategy?.approval_required) > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                        {capabilityHealth?.byReleaseStrategy?.approval_required ?? 0}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">进入能力治理查看候选、版本和发布日志</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectTab('knowledge')}
                    className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">图谱缺口</span>
                      <Badge className={asNumber(kgSummary?.blockerCount) > 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : asNumber(kgSummary?.warningCount) > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                        {(kgSummary?.blockerCount ?? 0) + (kgSummary?.warningCount ?? 0)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{kgSummary?.blockerCount ?? 0} 个阻断，{kgSummary?.warningCount ?? 0} 个提醒</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={runFilters.keyword}
                onChange={(event) => {
                  setRunFilters((current) => ({ ...current, keyword: event.target.value }));
                  setRunPage(1);
                }}
                className="pl-9"
                placeholder="搜索 runNo 或用户问题"
              />
            </div>
            <select
              value={runFilters.status}
              onChange={(event) => {
                setRunFilters((current) => ({ ...current, status: event.target.value }));
                setRunPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {RUN_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button variant="outline" onClick={() => void loadRuns()} disabled={runsLoading}>
              {runsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              刷新
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>失败定位</TableHead>
                <TableHead>入口</TableHead>
                <TableHead>问题</TableHead>
                <TableHead>工具/审批</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs?.items.length ? runs.items.map((run) => {
                const diagnosis = getFailureDiagnosis(run);
                return (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap text-gray-500">{formatDateTime(run.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{run.runNo}</TableCell>
                    <TableCell><Badge className={getStatusClass(run.status)}>{getStatusLabel(run.status)}</Badge></TableCell>
                    <TableCell><Badge className={diagnosis.className}>{diagnosis.label}</Badge></TableCell>
                    <TableCell>{run.entrypoint}</TableCell>
                    <TableCell className="max-w-[360px] truncate">{run.userInput}</TableCell>
                    <TableCell>{run.toolCallCount ?? 0} / {run.approvalCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => void openRunDetail(run.id)}>详情</Button>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <EmptyRow colSpan={8} text={runsLoading ? '运行审计加载中' : '暂无运行记录'} />
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>共 {runs?.total ?? 0} 条</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={runPage <= 1} onClick={() => setRunPage((current) => Math.max(1, current - 1))}>上一页</Button>
              <span>{runPage} / {Math.max(1, Math.ceil((runs?.total ?? 0) / runPageSize))}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={runPage >= Math.max(1, Math.ceil((runs?.total ?? 0) / runPageSize))}
                onClick={() => setRunPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="节点" value={kgSummary?.nodeCount ?? '-'} icon={Database} tone="slate" />
            <StatTile label="边" value={kgSummary?.edgeCount ?? '-'} icon={Network} tone="sky" />
            <StatTile label="阻断缺口" value={kgSummary?.blockerCount ?? '-'} icon={XCircle} tone={asNumber(kgSummary?.blockerCount) > 0 ? 'rose' : 'emerald'} />
            <StatTile label="提醒缺口" value={kgSummary?.warningCount ?? '-'} icon={AlertTriangle} tone={asNumber(kgSummary?.warningCount) > 0 ? 'amber' : 'emerald'} />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={kgFilters.keyword}
                onChange={(event) => {
                  setKgFilters((current) => ({ ...current, keyword: event.target.value }));
                  setKgPage(1);
                }}
                className="pl-9"
                placeholder="搜索节点 ID、名称或描述"
              />
            </div>
            <select
              value={kgFilters.type}
              onChange={(event) => {
                setKgFilters((current) => ({ ...current, type: event.target.value }));
                setKgFocusNodeId('');
                setKgPage(1);
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {NODE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button variant="outline" onClick={() => void loadKnowledge()} disabled={kgLoading}>
              {kgLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              刷新
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>置信度</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kgNodes?.items.length ? kgNodes.items.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{node.displayName ?? node.name}</div>
                      <div className="mt-1 max-w-[380px] truncate font-mono text-xs text-gray-500">{node.id}</div>
                    </TableCell>
                    <TableCell>{node.type}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{node.sourcePath ?? node.source}</TableCell>
                    <TableCell>{formatPercent(node.confidence)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setKgFocusNodeId(node.id)}>聚焦</Button>
                        <Button variant="ghost" size="sm" onClick={() => void openNodeDetail(node.id)}>详情</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={5} text={kgLoading ? '知识图谱加载中' : '暂无节点'} />
                )}
              </TableBody>
            </Table>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Network className="h-4 w-4 text-sky-600" />
                  图谱预览
                </div>
                {kgFocusNodeId ? (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    <span className="min-w-0 truncate font-mono">{kgFocusNodeId}</span>
                    <Button variant="ghost" size="sm" onClick={() => setKgFocusNodeId('')}>清除焦点</Button>
                  </div>
                ) : null}
                <KnowledgeGraphPreview
                  nodes={kgVisualize?.nodes ?? []}
                  edges={kgVisualize?.edges ?? []}
                  focusId={kgFocusNodeId}
                  onNodeClick={(node) => void openNodeDetail(node.id)}
                />
                <div className="mt-3 grid gap-2">
                  <Input value={kgPathFrom} onChange={(event) => setKgPathFrom(event.target.value)} placeholder="起点节点 ID" />
                  <Input value={kgPathTo} onChange={(event) => setKgPathTo(event.target.value)} placeholder="终点节点 ID" />
                  <Button variant="outline" onClick={() => void runKnowledgePath()} disabled={kgPathLoading}>
                    {kgPathLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}
                    查询路径
                  </Button>
                </div>
                {kgPathResult ? (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-gray-700">
                    {kgPathResult.found ? `已找到：${kgPathResult.path.join(' -> ')}` : `未找到 ${kgPathResult.maxDepth} 跳内路径`}
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <GitBranch className="h-4 w-4 text-indigo-600" />
                  人工覆盖
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Input value={kgSynonymTarget} onChange={(event) => setKgSynonymTarget(event.target.value)} placeholder="目标节点 ID" />
                    <Input value={kgSynonymValue} onChange={(event) => setKgSynonymValue(event.target.value)} placeholder="同义词" />
                    <Input value={kgSynonymReason} onChange={(event) => setKgSynonymReason(event.target.value)} placeholder="原因" />
                    <Button variant="outline" onClick={() => void createKgSynonym()} disabled={kgOverrideSaving === 'synonym'} className="w-full">
                      {kgOverrideSaving === 'synonym' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      新增同义词
                    </Button>
                    <div className="space-y-2">
                      {(kgSynonyms?.items ?? []).map((item) => (
                        <div key={`synonym-${item.id}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-800">{item.value ?? item.label ?? '-'}</div>
                            <div className="truncate font-mono text-xs text-gray-500">{item.targetNodeId}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => void deleteKgOverride('synonym', item.id)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-border pt-4">
                    <Input value={kgExcludeFrom} onChange={(event) => setKgExcludeFrom(event.target.value)} placeholder="互斥来源节点 ID" />
                    <Input value={kgExcludeTo} onChange={(event) => setKgExcludeTo(event.target.value)} placeholder="互斥目标节点 ID" />
                    <Input value={kgExcludeReason} onChange={(event) => setKgExcludeReason(event.target.value)} placeholder="原因" />
                    <Button variant="outline" onClick={() => void createKgExclude()} disabled={kgOverrideSaving === 'exclude'} className="w-full">
                      {kgOverrideSaving === 'exclude' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                      新增互斥
                    </Button>
                    <div className="space-y-2">
                      {(kgExcludes?.items ?? []).map((item) => (
                        <div key={`exclude-${item.id}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-800">{item.label ?? '互斥覆盖'}</div>
                            <div className="truncate font-mono text-xs text-gray-500">{item.sourceNodeId}{' -> '}{item.targetNodeId}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => void deleteKgOverride('exclude', item.id)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    图谱缺口
                  </div>
                  {kgGapFocusNodeId ? (
                    <Button variant="ghost" size="sm" onClick={() => setKgGapFocusNodeId('')}>清除缺口焦点</Button>
                  ) : null}
                </div>
                {kgGapFocusNodeId ? (
                  <div className="mb-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    当前定位：<span className="font-mono">{kgGapFocusNodeId}</span>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {visibleKgGaps.slice(0, 8).map((gap) => (
                    <div key={`${gap.code}-${gap.targetId ?? gap.title}`} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{gap.title}</span>
                        <Badge className={getSeverityClass(gap.severity)}>{gap.severity}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{gap.detail}</div>
                      {gap.targetId ? <div className="mt-1 truncate font-mono text-xs text-gray-500">{gap.targetId}</div> : null}
                      <div className="mt-2 text-xs text-gray-700">{gap.suggestedFix}</div>
                    </div>
                  ))}
                  {!visibleKgGaps.length ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无缺口</div> : null}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatTile label="候选能力" value={capabilityDrafts?.stats.total ?? capabilityDrafts?.total ?? '-'} icon={Target} tone="amber" />
            <StatTile label="已发布能力" value={capabilityHealth?.total ?? '-'} icon={Sparkles} tone="sky" />
            <StatTile label="启用" value={capabilityHealth?.enabled ?? '-'} icon={CheckCircle2} tone="emerald" />
            <StatTile label="停用" value={capabilityHealth?.disabled ?? '-'} icon={XCircle} tone={asNumber(capabilityHealth?.disabled) > 0 ? 'amber' : 'slate'} />
            <StatTile label="高风险自动发布" value={formatMetric(highRiskAutoPublish)} icon={ShieldCheck} tone={asNumber(highRiskAutoPublish) > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Target className="h-4 w-4 text-amber-600" />
                  候选池入口
                </div>
                <a
                  href="/system/agent-capabilities"
                  className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-accent"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  打开能力中心
                </a>
              </div>
              <div className="grid gap-2">
                {['draft', 'needs_changes', 'approved', 'published'].map((status) => (
                  <div key={status} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-gray-600">{getDraftStatusLabel(status)}</span>
                    <span className="font-semibold text-gray-900">{capabilityDraftStatus[status] ?? 0}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                支持本地导入扫描草稿、审核、dry-run 与发布后烟测；生产 Hook URL/Token 后续再配置。
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <GitBranch className="h-4 w-4 text-sky-600" />
                Manifest 版本
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-xs text-gray-500">当前使用</div>
                <div className="mt-1 truncate font-mono text-sm font-semibold text-gray-900">{activeManifestVersion ?? '-'}</div>
              </div>
              <div className="mt-3 space-y-2">
                {capabilityManifestVersions.slice(0, 4).map((version) => (
                  <div key={version.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-medium text-gray-900">{version.version}</span>
                      <Badge className={version.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}>
                        {version.status === 'active' ? '使用中' : version.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{version.itemCount} 项 · {formatDateTime(version.publishedAt ?? version.createdAt)}</div>
                  </div>
                ))}
                {!capabilityManifestVersions.length ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-gray-500">{capabilityLoading ? 'Manifest 加载中' : '暂无 Manifest 版本'}</div> : null}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Database className="h-4 w-4 text-emerald-600" />
                QueryKey 注册表
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="text-xs text-gray-500">登记数</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">{capabilityQueryKeys.length || '-'}</div>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="text-xs text-gray-500">覆盖领域</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">{queryKeyDomainCount || '-'}</div>
                </div>
              </div>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto">
                {capabilityQueryKeys.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-md border border-border px-3 py-2">
                    <div className="truncate font-mono text-xs font-medium text-gray-900">{item.queryKey}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{item.toolName} · {item.domain} · {item.status}</div>
                  </div>
                ))}
                {!capabilityQueryKeys.length ? <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-gray-500">{capabilityLoading ? 'QueryKey 加载中' : '暂无 QueryKey 登记'}</div> : null}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <ShieldCheck className="h-4 w-4 text-violet-600" />
                能力健康看板
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">发布策略</div>
                  <div className="space-y-2">
                    {Object.entries(capabilityHealth?.byReleaseStrategy ?? {}).map(([strategy, count]) => (
                      <div key={strategy} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-gray-600">{getReleaseStrategyLabel(strategy)}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                    ))}
                    {!Object.keys(capabilityHealth?.byReleaseStrategy ?? {}).length ? <div className="text-sm text-gray-500">暂无策略分布</div> : null}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">风险等级</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(capabilityHealth?.byRiskLevel ?? {}).map(([riskLevel, count]) => (
                      <Badge key={riskLevel} className={riskLevel === 'high' ? 'border-rose-200 bg-rose-50 text-rose-700' : riskLevel === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                        {getRiskLevelLabel(riskLevel)} {count}
                      </Badge>
                    ))}
                    {!Object.keys(capabilityHealth?.byRiskLevel ?? {}).length ? <span className="text-sm text-gray-500">暂无风险分布</span> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-gray-800">领域热力</div>
              <div className="space-y-2">
                {sortedHeatMap.map((item) => (
                  <div key={`${item.domain}-${item.releaseStrategy}`}>
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                      <span>{item.domain} / {item.releaseStrategy}</span>
                      <span>{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (item.count / Math.max(1, capabilityHealth?.total ?? item.count)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!sortedHeatMap.length ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无热力数据</div> : null}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <GitBranch className="h-4 w-4 text-sky-600" />
                自动发布日志
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>流水号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>触发</TableHead>
                    <TableHead>扫描</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoPublishRuns?.items.length ? autoPublishRuns.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap text-gray-500">{formatDateTime(run.startedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{run.runNo}</TableCell>
                      <TableCell><Badge className={getStatusClass(run.status)}>{getStatusLabel(run.status)}</Badge></TableCell>
                      <TableCell>{String(run.input?.trigger ?? run.result?.trigger ?? '-')}</TableCell>
                      <TableCell>{String(run.input?.scanMode ?? run.result?.scanMode ?? '-')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void openAutoPublishDetail(run.id)}>详情</Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <EmptyRow colSpan={6} text={capabilityLoading ? '自动发布日志加载中' : '暂无自动发布日志'} />
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gray" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="当前规则数" value={grayRules?.total ?? '-'} icon={SlidersHorizontal} tone="sky" />
            <StatTile label="运行时刷新" value="变更后刷新" icon={RefreshCw} tone="emerald" />
            <StatTile label="最高优先级" value={grayRules?.items?.[0]?.priority ?? '-'} icon={GitBranch} tone="slate" />
            <StatTile label="默认回退" value="环境变量/全局" icon={ShieldCheck} tone="amber" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <SlidersHorizontal className="h-4 w-4 text-sky-600" />
                新增灰度规则
              </div>
              <div className="grid gap-3">
                <Input
                  value={grayRuleDraft.name}
                  onChange={(event) => updateGrayRuleDraft('name', event.target.value)}
                  placeholder="规则名称，例如：次卡问数新链路优先"
                />
                <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                  <select
                    value={grayRuleDraft.mode}
                    onChange={(event) => updateGrayRuleDraft('mode', event.target.value)}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {DEBUG_GRAY_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <Input
                    value={grayRuleDraft.priority}
                    onChange={(event) => updateGrayRuleDraft('priority', event.target.value)}
                    placeholder="优先级"
                  />
                </div>
                <Input
                  value={grayRuleDraft.storeIds}
                  onChange={(event) => updateGrayRuleDraft('storeIds', event.target.value)}
                  placeholder="门店 ID，逗号分隔；留空为全部"
                />
                <Input
                  value={grayRuleDraft.personaCodes}
                  onChange={(event) => updateGrayRuleDraft('personaCodes', event.target.value)}
                  placeholder="persona，例如 manager,reception"
                />
                <Input
                  value={grayRuleDraft.roles}
                  onChange={(event) => updateGrayRuleDraft('roles', event.target.value)}
                  placeholder="角色，例如 manager,reception,beautician"
                />
                <Input
                  value={grayRuleDraft.entrypoints}
                  onChange={(event) => updateGrayRuleDraft('entrypoints', event.target.value)}
                  placeholder="入口，例如 admin,kiosk,agent_governance_debug"
                />
                <textarea
                  value={grayRuleDraft.capabilityIds}
                  onChange={(event) => updateGrayRuleDraft('capabilityIds', event.target.value)}
                  className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  placeholder="能力 ID，可逗号或换行分隔；留空为全部能力"
                />
                <textarea
                  value={grayRuleDraft.reason}
                  onChange={(event) => updateGrayRuleDraft('reason', event.target.value)}
                  className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  placeholder="启用原因、回滚条件或测试范围"
                />
                <Button onClick={() => void createGrayRule()} disabled={grayRuleSaving}>
                  {grayRuleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  保存并刷新运行时
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[160px_180px_auto] md:items-center">
                <select
                  value={grayRuleFilters.status}
                  onChange={(event) => {
                    setGrayRuleFilters((current) => ({ ...current, status: event.target.value }));
                    setGrayRulePage(1);
                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {GRAY_RULE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={grayRuleFilters.mode}
                  onChange={(event) => {
                    setGrayRuleFilters((current) => ({ ...current, mode: event.target.value }));
                    setGrayRulePage(1);
                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="all">全部模式</option>
                  {DEBUG_GRAY_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <Button variant="outline" onClick={() => void loadGrayRules()} disabled={grayRulesLoading}>
                  {grayRulesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  刷新
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>优先级</TableHead>
                    <TableHead>规则</TableHead>
                    <TableHead>模式</TableHead>
                    <TableHead>命中范围</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grayRules?.items.length ? grayRules.items.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">{rule.name}</div>
                        <div className="mt-1 max-w-[260px] truncate text-xs text-gray-500">{rule.reason ?? '无原因备注'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusClass(rule.mode)}>
                          {DEBUG_GRAY_MODE_OPTIONS.find((option) => option.value === rule.mode)?.label ?? rule.mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="truncate text-sm text-gray-800">{rule.scopeSummary}</div>
                        <div className="mt-1 truncate font-mono text-xs text-gray-500">cap: {formatList(rule.capabilityIds)}</div>
                        <div className="mt-1 truncate font-mono text-xs text-gray-500">entry: {formatList(rule.entrypoints)}</div>
                      </TableCell>
                      <TableCell><Badge className={getStatusClass(rule.status)}>{getStatusLabel(rule.status)}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500">{formatDateTime(rule.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteGrayRule(rule.id)}
                          disabled={rule.status === 'deleted' || grayRuleDeletingId === rule.id}
                        >
                          {grayRuleDeletingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <EmptyRow colSpan={7} text={grayRulesLoading ? '灰度规则加载中' : '暂无灰度规则'} />
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>共 {grayRules?.total ?? 0} 条</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={grayRulePage <= 1} onClick={() => setGrayRulePage((current) => Math.max(1, current - 1))}>上一页</Button>
                  <span>{grayRulePage} / {Math.max(1, Math.ceil((grayRules?.total ?? 0) / grayRulePageSize))}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={grayRulePage >= Math.max(1, Math.ceil((grayRules?.total ?? 0) / grayRulePageSize))}
                    onClick={() => setGrayRulePage((current) => current + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="eval" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="评测题" value={String(evalReport?.summary?.totalQuestions ?? '-')} icon={Bot} tone="sky" />
            <StatTile label="P0 题" value={String(evalReport?.summary?.p0Questions ?? '-')} icon={ShieldCheck} tone="slate" />
            <StatTile label="P0 降级" value={formatMetric(fallbackCount)} icon={AlertTriangle} tone={asNumber(fallbackCount) > 0 ? 'amber' : 'emerald'} />
            <StatTile label="越权证据" value={formatMetric(unauthorizedEvidenceCount)} icon={XCircle} tone={asNumber(unauthorizedEvidenceCount) > 0 ? 'rose' : 'emerald'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-gray-800">门禁结果</div>
              <div className="space-y-2">
                {evalReport?.gates.map((gate) => (
                  <div key={gate.gate} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">{gate.gate}</span>
                      <Badge className={gate.pass ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}>
                        {gate.pass ? '通过' : '未通过'}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{gate.expected} · {gate.actual}</div>
                  </div>
                )) ?? <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无门禁报告</div>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <select
                  value={evalPriority}
                  onChange={(event) => {
                    setEvalPriority(event.target.value);
                    setEvalPage(1);
                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void runEvalDryRunBatch()} disabled={evalBatchRunning}>
                    {evalBatchRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    批量 Dry-run
                  </Button>
                  <Button variant="outline" onClick={() => void importLatestEvalRun()} disabled={evalImporting}>
                    {evalImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                    导入最新报告
                  </Button>
                  <Button variant="outline" onClick={() => void loadEval()} disabled={evalLoading}>
                    {evalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>题号</TableHead>
                    <TableHead>优先级</TableHead>
                    <TableHead>问题</TableHead>
                    <TableHead>期望能力</TableHead>
                    <TableHead>权限/契约</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evalCases?.items.length ? evalCases.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell><Badge className={item.priority === 'P0' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-gray-200 bg-gray-50 text-gray-700'}>{item.priority}</Badge></TableCell>
                      <TableCell className="max-w-[360px] truncate">{item.question}</TableCell>
                      <TableCell className="font-mono text-xs">{item.expectedCapabilityId ?? '-'}</TableCell>
                      <TableCell>{item.permissionResult ?? '-'} / {item.contractResult ?? '-'}</TableCell>
                    </TableRow>
                  )) : (
                    <EmptyRow colSpan={5} text={evalLoading ? '评测题加载中' : '暂无评测题'} />
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-end gap-2 text-sm text-gray-500">
                <Button variant="outline" size="sm" disabled={evalPage <= 1} onClick={() => setEvalPage((current) => Math.max(1, current - 1))}>上一页</Button>
                <span>{evalPage} / {Math.max(1, Math.ceil((evalCases?.total ?? 0) / evalPageSize))}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={evalPage >= Math.max(1, Math.ceil((evalCases?.total ?? 0) / evalPageSize))}
                  onClick={() => setEvalPage((current) => current + 1)}
                >
                  下一页
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-gray-800">评测运行历史</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>分数</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evalRuns?.items.length ? evalRuns.items.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="whitespace-nowrap text-gray-500">{formatDateTime(run.createdAt)}</TableCell>
                        <TableCell><Badge className={getStatusClass(run.status)}>{getStatusLabel(run.status)}</Badge></TableCell>
                        <TableCell>{formatMetric(typeof run.score === 'string' ? Number(run.score) : run.score)}</TableCell>
                        <TableCell className="max-w-[360px] truncate">{getEvalRunSummary(run)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => void openEvalFailures(run)}>
                            失败样例
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <EmptyRow colSpan={5} text={evalLoading ? '评测历史加载中' : '暂无评测运行历史'} />
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="textSql" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="语义视图" value={String(textSqlConfigStatus?.viewReadiness?.totalViews ?? (textSqlViews.length || '-'))} icon={Database} tone="sky" />
            <StatTile label="启用视图" value={String(textSqlConfigStatus?.viewReadiness?.enabledViews ?? (textSqlViews.filter((item) => item.status === 'enabled').length || '-'))} icon={ShieldCheck} tone="emerald" />
            <StatTile label="审计运行" value={String(textSqlRuns?.total ?? '-')} icon={Activity} tone="slate" />
            <StatTile
              label={textSqlConfigStatus?.enabled ? '已启用' : '未启用'}
              value={textSqlConfigStatus?.readonlyExecutionReady ? '可执行' : 'Dry-run'}
              icon={AlertTriangle}
              tone={textSqlConfigStatus?.readonlyExecutionReady ? 'emerald' : 'amber'}
            />
          </div>

          {textSqlConfigStatus ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={textSqlConfigStatus.readonlyExecutionReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                  {textSqlConfigStatus.executeMode}
                </Badge>
                <span className="text-gray-600">
                  total {textSqlConfigStatus.viewReadiness?.totalViews ?? textSqlViews.length} / enabled {textSqlConfigStatus.viewReadiness?.enabledViews ?? textSqlViews.filter((item) => item.status === 'enabled').length} / planned {textSqlConfigStatus.viewReadiness?.plannedViews ?? '-'} / admin {textSqlConfigStatus.viewReadiness?.adminViews ?? '-'}
                </span>
              </div>
              {textSqlConfigStatus.executeBlockers?.length ? (
                <div className="mt-2 text-amber-700">执行阻断：{formatList(textSqlConfigStatus.executeBlockers)}</div>
              ) : null}
              {textSqlConfigStatus.nextActions?.length ? (
                <div className="mt-1 text-gray-500">下一步：{formatList(textSqlConfigStatus.nextActions)}</div>
              ) : null}
              {textSqlConfigStatus.deploymentReadiness ? (
                <div className="mt-2 text-gray-500">迁移：{textSqlConfigStatus.deploymentReadiness.primaryMigrationName}</div>
              ) : null}
              {textSqlConfigStatus.readinessCommands ? (
                <div className="mt-2 grid gap-1 rounded-md bg-muted/40 p-2 font-mono text-xs text-gray-600">
                  <div>本地门禁：{redactSensitiveInlineText(textSqlConfigStatus.readinessCommands.localGate)}</div>
                  <div>真实库审计：{redactSensitiveInlineText(textSqlConfigStatus.readinessCommands.completionAudit)}</div>
                  <div>只读库验收：{redactSensitiveInlineText(textSqlConfigStatus.readinessCommands.strictReadiness)}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">受控 Text-to-SQL Dry-run</div>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">不会访问数据库</Badge>
              </div>
              <textarea
                value={textSqlQuestion}
                onChange={(event) => setTextSqlQuestion(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-3 grid gap-2 md:grid-cols-[140px_auto]">
                <Input value={textSqlStoreId} onChange={(event) => setTextSqlStoreId(event.target.value)} placeholder="storeId" />
                <Button onClick={() => void runTextSqlDryRun()} disabled={textSqlDryRunning || !textSqlQuestion.trim()}>
                  {textSqlDryRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  生成受控查询计划
                </Button>
              </div>
              {textSqlDryRunResult ? (
                <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getStatusClass(textSqlDryRunResult.status)}>{textSqlDryRunResult.status}</Badge>
                    <span className="text-gray-500">auditRunId: {textSqlDryRunResult.auditRunId ?? '-'}</span>
                  </div>
                  <div className="text-gray-800">{textSqlDryRunResult.answer ?? '-'}</div>
                  <div className="text-xs text-gray-500">视图：{formatList(textSqlDryRunResult.evidence.sourceViews)}</div>
                  <pre className="max-h-48 overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                    {formatTextToSqlTrace(textSqlDryRunResult.queryTrace, canManageAgentGovernance)}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">Guard Inspect</div>
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">SELECT only</Badge>
              </div>
              <textarea
                value={textSqlInspectSql}
                onChange={(event) => setTextSqlInspectSql(event.target.value)}
                className="min-h-32 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <Button className="mt-3" variant="outline" onClick={() => void inspectTextSqlGuard()} disabled={textSqlGuardLoading || !textSqlInspectSql.trim()}>
                {textSqlGuardLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                检查 SQL
              </Button>
              {textSqlGuardResult ? (
                <div className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={textSqlGuardResult.status === 'pass' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}>
                      {textSqlGuardResult.status}
                    </Badge>
                    <span className="text-gray-500">{textSqlGuardResult.reasonCode ?? textSqlGuardResult.message ?? 'guard result'}</span>
                  </div>
                  <div className="text-xs text-gray-500">策略：{formatList(textSqlGuardResult.appliedPolicies)}</div>
                  <pre className="max-h-48 overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                    {getTextToSqlGuardSqlDisplay(textSqlGuardResult, canManageAgentGovernance)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-800">高频候选能力</div>
                <div className="mt-1 text-xs text-gray-500">由受控 Text-to-SQL 审计自动聚类，只沉淀为待治理草稿，不自动发布。</div>
              </div>
              <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                {textSqlCandidates.filter((item) => item.status === 'candidate').length} 个可沉淀
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>候选</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>命中</TableHead>
                  <TableHead>成功率</TableHead>
                  <TableHead>视图</TableHead>
                  <TableHead>样例问题</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {textSqlCandidates.length ? textSqlCandidates.slice(0, 8).map((candidate) => (
                  <TableRow key={candidate.clusterKey}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{candidate.displayName}</div>
                      <div className="font-mono text-xs text-gray-500">{candidate.suggestedCapabilityId}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={candidate.status === 'candidate' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                        {candidate.status === 'candidate' ? '可沉淀' : '阻断报表'}
                      </Badge>
                    </TableCell>
                    <TableCell>{candidate.hitCount}</TableCell>
                    <TableCell>{formatPercent(candidate.successRate)}</TableCell>
                    <TableCell className="max-w-[240px] truncate font-mono text-xs">{formatList(candidate.selectedViews)}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{candidate.sampleQuestions[0] ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {candidate.status === 'candidate' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void promoteTextSqlCandidate(candidate)}
                          disabled={textSqlPromotingKey === candidate.clusterKey}
                        >
                          {textSqlPromotingKey === candidate.clusterKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                          沉淀草稿
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">{candidate.reason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={7} text={textSqlLoading ? '候选能力加载中' : '暂无高频候选能力'} />
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">审计运行</div>
                <div className="flex items-center gap-2">
                  <select
                    value={textSqlStatus}
                    onChange={(event) => {
                      setTextSqlStatus(event.target.value);
                      setTextSqlPage(1);
                    }}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">全部状态</option>
                    <option value="dry_run">Dry-run</option>
                    <option value="success">成功</option>
                    <option value="no_data">无数据</option>
                    <option value="blocked">已阻断</option>
                    <option value="failed">失败</option>
                  </select>
                  <Button variant="outline" onClick={() => void loadTextSql()} disabled={textSqlLoading}>
                    {textSqlLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新
                  </Button>
                </div>
              </div>
              <div className="mb-3 grid gap-2 md:grid-cols-4">
                <div className="rounded-md border border-rose-100 bg-rose-50 p-3">
                  <div className="text-xs text-rose-600">已阻断</div>
                  <div className="mt-1 text-lg font-semibold text-rose-700">{textSqlBlockedSummary.blockedCount}</div>
                </div>
                <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
                  <div className="text-xs text-amber-700">无数据</div>
                  <div className="mt-1 text-lg font-semibold text-amber-800">{textSqlBlockedSummary.noDataCount}</div>
                </div>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">失败</div>
                  <div className="mt-1 text-lg font-semibold text-slate-800">{textSqlBlockedSummary.failedCount}</div>
                </div>
                <div className="rounded-md border border-violet-100 bg-violet-50 p-3">
                  <div className="text-xs text-violet-700">阻断报表</div>
                  <div className="mt-1 text-lg font-semibold text-violet-800">{textSqlBlockedSummary.blockedReports}</div>
                </div>
              </div>
              {textSqlBlockedSummary.topReasons.length ? (
                <div className="mb-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-gray-600">
                  高频阻断原因：{formatList(textSqlBlockedSummary.topReasons)}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>问题</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>视图</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {textSqlRuns?.items.length ? textSqlRuns.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-xs">{run.id}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{run.question}</TableCell>
                      <TableCell><Badge className={getStatusClass(run.status)}>{run.status}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate font-mono text-xs">{formatJson(run.selectedViewsJson)}</TableCell>
                      <TableCell>{run.executionMs ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500">{formatDateTime(run.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void openTextSqlRunDetail(run.id)}>详情</Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <EmptyRow colSpan={7} text={textSqlLoading ? 'Text-to-SQL 审计加载中' : '暂无 Text-to-SQL 审计'} />
                  )}
                </TableBody>
              </Table>
              <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-500">
                <Button variant="outline" size="sm" disabled={textSqlPage <= 1} onClick={() => setTextSqlPage((current) => Math.max(1, current - 1))}>上一页</Button>
                <span>{textSqlPage} / {Math.max(1, Math.ceil((textSqlRuns?.total ?? 0) / textSqlPageSize))}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={textSqlPage >= Math.max(1, Math.ceil((textSqlRuns?.total ?? 0) / textSqlPageSize))}
                  onClick={() => setTextSqlPage((current) => current + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-gray-800">语义视图 / 运行详情</div>
              {textSqlRunDetail ? (
                <div className="mb-4 space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-gray-900">#{textSqlRunDetail.id} {textSqlRunDetail.status}</div>
                    {['success', 'dry_run', 'no_data'].includes(textSqlRunDetail.status) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void promoteTextSqlRun(textSqlRunDetail)}
                        disabled={textSqlPromotingKey === `run:${textSqlRunDetail.id}`}
                      >
                        {textSqlPromotingKey === `run:${textSqlRunDetail.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        沉淀草稿
                      </Button>
                    ) : null}
                  </div>
                  <div className="text-gray-600">{textSqlRunDetail.question}</div>
                  <div className="text-xs text-gray-500">blockedReason: {textSqlRunDetail.blockedReason ?? '-'}</div>
                  <pre className="max-h-52 overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-100">
                    {formatTextToSqlTrace(textSqlRunDetail.queryTraceJson, canManageAgentGovernance)}
                  </pre>
                </div>
              ) : null}
              <div className="space-y-2">
                {textSqlViews.slice(0, 16).map((view) => (
                  <div key={view.viewName} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-gray-800">{view.viewName}</span>
                      <Badge className={view.status === 'enabled' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                        {view.batch} · {view.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{view.domain} · {formatList(view.requiredPermissions)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-gray-800">单题调试</div>
              <textarea
                aria-label="调试问题"
                value={debugQuestion}
                onChange={(event) => setDebugQuestion(event.target.value)}
                className="min-h-32 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <select
                  value={debugGrayMode}
                  onChange={(event) => setDebugGrayMode(event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {DEBUG_GRAY_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={debugRole}
                  onChange={(event) => setDebugRole(event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {DEBUG_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <Input
                  value={debugStoreId}
                  onChange={(event) => setDebugStoreId(event.target.value)}
                  placeholder="storeId"
                />
                <Input
                  value={debugEntrypoint}
                  onChange={(event) => setDebugEntrypoint(event.target.value)}
                  placeholder="entrypoint"
                />
              </div>
              <label className="mt-3 block space-y-1 text-xs text-gray-500">
                <span>目标 Manifest 版本</span>
                <Input
                  value={debugCompareManifestVersion}
                  onChange={(event) => setDebugCompareManifestVersion(event.target.value)}
                  placeholder="可选，仅对比模式使用，例如 cap-20260705180000"
                />
              </label>
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Manifest 模拟
                  </div>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700">仅本地 dry-run</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-xs text-gray-500">
                    <span>能力 ID</span>
                    <Input
                      value={debugSimulationCapabilityId}
                      onChange={(event) => setDebugSimulationCapabilityId(event.target.value)}
                      placeholder="capabilityId"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-500">
                    <span>临时状态</span>
                    <select
                      value={debugSimulationEnabled}
                      onChange={(event) => setDebugSimulationEnabled(event.target.value as DebugSimulationEnabled)}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-gray-800"
                    >
                      <option value="inherit">继承 active Manifest</option>
                      <option value="enabled">临时启用</option>
                      <option value="disabled">临时禁用</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-gray-500">
                    <span>triggerKeywords</span>
                    <Input
                      value={debugSimulationTriggerKeywords}
                      onChange={(event) => setDebugSimulationTriggerKeywords(event.target.value)}
                      placeholder="例如：商品订单, 沉睡次卡"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-500">
                    <span>negativeExamples</span>
                    <Input
                      value={debugSimulationNegativeExamples}
                      onChange={(event) => setDebugSimulationNegativeExamples(event.target.value)}
                      placeholder="例如：不要查商品订单"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-500 md:col-span-2">
                    <span>outputKinds</span>
                    <Input
                      value={debugSimulationOutputKinds}
                      onChange={(event) => setDebugSimulationOutputKinds(event.target.value)}
                      placeholder="例如：table, evidence_panel, chart"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <Button onClick={() => void runDebug('execute')} disabled={Boolean(debugLoading)}>
                  {debugLoading === 'execute' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  执行计划
                </Button>
                <Button variant="outline" onClick={() => void runDebug('toolReplay')} disabled={Boolean(debugLoading)}>
                  {debugLoading === 'toolReplay' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                  只读工具执行
                </Button>
                <Button variant="outline" onClick={() => void runDebug('compare')} disabled={Boolean(debugLoading)}>
                  {debugLoading === 'compare' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
                  对比
                </Button>
                <Button variant="outline" onClick={() => void runDebug('simulate')} disabled={Boolean(debugLoading)}>
                  {debugLoading === 'simulate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  模拟
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800">调试结果</div>
                {debugResult ? <Badge className="border-sky-200 bg-sky-50 text-sky-700">{debugResult.selectedCapabilityId ?? '未命中'}</Badge> : null}
              </div>
              {debugResult ? (
                <div className="space-y-4">
                  {debugResult.modes ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {Object.entries(debugResult.modes).map(([mode, result]) => (
                        <div key={mode} className="rounded-lg border border-border bg-background p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-800">{mode}</span>
                            <Badge className={getStatusClass(result.strategy && typeof result.strategy === 'object' && 'finalEngine' in result.strategy ? String((result.strategy as { finalEngine?: string }).finalEngine) : undefined)}>
                              {result.strategy && typeof result.strategy === 'object' && 'finalEngine' in result.strategy ? String((result.strategy as { finalEngine?: string }).finalEngine) : '-'}
                            </Badge>
                          </div>
                          <div className="truncate text-xs text-gray-600">{result.selectedCapabilityId ?? '未命中'}</div>
                          <div className="mt-1 text-xs text-gray-500">置信度 {formatPercent(result.confidence)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <ComparisonSummaryPanel comparison={debugResult.comparison} />
                  <ManifestSimulationPanel simulation={debugResult.simulation} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <StatTile label="命中能力" value={debugResult.selectedCapabilityId ?? '-'} icon={Sparkles} tone="sky" />
                    <StatTile label="置信度" value={formatPercent(debugResult.confidence)} icon={ShieldCheck} tone="emerald" />
                    <StatTile label="Dry Run" value={debugResult.dryRun ? '是' : '否'} icon={CheckCircle2} tone="slate" />
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-sm text-gray-700">{debugResult.reason ?? debugResult.note ?? '-'}</div>
                  <DebugContextPanel context={debugResult.debugContext} />
                  <GraphPreprocessPanel trace={debugResult.graphTrace} />
                  {debugResult.llmTrace ? (
                    <JsonBlock title="LLM Prompt / Response" value={debugResult.llmTrace} maxHeight="max-h-72" />
                  ) : null}
                  <PolicyDecisionPanel trace={debugResult.policyTrace} />
                  <QueryReplayPanel replay={debugResult.queryReplay} />
                  {debugResult.toolReplay?.requested ? (
                    <JsonBlock title="只读工具执行" value={debugResult.toolReplay} maxHeight="max-h-72" />
                  ) : null}
                  {debugResult.contractReplay?.requested ? (
                    <JsonBlock title="契约与最终 blocks" value={debugResult.contractReplay} maxHeight="max-h-72" />
                  ) : null}
                  <JsonBlock title="完整调试载荷" value={debugResult} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-gray-500">暂无调试结果</div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <DialogContent className="sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>运行详情</DialogTitle>
            <DialogDescription>{runDetail?.run.runNo ?? '加载中'}</DialogDescription>
          </DialogHeader>
          {runDetailLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载运行详情
            </div>
          ) : runDetail ? (
            <div className="space-y-4">
              <RunDetailTracePanel detail={runDetail} />
              <EvidenceAuditPanel detail={runDetail} />
              <div className="grid gap-4 lg:grid-cols-2">
                <JsonBlock title="链路回放" value={runDetail.replay} />
                <JsonBlock title="运行" value={runDetail.run} />
                <JsonBlock title="工具调用" value={runDetail.toolCalls} />
                <JsonBlock title="消息" value={runDetail.messages} />
                <JsonBlock title="审批" value={runDetail.approvals} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={evalFailuresOpen} onOpenChange={setEvalFailuresOpen}>
        <DialogContent className="sm:max-w-[1040px]">
          <DialogHeader>
            <DialogTitle>评测失败样例</DialogTitle>
            <DialogDescription>
              {evalFailureRun ? `运行 #${evalFailureRun.id} · ${formatDateTime(evalFailureRun.createdAt)}` : '加载中'}
            </DialogDescription>
          </DialogHeader>
          {evalFailuresLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载失败样例
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <StatTile label="失败样例" value={String(evalFailures?.total ?? 0)} icon={AlertTriangle} tone={(evalFailures?.total ?? 0) > 0 ? 'amber' : 'emerald'} />
                <StatTile label="运行状态" value={evalFailures?.run.status ?? '-'} icon={ShieldCheck} tone={evalFailures?.run.status === 'pass' ? 'emerald' : 'rose'} />
                <StatTile label="分数" value={formatMetric(typeof evalFailures?.run.score === 'string' ? Number(evalFailures.run.score) : evalFailures?.run.score)} icon={Activity} tone="slate" />
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-sm text-gray-700">
                {evalFailures?.summary ?? '暂无失败样例。'}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>分类</TableHead>
                    <TableHead>问题</TableHead>
                    <TableHead>预期能力</TableHead>
                    <TableHead>实际能力</TableHead>
                    <TableHead>原因</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evalFailures?.items.length ? evalFailures.items.map((failure, itemIndex) => {
                    const replayKey = `${failure.category}:${failure.index ?? failure.id ?? 'first'}`;
                    const dryReplayKey = `${replayKey}:dry`;
                    const toolReplayKey = `${replayKey}:tool`;
                    const replayingThisRow = evalReplayLoadingKey === dryReplayKey || evalReplayLoadingKey === toolReplayKey;
                    return (
                      <TableRow key={`${failure.category}-${failure.index ?? failure.id ?? itemIndex}`}>
                        <TableCell><Badge className={getSeverityClass(failure.severity)}>{failure.category}</Badge></TableCell>
                        <TableCell className="max-w-[260px] truncate">{failure.question ?? failure.title ?? '-'}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">{failure.expectedCapabilityId ?? failure.expected ?? '-'}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">{failure.actualCapabilityId ?? failure.actual ?? '-'}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs text-gray-500">{failure.reason ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void replayEvalFailure(failure)}
                              disabled={replayingThisRow || !failure.question}
                            >
                              {evalReplayLoadingKey === dryReplayKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dry-run 回放'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void replayEvalFailure(failure, { toolReplay: true })}
                              disabled={replayingThisRow || !failure.question}
                            >
                              {evalReplayLoadingKey === toolReplayKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <ShieldCheck className="h-4 w-4" />
                                  只读工具回放
                                </>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <EmptyRow colSpan={6} text="暂无失败样例" />
                  )}
                </TableBody>
              </Table>

              {evalReplayResult ? (
                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">回放诊断</div>
                      <div className="mt-1 text-sm text-gray-600">{evalReplayResult.diagnosis.message}</div>
                    </div>
                    <Badge className={getStatusClass(evalReplayResult.diagnosis.status)}>
                      {evalReplayResult.diagnosis.status}
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <StatTile label="预期能力" value={evalReplayResult.comparison.expectedCapabilityId ?? '-'} icon={Target} tone="slate" />
                    <StatTile label="原实际能力" value={evalReplayResult.comparison.previousActualCapabilityId ?? '-'} icon={GitBranch} tone="amber" />
                    <StatTile label="当前回放" value={evalReplayResult.comparison.replayCapabilityId ?? '-'} icon={Sparkles} tone={evalReplayResult.comparison.replayMatchedExpected ? 'emerald' : 'rose'} />
                  </div>

                  <DebugContextPanel context={evalReplayResult.replay.debugContext} />
                  <GraphPreprocessPanel trace={evalReplayResult.replay.graphTrace} />
                  <PolicyDecisionPanel trace={evalReplayResult.replay.policyTrace} />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <JsonBlock title="回放安全边界" value={evalReplayResult.safety} maxHeight="max-h-40" />
                    <JsonBlock title="回放载荷" value={evalReplayResult.replay} maxHeight="max-h-72" />
                  </div>
                  {evalReplayResult.toolReplay?.requested ? (
                    <JsonBlock title="只读工具回放" value={evalReplayResult.toolReplay} maxHeight="max-h-72" />
                  ) : null}
                  <QueryReplayPanel replay={evalReplayResult.queryReplay} title="Query Plan / SQL 回放" />
                  {evalReplayResult.contractReplay?.requested ? (
                    <JsonBlock title="契约与渲染回放" value={evalReplayResult.contractReplay} maxHeight="max-h-72" />
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={nodeDetailOpen} onOpenChange={setNodeDetailOpen}>
        <DialogContent className="sm:max-w-[1040px]">
          <DialogHeader>
            <DialogTitle>图谱节点详情</DialogTitle>
            <DialogDescription>{nodeDetail?.node.id ?? '加载中'}</DialogDescription>
          </DialogHeader>
          {nodeDetail ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">{nodeDetail.node.displayName ?? nodeDetail.node.name}</span>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-700">{nodeDetail.node.type}</Badge>
                      <Badge className="border-sky-200 bg-sky-50 text-sky-700">{formatPercent(nodeDetail.node.confidence)}</Badge>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-gray-500">{nodeDetail.node.id}</div>
                    {nodeDetail.node.description ? <div className="mt-2 text-sm text-gray-600">{nodeDetail.node.description}</div> : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" size="sm" onClick={() => applyNodeToGovernance(nodeDetail.node.id, 'synonym')}>设为同义词目标</Button>
                    <Button variant="outline" size="sm" onClick={() => applyNodeToGovernance(nodeDetail.node.id, 'excludeFrom')}>设为互斥来源</Button>
                    <Button variant="outline" size="sm" onClick={() => applyNodeToGovernance(nodeDetail.node.id, 'excludeTo')}>设为互斥目标</Button>
                    <Button variant="outline" size="sm" onClick={() => applyNodeToGovernance(nodeDetail.node.id, 'pathFrom')}>设为路径起点</Button>
                    <Button variant="outline" size="sm" onClick={() => applyNodeToGovernance(nodeDetail.node.id, 'pathTo')}>设为路径终点</Button>
                    <Button variant="outline" size="sm" onClick={() => setKgFocusNodeId(nodeDetail.node.id)}>图谱聚焦</Button>
                    {nodeDetail.node.type === 'Word' ? (
                      <Button variant="outline" size="sm" onClick={() => applyWordNodeToSynonym(nodeDetail)}>进入同义词治理</Button>
                    ) : null}
                    {isIsolatedGraphNode(nodeDetail) ? (
                      <Button variant="outline" size="sm" onClick={() => createGapAlertFromNode(nodeDetail)}>创建缺口告警</Button>
                    ) : null}
                    {nodeDetail.node.type === 'Capability' ? (
                      <a
                        href={getCapabilityCenterUrl(nodeDetail.node)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-3 text-sm font-medium text-gray-700 hover:bg-accent"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        进入能力中心
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-800">关联关系</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>方向</TableHead>
                        <TableHead>关系</TableHead>
                        <TableHead>对端节点</TableHead>
                        <TableHead>来源</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...nodeDetail.outgoing.map((edge) => ({ edge, direction: '出边', otherId: edge.to })), ...nodeDetail.incoming.map((edge) => ({ edge, direction: '入边', otherId: edge.from }))].slice(0, 80).map(({ edge, direction, otherId }) => {
                        const related = nodeDetail.relatedNodes?.find((node) => node.id === otherId);
                        return (
                          <TableRow key={`${direction}-${edge.id}`}>
                            <TableCell className="whitespace-nowrap">{direction}</TableCell>
                            <TableCell>
                              <Badge className="border-slate-200 bg-slate-50 text-slate-700">{edge.type}</Badge>
                              {edge.label ? <div className="mt-1 text-xs text-gray-500">{edge.label}</div> : null}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="text-left text-sm font-medium text-sky-700 hover:underline"
                                onClick={() => void openNodeDetail(otherId)}
                              >
                                {related?.displayName ?? related?.name ?? otherId}
                              </button>
                              <div className="mt-1 max-w-[320px] truncate font-mono text-xs text-gray-500">{otherId}</div>
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs text-gray-500">{edge.sourcePath ?? edge.source}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!nodeDetail.outgoing.length && !nodeDetail.incoming.length ? <EmptyRow colSpan={4} text="暂无关联关系" /> : null}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 text-sm font-semibold text-gray-800">关联节点</div>
                    <div className="space-y-2">
                      {(nodeDetail.relatedNodes ?? []).slice(0, 16).map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-2 text-left hover:bg-muted"
                          onClick={() => void openNodeDetail(node.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-800">{node.displayName ?? node.name}</span>
                            <span className="block truncate font-mono text-xs text-gray-500">{node.id}</span>
                          </span>
                          <span className="shrink-0 text-xs text-gray-500">{node.type}</span>
                        </button>
                      ))}
                      {!(nodeDetail.relatedNodes ?? []).length ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">暂无关联节点</div> : null}
                    </div>
                  </div>
                  <JsonBlock title="节点原始数据" value={nodeDetail.node} maxHeight="max-h-56" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载节点详情
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={autoPublishDetailOpen} onOpenChange={setAutoPublishDetailOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>自动发布日志</DialogTitle>
            <DialogDescription>{autoPublishDetail?.runNo ?? '加载中'}</DialogDescription>
          </DialogHeader>
          {autoPublishDetail ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonBlock title="输入" value={autoPublishDetail.input} />
              <JsonBlock title="结果" value={autoPublishDetail.result ?? autoPublishDetail.errorMessage} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载发布日志
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
