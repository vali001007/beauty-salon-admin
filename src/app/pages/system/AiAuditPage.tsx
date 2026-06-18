import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Search, ShieldCheck } from 'lucide-react';
import { getAiAuditLogsPaginated, getAiAuditSummary } from '@/api/ai';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { usePagination } from '@/hooks/usePagination';
import type { AiAuditLog, AiAuditSummary } from '@/types/ai';

const SCENARIO_OPTIONS = [
  { value: '', label: '全部场景' },
  { value: 'assistant_chat', label: '智能对话' },
  { value: 'customer_invitation_script', label: '邀约话术' },
  { value: 'marketing_copy', label: '营销文案' },
  { value: 'activity_page', label: '活动页生成' },
  { value: 'campaign_variants', label: '多渠道文案' },
  { value: 'customer_summary', label: '客户摘要' },
  { value: 'service_note_summary', label: '服务记录摘要' },
  { value: 'skin_test_explanation', label: '皮肤检测解读' },
  { value: 'skin_photo_analyze', label: '拍照肤质检测' },
  { value: 'terminal_service_advice', label: '终端服务建议' },
  { value: 'next_best_action', label: 'NBA 推荐' },
  { value: 'terminal_intent', label: '终端意图解析' },
  { value: 'terminal_dashboard_insights', label: '终端经营洞察' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'failed_fallback', label: '失败后兜底' },
];

const EMPTY_SUMMARY: AiAuditSummary = {
  total: 0,
  successCount: 0,
  failedCount: 0,
  successRate: 0,
  averageLatencyMs: 0,
  blockedCount: 0,
};

function formatDateTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

function formatScenario(value: string) {
  return SCENARIO_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function formatStatus(value: string) {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function getStatusClass(value: string) {
  if (value === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'failed_fallback') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function maskSensitiveText(value?: string | null) {
  if (!value) return '-';
  return value
    .replace(/1[3-9]\d{9}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{6}(?:19|20)\d{2}\d{2}\d{2}\d{3}[\dXx]\b/g, '[id-card]')
    .replace(/((?:客户|顾客|姓名|customerName|name)\s*[:：=]\s*)([^,，。；;\n"}]+)/gi, '$1[masked]');
}

function getLogInput(log: AiAuditLog) {
  return maskSensitiveText(log.inputSummary ?? log.inputPreview);
}

function getLogOutput(log: AiAuditLog) {
  return maskSensitiveText(log.outputSummary ?? log.outputPreview);
}

export function AiAuditPage() {
  const [scenario, setScenario] = useState('');
  const [status, setStatus] = useState('');
  const [selectedLog, setSelectedLog] = useState<AiAuditLog | null>(null);
  const [summary, setSummary] = useState<AiAuditSummary>(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const filters = useMemo(
    () => ({
      scenario: scenario || undefined,
      status: status || undefined,
    }),
    [scenario, status],
  );

  const { data: logs, total, page, pageSize, loading, setPage, setPageSize } = usePagination<AiAuditLog>(
    getAiAuditLogsPaginated,
    filters,
  );

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    getAiAuditSummary(filters)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY_SUMMARY);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 系统设置 / AI 审计</div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">AI 审计</h2>
          <p className="mt-1 text-sm text-gray-500">
            查看 AI 调用场景、Provider、Token、耗时和失败情况，用于排查 Prompt 与模型稳定性。
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-600">
          <ShieldCheck className="h-4 w-4 text-primary" />
          今日口径
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">今日调用</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryLoading ? '-' : summary.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">成功率</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {summaryLoading ? '-' : `${summary.successRate}%`}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">平均耗时</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {summaryLoading ? '-' : `${summary.averageLatencyMs} ms`}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-sm text-gray-500">安全拦截</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summaryLoading ? '-' : summary.blockedCount}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={scenario}
              readOnly
              className="pl-9 text-gray-500"
              placeholder="当前按场景下拉筛选"
            />
          </div>
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {SCENARIO_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => {
              setScenario('');
              setStatus('');
              setPage(1);
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
            <TableHead>场景</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>安全拦截</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-gray-500">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                正在加载 AI 审计日志...
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-gray-500">
                暂无 AI 审计记录。
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatScenario(log.scenario)}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusClass(log.status)}`}>
                    {formatStatus(log.status)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{log.provider}</div>
                  <div className="text-xs text-gray-500">{log.model || '-'}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {(log.inputTokens ?? 0) + (log.outputTokens ?? 0)}
                  <div className="text-xs text-gray-500">
                    入 {log.inputTokens ?? 0} / 出 {log.outputTokens ?? 0}
                  </div>
                </TableCell>
                <TableCell>
                  {log.safetyBlocked ? (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                      已拦截
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">未拦截</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{log.latencyMs ?? 0} ms</TableCell>
                <TableCell className="max-w-[220px] truncate">{log.promptTemplate || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelectedLog(log)}>
                    <Eye className="h-4 w-4" />
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

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

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>审计详情</DialogTitle>
            <DialogDescription>查看该次 AI 调用的输入/输出摘要和基础运行信息。</DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">场景</div>
                  <div className="mt-1 font-medium">{formatScenario(selectedLog.scenario)}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">Provider / Model</div>
                  <div className="mt-1 font-medium">
                    {selectedLog.provider} / {selectedLog.model || '-'}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">状态</div>
                  <div className="mt-1 font-medium">{formatStatus(selectedLog.status)}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">安全拦截</div>
                  <div className="mt-1 font-medium">{selectedLog.safetyBlocked ? '已拦截' : '未拦截'}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-gray-500">耗时</div>
                  <div className="mt-1 font-medium">{selectedLog.latencyMs ?? 0} ms</div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">输入摘要</div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-gray-700">
                  {getLogInput(selectedLog)}
                </pre>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700">输出摘要</div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-gray-700">
                  {getLogOutput(selectedLog)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
