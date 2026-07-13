import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Eye,
  GitBranch,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  activateAgentCapabilityManifestVersion,
  autoGovernAgentCapabilities,
  dryRunAgentCapabilityDraft,
  getAgentCapabilityDraft,
  getAgentCapabilityDrafts,
  getAgentCapabilityManifestVersions,
  getAgentToolQueryKeys,
  importAgentCapabilityDrafts,
  publishAgentCapabilities,
  reviewAgentCapabilityDraft,
  runAgentCapabilityDraftEvalGate,
  runAgentCapabilityEvalGate,
  runAgentCapabilityPostPublishSmokeTest,
  validateAgentCapabilityDraft,
} from '@/api';
import type {
  AgentCapabilityAutoGovernanceResult,
  AgentCapabilityDraftDetail,
  AgentCapabilityDraftListResult,
  AgentCapabilityDryRunResult,
  AgentCapabilityEvalGateResult,
  AgentCapabilityManifestVersion,
  AgentCapabilityPostPublishSmokeResult,
  AgentToolQueryKeyItem,
} from '@/types/agentCapabilityCenter';

const statusLabels: Record<string, string> = {
  draft: '待治理',
  needs_changes: '待补齐',
  needs_development: '待补齐',
  needs_review: '待复核',
  approved: '已审核',
  rejected: '已驳回',
  published: '已发布',
};

const releaseLabels: Record<string, string> = {
  auto_publish: '自动发布',
  approval_required: '人工审核',
  write_blocked: '写操作拦截',
};

const riskLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const sourceLabels: Record<string, string> = {
  auto_scan_draft: '自动扫描',
  auto_governance: '自动治理',
  manual_builtin: '内置迁移',
  eval_failure: '评测失败',
  text_to_sql_candidate: 'Text-to-SQL 候选',
};

const statusClass: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  needs_changes: 'bg-amber-50 text-amber-700',
  needs_development: 'bg-amber-50 text-amber-700',
  needs_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  published: 'bg-emerald-50 text-emerald-700',
};

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compactList(values?: string[], limit = 3) {
  const list = values?.filter(Boolean) ?? [];
  if (!list.length) return '-';
  return list.length > limit ? `${list.slice(0, limit).join('、')} 等 ${list.length} 项` : list.join('、');
}

type CapabilityActionError = Error & {
  payload?: {
    message?: unknown;
    details?: unknown;
  };
};

function getCapabilityActionError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return { title: fallback };
  const payload = (error as CapabilityActionError).payload;
  const details = payload?.details as Record<string, unknown> | undefined;
  const nestedMessage = details?.message as Record<string, unknown> | undefined;
  const blocked = (details?.blocked ?? nestedMessage?.blocked) as
    | Array<{ capabilityId?: string; issues?: Array<{ message?: string }> }>
    | undefined;
  const title =
    (typeof payload?.message === 'string' && payload.message) ||
    (typeof details?.message === 'string' && details.message) ||
    (typeof nestedMessage?.message === 'string' && nestedMessage.message) ||
    error.message ||
    fallback;
  if (!blocked?.length) return { title };
  const sample = blocked.slice(0, 3).map((item) => {
    const issue = item.issues?.find((entry) => entry.message)?.message ?? '未返回具体原因';
    return `${item.capabilityId ?? 'unknown'}：${issue}`;
  });
  const description = `${sample.join('\n')}${blocked.length > sample.length ? `\n另有 ${blocked.length - sample.length} 项被阻断` : ''}`;
  return { title, description };
}

function autoGovernanceSummary(result: AgentCapabilityAutoGovernanceResult) {
  const byStatus = result.summary.byStatus ?? {};
  return `已处理 ${result.processed} 项：已审核 ${byStatus.approved ?? 0}，待补齐 ${byStatus.needs_development ?? 0}，待复核 ${byStatus.needs_review ?? 0}`;
}

