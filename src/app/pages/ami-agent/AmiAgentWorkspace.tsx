import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, ChevronRight, RefreshCw, Play, Zap } from 'lucide-react';
import { getAgentResultDisplayModel, useAgentConversation, usePersona, type AgentConversationMessage } from '@ami/agent-core';
import type {
  AgentAutomationDefinitionItem,
  AgentAutomationRunItem,
  AgentAutomationTriggerTemplate,
  AgentDailyArchiveItem,
  AgentMemoryItem,
  AgentPersonaSummary,
  AgentQualityReport,
  AgentRole,
  AgentApprovalListItem,
  AgentEvalSummary,
  AgentFeedbackFailureReport,
  AgentKnowledgeGovernance,
  AgentKnowledgeGovernanceReportSummary,
  AgentSchemaReadiness,
  AgentPhaseOutput,
  AgentRunDetail,
  AgentRunRecord,
  AuraResponseBlock,
} from '@/types/agent';
import {
  createAgentRun,
  appendAgentMessage,
  approveAgentApproval,
  generateAgentDailyArchive,
  getAgentAutomations,
  getAgentAutomationRuns,
  getAgentAutomationTriggers,
  getAgentApprovalsPaginated,
  getAgentDailyArchives,
  getAgentFeedbackFailures,
  getAgentKnowledgeGovernance,
  getAgentMemories,
  getAgentPersonas,
  getAgentQualityReport,
  getAgentRunDetail,
  getAgentRunsPaginated,
  getAgentSchemaReadiness,
  rejectAgentApproval,
  runDefaultAgentEvals,
  runAgentAutomationOnce,
  submitAgentFeedback,
  updateAgentPersona,
} from '@/api/real/agent';
import {
  appendAgentV2Message,
  createAgentV2Run,
  getAgentV2RunDetail,
  getAgentV2RunsPaginated,
} from '@/api/real/agentV2';
import { useStoreStore } from '@/stores/storeStore';
import { useAuthStore } from '@/stores/authStore';
import { AgentBlockRenderer, AgentPhaseOutputRenderer } from './components/AgentBlockRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationMessage extends AgentConversationMessage {
  blocks?: AuraResponseBlock[];
  phaseOutputs?: AgentPhaseOutput[];
  architecture?: string;
  agentV2GrayMode?: string;
  agentV2FinalEngine?: string;
}

type AgentWorkspaceTab = 'debug' | 'audit' | 'approvals' | 'personas' | 'eval' | 'quality' | 'knowledge';
type AgentRuntimeMode = 'agent_v1' | 'agent_v2';
type AgentV2GrayMode = 'legacy_regex' | 'shadow' | 'kg_llm_preferred' | 'kg_llm_only' | 'legacy_retired';

const AGENT_RUNTIME_MODE_STORAGE_KEY = 'ami.agent.workspace.runtimeMode';
const AGENT_V2_GRAY_MODE_STORAGE_KEY = 'ami.agent.workspace.v2GrayMode';
const AGENT_RUNTIME_OPTIONS: Array<{ value: AgentRuntimeMode; label: string; description: string }> = [
  { value: 'agent_v1', label: 'Agent V1', description: '旧工具链' },
  { value: 'agent_v2', label: 'Agent V2', description: '能力目录' },
];
const AGENT_V2_GRAY_MODE_OPTIONS: Array<{ value: AgentV2GrayMode; label: string; description: string }> = [
  { value: 'kg_llm_preferred', label: '优先', description: 'KG+LLM 优先' },
  { value: 'shadow', label: 'Shadow', description: '旁路观测' },
  { value: 'kg_llm_only', label: '仅新链', description: '不走旧链' },
  { value: 'legacy_regex', label: '旧链', description: '正则链路' },
  { value: 'legacy_retired', label: '退役', description: '旧链退役' },
];

const AGENT_WORKSPACE_TABS: Array<{ key: AgentWorkspaceTab; label: string; description: string }> = [
  { key: 'debug', label: '对话调试', description: '验证 Persona、Planner、工具调用和富输出' },
  { key: 'audit', label: '运行审计', description: '追踪 AgentRun、终端来源、工具调用和证据' },
  { key: 'approvals', label: '审批管理', description: '处理中高风险动作确认' },
  { key: 'personas', label: 'Persona 配置', description: '查看六大角色 Agent 能力边界' },
  { key: 'eval', label: '评测集', description: '运行默认评测并查看失败项' },
  { key: 'quality', label: '质量大盘', description: '汇总反馈、失败率和能力缺口' },
  { key: 'knowledge', label: '语义治理', description: '查看图谱、能力目录、Eval 门禁和旧规则' },
];

