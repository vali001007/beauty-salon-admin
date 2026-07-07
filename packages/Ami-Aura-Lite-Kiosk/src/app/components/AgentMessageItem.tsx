import React from "react";
import { Sparkles } from "lucide-react";
import { getAgentResultDisplayModel } from "@ami/agent-core";
import type { AgentRunResult, AuraResponseBlock } from "@/types/agent";
import { FollowUpChips } from "./FollowUpChips";
import { AgentFeedback } from "./AgentFeedback";
import { AgentRunResultCard } from "./RoleDashboards";

const LazyBlockRenderer = React.lazy(() =>
  import("./BlockRenderer").then((module) => ({ default: module.BlockRenderer })),
);

type AgentRunWithBlocks = AgentRunResult & {
  renderedBlocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
};

export interface AgentMessageItemProps {
  data: AgentRunWithBlocks;
  onCommand?: (command: string) => void;
  onAction?: (action: string, label?: string) => void;
  onApprove?: (approvalId: number) => void;
  onReject?: (approvalId: number) => void;
  onFeedback?: (runId: number, adopted: boolean) => Promise<void> | void;
}

function getStatusLabel(status: AgentRunResult["status"]) {
  const labels: Record<string, string> = {
    created: "已创建",
    planning: "规划中",
    validating: "校验中",
    running_tool: "查询中",
    waiting_approval: "待确认",
    composing: "生成中",
    completed: "已完成",
    failed: "执行失败",
    cancelled: "已取消",
  };
  return labels[status] ?? status;
}

function getStatusClass(status: AgentRunResult["status"]) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "waiting_approval") return "bg-amber-50 text-amber-700";
  if (status === "failed" || status === "cancelled") return "bg-rose-50 text-rose-600";
  return "bg-[#F7F5F2] text-[#6F6678]";
}

function getEvidenceText(evidence: AgentRunWithBlocks["evidence"]) {
  if (!evidence) return "";
  const source = evidence.source?.length ? evidence.source.join("、") : "Ami_Core";
  const range = evidence.dateRange ? ` · ${evidence.dateRange}` : "";
  return `数据来源 · ${source}${range}`;
}

