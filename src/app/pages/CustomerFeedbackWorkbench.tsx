import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { createCustomerFeedback, getCustomerFeedback, getCustomerFeedbackAnalytics, updateCustomerFeedback } from '@/api/customerFeedback';
import { getBeauticians } from '@/api/beautician';
import { getProjects } from '@/api/project';
import type { Beautician, Customer, Project } from '@/types';
import type {
  CreateCustomerFeedbackPayload,
  CustomerFeedbackAnalytics,
  CustomerFeedbackRecord,
  CustomerFeedbackSeverity,
  CustomerFeedbackStatus,
  CustomerFeedbackType,
} from '@/types/customer-feedback';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import { formatBusinessDate, formatBusinessDateTime } from '@/utils/businessTime';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { CustomerPicker } from '../components/CustomerPicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';

const TYPE_LABELS: Record<CustomerFeedbackType, string> = {
  complaint: '投诉',
  satisfaction: '满意评价',
  suggestion: '建议',
  praise: '表扬',
};

const STATUS_LABELS: Record<CustomerFeedbackStatus, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

const SEVERITY_LABELS: Record<CustomerFeedbackSeverity, string> = {
  normal: '一般',
  warning: '重要',
  critical: '紧急',
};

const selectClassName = 'h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-primary';