type AgentActionPayload = {
  args?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getResultBusinessTask(result: unknown): Record<string, unknown> {
  const plan = asRecord(asRecord(result).plan);
  return asRecord(plan.businessTask);
}

function resolveAgentRuntimeMode(value: string | null | undefined): AgentRuntimeMode {
  return value === 'agent_v2' ? 'agent_v2' : 'agent_v1';
}

function getStoredAgentRuntimeMode(): AgentRuntimeMode {
  if (typeof window === 'undefined') return 'agent_v1';
  return resolveAgentRuntimeMode(window.localStorage.getItem(AGENT_RUNTIME_MODE_STORAGE_KEY));
}

function resolveAgentV2GrayMode(value: string | null | undefined): AgentV2GrayMode {
  if (
    value === 'legacy_regex' ||
    value === 'shadow' ||
    value === 'kg_llm_preferred' ||
    value === 'kg_llm_only' ||
    value === 'legacy_retired'
  ) {
    return value;
  }
  return 'kg_llm_preferred';
}

function getStoredAgentV2GrayMode(): AgentV2GrayMode {
  if (typeof window === 'undefined') return 'kg_llm_preferred';
  return resolveAgentV2GrayMode(window.localStorage.getItem(AGENT_V2_GRAY_MODE_STORAGE_KEY));
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export function AmiAgentWorkspace() {
  const navigate = useNavigate();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const user = useAuthStore((s) => s.user);
  const agentRole = useMemo(() => resolveAgentRole(user?.roles), [user?.roles]);
  const [agentRuntimeMode, setAgentRuntimeMode] = useState<AgentRuntimeMode>(getStoredAgentRuntimeMode);
  const [agentV2GrayMode, setAgentV2GrayMode] = useState<AgentV2GrayMode>(getStoredAgentV2GrayMode);

  const [input, setInput] = useState('');
  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  const [archives, setArchives] = useState<AgentDailyArchiveItem[]>([]);
  const [qualityReport, setQualityReport] = useState<AgentQualityReport | null>(null);
  const [automationTriggers, setAutomationTriggers] = useState<AgentAutomationTriggerTemplate[]>([]);
  const [automations, setAutomations] = useState<AgentAutomationDefinitionItem[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AgentAutomationRunItem[]>([]);
  const [schemaReadiness, setSchemaReadiness] = useState<AgentSchemaReadiness | null>(null);
  const [memoryMigrationPending, setMemoryMigrationPending] = useState(false);
  const [archiveMigrationPending, setArchiveMigrationPending] = useState(false);
  const [automationMigrationPending, setAutomationMigrationPending] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentWorkspaceTab>('debug');
  const [auditEntrypoint, setAuditEntrypoint] = useState('terminal:kiosk');
  const [auditStatus, setAuditStatus] = useState('');
  const [auditRole, setAuditRole] = useState('');
  const [auditPersonaCode, setAuditPersonaCode] = useState('');
  const [auditKeyword, setAuditKeyword] = useState('');
  const [auditRuns, setAuditRuns] = useState<AgentRunRecord[]>([]);
  const [auditRunDetail, setAuditRunDetail] = useState<AgentRunDetail | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [approvals, setApprovals] = useState<AgentApprovalListItem[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [evalSummary, setEvalSummary] = useState<AgentEvalSummary | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [feedbackFailures, setFeedbackFailures] = useState<AgentFeedbackFailureReport | null>(null);
  const [knowledgeGovernance, setKnowledgeGovernance] = useState<AgentKnowledgeGovernance | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeCapabilityId, setKnowledgeCapabilityId] = useState('');
  const [knowledgePersonaCode, setKnowledgePersonaCode] = useState('');
  const [knowledgeRiskLevel, setKnowledgeRiskLevel] = useState('');
  const [knowledgeDomain, setKnowledgeDomain] = useState('');
  const [knowledgeDebugText, setKnowledgeDebugText] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<React.ElementRef<'textarea'>>(null);
  const showPersonaDebug = useMemo(() => {
    const debugFromUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugPersona') === '1';
    return debugFromUrl || import.meta.env.VITE_AMI_AGENT_SHOW_PERSONA_SWITCHER === 'true';
  }, []);

  const personaApi = useMemo(() => ({ getPersonas: getAgentPersonas }), []);
  const {
    personas,
    activePersona,
    changePersona,
    reload: reloadPersonas,
    setActivePersona,
  } = usePersona({
    api: personaApi,
    role: agentRole,
    filterByRole: false,
  });
  const unifiedSuggestedQuestions = useMemo(
    () => Array.from(new Set(personas.flatMap((persona) => persona.suggestedQuestions))).slice(0, 4),
    [personas],
  );

  const agentRuntimeContext = useMemo(
    () => ({
      ...(showPersonaDebug ? { debugTrace: true } : {}),
      agentEngine: agentRuntimeMode,
      architecture: agentRuntimeMode === 'agent_v2' ? 'kg_llm_agent' : 'agent_v1',
      ...(agentRuntimeMode === 'agent_v2' ? { agentV2GrayMode } : {}),
    }),
    [agentRuntimeMode, agentV2GrayMode, showPersonaDebug],
  );

  const conversationApi = useMemo(
    () => ({
      createRun: agentRuntimeMode === 'agent_v2' ? createAgentV2Run : createAgentRun,
      appendMessage: agentRuntimeMode === 'agent_v2' ? appendAgentV2Message : appendAgentMessage,
      submitFeedback: submitAgentFeedback,
    }),
    [agentRuntimeMode],
  );
  const {
    messages,
    sending,
    sendMessage: sendAgentMessage,
    submitFeedback: submitAgentConversationFeedback,
    updateLastAgentMessage,
    reset: resetConversation,
  } = useAgentConversation<ConversationMessage>({
    api: conversationApi,
    role: agentRole,
    entrypoint: showPersonaDebug ? `ami-agent:${activePersona?.code ?? 'manager'}` : 'ami-agent:auto',
    personaCode: showPersonaDebug ? activePersona?.code ?? 'manager' : undefined,
    context: agentRuntimeContext,
    formatError: formatAgentError,
    mapAgentResult: (result) => {
      const displayModel = getAgentResultDisplayModel(result);
      const businessTask = getResultBusinessTask(result);
      const grayStrategy = asRecord(businessTask.agentV2GrayStrategy);
      return {
        blocks: displayModel.blocks,
        followUpSuggestions: displayModel.followUpSuggestions,
        evidence: displayModel.evidence,
        actions: displayModel.actions,
        limitations: displayModel.limitations,
        phaseOutputs: (result as { phaseOutputs?: AgentPhaseOutput[] }).phaseOutputs,
        routeDecision: result.routeDecision,
        architecture: String(businessTask.architecture ?? (agentRuntimeMode === 'agent_v2' ? 'kg_llm_agent' : 'agent_v1')),
        agentV2GrayMode: typeof grayStrategy.mode === 'string'
          ? grayStrategy.mode
          : agentRuntimeMode === 'agent_v2'
            ? agentV2GrayMode
            : undefined,
        agentV2FinalEngine: typeof grayStrategy.finalEngine === 'string' ? grayStrategy.finalEngine : undefined,
      };
    },
  });

  // 自动滚动到最新消息
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadInsightPanel = useCallback(async () => {
    if (!currentStoreId) return;
    setInsightLoading(true);
    const personaCode = activePersona?.code;
    try {
      const [memoryResult, archiveResult, quality, schemaStatus] = await Promise.all([
        getAgentMemories({ personaCode, limit: 5 }),
        getAgentDailyArchives({ personaCode, pageSize: 3 }),
        getAgentQualityReport({ personaCode, days: 7 }),
        getAgentSchemaReadiness().catch(() => null),
      ]);
      const [triggerResult, automationResult, runResult] = await Promise.all([
        getAgentAutomationTriggers(),
        getAgentAutomations({ personaCode, pageSize: 3 }),
        getAgentAutomationRuns({ personaCode, pageSize: 3 }),
      ]);
      setMemories(memoryResult.items);
      setArchives(archiveResult.items);
      setQualityReport(quality);
      setSchemaReadiness(schemaStatus);
      setAutomationTriggers(triggerResult);
      setAutomations(automationResult.items);
      setAutomationRuns(runResult.items);
      setMemoryMigrationPending(Boolean(memoryResult.migrationPending));
      setArchiveMigrationPending(Boolean(archiveResult.migrationPending));
      setAutomationMigrationPending(Boolean(automationResult.migrationPending || runResult.migrationPending));
    } catch (error) {
      console.warn(error);
    } finally {
      setInsightLoading(false);
    }
  }, [activePersona?.code, currentStoreId]);

  useEffect(() => {
    void loadInsightPanel();
  }, [loadInsightPanel]);

  const handleAgentRuntimeModeChange = useCallback(
    (mode: AgentRuntimeMode) => {
      if (mode === agentRuntimeMode) return;
      setAgentRuntimeMode(mode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AGENT_RUNTIME_MODE_STORAGE_KEY, mode);
      }
      resetConversation();
      setInput('');
      setAuditRuns([]);
      setAuditRunDetail(null);
    },
    [agentRuntimeMode, resetConversation],
  );

  const handleAgentV2GrayModeChange = useCallback(
    (mode: AgentV2GrayMode) => {
      if (mode === agentV2GrayMode) return;
      setAgentV2GrayMode(mode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AGENT_V2_GRAY_MODE_STORAGE_KEY, mode);
      }
      if (agentRuntimeMode !== 'agent_v2') return;
      resetConversation();
      setInput('');
      setAuditRuns([]);
      setAuditRunDetail(null);
    },
    [agentRuntimeMode, agentV2GrayMode, resetConversation],
  );

  const loadAuditPanel = useCallback(async () => {
    setAuditLoading(true);
    try {
      const listRuns = agentRuntimeMode === 'agent_v2' ? getAgentV2RunsPaginated : getAgentRunsPaginated;
      const getRunDetail = agentRuntimeMode === 'agent_v2' ? getAgentV2RunDetail : getAgentRunDetail;
      const result = await listRuns({
        page: 1,
        pageSize: 20,
        ...(auditEntrypoint ? { entrypoint: auditEntrypoint } : {}),
        ...(auditStatus ? { status: auditStatus } : {}),
        ...(auditRole ? { role: auditRole } : {}),
        ...(auditPersonaCode ? { personaCode: auditPersonaCode } : {}),
        ...(auditKeyword.trim() ? { keyword: auditKeyword.trim() } : {}),
      });
      setAuditRuns(result.items);
      const firstRun = result.items[0];
      if (firstRun) {
        setAuditRunDetail(await getRunDetail(firstRun.id));
      } else {
        setAuditRunDetail(null);
      }
    } catch (error) {
      console.warn(error);
      setAuditRuns([]);
      setAuditRunDetail(null);
    } finally {
      setAuditLoading(false);
    }
  }, [agentRuntimeMode, auditEntrypoint, auditKeyword, auditPersonaCode, auditRole, auditStatus]);

  const loadApprovalsPanel = useCallback(async () => {
    setApprovalsLoading(true);
    try {
      const result = await getAgentApprovalsPaginated({ page: 1, pageSize: 20, status: 'pending' });
      setApprovals(result.items);
    } catch (error) {
      console.warn(error);
      setApprovals([]);
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  const loadEvalPanel = useCallback(async () => {
    setEvalLoading(true);
    try {
      const [summary, failures] = await Promise.all([
        runDefaultAgentEvals(),
        getAgentFeedbackFailures({ days: 7, personaCode: activePersona?.code, limit: 10 }).catch(() => null),
      ]);
      setEvalSummary(summary);
      setFeedbackFailures(failures);
    } catch (error) {
      console.warn(error);
    } finally {
      setEvalLoading(false);
    }
  }, [activePersona?.code]);

  const loadKnowledgePanel = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      setKnowledgeGovernance(await getAgentKnowledgeGovernance({
        capabilityId: knowledgeCapabilityId.trim() || undefined,
        personaCode: knowledgePersonaCode || undefined,
        riskLevel: knowledgeRiskLevel || undefined,
        domain: knowledgeDomain.trim() || undefined,
        q: knowledgeDebugText.trim() || undefined,
      }));
    } catch (error) {
      console.warn(error);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [knowledgeCapabilityId, knowledgeDebugText, knowledgeDomain, knowledgePersonaCode, knowledgeRiskLevel]);

  useEffect(() => {
    if (activeTab === 'audit') void loadAuditPanel();
    if (activeTab === 'approvals') void loadApprovalsPanel();
    if (activeTab === 'eval') void loadEvalPanel();
    if (activeTab === 'quality') void loadInsightPanel();
    if (activeTab === 'knowledge') void loadKnowledgePanel();
  }, [activeTab, loadApprovalsPanel, loadAuditPanel, loadEvalPanel, loadInsightPanel, loadKnowledgePanel]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      setInput('');
      await sendAgentMessage(text);
    },
    [sendAgentMessage, sending],
  );

  const handleKeyDown = (e: React.KeyboardEvent<React.ElementRef<'textarea'>>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handlePersonaChange = (persona: AgentPersonaSummary) => {
    changePersona(persona);
    resetConversation();
    setInput('');
  };

  const handlePersonaSave = async (
    code: AgentPersonaSummary['code'],
    data: { toolGroups?: string[]; suggestedQuestions?: string[] },
  ) => {
    const updated = await updateAgentPersona(code, data);
    const nextPersonas = await reloadPersonas();
    const nextActive = nextPersonas.find((persona) => persona.code === updated.code) ?? updated;
    setActivePersona(nextActive);
    return nextActive;
  };

  const handleFollowUp = (suggestion: string) => {
    void sendMessage(suggestion);
  };

  const handlePromptSelect = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleFeedback = async (runId: number, adopted: boolean) => {
    try {
      await submitAgentConversationFeedback(runId, { adopted });
      void loadInsightPanel();
    } catch {
      // 静默失败，反馈不影响主流程
    }
  };

  const handleGenerateArchive = async () => {
    try {
      await generateAgentDailyArchive({ personaCode: activePersona?.code });
      await loadInsightPanel();
    } catch (error) {
      console.warn(error);
    }
  };

  const handleRunAutomation = async (definitionId: number) => {
    try {
      await runAgentAutomationOnce(definitionId, { mode: 'manual', dryRun: true });
      await loadInsightPanel();
    } catch (error) {
      console.warn(error);
    }
  };

  const handleSelectAuditRun = async (runId: number) => {
    setAuditLoading(true);
    try {
      setAuditRunDetail(await (agentRuntimeMode === 'agent_v2' ? getAgentV2RunDetail(runId) : getAgentRunDetail(runId)));
    } catch (error) {
      console.warn(error);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleApprovalDecision = async (approvalId: number, decision: 'approve' | 'reject', comment?: string) => {
    setApprovalsLoading(true);
    try {
      if (decision === 'approve') {
        await approveAgentApproval(approvalId, { role: agentRole, comment: comment?.trim() || '管理端审批通过' });
      } else {
        await rejectAgentApproval(approvalId, { role: agentRole, comment: comment?.trim() || '管理端审批拒绝' });
      }
      await Promise.all([loadApprovalsPanel(), loadInsightPanel()]);
    } catch (error) {
      console.warn(error);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const handleAction = async (actionId: string, payload?: AgentActionPayload) => {
    const [action, scope, idText] = actionId.split(':');
    if (action === 'marketing' && scope === 'activity') {
      if (idText === 'edit') {
        const activityId = Number(actionId.split(':')[3]);
        navigate(`/customer-marketing/activity-management${activityId ? `?focusActivityId=${activityId}&mode=edit` : ''}`);
        return;
      }
      const activityId = Number(idText);
      navigate(activityId ? `/customer-marketing/activity-effect/${activityId}` : '/customer-marketing/activity-management');
      return;
    }
    const routeByActionId: Record<string, string> = {
      'finance:reconciliation:open': '/finance/reconciliation',
      'finance:staff-commission:open': '/finance/staff-commission',
    };
    const route = routeByActionId[actionId];
    if (route) {
      navigate(route);
      return;
    }
    const approvalAction = action;
    const approvalIdText = scope;
    const approvalId = Number(approvalIdText);
    if (!approvalId || !['approve', 'reject'].includes(approvalAction)) return;
    updateLastAgentMessage({ loading: true });
    try {
      const result = approvalAction === 'approve'
        ? await approveAgentApproval(approvalId, { role: resolveAgentRole(user?.roles), comment: '管理端确认执行', args: payload?.args })
        : await rejectAgentApproval(approvalId, { role: resolveAgentRole(user?.roles), comment: '管理端暂不执行' });
      const displayModel = getAgentResultDisplayModel(result);
      const businessTask = getResultBusinessTask(result);
      const grayStrategy = asRecord(businessTask.agentV2GrayStrategy);
      updateLastAgentMessage({
        loading: false,
        text: result.answer,
        blocks: displayModel.blocks,
        evidence: displayModel.evidence,
        actions: displayModel.actions,
        limitations: displayModel.limitations,
        phaseOutputs: (result as { phaseOutputs?: AgentPhaseOutput[] }).phaseOutputs,
        followUpSuggestions: displayModel.followUpSuggestions,
        runId: result.runId,
        architecture: String(businessTask.architecture ?? (agentRuntimeMode === 'agent_v2' ? 'kg_llm_agent' : 'agent_v1')),
        agentV2GrayMode: typeof grayStrategy.mode === 'string'
          ? grayStrategy.mode
          : agentRuntimeMode === 'agent_v2'
            ? agentV2GrayMode
            : undefined,
        agentV2FinalEngine: typeof grayStrategy.finalEngine === 'string' ? grayStrategy.finalEngine : undefined,
      });
    } catch (err) {
      updateLastAgentMessage({
        loading: false,
        error: formatAgentError(err),
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-background">
      <AgentWorkspaceTabs
        activeTab={activeTab}
        agentRuntimeMode={agentRuntimeMode}
        agentV2GrayMode={agentV2GrayMode}
        onAgentRuntimeModeChange={handleAgentRuntimeModeChange}
        onAgentV2GrayModeChange={handleAgentV2GrayModeChange}
        onChange={setActiveTab}
      />

      {activeTab === 'debug' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showPersonaDebug ? (
            <PersonaSidebar
              personas={personas}
              activePersona={activePersona}
              onSelect={handlePersonaChange}
            />
          ) : null}

          <div className="flex flex-1 flex-col overflow-hidden border-x border-border">
            <div className="flex items-center gap-3 border-b border-border px-6 py-4">
              <Sparkles className="h-5 w-5 text-[#7B5CFF]" />
              <div>
                <h1 className="text-sm font-semibold text-foreground">
                  {showPersonaDebug ? activePersona?.name ?? '洞悉美业·运营智能体' : '洞悉美业·门店运营智能体'}
                </h1>
                {showPersonaDebug && activePersona ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {activePersona.description}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    自动识别问题类型并分配给合适的专业 Agent。
                  </p>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && (
                <EmptyState
                  persona={showPersonaDebug ? activePersona : null}
                  suggestions={showPersonaDebug ? activePersona?.suggestedQuestions : unifiedSuggestedQuestions}
                  onSelect={handlePromptSelect}
                />
              )}
              {messages.map((msg) => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  onFollowUp={handleFollowUp}
                  onFeedback={handleFeedback}
                  onAction={handleAction}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-[#7B5CFF]/50 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={showPersonaDebug && activePersona ? `问 ${activePersona.name}...` : '问 洞悉美业·门店运营智能体...'}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground min-h-[36px] max-h-[120px]"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || sending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7B5CFF] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 px-1 text-xs text-muted-foreground">
                Enter 发送 · Shift+Enter 换行
              </p>
            </div>
          </div>

          <AgentInsightPanel
            persona={activePersona}
            memories={memories}
            archives={archives}
            qualityReport={qualityReport}
            automationTriggers={automationTriggers}
            automations={automations}
            automationRuns={automationRuns}
            schemaReadiness={schemaReadiness}
            memoryMigrationPending={memoryMigrationPending}
            archiveMigrationPending={archiveMigrationPending}
            automationMigrationPending={automationMigrationPending}
            loading={insightLoading}
            onRefresh={loadInsightPanel}
            onGenerateArchive={handleGenerateArchive}
            onRunAutomation={handleRunAutomation}
          />
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <AgentAuditTab
          runs={auditRuns}
          detail={auditRunDetail}
          loading={auditLoading}
          entrypoint={auditEntrypoint}
          status={auditStatus}
          role={auditRole}
          personaCode={auditPersonaCode}
          keyword={auditKeyword}
          personas={personas}
          onEntrypointChange={setAuditEntrypoint}
          onStatusChange={setAuditStatus}
          onRoleChange={setAuditRole}
          onPersonaCodeChange={setAuditPersonaCode}
          onKeywordChange={setAuditKeyword}
          onRefresh={loadAuditPanel}
          onSelectRun={handleSelectAuditRun}
        />
      ) : null}

      {activeTab === 'approvals' ? (
        <AgentApprovalsTab
          approvals={approvals}
          loading={approvalsLoading}
          onRefresh={loadApprovalsPanel}
          onDecision={handleApprovalDecision}
        />
      ) : null}

      {activeTab === 'personas' ? (
        <AgentPersonaConfigTab
          personas={personas}
          activePersona={activePersona}
          onSelect={handlePersonaChange}
          onSave={handlePersonaSave}
        />
      ) : null}

      {activeTab === 'eval' ? (
        <AgentEvalTab
          summary={evalSummary}
          failures={feedbackFailures}
          loading={evalLoading}
          onRun={loadEvalPanel}
        />
      ) : null}

      {activeTab === 'quality' ? (
        <AgentQualityTab
          persona={activePersona}
          qualityReport={qualityReport}
          schemaReadiness={schemaReadiness}
          memories={memories}
          archives={archives}
          automations={automations}
          automationRuns={automationRuns}
          feedbackFailures={feedbackFailures}
          loading={insightLoading}
          onRefresh={() => {
            void loadInsightPanel();
            void getAgentFeedbackFailures({ days: 7, personaCode: activePersona?.code, limit: 10 })
              .then(setFeedbackFailures)
              .catch(() => undefined);
          }}
        />
      ) : null}

      {activeTab === 'knowledge' ? (
        <AgentKnowledgeGovernanceTab
          data={knowledgeGovernance}
          loading={knowledgeLoading}
          capabilityId={knowledgeCapabilityId}
          personaCode={knowledgePersonaCode}
          riskLevel={knowledgeRiskLevel}
          domain={knowledgeDomain}
          debugText={knowledgeDebugText}
          onCapabilityIdChange={setKnowledgeCapabilityId}
          onPersonaCodeChange={setKnowledgePersonaCode}
          onRiskLevelChange={setKnowledgeRiskLevel}
          onDomainChange={setKnowledgeDomain}
          onDebugTextChange={setKnowledgeDebugText}
          onRefresh={loadKnowledgePanel}
        />
      ) : null}
    </div>
  );
}

function AgentWorkspaceTabs({
  activeTab,
  agentRuntimeMode,
  agentV2GrayMode,
  onAgentRuntimeModeChange,
  onAgentV2GrayModeChange,
  onChange,
}: {
  activeTab: AgentWorkspaceTab;
  agentRuntimeMode: AgentRuntimeMode;
  agentV2GrayMode: AgentV2GrayMode;
  onAgentRuntimeModeChange: (mode: AgentRuntimeMode) => void;
  onAgentV2GrayModeChange: (mode: AgentV2GrayMode) => void;
  onChange: (tab: AgentWorkspaceTab) => void;
}) {
  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground">Agent 治理工作台</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            统一管理调试、审计、审批、Persona、评测和质量闭环。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <div className="flex rounded-lg border border-border bg-muted p-1">
            {AGENT_RUNTIME_OPTIONS.map((option) => {
              const active = agentRuntimeMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onAgentRuntimeModeChange(option.value)}
                  className={[
                    'min-w-[86px] rounded-md px-3 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  ].join(' ')}
                >
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-[10px]">{option.description}</span>
                </button>
              );
            })}
          </div>
          {agentRuntimeMode === 'agent_v2' ? (
            <div className="flex rounded-lg border border-[#7B5CFF]/20 bg-[#7B5CFF]/5 p-1">
              {AGENT_V2_GRAY_MODE_OPTIONS.map((option) => {
                const active = agentV2GrayMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onAgentV2GrayModeChange(option.value)}
                    className={[
                      'min-w-[64px] rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'bg-background text-[#7B5CFF] shadow-sm'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    ].join(' ')}
                    title={option.value}
                  >
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-[10px]">{option.description}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {AGENT_WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              'min-w-[112px] rounded-lg border px-3 py-2 text-left transition-colors',
              activeTab === tab.key
                ? 'border-[#7B5CFF]/40 bg-[#7B5CFF]/10 text-[#7B5CFF]'
                : 'border-border bg-card text-foreground hover:bg-muted',
            ].join(' ')}
          >
            <div className="text-sm font-medium">{tab.label}</div>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{tab.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentAuditTab({
  runs,
  detail,
  loading,
  entrypoint,
  status,
  role,
  personaCode,
  keyword,
  personas,
  onEntrypointChange,
  onStatusChange,
  onRoleChange,
  onPersonaCodeChange,
  onKeywordChange,
  onRefresh,
  onSelectRun,
}: {
  runs: AgentRunRecord[];
  detail: AgentRunDetail | null;
  loading: boolean;
  entrypoint: string;
  status: string;
  role: string;
  personaCode: string;
  keyword: string;
  personas: AgentPersonaSummary[];
  onEntrypointChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onPersonaCodeChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onRefresh: () => void;
  onSelectRun: (runId: number) => void;
}) {
  const resultSnapshot = getRunResultSnapshot(detail?.run?.resultJson);
  const evidenceSnapshot = getEvidenceSnapshot(detail?.run);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_1fr] overflow-hidden bg-muted/20">
      <section className="overflow-y-auto border-r border-border bg-background p-4">
        <PanelHeader title="运行审计" loading={loading} onRefresh={onRefresh} />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted-foreground">
            来源
            <select
              value={entrypoint}
              onChange={(event) => onEntrypointChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="terminal:kiosk">终端 terminal:kiosk</option>
              <option value="">全部来源</option>
              <option value="ami-agent:manager">管理端 manager</option>
              <option value="ami-agent:marketing">管理端 marketing</option>
              <option value="api">API</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            状态
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">全部</option>
              <option value="completed">已完成</option>
              <option value="waiting_approval">待审批</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            角色
            <select
              value={role}
              onChange={(event) => onRoleChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">全部</option>
              <option value="manager">店长</option>
              <option value="reception">前台</option>
              <option value="beautician">美容师</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Persona
            <select
              value={personaCode}
              onChange={(event) => onPersonaCodeChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">全部</option>
              {personas.map((persona) => (
                <option key={persona.code} value={persona.code}>{persona.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mb-3 block text-xs text-muted-foreground">
          关键词
          <div className="mt-1 flex gap-2">
            <input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRefresh();
              }}
              placeholder="问题、runNo、agentCode"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              查询
            </button>
          </div>
        </label>
        <div className="space-y-2">
          {runs.length ? runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run.id)}
              className={[
                'w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted',
                detail?.run?.id === run.id ? 'border-[#7B5CFF]/40 bg-[#7B5CFF]/5' : 'border-border bg-card',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{run.runNo}</span>
                <StatusBadge status={run.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{run.userInput}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{run.entrypoint}</span>
                <span>{run.personaCode ?? run.agentCode}</span>
                <span>工具 {run.toolCallCount ?? 0}</span>
                <span>审批 {run.approvalCount ?? 0}</span>
              </div>
            </button>
          )) : (
            <EmptyPanelText text="暂无匹配的 AgentRun。终端问答产生后会出现在这里。" />
          )}
        </div>
      </section>
      <section className="min-w-0 overflow-y-auto p-5">
        {detail?.run ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{detail.run.runNo}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{detail.run.userInput}</p>
                </div>
                <StatusBadge status={detail.run.status} />
              </div>
              {detail.run.errorMessage ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{detail.run.errorMessage}</p>
              ) : null}
            </div>
            <AuditSection title="消息" count={detail.messages.length}>
              {detail.messages.map((message) => (
                <TimelineRow key={message.id} title={message.role} subtitle={message.content} />
              ))}
            </AuditSection>
            <AuditSection title="执行步骤" count={detail.steps.length}>
              {detail.steps.map((step) => (
                <TimelineRow
                  key={step.id}
                  title={`${step.name} · ${step.status}`}
                  subtitle={`${step.stepType}${step.endedAt ? ` · ${formatDateTime(step.endedAt)}` : ''}`}
                />
              ))}
            </AuditSection>
            <AuditSection title="工具调用" count={detail.toolCalls.length}>
              {detail.toolCalls.map((tool) => (
                <TimelineRow
                  key={tool.id}
                  title={`${tool.toolName} · ${tool.status}`}
                  subtitle={`风险 ${tool.riskLevel}${tool.latencyMs ? ` · ${tool.latencyMs}ms` : ''}`}
                />
              ))}
            </AuditSection>
            <AuditSection title="审批记录" count={detail.approvals.length}>
              {detail.approvals.map((approval) => (
                <TimelineRow key={approval.id} title={`#${approval.id} · ${approval.status}`} subtitle={approval.comment ?? '无备注'} />
              ))}
            </AuditSection>
            <AuditSection title="证据与输出契约" count={(evidenceSnapshot ? 1 : 0) + (resultSnapshot?.renderedBlocks?.length ?? 0)}>
              {evidenceSnapshot ? (
                <TimelineRow
                  title="Evidence"
                  subtitle={[
                    evidenceSnapshot.source?.length ? `来源 ${evidenceSnapshot.source.join('、')}` : '',
                    evidenceSnapshot.dateRange ? `范围 ${evidenceSnapshot.dateRange}` : '',
                    evidenceSnapshot.metricDefinition ? `口径 ${evidenceSnapshot.metricDefinition}` : '',
                  ].filter(Boolean).join(' · ')}
                />
              ) : null}
              {resultSnapshot?.renderedBlocks?.length ? (
                <TimelineRow
                  title="RenderedBlocks"
                  subtitle={resultSnapshot.renderedBlocks.map((block) => block.kind).join('、')}
                />
              ) : null}
              {resultSnapshot?.responseMode ? (
                <TimelineRow title="ResponseMode" subtitle={resultSnapshot.responseMode} />
              ) : null}
              {!evidenceSnapshot && !resultSnapshot?.renderedBlocks?.length ? (
                <EmptyPanelText text="暂无证据或结构化输出记录。" />
              ) : null}
            </AuditSection>
            <AuditSection title="上下文快照" count={detail.run.contextJson ? 1 : 0}>
              {detail.run.contextJson ? <JsonPreview value={detail.run.contextJson} /> : <EmptyPanelText text="暂无 contextJson。" />}
            </AuditSection>
            <AuditSection title="原始结果快照" count={detail.run.resultJson ? 1 : 0}>
              {detail.run.resultJson ? <JsonPreview value={detail.run.resultJson} /> : <EmptyPanelText text="暂无 resultJson。" />}
            </AuditSection>
          </div>
        ) : (
          <EmptyPanelText text="选择一条 AgentRun 查看消息、步骤、工具调用和审批详情。" />
        )}
      </section>
    </div>
  );
}

function AgentApprovalsTab({
  approvals,
  loading,
  onRefresh,
  onDecision,
}: {
  approvals: AgentApprovalListItem[];
  loading: boolean;
  onRefresh: () => void;
  onDecision: (approvalId: number, decision: 'approve' | 'reject', comment?: string) => void;
}) {
  const [rejectComments, setRejectComments] = useState<Record<number, string>>({});
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
      <PanelHeader title="审批管理" loading={loading} onRefresh={onRefresh} />
      <div className="grid gap-3">
        {approvals.length ? approvals.map((approval) => {
          const riskLevel = approval.toolCall?.riskLevel ?? getJsonValue(approval.beforeJson, 'riskLevel') ?? 'unknown';
          const impact = approvalImpactText(approval);
          return (
            <div key={approval.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">审批 #{approval.id}</h2>
                    <StatusBadge status={approval.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {approval.run?.runNo ?? `Run ${approval.runId}`} · {approval.toolCall?.toolName ?? '待确认动作'}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground">{approval.run?.userInput ?? '无关联问题摘要'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    风险等级 {String(riskLevel)} · 影响对象 {impact}
                  </p>
                </div>
                <div className="flex min-w-[260px] flex-shrink-0 flex-col gap-2">
                  <textarea
                    value={rejectComments[approval.id] ?? ''}
                    onChange={(event) => setRejectComments((prev) => ({ ...prev, [approval.id]: event.target.value }))}
                    placeholder="拒绝原因，可选"
                    className="min-h-[68px] rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-[#7B5CFF]/60"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onDecision(approval.id, 'approve')}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      批准
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onDecision(approval.id, 'reject', rejectComments[approval.id])}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }) : (
          <EmptyPanelText text="当前没有待审批动作。高风险营销触达、采购或财务动作会进入这里。" />
        )}
      </div>
    </div>
  );
}

function getJsonValue(source: unknown, key: string) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  return (source as Record<string, unknown>)[key];
}

function approvalImpactText(approval: AgentApprovalListItem) {
  const before = approval.beforeJson && typeof approval.beforeJson === 'object' && !Array.isArray(approval.beforeJson)
    ? approval.beforeJson as Record<string, unknown>
    : {};
  const args = before.args && typeof before.args === 'object' && !Array.isArray(before.args)
    ? before.args as Record<string, unknown>
    : approval.toolCall?.argsJson && typeof approval.toolCall.argsJson === 'object' && !Array.isArray(approval.toolCall.argsJson)
      ? approval.toolCall.argsJson as Record<string, unknown>
      : {};
  const candidates = ['customerName', 'segment', 'targetSegment', 'productName', 'activityName', 'supplierName', 'orderNo'];
  const matched = candidates
    .map((key) => args[key])
    .find((value) => typeof value === 'string' && value.trim());
  if (matched) return String(matched);
  const argKeys = Object.keys(args).slice(0, 3);
  return argKeys.length ? argKeys.join('、') : approval.toolCall?.toolName ?? '待确认业务动作';
}

function AgentPersonaConfigTab({
  personas,
  activePersona,
  onSelect,
  onSave,
}: {
  personas: AgentPersonaSummary[];
  activePersona: AgentPersonaSummary | null;
  onSelect: (persona: AgentPersonaSummary) => void;
  onSave: (
    code: AgentPersonaSummary['code'],
    data: { toolGroups?: string[]; suggestedQuestions?: string[] },
  ) => Promise<AgentPersonaSummary>;
}) {
  const selectedPersona = activePersona ?? personas[0] ?? null;
  const [questionDraft, setQuestionDraft] = useState('');
  const [toolGroups, setToolGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const availableToolGroups = useMemo(
    () => Array.from(new Set(personas.flatMap((persona) => persona.toolGroups))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [personas],
  );

  useEffect(() => {
    if (!selectedPersona) return;
    setQuestionDraft(selectedPersona.suggestedQuestions.join('\n'));
    setToolGroups(selectedPersona.toolGroups);
    setSaveMessage('');
  }, [selectedPersona]);

  const toggleToolGroup = (toolGroup: string) => {
    setToolGroups((current) =>
      current.includes(toolGroup) ? current.filter((item) => item !== toolGroup) : [...current, toolGroup],
    );
  };

  const handleSave = async () => {
    if (!selectedPersona) return;
    const suggestedQuestions = questionDraft
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
    setSaving(true);
    setSaveMessage('');
    try {
      const updated = await onSave(selectedPersona.code, {
        toolGroups,
        suggestedQuestions,
      });
      setQuestionDraft(updated.suggestedQuestions.join('\n'));
      setToolGroups(updated.toolGroups);
      setSaveMessage('已保存到 Agent Persona 配置。');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Persona 配置</h2>
        <p className="mt-1 text-xs text-muted-foreground">配置六类 Agent 的目标角色、工具组和终端冷启动推荐问题。</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        <div className="grid gap-4 lg:grid-cols-2">
          {personas.map((persona) => (
            <button
              key={persona.code}
              type="button"
              onClick={() => onSelect(persona)}
              className={[
                'rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60',
                selectedPersona?.code === persona.code ? 'border-[#7B5CFF]/50 ring-2 ring-[#7B5CFF]/10' : 'border-border',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{persona.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{persona.description}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{persona.code}</span>
              </div>
              <PersonaChipGroup title="目标角色" items={persona.targetRoles} />
              <PersonaChipGroup title="工具组" items={persona.toolGroups.slice(0, 5)} />
              <PersonaChipGroup title="推荐问题" items={persona.suggestedQuestions.slice(0, 3)} />
            </button>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5">
          {selectedPersona ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{selectedPersona.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedPersona.description}</p>
                </div>
                <span className="rounded-full bg-[#F1ECFF] px-3 py-1 text-xs font-medium text-[#6B4EFF]">{selectedPersona.code}</span>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-foreground" htmlFor="agent-persona-questions">
                    推荐问题
                  </label>
                  <span className="text-[11px] text-muted-foreground">每行一个，最多保存 6 个</span>
                </div>
                <textarea
                  id="agent-persona-questions"
                  value={questionDraft}
                  onChange={(event) => setQuestionDraft(event.target.value)}
                  className="min-h-[150px] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-[#7B5CFF]"
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium text-foreground">工具组开关</h4>
                  <span className="text-[11px] text-muted-foreground">当前启用 {toolGroups.length} 个</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableToolGroups.map((toolGroup) => {
                    const checked = toolGroups.includes(toolGroup);
                    return (
                      <button
                        key={toolGroup}
                        type="button"
                        onClick={() => toggleToolGroup(toolGroup)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-xs transition-colors',
                          checked
                            ? 'border-[#7B5CFF]/50 bg-[#F1ECFF] text-[#5F43E9]'
                            : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted',
                        ].join(' ')}
                      >
                        {toolGroup}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {saveMessage || '保存后会影响管理端调试与后续终端推荐问题同步。'}
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !toolGroups.length}
                  className="rounded-lg bg-[#2C7A6B] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </>
          ) : (
            <EmptyPanelText text="暂无可配置的 Persona。" />
          )}
        </div>
      </div>
    </div>
  );
}

function AgentEvalTab({
  summary,
  failures,
  loading,
  onRun,
}: {
  summary: AgentEvalSummary | null;
  failures: AgentFeedbackFailureReport | null;
  loading: boolean;
  onRun: () => void;
}) {
  const failedResults = summary?.results.filter((item) => !item.passed) ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
      <PanelHeader title="评测集" loading={loading} onRefresh={onRun} refreshLabel="运行默认评测" />
      <div className="grid gap-4 lg:grid-cols-4">
        <MiniMetric label="总用例" value={String(summary?.total ?? 0)} />
        <MiniMetric label="通过" value={String(summary?.passed ?? 0)} />
        <MiniMetric label="失败" value={String(summary?.failed ?? 0)} />
        <MiniMetric label="负反馈样本" value={String(failures?.kpis.negativeFeedbackCount ?? 0)} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <AuditSection title="失败评测" count={failedResults.length}>
          {failedResults.length ? failedResults.slice(0, 8).map((item) => (
            <TimelineRow key={item.id} title={`${item.id} · ${item.scenario}`} subtitle={item.errors.join('；') || '未提供错误信息'} />
          )) : <EmptyPanelText text="暂无失败评测。" />}
        </AuditSection>
        <AuditSection title="负反馈回归候选" count={failures?.items.length ?? 0}>
          {failures?.items.length ? failures.items.slice(0, 8).map((item) => (
            <TimelineRow key={item.feedbackId} title={`${item.skillId} · Run ${item.runId}`} subtitle={item.reason || item.question} />
          )) : <EmptyPanelText text="暂无可导入评测的负反馈样本。" />}
        </AuditSection>
      </div>
    </div>
  );
}

function AgentKnowledgeGovernanceTab({
  data,
  loading,
  capabilityId,
  personaCode,
  riskLevel,
  domain,
  debugText,
  onCapabilityIdChange,
  onPersonaCodeChange,
  onRiskLevelChange,
  onDomainChange,
  onDebugTextChange,
  onRefresh,
}: {
  data: AgentKnowledgeGovernance | null;
  loading: boolean;
  capabilityId: string;
  personaCode: string;
  riskLevel: string;
  domain: string;
  debugText: string;
  onCapabilityIdChange: (value: string) => void;
  onPersonaCodeChange: (value: string) => void;
  onRiskLevelChange: (value: string) => void;
  onDomainChange: (value: string) => void;
  onDebugTextChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const gate = data?.evalReport?.gate;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
      <PanelHeader title="语义治理" loading={loading} onRefresh={onRefresh} />
      <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
        <label className="block text-xs text-muted-foreground">
          Capability 筛选
          <input
            value={capabilityId}
            onChange={(event) => onCapabilityIdChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRefresh();
            }}
            placeholder="例如 marketing.activity.link.lookup"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Entity Resolver 调试
          <input
            value={debugText}
            onChange={(event) => onDebugTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRefresh();
            }}
            placeholder="输入一句自然语言，例如 老朋友回店护理礼活动链接发我"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="self-end rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          查询
        </button>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="block text-xs text-muted-foreground">
          Persona
          <select
            value={personaCode}
            onChange={(event) => onPersonaCodeChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">全部</option>
            <option value="manager">店长经营</option>
            <option value="marketing">营销增长</option>
            <option value="reception">前台接待</option>
            <option value="beautician">美容师服务</option>
            <option value="inventory">库存采购</option>
            <option value="finance">财务风控</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          风险 / 优先级
          <select
            value={riskLevel}
            onChange={(event) => onRiskLevelChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">全部</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          业务域
          <input
            value={domain}
            onChange={(event) => onDomainChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRefresh();
            }}
            placeholder="例如 marketing / inventory / finance"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Schema 节点" value={String(data?.schemaGraph.nodeCount ?? 0)} />
        <MiniMetric label="Schema 关系" value={String(data?.schemaGraph.relationCount ?? 0)} />
        <MiniMetric label="能力目录" value={`${data?.capabilityCatalog.filtered ?? 0}/${data?.capabilityCatalog.total ?? 0}`} />
        <MiniMetric label="Eval 通过率" value={formatPercent(data?.evalReport?.summary.passRate)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <AuditSection title="自动扫描门禁" count={data?.knowledgeReports?.scan?.gate?.warnings.length ?? 0}>
          {data?.knowledgeReports?.scan ? (
            <>
              <TimelineRow
                title={`Schema ${data.knowledgeReports.scan.schema.generatedModelCount}/${data.knowledgeReports.scan.schema.schemaModelCount}`}
                subtitle={`门禁 ${data.knowledgeReports.scan.gate?.passed ? '通过' : '未通过'} · 阻断 ${data.knowledgeReports.scan.gate?.blockers.length ?? 0} · 提醒 ${data.knowledgeReports.scan.gate?.warnings.length ?? 0}`}
              />
              <TimelineRow
                title="API / 页面候选"
                subtitle={`Endpoint ${data.knowledgeReports.scan.api.endpoints} · real API ${data.knowledgeReports.scan.api.realApiMethods} · 页面 ${data.knowledgeReports.scan.frontend.routes.length}`}
              />
              <TimelineRow
                title="Agent 覆盖缺口"
                subtitle={`Skill ${data.knowledgeReports.scan.agent.missingSkillMappings.length} · Eval ${data.knowledgeReports.scan.agent.missingEvalCases.length} · Tool ${data.knowledgeReports.scan.agent.missingToolRegistryMappings.length}`}
              />
              {data.knowledgeReports.scan.gate?.warnings.slice(0, 4).map((item) => (
                <TimelineRow key={item} title="提醒项" subtitle={item} />
              ))}
            </>
          ) : (
            <EmptyPanelText text="暂无自动扫描报告。先运行 agent:knowledge:scan。" />
          )}
        </AuditSection>
        <GovernanceReportPanel title="知识治理日报" report={data?.knowledgeReports?.daily ?? null} />
        <GovernanceReportPanel title="知识治理周报" report={data?.knowledgeReports?.weekly ?? null} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <AuditSection title="Capability Catalog" count={data?.capabilityCatalog.items.length ?? 0}>
          {data?.capabilityCatalog.items.slice(0, 12).map((item) => (
            <TimelineRow
              key={item.capabilityId}
              title={`${item.displayName} · ${item.capabilityId}`}
              subtitle={`${item.personaCodes.join('/')} · ${item.objectTypes.join('/')} · 输出 ${item.outputKinds.join('/')}`}
            />
          )) ?? <EmptyPanelText text="暂无能力目录数据。" />}
        </AuditSection>
        <AuditSection title="Schema Graph" count={data?.schemaGraph.objects.length ?? 0}>
          {data?.schemaGraph.objects.slice(0, 12).map((item) => (
            <TimelineRow
              key={item.modelName}
              title={`${item.displayName} · ${item.modelName}`}
              subtitle={`${item.objectType} · 关系 ${item.relationCount} · 可查询字段 ${item.queryableFieldCount}${item.storeScoped ? ' · 门店隔离' : ''}`}
            />
          )) ?? <EmptyPanelText text="暂无 Schema Graph 数据。" />}
        </AuditSection>
        <AuditSection title="Eval Gate" count={data?.evalReport ? 1 : 0}>
          {data?.evalReport ? (
            <>
              <TimelineRow
                title={`最新报告 · ${data.evalReport.summary.passed}/${data.evalReport.summary.total}`}
                subtitle={`路由 ${formatPercent(data.evalReport.summary.routingAccuracy)} · 实体 ${formatPercent(data.evalReport.summary.entityAccuracy)} · 输出 ${formatPercent(data.evalReport.summary.outputContractAccuracy)}`}
              />
              {gate ? (
                <TimelineRow
                  title={`${gate.level.toUpperCase()} 门禁 · ${gate.passed ? '通过' : '未通过'}`}
                  subtitle={`覆盖 ${gate.evaluatedTotal} 条 · 通过率 ${formatPercent(gate.actual.passRate)} · 路由 ${formatPercent(gate.actual.routingAccuracy)}`}
                />
              ) : null}
              {(data.evalReport.improvementBacklog.length ? data.evalReport.improvementBacklog : data.evalReport.failures).slice(0, 8).map((item) => (
                <TimelineRow
                  key={item.id}
                  title={`${item.id} · ${(item as { priority?: string }).priority ?? '失败样本'}`}
                  subtitle={'recommendation' in item ? item.recommendation : item.input}
                />
              ))}
            </>
          ) : (
            <EmptyPanelText text="暂无 Eval 报告。先运行 agent:eval:knowledge-map:gate:p2 生成基线。" />
          )}
        </AuditSection>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <AuditSection title="Entity Resolver 调试" count={data?.entityDebug?.candidates.length ?? 0}>
          {data?.entityDebug ? (
            <>
              <TimelineRow
                title={`状态：${data.entityDebug.status}`}
                subtitle={data.entityDebug.clarificationQuestion ?? data.entityDebug.query}
              />
              {data.entityDebug.candidates.slice(0, 8).map((item) => (
                <TimelineRow
                  key={`${item.objectType}-${item.entityId}`}
                  title={`${item.objectType} · ${item.displayName}`}
                  subtitle={`置信度 ${Math.round(item.confidence * 100)}% · ${item.matchStrategy} · ${item.sourceModel}`}
                />
              ))}
            </>
          ) : (
            <EmptyPanelText text="输入一句自然语言后，可查看实体候选、置信度和匹配策略。" />
          )}
        </AuditSection>
        <AuditSection title="Legacy Fallback 治理" count={data?.legacyRules.legacyFallbackRuns ?? 0}>
          {data ? (
            <>
              <TimelineRow
                title={`最近扫描 ${data.legacyRules.scannedRuns} 次运行`}
                subtitle={`legacy fallback ${data.legacyRules.legacyFallbackRuns} 次`}
              />
              {data.legacyRules.usageByReason.slice(0, 6).map((item) => (
                <TimelineRow key={item.reason} title={item.reason} subtitle={`使用 ${item.count} 次`} />
              ))}
              {data.legacyRules.samples.slice(0, 4).map((item) => (
                <TimelineRow key={item.runId} title={item.runNo} subtitle={`${item.fallbackReason} · ${item.question}`} />
              ))}
              {data.legacyRules.deprecationCandidates?.slice(0, 6).map((item) => (
                <TimelineRow
                  key={item.reason}
                  title={`废弃候选 · ${item.reason}`}
                  subtitle={`最近窗口 ${item.latestCount} 次，上一个窗口 ${item.previousCount} 次`}
                />
              ))}
              {data.legacyRules.deprecationPolicy.slice(0, 3).map((item) => (
                <TimelineRow key={item} title="清理策略" subtitle={item} />
              ))}
            </>
          ) : (
            <EmptyPanelText text="暂无旧规则统计。" />
          )}
        </AuditSection>
      </div>
    </div>
  );
}

function GovernanceReportPanel({
  title,
  report,
}: {
  title: string;
  report: AgentKnowledgeGovernanceReportSummary | null;
}) {
  return (
    <AuditSection title={title} count={report?.agentCapabilityGaps.length ?? 0}>
      {report ? (
        <>
          <TimelineRow
            title={`${report.summary?.gatePassed ? '门禁通过' : '门禁未通过'} · ${report.mode ?? 'unknown'}`}
            subtitle={`阻断 ${report.summary?.blockerCount ?? 0} · 提醒 ${report.summary?.warningCount ?? 0} · P0 ${formatPercent(report.summary?.p0PassRate ?? undefined)}`}
          />
          <TimelineRow
            title="核心缺口"
            subtitle={`业务对象 ${report.summary?.missingBusinessObjectMappings ?? 0} · 中文名 ${report.summary?.missingDisplayNames ?? 0} · Skill ${report.summary?.missingSkillMappings ?? 0} · Eval ${report.summary?.missingEvalCases ?? 0}`}
          />
          <TimelineRow
            title="运行态"
            subtitle={`legacy fallback ${report.summary?.legacyFallbackRuns ?? 0} · reason ${report.summary?.fallbackReasonCount ?? 0} · ${report.markdownPath}`}
          />
          <button
            type="button"
            onClick={() => downloadGovernanceMarkdown(report)}
            disabled={!report.markdownContent}
            className="w-fit rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            导出 Markdown
          </button>
          {report.agentCapabilityGaps.slice(0, 5).map((item) => (
            <TimelineRow key={`${item.type}-${item.key}`} title={`${item.priority} · ${item.key}`} subtitle={item.reason} />
          ))}
          {report.reviewChecklist.slice(0, 3).map((item) => (
            <TimelineRow key={item} title="Review" subtitle={item} />
          ))}
        </>
      ) : (
        <EmptyPanelText text={`暂无${title}。先运行 ${title.includes('日') ? 'agent:knowledge:daily' : 'agent:knowledge:weekly'}。`} />
      )}
    </AuditSection>
  );
}

function downloadGovernanceMarkdown(report: AgentKnowledgeGovernanceReportSummary) {
  if (!report.markdownContent) return;
  const blob = new globalThis.Blob([report.markdownContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = report.markdownPath.split('/').pop() ?? 'agent-knowledge-governance-report.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AgentQualityTab({
  persona,
  qualityReport,
  schemaReadiness,
  memories,
  archives,
  automations,
  automationRuns,
  feedbackFailures,
  loading,
  onRefresh,
}: {
  persona: AgentPersonaSummary | null;
  qualityReport: AgentQualityReport | null;
  schemaReadiness: AgentSchemaReadiness | null;
  memories: AgentMemoryItem[];
  archives: AgentDailyArchiveItem[];
  automations: AgentAutomationDefinitionItem[];
  automationRuns: AgentAutomationRunItem[];
  feedbackFailures: AgentFeedbackFailureReport | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const kpis = qualityReport?.kpis;
  const questionBank = qualityReport?.questionBank;
  const entrypointComparison = (qualityReport?.entrypointBreakdown ?? []).map((item) => ({
    ...item,
    label: item.name === 'terminal:kiosk'
      ? '终端新链路'
      : item.name.startsWith('ami-agent:')
        ? '管理端 Agent'
        : item.name === 'api'
          ? 'API / 旧兼容入口'
          : item.name,
  }));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-5">
      <PanelHeader title={`质量大盘 · ${persona?.name ?? '全部 Agent'}`} loading={loading} onRefresh={onRefresh} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="运行数" value={String(kpis?.runCount ?? 0)} />
        <MiniMetric label="成功率" value={formatPercent(kpis?.successRate)} />
        <MiniMetric label="反馈数" value={String(kpis?.feedbackCount ?? 0)} />
        <MiniMetric label="采纳率" value={formatPercent(kpis?.adoptionRate)} />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">问题库门禁</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              覆盖 650 条自然语言问题，按 P0/P1/P2 分层追踪回归结果。
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            P0 {questionBank?.p0Cases ?? 0} 条
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MiniMetric label="覆盖率" value={formatPercent(questionBank?.coverageRate)} />
          <MiniMetric label="结构化问题" value={`${questionBank?.structuredQuestions ?? 0}/${questionBank?.totalQuestions ?? 0}`} />
          <MiniMetric label="多轮轮次" value={String(questionBank?.conversationTurns ?? 0)} />
          {(questionBank?.priorityPassRates ?? ['P0', 'P1', 'P2'].map((priority) => ({ priority, total: 0, passed: 0, failed: 0, passRate: null }))).map((item) => (
            <MiniMetric
              key={item.priority}
              label={`${item.priority} 通过率`}
              value={item.total ? `${formatPercent(item.passRate)} · ${item.passed}/${item.total}` : '未运行'}
            />
          ))}
        </div>
      </div>
      <div className="mt-5">
        <AuditSection title="灰度入口对比" count={entrypointComparison.length}>
          {entrypointComparison.length ? entrypointComparison.map((item) => (
            <TimelineRow
              key={item.name}
              title={`${item.label} · ${item.name}`}
              subtitle={`运行 ${item.runCount} · 成功率 ${formatPercent(item.successRate)} · 完成 ${item.completed} · 失败 ${item.failed}`}
            />
          )) : (
            <EmptyPanelText text="暂无入口维度数据。灰度期间可用 terminal:kiosk、ami-agent:*、api 等入口对比新旧链路质量。" />
          )}
        </AuditSection>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <AuditSection title="Persona 质量" count={qualityReport?.personaBreakdown.length ?? 0}>
          {qualityReport?.personaBreakdown.map((item) => (
            <TimelineRow key={item.name} title={item.name} subtitle={`运行 ${item.runCount} · 成功率 ${formatPercent(item.successRate)}`} />
          ))}
        </AuditSection>
        <AuditSection title="入口质量" count={qualityReport?.entrypointBreakdown.length ?? 0}>
          {qualityReport?.entrypointBreakdown.slice(0, 8).map((item) => (
            <TimelineRow
              key={item.name}
              title={item.name}
              subtitle={`运行 ${item.runCount} · 成功率 ${formatPercent(item.successRate)} · 失败 ${item.failed}`}
            />
          ))}
        </AuditSection>
        <AuditSection title="工具质量" count={qualityReport?.toolBreakdown.length ?? 0}>
          {qualityReport?.toolBreakdown.slice(0, 8).map((item) => (
            <TimelineRow key={item.toolName} title={item.toolName} subtitle={`调用 ${item.callCount} · 失败率 ${formatPercent(item.failureRate)}`} />
          ))}
        </AuditSection>
        <AuditSection title="能力缺口" count={(qualityReport?.recommendations.length ?? 0) + (feedbackFailures?.items.length ?? 0)}>
          {qualityReport?.recommendations.slice(0, 4).map((item) => (
            <TimelineRow key={item} title="质量建议" subtitle={item} />
          ))}
          {feedbackFailures?.items.slice(0, 4).map((item) => (
            <TimelineRow key={item.feedbackId} title={`${item.skillId} 负反馈`} subtitle={item.reason || item.question} />
          ))}
        </AuditSection>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <MiniMetric label="记忆" value={String(memories.length)} />
        <MiniMetric label="归档" value={String(archives.length)} />
        <MiniMetric label="自动化" value={String(automations.length)} />
        <MiniMetric label="自动化运行" value={String(automationRuns.length)} />
      </div>
      {schemaReadiness && !schemaReadiness.ready ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          迁移未完全就绪：缺失 {schemaReadiness.missingTables.length} 张表，{schemaReadiness.missingMigrations.length} 条迁移记录。
        </div>
      ) : null}
    </div>
  );
}

function PanelHeader({
  title,
  loading,
  refreshLabel = '刷新',
  onRefresh,
}: {
  title: string;
  loading?: boolean;
  refreshLabel?: string;
  onRefresh: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={['h-3.5 w-3.5', loading ? 'animate-spin' : ''].join(' ')} />
        {refreshLabel}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const value = status ?? 'unknown';
  const className = value === 'completed' || value === 'approved'
    ? 'bg-emerald-50 text-emerald-700'
    : value === 'failed' || value === 'rejected' || value === 'cancelled'
      ? 'bg-rose-50 text-rose-700'
      : value === 'waiting_approval' || value === 'pending'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-muted text-muted-foreground';
  return <span className={['rounded-full px-2 py-1 text-[11px] font-medium', className].join(' ')}>{statusLabel(value)}</span>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    created: '已创建',
    planning: '规划中',
    running_tool: '查询中',
    waiting_approval: '待审批',
    composing: '生成中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    pending: '待处理',
    approved: '已批准',
    rejected: '已拒绝',
  };
  return labels[status] ?? status;
}

function AuditSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TimelineRow({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <p className="truncate text-xs font-medium text-foreground">{title}</p>
      {subtitle ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function EmptyPanelText({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function PersonaChipGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((item) => (
          <span key={item} className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            {item}
          </span>
        )) : (
          <span className="text-[11px] text-muted-foreground">未配置</span>
        )}
      </div>
    </div>
  );
}

function getRunResultSnapshot(value: unknown): {
  renderedBlocks?: AuraResponseBlock[];
  evidence?: {
    source?: string[];
    dateRange?: string;
    metricDefinition?: string;
  };
  responseMode?: string;
} | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    renderedBlocks?: unknown;
    evidence?: unknown;
    responseMode?: unknown;
  };
  const renderedBlocks = Array.isArray(record.renderedBlocks)
    ? record.renderedBlocks.filter((block): block is AuraResponseBlock => Boolean(block && typeof block === 'object' && 'kind' in block))
    : undefined;
  const evidence = record.evidence && typeof record.evidence === 'object'
    ? record.evidence as { source?: string[]; dateRange?: string; metricDefinition?: string }
    : undefined;
  return {
    ...(renderedBlocks?.length ? { renderedBlocks } : {}),
    ...(evidence ? { evidence } : {}),
    ...(typeof record.responseMode === 'string' ? { responseMode: record.responseMode } : {}),
  };
}

function getEvidenceSnapshot(run?: AgentRunRecord | null) {
  if (!run) return null;
  const resultSnapshot = getRunResultSnapshot(run.resultJson);
  if (resultSnapshot?.evidence) return resultSnapshot.evidence;
  if (run.evidenceJson && typeof run.evidenceJson === 'object') {
    return run.evidenceJson as { source?: string[]; dateRange?: string; metricDefinition?: string };
  }
  return null;
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
      {safeJsonStringify(value)}
    </pre>
  );
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveAgentRole(roles?: string[]): AgentRole {
  const normalized = (roles ?? []).map((role) => role.toLowerCase());
  if (normalized.some((role) => role.includes('beautician'))) return 'beautician';
  if (normalized.some((role) => role.includes('reception') || role.includes('cashier') || role.includes('frontdesk'))) {
    return 'reception';
  }
  return 'manager';
}

function formatAgentError(error: unknown): string {
  const payload = error instanceof Error ? (error as Error & { payload?: { status?: number; message?: string } }).payload : undefined;
  if (payload?.status === 401) return '登录状态已失效，请重新登录后再使用智能体。';
  if (payload?.status === 403) return payload.message || '当前账号没有执行该智能体能力的权限。';
  const message = error instanceof Error ? error.message : '';
  const payloadMessage = payload?.message ?? '';
  if (/timeout|exceeded|ECONNABORTED/i.test(`${message} ${payloadMessage}`)) {
    return '本次 Agent 查询涉及的数据较多，等待时间超过前台限制。已避免重复提交，请缩小时间范围或问题范围后重试。';
  }
  if (payload?.status && payload.status >= 500) {
    return 'Agent 服务暂时异常，已保留本轮问题。请稍后重试，或刷新页面后重新发起本次查询。';
  }
  if (error instanceof Error && /status code 5\d\d|Internal server error/i.test(error.message)) {
    return 'Agent 服务暂时异常，已保留本轮问题。请稍后重试，或刷新页面后重新发起本次查询。';
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

function AgentInsightPanel({
  persona,
  memories,
  archives,
  qualityReport,
  automationTriggers,
  automations,
  automationRuns,
  schemaReadiness,
  memoryMigrationPending,
  archiveMigrationPending,
  automationMigrationPending,
  loading,
  onRefresh,
  onGenerateArchive,
  onRunAutomation,
}: {
  persona: AgentPersonaSummary | null;
  memories: AgentMemoryItem[];
  archives: AgentDailyArchiveItem[];
  qualityReport: AgentQualityReport | null;
  automationTriggers: AgentAutomationTriggerTemplate[];
  automations: AgentAutomationDefinitionItem[];
  automationRuns: AgentAutomationRunItem[];
  schemaReadiness: AgentSchemaReadiness | null;
  memoryMigrationPending: boolean;
  archiveMigrationPending: boolean;
  automationMigrationPending: boolean;
  loading: boolean;
  onRefresh: () => void;
  onGenerateArchive: () => void;
  onRunAutomation: (definitionId: number) => void;
}) {
  const kpis = qualityReport?.kpis;
  const hasMigrationPending = memoryMigrationPending || archiveMigrationPending || automationMigrationPending;
  const memorySchemaGroup = schemaGroup(schemaReadiness, 'memory_archive');
  const automationSchemaGroup = schemaGroup(schemaReadiness, 'automation_engine');
  const memorySchemaReady = Boolean(memorySchemaGroup?.ready);
  const automationSchemaReady = Boolean(automationSchemaGroup?.ready);
  const archiveActionDisabled = schemaReadiness ? !memorySchemaReady : false;
  const automationActionDisabled = schemaReadiness ? !automationSchemaReady : false;
  return (
    <aside className="hidden w-80 flex-shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-4 xl:block">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">运营记忆</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{persona?.name ?? '当前 Agent'}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
          title="刷新"
        >
          <RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />
        </button>
      </div>

      {hasMigrationPending ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          部分 Agent 记忆/自动化表尚未迁移，当前面板以空态预览加载；迁移完成后可做运行态验收。
        </div>
      ) : null}

      {schemaReadiness ? (
        <section className="mb-4 rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">迁移就绪</h3>
            <span className={['text-xs', schemaReadiness.ready ? 'text-emerald-600' : 'text-amber-700'].join(' ')}>
              {schemaReadiness.ready
                ? '已就绪'
                : `${schemaReadiness.missingTables.length} 表 / ${schemaReadiness.missingMigrations.length} 迁移待处理`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SchemaReadyBadge label="记忆归档" group={memorySchemaGroup} />
            <SchemaReadyBadge label="自动化" group={automationSchemaGroup} />
          </div>
          {!schemaReadiness.ready ? (
            <div className="mt-3 space-y-2 border-t border-border/70 pt-2">
              {schemaReadiness.missingMigrations.length ? (
                <SchemaMissingList title="待应用迁移" items={schemaReadiness.missingMigrations} />
              ) : null}
              {schemaReadiness.missingTables.length ? (
                <SchemaMissingList title="缺失数据表" items={schemaReadiness.missingTables} />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mb-4 rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">7 日质量</h3>
          <span className="text-xs text-muted-foreground">{qualityReport?.range.days ?? 7} 天</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="运行" value={String(kpis?.runCount ?? 0)} />
          <MiniMetric label="成功率" value={formatPercent(kpis?.successRate)} />
          <MiniMetric label="反馈" value={String(kpis?.feedbackCount ?? 0)} />
          <MiniMetric label="采纳率" value={formatPercent(kpis?.adoptionRate)} />
        </div>
        {qualityReport?.recommendations?.length ? (
          <div className="mt-3 space-y-1">
            {qualityReport.recommendations.slice(0, 2).map((item) => (
              <p key={item} className="rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
                {item}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mb-4 rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">自动化中心</h3>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            {automationTriggers.length} 触发器
          </span>
        </div>
        <div className="space-y-2">
          {automationMigrationPending ? (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
              自动化表待迁移，暂不显示草稿和运行日志。
            </p>
          ) : null}
          {automations.length ? automations.map((item) => (
            <div key={item.id} className="rounded-md border border-border/70 px-2 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {automationTriggerLabel(item.triggerType, automationTriggers)} · {automationStatusLabel(item.status)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!automationActionDisabled) onRunAutomation(item.id);
                  }}
                  disabled={automationActionDisabled}
                  className={[
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    automationActionDisabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground' : '',
                  ].join(' ')}
                  title={automationActionDisabled ? '自动化表迁移后可手动预演' : '手动预演'}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              暂无 Agent 自动化草稿。可先从营销、库存、预约或财务风险问答中沉淀自动化。
            </p>
          )}
        </div>
        {automationRuns.length ? (
          <div className="mt-3 border-t border-border/70 pt-2">
            <p className="mb-1 text-[11px] text-muted-foreground">最近运行</p>
            <div className="space-y-1">
              {automationRuns.slice(0, 2).map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{automationTriggerLabel(run.triggerType, automationTriggers)}</span>
                  <span className="flex-shrink-0 text-foreground">{automationStatusLabel(run.status)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mb-4 rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">门店记忆</h3>
          <span className="text-xs text-muted-foreground">{memories.length}</span>
        </div>
        <div className="space-y-2">
          {memoryMigrationPending ? (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
              记忆表待迁移，暂不显示历史记忆。
            </p>
          ) : null}
          {memories.length ? memories.map((memory) => (
            <div key={memory.id} className="rounded-md border border-border/70 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-foreground">{memory.title}</p>
                <span className="text-[11px] text-muted-foreground">L{memory.importance}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {memory.summary || memory.content}
              </p>
            </div>
          )) : (
            <p className="text-xs leading-relaxed text-muted-foreground">暂无当前 Agent 记忆。</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">每日归档</h3>
          <button
            type="button"
            onClick={() => {
              if (!archiveActionDisabled) onGenerateArchive();
            }}
            disabled={archiveActionDisabled}
            className={[
              'rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted',
              archiveActionDisabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : '',
            ].join(' ')}
            title={archiveActionDisabled ? '记忆归档表迁移后可生成今日归档' : '生成今日归档'}
          >
            {archiveActionDisabled ? '待迁移' : '生成今日'}
          </button>
        </div>
        <div className="space-y-2">
          {archiveMigrationPending ? (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
              归档表待迁移，暂不支持生成可持久化归档。
            </p>
          ) : null}
          {archives.length ? archives.map((archive) => (
            <div key={archive.id} className="rounded-md border border-border/70 px-2 py-2">
              <p className="truncate text-xs font-medium text-foreground">{archive.title}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{archive.summary}</p>
            </div>
          )) : (
            <p className="text-xs leading-relaxed text-muted-foreground">暂无归档，完成问答后可生成今日归档。</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SchemaReadyBadge({
  label,
  group,
}: {
  label: string;
  group?: AgentSchemaReadiness['groups'][number];
}) {
  const ready = Boolean(group?.ready);
  const status = ready
    ? '已就绪'
    : group?.missingTables.length
      ? '表待迁移'
      : group?.migrationApplied === false
        ? '迁移未记录'
        : '待检查';
  return (
    <div className="rounded-md border border-border/70 px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={['mt-1 text-xs font-medium', ready ? 'text-emerald-600' : 'text-amber-700'].join(' ')}>
        {status}
      </p>
    </div>
  );
}

function SchemaMissingList({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.slice(0, 3);
  const remaining = items.length - visibleItems.length;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <p key={item} className="truncate rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800" title={item}>
            {item}
          </p>
        ))}
        {remaining > 0 ? (
          <p className="text-[11px] text-muted-foreground">另有 {remaining} 项待处理</p>
        ) : null}
      </div>
    </div>
  );
}

function schemaGroup(readiness: AgentSchemaReadiness | null, code: string) {
  return readiness?.groups.find((group) => group.code === code);
}

function automationTriggerLabel(triggerType: string, triggers: AgentAutomationTriggerTemplate[]) {
  return triggers.find((item) => item.code === triggerType)?.name ?? triggerType;
}

function automationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    enabled: '启用',
    paused: '暂停',
    waiting_approval: '待确认',
    dry_run_completed: '预演完成',
    completed: '完成',
    failed: '失败',
    pending: '待处理',
    recorded: '已记录',
  };
  return labels[status] ?? status;
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

const personaRouteLabels: Record<string, string> = {
  manager: '店长经营 Agent',
  marketing: '营销增长 Agent',
  reception: '前台接待 Agent',
  beautician: '美容师服务 Agent',
  inventory: '库存采购 Agent',
  finance: '财务风控 Agent',
};

function getArchitectureLabel(value?: string) {
  const labels: Record<string, string> = {
    agent_v2_kg_llm: 'KG+LLM',
    kg_llm_agent: 'KG+LLM',
    agent_v2_shadow: 'V2 Shadow',
    agent_v2_legacy_fallback: 'V2 回退',
    agent_v2_kg_llm_retired: '旧链退役',
    agent_v2: 'Agent V2',
    agent_v1: 'Agent V1',
  };
  return value ? labels[value] ?? value : '';
}

// ─── PersonaSidebar ───────────────────────────────────────────────────────────

function PersonaSidebar({
  personas,
  activePersona,
  onSelect,
}: {
  personas: AgentPersonaSummary[];
  activePersona: AgentPersonaSummary | null;
  onSelect: (p: AgentPersonaSummary) => void;
}) {
  const personaIcons: Record<string, string> = {
    manager: '📊',
    marketing: '📣',
    reception: '🎪',
    beautician: '✨',
    inventory: '📦',
    finance: '💰',
  };

  return (
    <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto py-4">
      <div className="px-4 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        角色 Agent
      </div>
      <div className="space-y-0.5 px-2">
        {personas.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onSelect(p)}
            className={[
              'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
              activePersona?.code === p.code
                ? 'bg-[#7B5CFF]/10 text-[#7B5CFF] font-medium'
                : 'text-foreground hover:bg-muted',
            ].join(' ')}
          >
            <span className="text-base leading-none">{personaIcons[p.code] ?? '🤖'}</span>
            <span className="truncate">{p.name.replace(' Agent', '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  persona,
  suggestions,
  onSelect,
}: {
  persona: AgentPersonaSummary | null;
  suggestions?: string[];
  onSelect: (q: string) => void;
}) {
  const title = persona?.name ?? '洞悉美业·门店运营智能体';
  const description = persona?.description ?? '直接输入经营、客户、预约、库存、营销或财务问题，系统会自动分配给合适的专业 Agent。';
  const promptSuggestions = suggestions?.length ? suggestions : persona?.suggestedQuestions ?? [];
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7B5CFF]/10 text-3xl mb-4">
        🤖
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground text-center max-w-xs">
        {description}
      </p>
      <div className="mt-6 grid gap-2 w-full max-w-sm">
        {promptSuggestions.slice(0, 4).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted hover:border-foreground/20 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MessageItem ──────────────────────────────────────────────────────────────

export function MessageItem({
  msg,
  onFollowUp,
  onFeedback,
  onAction,
}: {
  msg: ConversationMessage;
  onFollowUp: (s: string) => void;
  onFeedback: (runId: number, adopted: boolean) => void;
  onAction: (actionId: string, payload?: AgentActionPayload) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-[#7B5CFF] px-4 py-3 text-sm text-white">
          {msg.text}
        </div>
      </div>
    );
  }

  // Agent 消息
  if (msg.loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[#7B5CFF]/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">洞悉美业正在分析...</span>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {msg.error}
      </div>
    );
  }

  const hasBlocks = msg.blocks && msg.blocks.length > 0;
  // 过滤掉 follow_up_chips 从 blocks 中（单独渲染）
  const contentBlocks = msg.blocks?.filter((b) => b.kind !== 'follow_up_chips') ?? [];
  const followUps = msg.followUpSuggestions ?? [];
  const phaseOutputs = msg.phaseOutputs ?? [];
  const blockActionIds = collectBlockActionIds(contentBlocks);
  const actions = (msg.actions ?? []).filter((action) => !blockActionIds.has(action.action));
  const limitations = msg.limitations ?? [];
  const statusNotice = msg.statusNotice;
  const routePersonaCode = msg.routeDecision?.personaCode ?? msg.personaCode;
  const routeLabel = routePersonaCode ? personaRouteLabels[String(routePersonaCode)] ?? `${routePersonaCode} Agent` : '';
  const architectureLabel = getArchitectureLabel(msg.architecture);
  const statusNoticeClass =
    statusNotice?.kind === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : statusNotice?.kind === 'unsupported'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3">
        {routeLabel || architectureLabel ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {routeLabel ? (
              <span className="rounded-full bg-[#7B5CFF]/10 px-2.5 py-1 font-medium text-[#7B5CFF]">
                由 {routeLabel} 处理
              </span>
            ) : null}
            {architectureLabel ? (
              <span
                className="rounded-full bg-[#C9956C]/10 px-2.5 py-1 font-medium text-[#8A5D38]"
                title={[
                  msg.agentV2GrayMode ? `灰度：${msg.agentV2GrayMode}` : '',
                  msg.agentV2FinalEngine ? `最终引擎：${msg.agentV2FinalEngine}` : '',
                ].filter(Boolean).join(' · ')}
              >
                {architectureLabel}
                {msg.agentV2GrayMode ? ` · ${msg.agentV2GrayMode}` : ''}
              </span>
            ) : null}
            {routeLabel && msg.routeDecision?.reason ? <span className="line-clamp-1">{msg.routeDecision.reason}</span> : null}
          </div>
        ) : null}
        {phaseOutputs.length > 0 && (
          <div className={hasBlocks ? 'mb-3' : ''}>
            <AgentPhaseOutputRenderer phases={phaseOutputs} />
          </div>
        )}
        {hasBlocks ? (
          <AgentBlockRenderer
            blocks={contentBlocks}
            onCommand={onFollowUp}
            onAction={onAction}
          />
        ) : (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{msg.text}</p>
        )}
        {statusNotice && (
          <div className={['mt-3 rounded-lg border px-3 py-2 text-xs leading-5', statusNoticeClass].join(' ')}>
            <div className="font-medium">{statusNotice.title}</div>
            <div className="mt-1 opacity-90">{statusNotice.message}</div>
          </div>
        )}
        {limitations.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
            限制说明：{limitations.join('；')}
          </div>
        )}
        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.slice(0, 3).map((action) => (
              <button
                key={`${action.action}-${action.label}`}
                type="button"
                onClick={() => onAction(action.action)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 关联问题推荐 */}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {followUps.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onFollowUp(s)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted hover:border-foreground/20 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 反馈按钮 */}
      {msg.runId && (
        <div className="flex gap-2 px-1">
          <button
            type="button"
            onClick={() => onFeedback(msg.runId!, true)}
            className="text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
          >
            👍 有用
          </button>
          <button
            type="button"
            onClick={() => onFeedback(msg.runId!, false)}
            className="text-xs text-muted-foreground hover:text-rose-500 transition-colors"
          >
            👎 无用
          </button>
        </div>
      )}
    </div>
  );
}

function collectBlockActionIds(blocks: NonNullable<ConversationMessage['blocks']>) {
  const ids = new Set<string>();
  for (const block of blocks) {
    if ('actionId' in block && typeof block.actionId === 'string') {
      ids.add(block.actionId);
    }
    if ('actions' in block && Array.isArray(block.actions)) {
      for (const action of block.actions) {
        if (action && typeof action === 'object' && 'actionId' in action && typeof action.actionId === 'string') {
          ids.add(action.actionId);
        }
      }
    }
  }
  return ids;
}
