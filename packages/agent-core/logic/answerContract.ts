import type { AuraResponseBlock } from '../types/blocks';
import type { AgentEvidence, AgentSuggestedAction, AgentToolResult } from '../types/result';

export interface AgentAnswerDisplayInput {
  status?: string | null;
  renderedBlocks?: AuraResponseBlock[] | null;
  followUpSuggestions?: string[] | null;
  evidence?: AgentEvidence | null;
  actions?: AgentSuggestedAction[] | null;
  toolResults?: AgentToolResult[] | null;
  limitations?: string[] | null;
  answerContract?: {
    warnings?: string[] | null;
    errors?: string[] | null;
  } | null;
}

export type AgentAnswerStatusKind = 'no_data' | 'unsupported' | 'failed';

export interface AgentAnswerStatusNotice {
  kind: AgentAnswerStatusKind;
  title: string;
  message: string;
}

export interface AgentAnswerDisplayModel {
  blocks: AuraResponseBlock[];
  followUpSuggestions: string[];
  evidence?: AgentEvidence;
  actions: AgentSuggestedAction[];
  limitations: string[];
  statusNotice?: AgentAnswerStatusNotice;
}

export function getAgentResultDisplayBlocks(result: AgentAnswerDisplayInput): AuraResponseBlock[] {
  return (result.renderedBlocks ?? []).filter((block) => block.kind !== 'follow_up_chips');
}

export function getAgentResultFollowUps(
  result: AgentAnswerDisplayInput,
  options: { maxSuggestions?: number } = {},
): string[] {
  const maxSuggestions = options.maxSuggestions ?? 3;
  const topLevel = normalizeStrings(result.followUpSuggestions);
  const fallback = normalizeStrings(
    (result.renderedBlocks ?? [])
      .filter((block): block is Extract<AuraResponseBlock, { kind: 'follow_up_chips' }> => block.kind === 'follow_up_chips')
      .flatMap((block) => block.suggestions),
  );
  return uniqueStrings(topLevel.length ? topLevel : fallback).slice(0, maxSuggestions);
}

export function getAgentResultEvidence(result: AgentAnswerDisplayInput): AgentEvidence | undefined {
  if (result.evidence) return result.evidence;
  return result.toolResults?.find((toolResult) => toolResult.evidence)?.evidence;
}

export function getAgentResultActions(result: AgentAnswerDisplayInput): AgentSuggestedAction[] {
  const actions = result.actions?.length
    ? result.actions
    : (result.toolResults ?? []).flatMap((toolResult) => toolResult.actions ?? []);
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.action}::${action.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getAgentResultLimitations(result: AgentAnswerDisplayInput): string[] {
  const evidence = getAgentResultEvidence(result);
  const evidencePanelLimitations = (result.renderedBlocks ?? [])
    .filter((block): block is Extract<AuraResponseBlock, { kind: 'evidence_panel' }> => block.kind === 'evidence_panel')
    .flatMap((block) => block.limitations ?? []);

  return uniqueStrings([
    ...normalizeStrings(result.limitations),
    ...normalizeStrings(evidence?.limitations),
    ...normalizeStrings(evidencePanelLimitations),
    ...normalizeStrings(result.answerContract?.warnings),
  ]);
}

export function getAgentResultStatusNotice(result: AgentAnswerDisplayInput): AgentAnswerStatusNotice | undefined {
  const toolResults = result.toolResults ?? [];
  const hasSuccess = toolResults.some((toolResult) => toolResult.status === 'success');
  const contractErrors = normalizeStrings(result.answerContract?.errors);

  if (result.status === 'failed' || contractErrors.length || (!hasSuccess && toolResults.some((toolResult) => toolResult.status === 'failed'))) {
    return {
      kind: 'failed',
      title: '执行失败',
      message: contractErrors[0] ?? toolResults.find((toolResult) => toolResult.status === 'failed')?.summary ?? '本次分析未能完成，请稍后重试或换一种问法。',
    };
  }

  if (!hasSuccess && toolResults.some((toolResult) => toolResult.status === 'unsupported')) {
    return {
      kind: 'unsupported',
      title: '暂不支持',
      message: toolResults.find((toolResult) => toolResult.status === 'unsupported')?.summary ?? '当前能力暂不支持这个问题，建议换成经营、客户、预约、库存或财务相关查询。',
    };
  }

  if (!hasSuccess && toolResults.some((toolResult) => toolResult.status === 'no_data')) {
    return {
      kind: 'no_data',
      title: '暂无数据',
      message: toolResults.find((toolResult) => toolResult.status === 'no_data')?.summary ?? '当前筛选条件下暂无可用业务数据。',
    };
  }

  return undefined;
}

export function getAgentResultDisplayModel(result: AgentAnswerDisplayInput): AgentAnswerDisplayModel {
  return {
    blocks: getAgentResultDisplayBlocks(result),
    followUpSuggestions: getAgentResultFollowUps(result),
    evidence: getAgentResultEvidence(result),
    actions: getAgentResultActions(result),
    limitations: getAgentResultLimitations(result),
    statusNotice: getAgentResultStatusNotice(result),
  };
}

function normalizeStrings(values?: Array<string | null | undefined> | null): string[] {
  return (values ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