function StatCard({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string | number;
  tone?: 'gray' | 'blue' | 'green' | 'amber';
}) {
  const toneClass = {
    gray: 'bg-gray-50 text-gray-900',
    blue: 'bg-blue-50 text-blue-900',
    green: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
  }[tone];
  return (
    <div className={`rounded-lg border border-border p-4 ${toneClass}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function AgentCapabilityCenter() {
  const [query, setQuery] = useState({
    keyword: '',
    status: 'all',
    domain: 'all',
    source: 'all',
    riskLevel: 'all',
    releaseStrategy: 'all',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AgentCapabilityDraftListResult | null>(null);
  const [detail, setDetail] = useState<AgentCapabilityDraftDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [versions, setVersions] = useState<AgentCapabilityManifestVersion[]>([]);
  const [queryKeys, setQueryKeys] = useState<AgentToolQueryKeyItem[]>([]);
  const [dryRunResult, setDryRunResult] = useState<AgentCapabilityDryRunResult | null>(null);
  const [evalGateResult, setEvalGateResult] = useState<AgentCapabilityEvalGateResult | null>(null);
  const [smokeTestResult, setSmokeTestResult] = useState<AgentCapabilityPostPublishSmokeResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const stats = data?.stats.byStatus ?? {};
  const domains = useMemo(() => {
    const set = new Set<string>();
    data?.items.forEach((item) => item.domain && set.add(item.domain));
    return Array.from(set).sort();
  }, [data?.items]);

  const selectedCount = selectedIds.size;
  const allCurrentSelected =
    Boolean(data?.items.length) && data!.items.every((item) => selectedIds.has(item.capabilityId));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [drafts, versionList, keyList] = await Promise.all([
        getAgentCapabilityDrafts({ ...query, page, pageSize }),
        getAgentCapabilityManifestVersions(),
        getAgentToolQueryKeys(),
      ]);
      setData(drafts);
      setVersions(versionList);
      setQueryKeys(keyList);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '能力中心数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function openDetail(capabilityId: string, openDrawer = false, options: { resetResults?: boolean } = {}) {
    const resetResults = options.resetResults ?? true;
    if (openDrawer) {
      setDetail(null);
      setDetailOpen(true);
    }
    setDetailLoading(true);
    if (resetResults) {
      setDryRunResult(null);
      setEvalGateResult(null);
      setSmokeTestResult(null);
    }
    try {
      setDetail(await getAgentCapabilityDraft(capabilityId));
    } catch (error) {
      if (openDrawer) setDetailOpen(false);
      toast.error(error instanceof Error ? error.message : '能力详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  function updateQuery(next: Partial<typeof query>) {
    setQuery((current) => ({ ...current, ...next }));
    setPage(1);
  }

  function toggleSelected(capabilityId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(capabilityId)) next.delete(capabilityId);
      else next.add(capabilityId);
      return next;
    });
  }

  function toggleCurrentPage() {
    if (!data?.items.length) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allCurrentSelected) data.items.forEach((item) => next.delete(item.capabilityId));
      else data.items.forEach((item) => next.add(item.capabilityId));
      return next;
    });
  }

  async function runAction<T>(
    key: string,
    action: () => Promise<T>,
    success: string,
    after?: (result: T) => void | Promise<void>,
  ) {
    setActionLoading(key);
    try {
      const result = await action();
      toast.success(success);
      await after?.(result);
      await loadData();
      if (detail?.capabilityId) await openDetail(detail.capabilityId, false, { resetResults: false });
    } catch (error) {
      const message = getCapabilityActionError(error, '操作失败');
      toast.error(message.title, { description: message.description });
    } finally {
      setActionLoading(null);
    }
  }

  async function runSmokeTest(capabilityId: string) {
    setActionLoading('post-publish-smoke');
    try {
      const result = await runAgentCapabilityPostPublishSmokeTest(capabilityId);
      setSmokeTestResult(result);
      if (result.pass) toast.success('发布后烟测通过，Agent V2 已可命中该能力');
      else toast.error('发布后烟测未通过，请查看命中能力与工具结果');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布后烟测失败');
    } finally {
      setActionLoading(null);
    }
  }

  async function runAutoGovernance(capabilityIds = selectedArray) {
    setActionLoading('auto-governance');
    try {
      const result = await autoGovernAgentCapabilities(
        capabilityIds.length
          ? { capabilityIds, mode: 'selected', limit: capabilityIds.length }
          : { mode: 'open', limit: 100 },
      );
      toast.success('自动治理完成', { description: autoGovernanceSummary(result) });
      if (capabilityIds.length) setSelectedIds(new Set());
      await loadData();
      if (detail?.capabilityId) await openDetail(detail.capabilityId, false, { resetResults: false });
    } catch (error) {
      const message = getCapabilityActionError(error, '自动治理失败');
      toast.error(message.title, { description: message.description });
    } finally {
      setActionLoading(null);
    }
  }

  async function importAndAutoGovernance() {
    setActionLoading('import-auto-governance');
    try {
      await importAgentCapabilityDrafts();
      const result = await autoGovernAgentCapabilities({ mode: 'open', limit: 100 });
      toast.success('候选能力已导入并自动治理', { description: autoGovernanceSummary(result) });
      await loadData();
    } catch (error) {
      const message = getCapabilityActionError(error, '导入或自动治理失败');
      toast.error(message.title, { description: message.description });
    } finally {
      setActionLoading(null);
    }
  }

  async function publishDetailCapability(capabilityId: string) {
    setActionLoading('publish-detail');
    try {
      await publishAgentCapabilities({ capabilityIds: [capabilityId] });
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(capabilityId);
        return next;
      });
      await loadData();
      setDetail(await getAgentCapabilityDraft(capabilityId));
      const smokeResult = await runAgentCapabilityPostPublishSmokeTest(capabilityId);
      setSmokeTestResult(smokeResult);
      if (smokeResult.pass) toast.success('能力已发布，并通过发布后烟测');
      else toast.error('能力已发布，但发布后烟测未通过');
    } catch (error) {
      const message = getCapabilityActionError(error, '能力发布失败');
      toast.error(message.title, { description: message.description });
    } finally {
      setActionLoading(null);
    }
  }

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">首页 / 系统设置 / Agent 能力中心</div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Agent 能力中心</h1>
          <p className="mt-1 text-sm text-gray-600">
            将管理端和后端已具备的业务能力先进入候选池，经 DTO、权限、工具和评测预检后发布到 Agent V2 Manifest。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-white shadow-sm hover:bg-primary/90 disabled:opacity-60"
            onClick={() => void importAndAutoGovernance()}
            disabled={Boolean(actionLoading)}
          >
            <Sparkles className="h-4 w-4" />
            导入并治理
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-teal-200 px-4 text-sm text-teal-700 shadow-sm hover:bg-teal-50 disabled:opacity-60"
            onClick={() => void runAutoGovernance()}
            disabled={Boolean(actionLoading)}
          >
            <Bot className="h-4 w-4" />
            自动治理
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 px-4 text-sm text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-60"
            onClick={() =>
              void runAction(
                'eval-selected',
                () => runAgentCapabilityEvalGate({ capabilityIds: selectedArray }),
                '选中能力评测门禁已完成',
                (result) => setEvalGateResult(result),
              )
            }
            disabled={!selectedCount || Boolean(actionLoading)}
          >
            <ShieldCheck className="h-4 w-4" />
            评测选中
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 px-4 text-sm text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-60"
            onClick={() =>
              void runAction(
                'publish-selected',
                () => publishAgentCapabilities({ capabilityIds: selectedArray }),
                '已发布选中能力',
                () => setSelectedIds(new Set()),
              )
            }
            disabled={!selectedCount || Boolean(actionLoading)}
          >
            <PlayCircle className="h-4 w-4" />
            发布选中
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 px-4 text-sm text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-60"
            onClick={() =>
              void runAction(
                'publish-approved',
                () => publishAgentCapabilities({ mode: 'approved' }),
                '已发布审核通过能力',
              )
            }
            disabled={Boolean(actionLoading)}
          >
            <ShieldCheck className="h-4 w-4" />
            发布已审核
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <StatCard label="候选能力" value={data?.stats.total ?? 0} tone="gray" />
        <StatCard label="待治理" value={stats.draft ?? 0} tone="amber" />
        <StatCard label="待补齐" value={stats.needs_development ?? 0} tone="amber" />
        <StatCard label="待复核" value={stats.needs_review ?? 0} tone="amber" />
        <StatCard label="已审核" value={stats.approved ?? 0} tone="blue" />
        <StatCard label="已发布" value={stats.published ?? 0} tone="green" />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_150px_150px_170px_150px_170px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
              placeholder="搜索能力ID、名称、说明"
              value={query.keyword}
              onChange={(event) => updateQuery({ keyword: event.target.value })}
            />
          </label>
          <select
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={query.status}
            onChange={(event) => updateQuery({ status: event.target.value })}
          >
            <option value="all">全部状态</option>
            <option value="draft">待治理</option>
            <option value="needs_development">待补齐</option>
            <option value="needs_review">待复核</option>
            <option value="approved">已审核</option>
            <option value="published">已发布</option>
            <option value="rejected">已驳回</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={query.domain}
            onChange={(event) => updateQuery({ domain: event.target.value })}
          >
            <option value="all">全部领域</option>
            {domains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={query.source}
            onChange={(event) => updateQuery({ source: event.target.value })}
          >
            <option value="all">全部来源</option>
            <option value="auto_scan_draft">自动扫描</option>
            <option value="auto_governance">自动治理</option>
            <option value="text_to_sql_candidate">Text-to-SQL 候选</option>
            <option value="manual_builtin">内置迁移</option>
            <option value="eval_failure">评测失败</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={query.riskLevel}
            onChange={(event) => updateQuery({ riskLevel: event.target.value })}
          >
            <option value="all">全部风险</option>
            <option value="low">低风险</option>
            <option value="medium">中风险</option>
            <option value="high">高风险</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={query.releaseStrategy}
            onChange={(event) => updateQuery({ releaseStrategy: event.target.value })}
          >
            <option value="all">全部发布策略</option>
            <option value="auto_publish">自动发布</option>
            <option value="approval_required">人工审核</option>
            <option value="write_blocked">写操作拦截</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium text-gray-900">候选能力清单</div>
              <div className="text-xs text-gray-500">
                共 {data?.total ?? 0} 条，已选 {selectedCount} 条
              </div>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allCurrentSelected} onChange={toggleCurrentPage} />
                  </th>
                  <th className="px-4 py-3">能力</th>
                  <th className="px-4 py-3">领域/对象</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">动作</th>
                  <th className="px-4 py-3">策略/风险</th>
                  <th className="px-4 py-3">权限</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.items.map((item) => (
                  <tr key={item.capabilityId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.capabilityId)}
                        onChange={() => toggleSelected(item.capabilityId)}
                      />
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{item.displayNameZh || item.displayName}</div>
                        <div className="mt-1 break-all font-mono text-xs text-gray-500">{item.capabilityId}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{item.domain}</div>
                      <div className="text-xs text-gray-500">{item.businessObject}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className={item.source === 'text_to_sql_candidate' ? 'rounded-full bg-violet-50 px-2 py-1 text-violet-700' : ''}>
                        {sourceLabels[item.source] ?? item.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{compactList(item.actions)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{releaseLabels[item.releaseStrategy] ?? item.releaseStrategy}</div>
                      <div className="text-xs text-gray-500">{riskLabels[item.riskLevel] ?? item.riskLevel}</div>
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-gray-600">
                      {compactList(item.permissionCodes, 2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${statusClass[item.status] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {statusLabels[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(item.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        disabled={detailLoading && detail?.capabilityId === item.capabilityId}
                        onClick={() => void openDetail(item.capabilityId, true)}
                      >
                        {detailLoading && detail?.capabilityId === item.capabilityId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        详情/预检
                      </button>
                    </td>
                  </tr>
                ))}
                {!data?.items.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                      暂无候选能力，请先导入草稿。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-gray-600">
            <span>
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <button
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          {detailOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/30"
              role="dialog"
              aria-modal="true"
              onClick={() => setDetailOpen(false)}
            >
              <section
                className="absolute left-0 top-0 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <h2 className="font-medium text-gray-900">能力详情与预检</h2>
                  <div className="flex items-center gap-2">
                    {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-gray-500 hover:bg-gray-50"
                      aria-label="关闭能力详情"
                      onClick={() => setDetailOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {!detail ? (
                    <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                      {detailLoading ? '正在加载能力详情...' : '未选择能力。'}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="text-base font-semibold text-gray-900">
                          {detail.displayNameZh || detail.displayName}
                        </div>
                        <div className="mt-1 break-all font-mono text-xs text-gray-500">{detail.capabilityId}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">发布策略</div>
                          <div className="mt-1">{releaseLabels[detail.releaseStrategy] ?? detail.releaseStrategy}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">风险</div>
                          <div className="mt-1">{riskLabels[detail.riskLevel] ?? detail.riskLevel}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">输出</div>
                          <div className="mt-1">{compactList(detail.outputKinds)}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">工具</div>
                          <div className="mt-1">{String(detail.executor?.tool ?? '-')}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border p-3 text-sm">
                        <div className="mb-2 font-medium text-gray-900">预检结果</div>
                        {detail.validation.pass ? (
                          <div className="flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            可发布
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detail.validation.issues.map((issue) => (
                              <div
                                key={`${issue.code}-${issue.message}`}
                                className={
                                  issue.level === 'block'
                                    ? 'rounded-lg bg-red-50 p-2 text-red-700'
                                    : 'rounded-lg bg-amber-50 p-2 text-amber-700'
                                }
                              >
                                <div className="flex items-center gap-2 font-medium">
                                  <AlertTriangle className="h-4 w-4" />
                                  {issue.message}
                                </div>
                                {issue.suggestion && <div className="mt-1 text-xs">{issue.suggestion}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-500">来源：</span>
                          {sourceLabels[detail.source] ?? detail.source}
                        </div>
                        <div>
                          <span className="text-gray-500">权限：</span>
                          {compactList(detail.permissionCodes, 4)}
                        </div>
                        <div>
                          <span className="text-gray-500">DTO：</span>
                          {compactList(detail.sourceDtos, 3)}
                        </div>
                        <div>
                          <span className="text-gray-500">接口：</span>
                          {compactList(detail.sourceApis, 2)}
                        </div>
                      </div>
                      {detail.source === 'text_to_sql_candidate' && (
                        <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
                          <div className="mb-2 font-medium">Text-to-SQL 候选证据</div>
                          <div>视图：{compactList((detail.executor?.selectedViews as string[] | undefined) ?? detail.sourceModels, 4)}</div>
                          <div className="mt-1">权限来源：{detail.permissionSource ?? '-'}</div>
                          <div className="mt-1">权限：{compactList(detail.permissionCodes, 4)}</div>
                          <div className="mt-1">字段策略：{Array.isArray(detail.fieldPolicies) ? detail.fieldPolicies.length : 0} 条</div>
                          <div className="mt-1 break-all font-mono text-xs text-violet-700">safeSqlHash: {String(detail.executor?.safeSqlHash ?? '-')}</div>
                          <div className="mt-1 break-all font-mono text-xs text-violet-700">generatedSqlHash: {String(detail.executor?.generatedSqlHash ?? '-')}</div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'validate',
                              () => validateAgentCapabilityDraft(detail.capabilityId),
                              '预检已刷新',
                            )
                          }
                        >
                          重新预检
                        </button>
                        <button
                          className="rounded-lg border border-purple-200 px-3 py-2 text-sm text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'dry-run',
                              () => dryRunAgentCapabilityDraft(detail.capabilityId),
                              'queryKey dry-run 已完成',
                              (result) => setDryRunResult(result),
                            )
                          }
                        >
                          queryKey dry-run
                        </button>
                        <button
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'eval-gate',
                              () => runAgentCapabilityDraftEvalGate(detail.capabilityId),
                              'Eval Gate 已完成',
                              (result) => setEvalGateResult(result),
                            )
                          }
                        >
                          Eval Gate
                        </button>
                        <button
                          className="rounded-lg border border-teal-200 px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading) || detail.status !== 'published'}
                          onClick={() => void runSmokeTest(detail.capabilityId)}
                        >
                          {actionLoading === 'post-publish-smoke' ? '烟测中...' : '发布后烟测'}
                        </button>
                        <button
                          className="rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 disabled:bg-gray-200 disabled:text-gray-500"
                          disabled={Boolean(actionLoading) || detail.status === 'published' || !detail.validation.pass}
                          onClick={() => void publishDetailCapability(detail.capabilityId)}
                        >
                          {actionLoading === 'publish-detail' ? '发布中...' : detail.status === 'published' ? '已发布' : '发布'}
                        </button>
                        <button
                          className="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'approve',
                              () =>
                                reviewAgentCapabilityDraft({ capabilityId: detail.capabilityId, decision: 'approve' }),
                              '已审核通过',
                            )
                          }
                        >
                          审核通过
                        </button>
                        <button
                          className="rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'needs_changes',
                              () =>
                                reviewAgentCapabilityDraft({
                                  capabilityId: detail.capabilityId,
                                  decision: 'needs_changes',
                                }),
                              '已标记待补齐',
                            )
                          }
                        >
                          标记待补齐
                        </button>
                        <button
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction(
                              'reject',
                              () =>
                                reviewAgentCapabilityDraft({ capabilityId: detail.capabilityId, decision: 'reject' }),
                              '已驳回',
                            )
                          }
                        >
                          驳回
                        </button>
                      </div>
                      {dryRunResult && (
                        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-purple-900">
                              queryKey dry-run：{dryRunResult.pass ? '通过' : '未通过'}
                            </div>
                            <div className="font-mono text-xs text-purple-700">{dryRunResult.queryKey || '-'}</div>
                          </div>
                          <div className="mt-2 space-y-1">
                            {dryRunResult.issues.map((issue) => (
                              <div
                                key={`${issue.code}-${issue.message}`}
                                className={
                                  issue.level === 'block'
                                    ? 'text-red-700'
                                    : issue.level === 'warn'
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }
                              >
                                {issue.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {smokeTestResult && (
                        <div
                          className={
                            smokeTestResult.pass
                              ? 'rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm'
                              : 'rounded-lg border border-red-100 bg-red-50 p-3 text-sm'
                          }
                        >
                          <div
                            className={
                              smokeTestResult.pass ? 'font-medium text-teal-900' : 'font-medium text-red-900'
                            }
                          >
                            发布后烟测：{smokeTestResult.pass ? '通过' : '未通过'}
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-gray-700">
                            <div>
                              <span className="text-gray-500">代表问题：</span>
                              {smokeTestResult.question}
                            </div>
                            <div>
                              <span className="text-gray-500">命中能力：</span>
                              {smokeTestResult.selectedCapabilityId || '-'} · 置信度{' '}
                              {Math.round((smokeTestResult.confidence || 0) * 100)}%
                            </div>
                            <div>
                              <span className="text-gray-500">Manifest：</span>
                              {smokeTestResult.activeManifestVersion || '-'}
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            {smokeTestResult.issues.map((issue) => (
                              <div
                                key={`${issue.code}-${issue.message}`}
                                className={
                                  issue.level === 'block'
                                    ? 'text-red-700'
                                    : issue.level === 'warn'
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }
                              >
                                {issue.message}
                              </div>
                            ))}
                          </div>
                          {smokeTestResult.toolResults.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-white/70 pt-2 text-xs text-gray-700">
                              {smokeTestResult.toolResults.map((result, index) => (
                                <div key={`${result.tool}-${index}`}>
                                  {result.tool}：{result.status} · {result.summary}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {evalGateResult && (
                        <div
                          className={
                            evalGateResult.pass
                              ? 'rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm'
                              : 'rounded-lg border border-red-100 bg-red-50 p-3 text-sm'
                          }
                        >
                          <div
                            className={
                              evalGateResult.pass ? 'font-medium text-emerald-900' : 'font-medium text-red-900'
                            }
                          >
                            Eval Gate：{evalGateResult.pass ? '通过' : '未通过'} · 覆盖{' '}
                            {evalGateResult.summary.scopedQuestions} / {evalGateResult.summary.totalQuestions} 题
                          </div>
                          <div className="mt-2 space-y-1">
                            {evalGateResult.gates.map((gate) => (
                              <div
                                key={gate.gate}
                                className={
                                  gate.level === 'block'
                                    ? 'text-red-700'
                                    : gate.level === 'warn'
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                }
                              >
                                {gate.gate}：{gate.actual}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 font-medium text-gray-900">
              <GitBranch className="h-4 w-4" />
              Manifest 版本
            </div>
            <div className="mt-3 space-y-2">
              {versions.slice(0, 5).map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-900">{version.version}</div>
                    <div className="text-xs text-gray-500">
                      {version.itemCount} 项 · {version.status} · {formatDate(version.publishedAt || version.createdAt)}
                    </div>
                  </div>
                  <button
                    className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
                    disabled={version.status === 'active' || Boolean(actionLoading)}
                    onClick={() =>
                      void runAction(
                        `activate-${version.id}`,
                        () => activateAgentCapabilityManifestVersion(version.id),
                        '已切换 Manifest 版本',
                      )
                    }
                  >
                    {version.status === 'active' ? '使用中' : '启用'}
                  </button>
                </div>
              ))}
              {!versions.length && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">暂无发布版本。</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="font-medium text-gray-900">QueryKey 工具登记</div>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {queryKeys.slice(0, 20).map((item) => (
                <div key={item.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="font-mono text-xs text-gray-900">{item.queryKey}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {item.toolName} · {item.domain} · {item.status}
                  </div>
                </div>
              ))}
              {!queryKeys.length && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">暂无 QueryKey 登记。</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