function toRangeBoundary(value: string, end = false) {
  if (!value) return undefined;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+08:00`).toISOString();
}

function startOfCurrentMonth() {
  const today = formatBusinessDate(new Date());
  return `${today.slice(0, 7)}-01`;
}

function statusTone(status: CustomerFeedbackStatus) {
  if (status === 'open') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'in_progress') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function severityTone(severity: CustomerFeedbackSeverity) {
  if (severity === 'critical') return 'text-rose-700';
  if (severity === 'warning') return 'text-amber-700';
  return 'text-gray-600';
}

type CreateForm = {
  customerId?: number;
  customerName: string;
  feedbackType: CustomerFeedbackType;
  rating: string;
  category: string;
  severity: CustomerFeedbackSeverity;
  content: string;
  beauticianId: string;
  projectId: string;
  occurredAt: string;
};

const EMPTY_FORM: CreateForm = {
  customerName: '',
  feedbackType: 'complaint',
  rating: '',
  category: '',
  severity: 'normal',
  content: '',
  beauticianId: '',
  projectId: '',
  occurredAt: '',
};

export function CustomerFeedbackWorkbench() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const canUpdate = usePermission('core:customer:update');
  const [items, setItems] = useState<CustomerFeedbackRecord[]>([]);
  const [analytics, setAnalytics] = useState<CustomerFeedbackAnalytics | null>(null);
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [feedbackType, setFeedbackType] = useState<CustomerFeedbackType | ''>('');
  const [status, setStatus] = useState<CustomerFeedbackStatus | ''>('');
  const [startDate, setStartDate] = useState(startOfCurrentMonth);
  const [endDate, setEndDate] = useState(() => formatBusinessDate(new Date()));
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    keyword: '',
    feedbackType: '' as CustomerFeedbackType | '',
    status: '' as CustomerFeedbackStatus | '',
    startDate: startOfCurrentMonth(),
    endDate: formatBusinessDate(new Date()),
  }));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<CustomerFeedbackRecord | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<CustomerFeedbackStatus>('resolved');
  const [resolutionNote, setResolutionNote] = useState('');
  const pageSize = 20;

  const range = useMemo(() => ({
    startDate: toRangeBoundary(appliedFilters.startDate),
    endDate: toRangeBoundary(appliedFilters.endDate, true),
  }), [appliedFilters.endDate, appliedFilters.startDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, analyticsResult] = await Promise.all([
        getCustomerFeedback({
          page,
          pageSize,
          keyword: appliedFilters.keyword || undefined,
          feedbackType: appliedFilters.feedbackType || undefined,
          status: appliedFilters.status || undefined,
          ...range,
        }),
        getCustomerFeedbackAnalytics(range),
      ]);
      setItems(Array.isArray(listResult.items) ? listResult.items : []);
      setTotal(Number(listResult.total ?? 0));
      setAnalytics(analyticsResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '客户反馈加载失败');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters.feedbackType, appliedFilters.keyword, appliedFilters.status, page, range]);

  useEffect(() => {
    void load();
  }, [currentStoreId, load]);

  useEffect(() => {
    if (!canUpdate) return;
    Promise.all([getBeauticians(), getProjects({ status: 'active' })])
      .then(([staff, serviceProjects]) => {
        setBeauticians(staff.filter((item) => item.status !== '离职'));
        setProjects(serviceProjects);
      })
      .catch(() => {
        setBeauticians([]);
        setProjects([]);
      });
  }, [canUpdate, currentStoreId]);

  const submitCreate = async () => {
    if (!form.content.trim() && !form.rating) {
      toast.error('请填写反馈内容或满意度评分');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateCustomerFeedbackPayload = {
        customerId: form.customerId,
        feedbackType: form.feedbackType,
        rating: form.rating ? Number(form.rating) : undefined,
        category: form.category.trim() || undefined,
        severity: form.severity,
        content: form.content.trim() || undefined,
        beauticianId: form.beauticianId ? Number(form.beauticianId) : undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        sourceChannel: 'admin_manual',
        occurredAt: form.occurredAt ? new Date(`${form.occurredAt}+08:00`).toISOString() : undefined,
      };
      await createCustomerFeedback(payload);
      toast.success('客户反馈已录入');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setPage(1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '客户反馈录入失败');
    } finally {
      setSaving(false);
    }
  };

  const submitResolution = async () => {
    if (!editing) return;
    if ((resolutionStatus === 'resolved' || resolutionStatus === 'closed') && !resolutionNote.trim()) {
      toast.error('解决或关闭反馈时必须填写处理结果');
      return;
    }
    setSaving(true);
    try {
      await updateCustomerFeedback(editing.id, {
        status: resolutionStatus,
        resolutionNote: resolutionNote.trim() || undefined,
      });
      toast.success('处理状态已更新');
      setEditing(null);
      setResolutionNote('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '处理状态更新失败');
    } finally {
      setSaving(false);
    }
  };

  const summary = analytics?.summary;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const summaryItems: Array<{ label: string; value: string | number; icon: LucideIcon }> = [
    { label: '反馈总数', value: summary?.feedbackCount ?? 0, icon: ClipboardCheck },
    { label: '投诉', value: summary?.complaintCount ?? 0, icon: AlertTriangle },
    { label: '待解决投诉', value: summary?.unresolvedComplaintCount ?? 0, icon: MessageSquareWarning },
    {
      label: '平均满意度',
      value: summary?.averageRating === null || summary?.averageRating === undefined
        ? '未采集'
        : `${summary.averageRating.toFixed(1)} / 5`,
      icon: Star,
    },
    {
      label: '评价覆盖率',
      value: `${((summary?.collectionCoverageRate ?? 0) * 100).toFixed(1)}%`,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <MessageSquareWarning className="h-5 w-5 text-primary" />
            客户反馈
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">投诉、满意度与服务评价统一记录和处理</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          {canUpdate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              录入反馈
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 border border-border bg-card md:grid-cols-5">
        {summaryItems.map(({ label, value, icon: Icon }, index) => (
          <div key={label} className={`min-w-0 px-4 py-3 ${index > 0 ? 'border-l border-border' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
            <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <label className="min-w-48 flex-1 space-y-1 text-sm">
          <span className="text-muted-foreground">搜索</span>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="客户、手机号、分类或处理结果" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">类型</span>
          <select className={selectClassName} value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as CustomerFeedbackType | '')}>
            <option value="">全部类型</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">状态</span>
          <select className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value as CustomerFeedbackStatus | '')}>
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">开始日期</span>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">结束日期</span>
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              setAppliedFilters({
                keyword: keyword.trim(),
                feedbackType,
                status,
                startDate,
                endDate,
              });
            }}
          >
            查询
          </Button>
      </div>

      {summary && summary.completedServiceTaskCount > 0 && summary.collectionCoverageRate < 0.8 ? (
        <div className="flex items-start gap-2 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          当前仅 {summary.linkedServiceTaskCount}/{summary.completedServiceTaskCount} 个已完成服务关联了反馈，未记录不代表客户没有不满。
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>客户</TableHead>
            <TableHead>类型 / 评分</TableHead>
            <TableHead>反馈内容</TableHead>
            <TableHead>员工 / 项目</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={7}><div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载客户反馈</div></TableCell></TableRow>
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={7}><div className="py-10 text-center text-muted-foreground">当前条件没有已录入反馈</div></TableCell></TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatBusinessDateTime(item.occurredAt)}</TableCell>
              <TableCell>
                <div className="font-medium">{item.customerName || '未关联客户'}</div>
                <div className="text-xs text-muted-foreground">{item.customerPhone || item.customerMemberLevel || '-'}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{TYPE_LABELS[item.feedbackType]}</div>
                <div className="text-xs text-muted-foreground">{item.rating ? `${item.rating} 星` : '未评分'}</div>
              </TableCell>
              <TableCell className="max-w-80">
                <div className="line-clamp-2">{item.content || item.category || '未填写文字反馈'}</div>
                <div className={`mt-1 text-xs ${severityTone(item.severity)}`}>{SEVERITY_LABELS[item.severity]}{item.category ? ` · ${item.category}` : ''}</div>
              </TableCell>
              <TableCell>
                <div>{item.beauticianName || '未关联员工'}</div>
                <div className="text-xs text-muted-foreground">{item.projectName || '-'}</div>
              </TableCell>
              <TableCell><span className={`inline-flex rounded-md border px-2 py-1 text-xs ${statusTone(item.status)}`}>{STATUS_LABELS[item.status]}</span></TableCell>
              <TableCell className="text-right">
                {canUpdate && item.status !== 'closed' ? (
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setResolutionStatus(item.status === 'open' ? 'in_progress' : item.status); setResolutionNote(item.resolutionNote || ''); }}>
                    处理
                  </Button>
                ) : <span className="text-xs text-muted-foreground">-</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="上一页"><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="icon" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="下一页"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="customer-feedback-create-description">
          <DialogHeader>
            <DialogTitle>录入客户反馈</DialogTitle>
            <DialogDescription id="customer-feedback-create-description">关联客户、员工和项目后，Ami Brain 才能给出可信的投诉与满意度分析。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <CustomerPicker
              value={form.customerName}
              selectedCustomerId={form.customerId}
              onValueChange={(customerName) => setForm((value) => ({ ...value, customerName }))}
              onSelect={(customer: Customer | null) => setForm((value) => ({ ...value, customerId: customer?.id, customerName: customer?.name || '' }))}
            />
            <label className="space-y-1.5 text-sm"><span className="font-medium">反馈类型</span><select className={`${selectClassName} w-full`} value={form.feedbackType} onChange={(event) => setForm((value) => ({ ...value, feedbackType: event.target.value as CustomerFeedbackType }))}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">满意度</span><select className={`${selectClassName} w-full`} value={form.rating} onChange={(event) => setForm((value) => ({ ...value, rating: event.target.value }))}><option value="">未评分</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} 星</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">风险级别</span><select className={`${selectClassName} w-full`} value={form.severity} onChange={(event) => setForm((value) => ({ ...value, severity: event.target.value as CustomerFeedbackSeverity }))}>{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">关联员工</span><select className={`${selectClassName} w-full`} value={form.beauticianId} onChange={(event) => setForm((value) => ({ ...value, beauticianId: event.target.value }))}><option value="">未关联</option>{beauticians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">关联项目</span><select className={`${selectClassName} w-full`} value={form.projectId} onChange={(event) => setForm((value) => ({ ...value, projectId: event.target.value }))}><option value="">未关联</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">分类</span><Input value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))} placeholder="如等待时间、服务效果" /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">发生时间</span><Input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((value) => ({ ...value, occurredAt: event.target.value }))} /></label>
            <label className="space-y-1.5 text-sm sm:col-span-2"><span className="font-medium">反馈内容</span><textarea className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" value={form.content} onChange={(event) => setForm((value) => ({ ...value, content: event.target.value }))} placeholder="记录客户原话、问题场景或满意点" /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void submitCreate()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}确认录入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent aria-describedby="customer-feedback-resolution-description">
          <DialogHeader>
            <DialogTitle>处理客户反馈</DialogTitle>
            <DialogDescription id="customer-feedback-resolution-description">处理记录会作为风险追踪与 Ami Brain 诊断依据。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-1.5 text-sm"><span className="font-medium">处理状态</span><select className={`${selectClassName} w-full`} value={resolutionStatus} onChange={(event) => setResolutionStatus(event.target.value as CustomerFeedbackStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">处理结果</span><textarea className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="记录回访、补偿、复做或改进结果" /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => void submitResolution()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}保存处理结果</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
