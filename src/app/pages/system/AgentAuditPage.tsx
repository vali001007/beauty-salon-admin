import { useMemo, useState } from 'react';
import { Bot, CheckCircle2, Eye, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  approveAgentApproval,
  compileBusinessTask,
  getAgentApprovalsPaginated,
  getAgentRunDetail,
  getAgentRunsPaginated,
  getAgentTools,
  rejectAgentApproval,
  runDefaultAgentEvals,
} from '@/api/agent';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { usePagination } from '@/hooks/usePagination';
import type {
  AgentApprovalListItem,
  AgentBusinessTaskCompileResult,
  AgentEvalSummary,
  AgentRole,
  AgentRunDetail,
  AgentRunRecord,
  AgentToolCatalogItem,
  BusinessTask,
  SemanticSqlCandidate,
} from '@/types/agent';

const RUN_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'waiting_approval', label: '待确认' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
  { value: 'running_tool', label: '执行中' },
];

const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'manager', label: '店长' },
  { value: 'reception', label: '前台' },
  { value: 'beautician', label: '美容师' },
];

const ENTRYPOINT_OPTIONS = [
  { value: '', label: '全部入口' },
  { value: 'aura_lite', label: 'Aura Lite' },
  { value: 'web_app', label: 'web app' },
  { value: 'api', label: 'API' },
  { value: 'test', label: '测试' },
];