const personaLabels: Record<string, string> = {
  manager: "店长经营 Agent",
  marketing: "营销增长 Agent",
  reception: "前台接待 Agent",
  beautician: "美容师服务 Agent",
  inventory: "库存采购 Agent",
  finance: "财务风控 Agent",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArchitectureLabel(value: unknown) {
  const architecture = String(value ?? "");
  const labels: Record<string, string> = {
    agent_v2_kg_llm: "KG+LLM",
    kg_llm_agent: "KG+LLM",
    agent_v2_shadow: "V2 Shadow",
    agent_v2_legacy_fallback: "V2 回退",
    agent_v2_kg_llm_retired: "旧链退役",
    agent_v2: "Agent V2",
    agent_v3_text_to_sql: "V3 数据分析",
    agent_v3: "Agent V3",
    agent_v1: "Agent V1",
  };
  return labels[architecture] ?? architecture;
}

function getAgentArchitectureMeta(data: AgentRunWithBlocks) {
  const plan = asRecord(data.plan);
  const businessTask = asRecord(plan.businessTask);
  const strategy = asRecord(businessTask.agentV2GrayStrategy);
  const architecture = businessTask.architecture ?? asRecord(data).architecture;
  const architectureLabel = architecture ? getArchitectureLabel(architecture) : "";
  const mode = typeof strategy.mode === "string" ? strategy.mode : "";
  const finalEngine = typeof strategy.finalEngine === "string" ? strategy.finalEngine : "";
  return {
    architectureLabel,
    mode,
    finalEngine,
  };
}

function getRouteText(data: AgentRunWithBlocks) {
  const personaCode = data.routeDecision?.personaCode ?? data.personaCode;
  if (!personaCode) return "";
  return `由 ${personaLabels[String(personaCode)] ?? `${personaCode} Agent`} 处理`;
}

function hasAnswerBlock(blocks: AuraResponseBlock[]) {
  return blocks.some((block) => block.kind === "text" || block.kind === "summary_text");
}

function hasEvidencePanel(blocks: AuraResponseBlock[]) {
  return blocks.some((block) => block.kind === "evidence_panel");
}

function getEmbeddedActionKeys(blocks: AuraResponseBlock[]) {
  const keys = new Set<string>();
  const add = (value?: string) => {
    const normalized = value?.trim();
    if (normalized) keys.add(normalized);
  };

  blocks.forEach((block) => {
    if ("actions" in block) {
      block.actions?.forEach((action) => {
        add(action.actionId);
        add(action.label);
      });
    }
    if (block.kind === "confirm_action" || block.kind === "action_card") {
      add(block.actionId);
      add(block.title);
    }
    if (block.kind === "alert") {
      add(block.actionId);
    }
  });

  return keys;
}

function hasEmbeddedActionSurface(blocks: AuraResponseBlock[]) {
  return blocks.some((block) => {
    if (block.kind === "confirm_action" || block.kind === "action_card") return true;
    if (block.kind === "alert" && block.actionId) return true;
    return "actions" in block && Boolean(block.actions?.length);
  });
}

function getStatusNoticeClass(kind: string) {
  if (kind === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (kind === "unsupported") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function AgentMessageItem({
  data,
  onCommand,
  onAction,
  onApprove,
  onReject,
  onFeedback,
}: AgentMessageItemProps) {
  const displayModel = getAgentResultDisplayModel(data);
  const blocks = displayModel.blocks;
  const evidenceText = getEvidenceText(displayModel.evidence);
  const suggestedActions = displayModel.actions;
  const limitations = displayModel.limitations;
  const statusNotice = displayModel.statusNotice;
  const routeText = getRouteText(data);
  const architectureMeta = getAgentArchitectureMeta(data);
  const shouldRenderAnswer = Boolean(data.answer) && !hasAnswerBlock(blocks);
  const shouldRenderEvidence = Boolean(evidenceText) && !hasEvidencePanel(blocks);
  const embeddedActionKeys = getEmbeddedActionKeys(blocks);
  const visibleActions = hasEmbeddedActionSurface(blocks)
    ? []
    : suggestedActions.filter((action) => !embeddedActionKeys.has(action.action) && !embeddedActionKeys.has(action.label));
  const visibleActionKeys = new Set<string>(embeddedActionKeys);
  visibleActions.forEach((action) => {
    visibleActionKeys.add(action.action);
    visibleActionKeys.add(action.label);
  });
  const followUps = displayModel.followUpSuggestions.filter((suggestion) => !visibleActionKeys.has(suggestion));

  if (
    !blocks.length &&
    !followUps.length &&
    !evidenceText &&
    !limitations.length &&
    !visibleActions.length &&
    !statusNotice &&
    !routeText &&
    !architectureMeta.architectureLabel
  ) {
    return (
      <div className="grid gap-2">
        <AgentRunResultCard data={data} onAction={onAction} onApprove={onApprove} onReject={onReject} />
        <AgentFeedback runId={data.runId} onFeedback={onFeedback} />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#2D1B69]/8 text-[#2D1B69]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#2D1B69]">Ami 智能问答</div>
              <div className="mt-1 text-xs text-[#6F6678]">{data.plan?.goal ?? "基于 Ami_Core 经营数据"}</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {routeText ? (
              <span className="rounded-full bg-[#2D1B69]/5 px-3 py-1 text-xs font-medium text-[#2D1B69]">
                {routeText}
              </span>
            ) : null}
            {architectureMeta.architectureLabel ? (
              <span
                className="rounded-full bg-[#C9956C]/10 px-3 py-1 text-xs font-medium text-[#8A5D38]"
                title={[
                  architectureMeta.mode ? `灰度：${architectureMeta.mode}` : "",
                  architectureMeta.finalEngine ? `最终引擎：${architectureMeta.finalEngine}` : "",
                ].filter(Boolean).join(" · ")}
              >
                {architectureMeta.architectureLabel}
                {architectureMeta.mode ? ` · ${architectureMeta.mode}` : ""}
              </span>
            ) : null}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(data.status)}`}>
              {getStatusLabel(data.status)}
            </span>
          </div>
        </div>

        {shouldRenderAnswer ? <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-[#1F1B2D]">{data.answer}</p> : null}
        {blocks.length ? (
          <React.Suspense fallback={<div className="text-xs text-[#6F6678]">正在加载结构化内容...</div>}>
            <LazyBlockRenderer blocks={blocks} onCommand={onCommand} onAction={onAction} />
          </React.Suspense>
        ) : null}

        {statusNotice ? (
          <div className={`mt-3 rounded-xl border px-3 py-3 text-xs leading-5 ${getStatusNoticeClass(statusNotice.kind)}`}>
            <div className="font-semibold">{statusNotice.title}</div>
            <div className="mt-1 opacity-90">{statusNotice.message}</div>
          </div>
        ) : null}

        {data.approval ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
            <div className="font-semibold">待确认动作 · {data.approval.riskLevel}</div>
            {data.approval.reason ? <div className="mt-1 text-amber-700">{data.approval.reason}</div> : null}
            {data.approval.status === "pending" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onApprove?.(data.approval!.id)}
                  className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-medium text-white shadow-sm"
                >
                  确认执行
                </button>
                <button
                  type="button"
                  onClick={() => onReject?.(data.approval!.id)}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 shadow-sm"
                >
                  暂不执行
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {shouldRenderEvidence ? <div className="mt-3 text-xs text-[#6F6678]">{evidenceText}</div> : null}
        {limitations.length ? (
          <div className="mt-2 text-xs leading-5 text-[#8A7F91]">
            限制说明：{limitations.join("；")}
          </div>
        ) : null}
        {visibleActions.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleActions.slice(0, 3).map((action) => (
              <button
                key={`${action.action}-${action.label}`}
                type="button"
                onClick={() => onAction?.(action.action, action.label)}
                className="rounded-xl border border-[#2D1B69]/15 bg-[#2D1B69]/5 px-3 py-2 text-xs font-medium text-[#2D1B69]"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {followUps.length ? <FollowUpChips suggestions={followUps} onSelect={(suggestion) => onCommand?.(suggestion)} /> : null}
      <AgentFeedback runId={data.runId} onFeedback={onFeedback} />
    </div>
  );
}
