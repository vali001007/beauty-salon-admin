import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, ChevronRight, RefreshCw, Play, Zap } from 'lucide-react';
import type {
  AgentAutomationDefinitionItem,
  AgentAutomationRunItem,
  AgentAutomationTriggerTemplate,
  AgentDailyArchiveItem,
  AgentMemoryItem,
  AgentPersonaSummary,
  AgentQualityReport,
  AgentRole,
  AgentRunResultV2,
  AgentSchemaReadiness,
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
  getAgentDailyArchives,
  getAgentMemories,
  getAgentPersonas,
  getAgentQualityReport,
  getAgentSchemaReadiness,
  rejectAgentApproval,
  runAgentAutomationOnce,
  submitAgentFeedback,
} from '@/api/real/agent';
import { useStoreStore } from '@/stores/storeStore';
import { useAuthStore } from '@/stores/authStore';
import { AgentBlockRenderer } from './components/AgentBlockRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  blocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
  loading?: boolean;
  error?: string;
  runId?: number;
}

type AgentActionPayload = {
  args?: Record<string, unknown>;
};

// ─── Main Workspace ───────────────────────────────────────────────────────────

export function AmiAgentWorkspace() {
  const navigate = useNavigate();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const user = useAuthStore((s) => s.user);

  const [personas, setPersonas] = useState<AgentPersonaSummary[]>([]);
  const [activePersona, setActivePersona] = useState<AgentPersonaSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<React.ElementRef<'textarea'>>(null);

  // 加载 Persona 列表
  useEffect(() => {
    getAgentPersonas()
      .then((list) => {
        setPersonas(list);
        if (list.length > 0) setActivePersona(list[0]);
      })
      .catch(console.warn);
  }, []);

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

  const appendMessage = useCallback((msg: ConversationMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAgentMessage = useCallback((patch: Partial<ConversationMessage>) => {
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === 'agent');
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((m, i) => (i === realIdx ? { ...m, ...patch } : m));
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      const userMsg: ConversationMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: text.trim(),
      };
      const agentMsg: ConversationMessage = {
        id: `a_${Date.now()}`,
        role: 'agent',
        loading: true,
      };
      appendMessage(userMsg);
      appendMessage(agentMsg);
      setInput('');
      setSending(true);

      try {
        let result: AgentRunResultV2;
        const agentRole = resolveAgentRole(user?.roles);
        if (activeRunId) {
          result = await appendAgentMessage(activeRunId, {
            message: text.trim(),
            role: agentRole,
          });
        } else {
          result = await createAgentRun({
            message: text.trim(),
            role: agentRole,
            entrypoint: `ami-agent:${activePersona?.code ?? 'manager'}`,
          });
          setActiveRunId(result.runId);
        }

        updateLastAgentMessage({
          loading: false,
          text: result.answer,
          blocks: result.renderedBlocks,
          followUpSuggestions: result.followUpSuggestions,
          runId: result.runId,
        });
      } catch (err) {
        updateLastAgentMessage({
          loading: false,
          error: formatAgentError(err),
        });
      } finally {
        setSending(false);
      }
    },
    [sending, activeRunId, activePersona, user, appendMessage, updateLastAgentMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<React.ElementRef<'textarea'>>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handlePersonaChange = (persona: AgentPersonaSummary) => {
    setActivePersona(persona);
    setActiveRunId(null);
    setMessages([]);
  };

  const handleFollowUp = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleFeedback = async (runId: number, adopted: boolean) => {
    try {
      await submitAgentFeedback(runId, { adopted });
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
    const approvalAction = action;
    const approvalIdText = scope;
    const approvalId = Number(approvalIdText);
    if (!approvalId || !['approve', 'reject'].includes(approvalAction)) return;
    updateLastAgentMessage({ loading: true });
    try {
      const result = approvalAction === 'approve'
        ? await approveAgentApproval(approvalId, { role: resolveAgentRole(user?.roles), comment: '管理端确认执行', args: payload?.args })
        : await rejectAgentApproval(approvalId, { role: resolveAgentRole(user?.roles), comment: '管理端暂不执行' });
      updateLastAgentMessage({
        loading: false,
        text: result.answer,
        blocks: result.renderedBlocks,
        followUpSuggestions: result.followUpSuggestions,
        runId: result.runId,
      });
    } catch (err) {
      updateLastAgentMessage({
        loading: false,
        error: formatAgentError(err),
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* 左侧：Persona 列表 */}
      <PersonaSidebar
        personas={personas}
        activePersona={activePersona}
        onSelect={handlePersonaChange}
      />

      {/* 中间：对话区域 */}
      <div className="flex flex-1 flex-col overflow-hidden border-x border-border">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Sparkles className="h-5 w-5 text-[#7B5CFF]" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {activePersona?.name ?? '洞悉美业·运营智能体'}
            </h1>
            {activePersona && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                {activePersona.description}
              </p>
            )}
          </div>
        </div>

        {/* 消息流 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && activePersona && (
            <EmptyState persona={activePersona} onSelect={handleFollowUp} />
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

        {/* 输入区 */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-[#7B5CFF]/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activePersona ? `问 ${activePersona.name}...` : '输入你的问题...'}
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
  );
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
  onSelect,
}: {
  persona: AgentPersonaSummary;
  onSelect: (q: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7B5CFF]/10 text-3xl mb-4">
        🤖
      </div>
      <h2 className="text-base font-semibold text-foreground">{persona.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground text-center max-w-xs">
        {persona.description}
      </p>
      <div className="mt-6 grid gap-2 w-full max-w-sm">
        {persona.suggestedQuestions.slice(0, 4).map((q) => (
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

function MessageItem({
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

  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3">
        {hasBlocks ? (
          <AgentBlockRenderer
            blocks={contentBlocks}
            onCommand={onFollowUp}
            onAction={onAction}
          />
        ) : (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{msg.text}</p>
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