const APPROVAL_STATUS_OPTIONS = [
  { value: '', label: '全部审批' },
  { value: 'pending', label: '待确认' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

function formatDateTime(value?: string | null) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
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

function getRunStatusLabel(status: string) {
  return RUN_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function getApprovalStatusLabel(status: string) {
  return APPROVAL_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

function getStatusClass(status: string) {
  if (status === 'completed' || status === 'approved' || status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'waiting_approval' || status === 'pending' || status === 'running_tool' || status === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (status === 'failed' || status === 'rejected' || status === 'cancelled' || status === 'high') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getRiskLabel(risk: string) {
  if (risk === 'low') return '低风险';
  if (risk === 'medium') return '中风险';
  if (risk === 'high') return '高风险';
  return risk || '-';
}

function getRoleScopeLabel(roles: string[]) {
  return roles.map(getRoleLabel).join('、') || '-';
}

function getRunEvidence(run?: AgentRunRecord | null) {
  return run?.evidenceJson || (run?.resultJson as { evidence?: unknown } | undefined)?.evidence;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function getToolResultRecord(value: unknown) {
  return asRecord(value);
}

function getToolConsumedSlots(resultJson: unknown) {
  const result = getToolResultRecord(resultJson);
  const data = asRecord(result?.data);
  return asRecord(data?.consumedSlots);
}

function getToolEvidence(resultJson: unknown) {
  const result = getToolResultRecord(resultJson);
  return asRecord(result?.evidence);
}

function getConsumedSlotRows(consumedSlots: Record<string, unknown> | undefined) {
  if (!consumedSlots) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const timeRange = asRecord(consumedSlots.timeRange);
  if (timeRange) {
    rows.push({
      label: '统计周期',
      value: [timeRange.label, timeRange.start && timeRange.end ? `${timeRange.start} 至 ${timeRange.end}` : '', timeRange.preset]
        .filter(Boolean)
        .map(String)
        .join(' · '),
    });
  }
  if (consumedSlots.limit !== undefined) {
    rows.push({ label: '返回数量', value: String(consumedSlots.limit) });
  }
  const filters = asRecord(consumedSlots.filters);
  if (filters && Object.keys(filters).length > 0) {
    rows.push({ label: '过滤条件', value: Object.entries(filters).map(([key, value]) => `${key}: ${String(value)}`).join('；') });
  }
  return rows;
}

function JsonBlock({ title, value, maxHeight = 'max-h-64' }: { title: string; value: unknown; maxHeight?: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700">{title}</div>
      <pre className={`${maxHeight} overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-gray-700`}>
        {formatJson(value)}
      </pre>
    </div>
  );
}

function ToolCallAuditSummary({ resultJson }: { resultJson: unknown }) {
  const consumedSlots = getToolConsumedSlots(resultJson);
  const slotRows = getConsumedSlotRows(consumedSlots);
  const evidence = getToolEvidence(resultJson);
  const sources = asStringList(evidence?.source);
  const filters = asStringList(evidence?.filters);
  const limitations = asStringList(evidence?.limitations);
  const hasSummary = slotRows.length > 0 || evidence;
  if (!hasSummary) return null;

  return (
    <div className="mb-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
        <div className="mb-2 text-xs font-semibold text-sky-900">实际消费槽位</div>
        {slotRows.length ? (
          <dl className="space-y-1 text-xs text-sky-950">
            {slotRows.map((row) => (
              <div key={row.label} className="flex gap-2">
                <dt className="w-20 shrink-0 text-sky-700">{row.label}</dt>
                <dd className="min-w-0 flex-1 break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="text-xs text-sky-700">该工具未声明或未回写槽位。</div>
        )}
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
        <div className="mb-2 text-xs font-semibold text-emerald-900">工具数据依据</div>
        <dl className="space-y-1 text-xs text-emerald-950">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-emerald-700">数据来源</dt>
            <dd className="min-w-0 flex-1 break-words">{sources.join('、') || '-'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-emerald-700">统计范围</dt>
            <dd className="min-w-0 flex-1 break-words">{String(evidence?.dateRange ?? '-')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-emerald-700">样本量</dt>
            <dd className="min-w-0 flex-1 break-words">{String(evidence?.sampleSize ?? '-')}</dd>
          </div>
          {filters.length ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-emerald-700">查询条件</dt>
              <dd className="min-w-0 flex-1 break-words">{filters.join('；')}</dd>
            </div>
          ) : null}
          {limitations.length ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-emerald-700">口径限制</dt>
              <dd className="min-w-0 flex-1 break-words">{limitations.join('；')}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

export function AgentAuditPage() {
  const [activeTab, setActiveTab] = useState<'runs' | 'approvals' | 'studio'>('runs');
  const [runStatus, setRunStatus] = useState('');
  const [role, setRole] = useState('');
  const [entrypoint, setEntrypoint] = useState('');
  const [keyword, setKeyword] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('pending');
  const [selectedDetail, setSelectedDetail] = useState<AgentRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approvalLoadingId, setApprovalLoadingId] = useState<number | null>(null);
  const [tools, setTools] = useState<AgentToolCatalogItem[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [evalSummary, setEvalSummary] = useState<AgentEvalSummary | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const runFilters = useMemo(
    () => ({
      status: runStatus || undefined,
      role: role || undefined,
      entrypoint: entrypoint || undefined,
      keyword: keyword.trim() || undefined,
    }),
    [runStatus, role, entrypoint, keyword],
  );

  const approvalFilters = useMemo(
    () => ({
      status: approvalStatus || undefined,
    }),
    [approvalStatus],
  );

  const runs = usePagination<AgentRunRecord>(getAgentRunsPaginated, runFilters);
  const approvals = usePagination<AgentApprovalListItem>(getAgentApprovalsPaginated, approvalFilters);

  const totalPages = Math.ceil(runs.total / runs.pageSize) || 1;
  const approvalTotalPages = Math.ceil(approvals.total / approvals.pageSize) || 1;

  const openRunDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detail = await getAgentRunDetail(id);
      setSelectedDetail(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AgentRun 详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const approveApproval = async (approvalId: number) => {
    setApprovalLoadingId(approvalId);
    try {
      await approveAgentApproval(approvalId, { comment: '管理端人工确认执行' });
      toast.success('已确认执行 Agent 动作');
      approvals.refresh();
      runs.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '确认执行失败');
    } finally {
      setApprovalLoadingId(null);
    }
  };

  const rejectApproval = async (approvalId: number) => {
    setApprovalLoadingId(approvalId);
    try {
      await rejectAgentApproval(approvalId, { comment: '管理端人工拒绝执行' });
      toast.success('已拒绝 Agent 动作');
      approvals.refresh();
      runs.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '拒绝执行失败');
    } finally {
      setApprovalLoadingId(null);
    }
  };

  const loadAgentStudio = async () => {
    setToolsLoading(true);
    try {
      const data = await getAgentTools();
      setTools(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent 工具目录加载失败');
    } finally {
      setToolsLoading(false);
    }
    setEvalLoading(true);
    try {
      const data = await runDefaultAgentEvals();
      setEvalSummary(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent 默认评测运行失败');
    } finally {
      setEvalLoading(false);
    }
  };

  const openStudioTab = () => {
    setActiveTab('studio');
    if (!tools.length && !toolsLoading) void loadAgentStudio();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / Agent 审计</div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">经营 Agent 审计</h2>
          <p className="mt-1 text-sm text-gray-500">
            查看 AgentRun、ToolCall、审批和证据包，用于排查问答规划、工具执行和人工确认链路。
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-600">
          <ShieldCheck className="h-4 w-4 text-primary" />
          只读审计 + 人工确认
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">AgentRun</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{runs.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">待确认动作</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {approvalStatus === 'pending' ? approvals.total : '-'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">当前能力</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-900">
            <Bot className="h-4 w-4 text-primary" />
            问数 / 草稿 / 排班预览
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={activeTab === 'runs' ? 'default' : 'outline'} onClick={() => setActiveTab('runs')}>
          运行日志
        </Button>
        <Button variant={activeTab === 'approvals' ? 'default' : 'outline'} onClick={() => setActiveTab('approvals')}>
          审批中心
        </Button>
        <Button variant={activeTab === 'studio' ? 'default' : 'outline'} onClick={openStudioTab}>
          工具与评测
        </Button>
      </div>

      {activeTab === 'runs' ? (
        <>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_160px_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    runs.setPage(1);
                  }}
                  className="pl-9"
                  placeholder="搜索 runNo、问题或 Agent Code"
                />
              </div>
              <select
                value={runStatus}
                onChange={(event) => {
                  setRunStatus(event.target.value);
                  runs.setPage(1);
                }}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {RUN_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  runs.setPage(1);
                }}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={entrypoint}
                onChange={(event) => {
                  setEntrypoint(event.target.value);
                  runs.setPage(1);
                }}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {ENTRYPOINT_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setRunStatus('');
                  setRole('');
                  setEntrypoint('');
                  runs.setPage(1);
                }}
              >
                重置
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>角色 / 入口</TableHead>
                <TableHead>用户问题</TableHead>
                <TableHead>Tool / Approval</TableHead>
                <TableHead>完成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    正在加载 AgentRun...
                  </TableCell>
                </TableRow>
              ) : runs.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    暂无 AgentRun 记录。
                  </TableCell>
                </TableRow>
              ) : (
                runs.data.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(run.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{run.runNo}</div>
                      <div className="text-xs text-gray-500">{run.agentCode}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(run.status)}`}>
                        {getRunStatusLabel(run.status)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {getRoleLabel(String(run.role))}
                      <div className="text-xs text-gray-500">{run.entrypoint}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">{run.userInput}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {run.toolCallCount ?? 0} / {run.approvalCount ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(run.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openRunDetail(run.id)}>
                        <Eye className="h-4 w-4" />
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationFooter
            total={runs.total}
            page={runs.page}
            pageSize={runs.pageSize}
            totalPages={totalPages}
            setPage={runs.setPage}
            setPageSize={runs.setPageSize}
          />
        </>
      ) : activeTab === 'approvals' ? (
        <>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[220px_auto] md:items-center">
              <select
                value={approvalStatus}
                onChange={(event) => {
                  setApprovalStatus(event.target.value);
                  approvals.setPage(1);
                }}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {APPROVAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="text-sm text-gray-500">中高风险工具只允许在这里人工确认或拒绝。</div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>工具</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>请求内容</TableHead>
                <TableHead>审批人</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    正在加载 Agent 审批...
                  </TableCell>
                </TableRow>
              ) : approvals.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                    暂无 Agent 审批记录。
                  </TableCell>
                </TableRow>
              ) : (
                approvals.data.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(approval.createdAt)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(approval.status)}`}>
                        {getApprovalStatusLabel(approval.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{approval.toolCall?.toolName || '-'}</div>
                      <div className="text-xs text-gray-500">{approval.toolCall?.riskLevel || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{approval.run?.runNo || `#${approval.runId}`}</div>
                      <div className="text-xs text-gray-500">
                        {approval.run ? `${getRoleLabel(String(approval.run.role))} / ${approval.run.entrypoint}` : '-'}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate">
                      {approval.run?.userInput || formatJson(approval.beforeJson)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {approval.approvedBy || '-'}
                      <div className="text-xs text-gray-500">{formatDateTime(approval.decidedAt)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {approval.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="success"
                            size="sm"
                            className="gap-2"
                            disabled={approvalLoadingId === approval.id}
                            onClick={() => approveApproval(approval.id)}
                          >
                            {approvalLoadingId === approval.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            确认
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="gap-2"
                            disabled={approvalLoadingId === approval.id}
                            onClick={() => rejectApproval(approval.id)}
                          >
                            <XCircle className="h-4 w-4" />
                            拒绝
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">已处理</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <PaginationFooter
            total={approvals.total}
            page={approvals.page}
            pageSize={approvals.pageSize}
            totalPages={approvalTotalPages}
            setPage={approvals.setPage}
            setPageSize={approvals.setPageSize}
          />
        </>
      ) : (
        <AgentStudioSection
          tools={tools}
          toolsLoading={toolsLoading}
          evalSummary={evalSummary}
          evalLoading={evalLoading}
          onRefresh={loadAgentStudio}
        />
      )}

      <Dialog open={detailLoading || !!selectedDetail} onOpenChange={(open) => !open && setSelectedDetail(null)}>
        <DialogContent className="sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>AgentRun 详情</DialogTitle>
            <DialogDescription>查看本次 Agent 规划、工具调用、审批状态、证据包和消息记录。</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-10 text-center text-gray-500">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              正在加载详情...
            </div>
          ) : selectedDetail?.run ? (
            <div className="max-h-[72vh] space-y-5 overflow-auto pr-2">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">RunNo</div>
                  <div className="mt-1 font-medium">{selectedDetail.run.runNo}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">状态</div>
                  <div className="mt-1 font-medium">{getRunStatusLabel(String(selectedDetail.run.status))}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">角色 / 入口</div>
                  <div className="mt-1 font-medium">
                    {getRoleLabel(String(selectedDetail.run.role))} / {selectedDetail.run.entrypoint}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">完成时间</div>
                  <div className="mt-1 font-medium">{formatDateTime(selectedDetail.run.completedAt)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-gray-500">用户问题</div>
                <div className="mt-1 text-sm text-gray-800">{selectedDetail.run.userInput}</div>
                {selectedDetail.run.errorMessage ? (
                  <div className="mt-2 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{selectedDetail.run.errorMessage}</div>
                ) : null}
              </div>

              <AgentRunSemanticSummary planJson={selectedDetail.run.planJson} />

              <div className="grid gap-4 lg:grid-cols-2">
                <JsonBlock title="Planner 输出" value={selectedDetail.run.planJson} />
                <JsonBlock title="证据包" value={getRunEvidence(selectedDetail.run)} />
              </div>

              <JsonBlock title="最终结果" value={selectedDetail.run.resultJson} maxHeight="max-h-80" />

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">消息记录</div>
                <div className="space-y-2">
                  {selectedDetail.messages.map((message) => (
                    <div key={message.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="mb-1 text-xs text-gray-500">
                        {message.role} · {formatDateTime(message.createdAt)}
                      </div>
                      <div className="whitespace-pre-wrap text-gray-800">{message.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">工具调用</div>
                <div className="space-y-3">
                  {selectedDetail.toolCalls.map((toolCall) => (
                    <div key={toolCall.id} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{toolCall.toolName}</div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(toolCall.status)}`}>
                          {toolCall.status}
                        </span>
                      </div>
                      <ToolCallAuditSummary resultJson={toolCall.resultJson} />
                      <div className="grid gap-3 lg:grid-cols-2">
                        <JsonBlock title="参数" value={toolCall.argsJson} maxHeight="max-h-48" />
                        <JsonBlock title="结果" value={toolCall.resultJson} maxHeight="max-h-48" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">审批记录</div>
                <div className="space-y-3">
                  {selectedDetail.approvals.length ? (
                    selectedDetail.approvals.map((approval) => (
                      <div key={approval.id} className="rounded-lg border border-border p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">审批 #{approval.id}</div>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(approval.status)}`}>
                            {getApprovalStatusLabel(approval.status)}
                          </span>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          <JsonBlock title="审批前" value={approval.beforeJson} maxHeight="max-h-48" />
                          <JsonBlock title="审批后" value={approval.afterJson} maxHeight="max-h-48" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-border p-3 text-sm text-gray-500">本次运行无审批记录。</div>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">执行步骤</div>
                <div className="space-y-2">
                  {selectedDetail.steps.map((step) => (
                    <div key={step.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {step.stepType} · {step.name}
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(step.status)}`}>
                          {step.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatDateTime(step.startedAt)} - {formatDateTime(step.endedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentRunSemanticSummary({ planJson }: { planJson: unknown }) {
  const plan = planJson && typeof planJson === 'object' ? (planJson as Record<string, unknown>) : null;
  const task = plan?.businessTask && typeof plan.businessTask === 'object' ? (plan.businessTask as BusinessTask) : null;
  const capability =
    plan?.capabilityPlan && typeof plan.capabilityPlan === 'object'
      ? (plan.capabilityPlan as { capabilityId?: string; reason?: string })
      : null;
  const sql = plan?.semanticSqlCandidate && typeof plan.semanticSqlCandidate === 'object'
    ? (plan.semanticSqlCandidate as SemanticSqlCandidate)
    : null;

  if (!task && !capability && !sql) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-gray-500">
        本次运行未记录结构化经营语义，可能是旧版本 AgentRun 或非经营语义任务。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800">经营语义摘要</div>
          <div className="text-xs text-gray-500">从 Planner 输出提取 BusinessTask、能力命中和 Semantic SQL 决策。</div>
        </div>
        {task ? (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(task.requiresApproval ? 'medium' : 'success')}`}>
            {task.requiresApproval ? '需审批' : '只读/低风险'}
          </span>
        ) : null}
      </div>

      {task ? (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <SemanticSummaryCard label="领域" value={task.domain} />
          <SemanticSummaryCard label="任务类型" value={task.taskType} />
          <SemanticSummaryCard label="数量" value={task.limit ? String(task.limit) : '-'} />
          <SemanticSummaryCard label="置信度" value={`${Math.round(task.confidence * 100)}%`} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">BusinessTask</div>
          {task ? (
            <div className="space-y-2 text-sm text-gray-700">
              <InfoLine label="目标" value={task.objective} />
              <InfoLine label="输出" value={task.outputMode} />
              <InfoLine label="时间" value={task.timeRange?.label || '-'} />
              <InfoLine label="指标" value={task.metrics?.length ? task.metrics.join('、') : '-'} />
              <InfoLine label="缺槽" value={task.missingSlots?.length ? task.missingSlots.join('、') : '无'} />
            </div>
          ) : (
            <div className="text-sm text-gray-500">未记录 BusinessTask。</div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">能力计划</div>
          {capability ? (
            <div className="space-y-2 text-sm text-gray-700">
              <InfoLine label="能力" value={capability.capabilityId || '-'} />
              <InfoLine label="原因" value={capability.reason || '-'} />
            </div>
          ) : (
            <div className="text-sm text-gray-500">未记录能力计划。</div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">Semantic SQL</div>
          {sql ? (
            <div className="space-y-2 text-sm text-gray-700">
              <InfoLine label="状态" value={sql.status} />
              <InfoLine label="允许" value={sql.allowed ? '是' : '否'} />
              <InfoLine label="原因" value={sql.reason} />
              <InfoLine label="Fallback" value={sql.fallbackCapability || '-'} />
            </div>
          ) : (
            <div className="text-sm text-gray-500">未记录 Semantic SQL 决策。</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentStudioSection({
  tools,
  toolsLoading,
  evalSummary,
  evalLoading,
  onRefresh,
}: {
  tools: AgentToolCatalogItem[];
  toolsLoading: boolean;
  evalSummary: AgentEvalSummary | null;
  evalLoading: boolean;
  onRefresh: () => void;
}) {
  const approvalToolCount = tools.filter((tool) => tool.requiresApproval).length;
  const passedRate = evalSummary?.total ? Math.round((evalSummary.passed / evalSummary.total) * 100) : 0;
  const [compileMessage, setCompileMessage] = useState('今天最值得跟进的10个客户');
  const [compileRole, setCompileRole] = useState<AgentRole>('manager');
  const [compileResult, setCompileResult] = useState<AgentBusinessTaskCompileResult | null>(null);
  const [compileLoading, setCompileLoading] = useState(false);

  const previewBusinessTask = async () => {
    const message = compileMessage.trim();
    if (!message) {
      toast.error('请输入要编译的经营问题');
      return;
    }
    setCompileLoading(true);
    try {
      const result = await compileBusinessTask({ message, role: compileRole });
      setCompileResult(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '经营任务编译失败');
    } finally {
      setCompileLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Agent Studio 最小治理台</h3>
            <p className="mt-1 text-sm text-gray-500">
              查看工具目录、风险边界和默认评测结果；P0 不提供在线编辑工具代码。
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={toolsLoading || evalLoading}>
            {toolsLoading || evalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            刷新评测
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">经营语义编译预览</h3>
            <p className="text-sm text-gray-500">预览 BusinessTask、能力命中、指标口径和 Semantic SQL 决策。</p>
          </div>
          <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
            结构化编译 + 无模型降级
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_160px_auto] lg:items-center">
          <Input
            value={compileMessage}
            onChange={(event) => setCompileMessage(event.target.value)}
            placeholder="例如：今天最值得跟进的10个客户"
          />
          <select
            value={compileRole}
            onChange={(event) => setCompileRole(event.target.value as AgentRole)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {ROLE_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button onClick={previewBusinessTask} disabled={compileLoading} className="gap-2">
            {compileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            编译预览
          </Button>
        </div>

        {compileResult ? <BusinessTaskCompilePreview result={compileResult} /> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">注册工具</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{tools.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">需人工确认</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{approvalToolCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">默认评测</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {evalSummary ? `${evalSummary.passed}/${evalSummary.total}` : '-'}
          </div>
          <div className="mt-1 text-xs text-gray-500">{evalSummary ? `通过率 ${passedRate}%` : '点击刷新评测获取结果'}</div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>工具</TableHead>
            <TableHead>风险</TableHead>
            <TableHead>角色范围</TableHead>
            <TableHead>审批</TableHead>
            <TableHead>权限</TableHead>
            <TableHead>限制</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {toolsLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                正在加载工具目录...
              </TableCell>
            </TableRow>
          ) : tools.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                暂无工具目录，请点击刷新评测。
              </TableCell>
            </TableRow>
          ) : (
            tools.map((tool) => (
              <TableRow key={tool.name}>
                <TableCell>
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-xs text-gray-500">{tool.description}</div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(tool.riskLevel)}`}>
                    {getRiskLabel(tool.riskLevel)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{getRoleScopeLabel(tool.allowedRoles)}</TableCell>
                <TableCell className="whitespace-nowrap">{tool.requiresApproval ? '需要' : '不需要'}</TableCell>
                <TableCell className="max-w-[240px]">
                  {tool.requiredPermissions.length ? tool.requiredPermissions.join('、') : '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {tool.maxRows ? `最多 ${tool.maxRows} 行` : '不限行数'}
                  <div className="text-xs text-gray-500">超时 {tool.timeoutMs}ms</div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">默认评测集</h3>
            <p className="text-sm text-gray-500">用于检查 Planner 路由、风险拦截和动作建议是否回归。</p>
          </div>
          {evalSummary ? (
            <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(evalSummary.failed ? 'failed' : 'success')}`}>
              {evalSummary.failed ? `失败 ${evalSummary.failed} 条` : '全部通过'}
            </span>
          ) : null}
        </div>
        {evalLoading ? (
          <div className="py-10 text-center text-gray-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            正在运行默认评测...
          </div>
        ) : evalSummary?.results?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用例</TableHead>
                <TableHead>期望工具</TableHead>
                <TableHead>实际工具</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evalSummary.results.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.scenario}</div>
                    <div className="text-xs text-gray-500">{item.id}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{String(item.expected.firstTool || '-')}</TableCell>
                  <TableCell className="whitespace-nowrap">{String(item.actual.firstTool || '-')}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(item.passed ? 'success' : 'failed')}`}>
                      {item.passed ? '通过' : '失败'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate">{item.errors.length ? item.errors.join('；') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-gray-500">
            尚未运行默认评测。
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="font-semibold">外部 MCP / A2A 接入边界</div>
        <p className="mt-1">
          当前版本只保留协议适配边界，不接真实外部工具。上线前需完成凭据管理、工具白名单、沙箱隔离、审计映射和超时熔断。
        </p>
      </div>
    </div>
  );
}

function BusinessTaskCompilePreview({ result }: { result: AgentBusinessTaskCompileResult }) {
  const task = result.task;
  const sql = result.semanticSqlCandidate;
  const primaryCapability = result.capabilityMatches[0];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SemanticSummaryCard label="领域" value={task.domain} />
        <SemanticSummaryCard label="任务类型" value={task.taskType} />
        <SemanticSummaryCard label="数量" value={task.limit ? String(task.limit) : '-'} />
        <SemanticSummaryCard label="置信度" value={`${Math.round(task.confidence * 100)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">BusinessTask</div>
          <div className="space-y-2 text-sm text-gray-700">
            <InfoLine label="目标" value={task.objective} />
            <InfoLine label="输出" value={task.outputMode} />
            <InfoLine label="时间" value={task.timeRange?.label || '-'} />
            <InfoLine label="指标" value={task.metrics.length ? task.metrics.join('、') : '-'} />
            <InfoLine label="缺槽" value={task.missingSlots.length ? task.missingSlots.join('、') : '无'} />
            <InfoLine label="审批" value={task.requiresApproval ? '需要' : '不需要'} />
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">能力命中</div>
          {primaryCapability ? (
            <div className="space-y-2 text-sm text-gray-700">
              <InfoLine label="能力" value={primaryCapability.capabilityId} />
              <InfoLine label="原因" value={primaryCapability.reason} />
              <InfoLine label="工具" value={primaryCapability.toolPlan.map((item) => item.tool).join('、')} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-gray-500">未命中能力，需要澄清。</div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">Semantic SQL 决策</div>
          <div className="space-y-2 text-sm text-gray-700">
            <InfoLine label="状态" value={sql.status} />
            <InfoLine label="允许" value={sql.allowed ? '是' : '否'} />
            <InfoLine label="原因" value={sql.reason} />
            <InfoLine label="Fallback" value={sql.fallbackCapability || '-'} />
            <InfoLine label="拒绝规则" value={sql.rejectedRules.length ? sql.rejectedRules.join('、') : '无'} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <JsonBlock title="编译校验" value={result.validation} maxHeight="max-h-52" />
        <JsonBlock title="指标命中" value={result.metricMatches} maxHeight="max-h-52" />
        <JsonBlock title="完整编译结果" value={result} maxHeight="max-h-52" />
      </div>
    </div>
  );
}

function SemanticSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[68px_1fr] gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="break-words text-gray-800">{value}</span>
    </div>
  );
}

function PaginationFooter({
  total,
  page,
  pageSize,
  totalPages,
  setPage,
  setPageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-gray-500">共 {total} 条</div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => setPageSize(Number(event.target.value))}
          className="h-8 rounded border border-gray-300 px-2 text-sm"
        >
          <option value={10}>10条/页</option>
          <option value={20}>20条/页</option>
          <option value={50}>50条/页</option>
        </select>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <span className="text-sm text-gray-600">
          {page} / {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          下一页
        </Button>
      </div>
    </div>
  );
}
