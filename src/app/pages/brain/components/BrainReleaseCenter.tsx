import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  FilePenLine,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  activateBrainRelease,
  createBrainRolloutSequence,
  listBrainReleases,
  listBrainResourceVersions,
  listBrainCapabilityRegenerationJobs,
  rejectBrainRelease,
  retryBrainCapabilityRegenerationJob,
  rollbackBrainReleaseToRules,
  submitBrainReleaseModification,
} from '@/api/brain';
import type {
  BrainGovernanceRelease,
  BrainGovernanceResourceVersion,
  BrainCapabilityRegenerationJob,
  BrainRiskLevel,
} from '@/types/brain';

const ROLLOUT_STAGES = [
  { key: 'shadow', label: 'Shadow', percentage: 100 },
  { key: 'canary_5', label: '5%', percentage: 5 },
  { key: 'canary_20', label: '20%', percentage: 20 },
  { key: 'canary_50', label: '50%', percentage: 50 },
  { key: 'full', label: '100%', percentage: 100 },
] as const;
const REGENERATION_POLL_DELAYS = [3_000, 6_000, 12_000, 30_000] as const;
const REGENERATION_POLL_TIMEOUT = 10 * 60_000;
const REGENERATION_POLL_FAILURE_LIMIT = 3;

export function BrainReleaseCenter() {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<BrainGovernanceResourceVersion[]>([]);
  const [releases, setReleases] = useState<BrainGovernanceRelease[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [releaseKey, setReleaseKey] = useState('');
  const [busyId, setBusyId] = useState<number | 'create' | null>(null);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [modifyingId, setModifyingId] = useState<number | null>(null);
  const [requirement, setRequirement] = useState('');
  const [jobs, setJobs] = useState<BrainCapabilityRegenerationJob[]>([]);
  const [pollingNotice, setPollingNotice] = useState<string | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);

  const loadJobs = useCallback(async () => {
    const response = await listBrainCapabilityRegenerationJobs();
    setJobs(response.items ?? []);
    return response.items ?? [];
  }, []);

  const load = useCallback(async () => {
    try {
      const [versionResponse, releaseResponse, jobResponse] = await Promise.all([
        listBrainResourceVersions({ status: 'draft' }),
        listBrainReleases(),
        listBrainCapabilityRegenerationJobs(),
      ]);
      setVersions((versionResponse.items ?? []).filter((item) => item.resourceType !== 'capability_change_request'));
      setReleases(releaseResponse.items ?? []);
      setJobs(jobResponse.items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布数据加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActiveJob = jobs.some((job) => ['queued', 'leased', 'retry_scheduled'].includes(job.status));
  useEffect(() => {
    if (!hasActiveJob) return undefined;
    let timer: number | undefined;
    let stopped = false;
    let delayIndex = 0;
    let consecutiveFailures = 0;
    const startedAt = Date.now();
    setPollingNotice(null);

    const stopWithNotice = (message: string) => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      setPollingNotice(message);
    };
    const schedule = (delay: number) => {
      if (stopped || document.visibilityState === 'hidden') return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      if (Date.now() - startedAt >= REGENERATION_POLL_TIMEOUT) {
        stopWithNotice('自动刷新已运行 10 分钟，请人工刷新查看最新状态。');
        return;
      }
      try {
        const nextJobs = await loadJobs();
        consecutiveFailures = 0;
        if (!nextJobs.some((job) => ['queued', 'leased', 'retry_scheduled'].includes(job.status))) return;
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= REGENERATION_POLL_FAILURE_LIMIT) {
          stopWithNotice('自动刷新连续失败 3 次，已暂停，请人工刷新。');
          return;
        }
      }
      delayIndex = Math.min(delayIndex + 1, REGENERATION_POLL_DELAYS.length - 1);
      schedule(REGENERATION_POLL_DELAYS[delayIndex]);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
      } else if (!stopped) {
        schedule(REGENERATION_POLL_DELAYS[delayIndex]);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule(REGENERATION_POLL_DELAYS[0]);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasActiveJob, loadJobs, pollGeneration]);

  const refresh = useCallback(async () => {
    setPollingNotice(null);
    setPollGeneration((current) => current + 1);
    await load();
  }, [load]);

  async function createSequence() {
    if (!releaseKey.trim() || !selected.length) {
      toast.error('请填写发布标识并选择至少一个能力版本');
      return;
    }
    setBusyId('create');
    try {
      await createBrainRolloutSequence({ releaseKey: releaseKey.trim(), resourceVersionIds: selected });
      toast.success('五阶段发布序列已生成，需逐阶段评测和批准');
      setReleaseKey('');
      setSelected([]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '灰度发布序列创建失败');
    } finally {
      setBusyId(null);
    }
  }

  async function approve(releaseId: number) {
    setBusyId(releaseId);
    try {
      await activateBrainRelease(releaseId);
      toast.success('该阶段已批准并生效');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布门禁未通过');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(releaseId: number) {
    setBusyId(releaseId);
    try {
      await rejectBrainRelease(releaseId, 'governance_console_rejected');
      toast.success('发布已拒绝并归档');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '拒绝发布失败');
    } finally {
      setBusyId(null);
    }
  }

  async function rollback(releaseId: number) {
    setBusyId(releaseId);
    try {
      await rollbackBrainReleaseToRules(releaseId, 'governance_console_rules_rollback');
      toast.success('已切回上一稳定版本，无需回滚业务数据库');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回滚失败');
    } finally {
      setBusyId(null);
    }
  }

  async function submitModification(releaseId: number) {
    const text = requirement.trim();
    if (!text) {
      toast.error('请用自然语言说明修改要求');
      return;
    }
    setBusyId(releaseId);
    try {
      const result = await submitBrainReleaseModification(releaseId, text);
      if (result.requestType === 'business_definition') {
        toast.success('已创建业务口径变更请求，原发布需要修改');
        navigate(result.redirectTo);
      } else {
        if (result.job.status === 'blocked') {
          toast.error('修改要求需要调整，请查看阻断原因后重新提交');
        } else {
          toast.success('系统已排队重新生成 Capability、契约测试和风险报告');
        }
        if (result.job) {
          setJobs((current) => [result.job, ...current.filter((item) => item.id !== result.job.id)]);
        }
      }
      setModifyingId(null);
      setRequirement('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修改要求提交失败');
    } finally {
      setBusyId(null);
    }
  }

  async function retryJob(jobId: number) {
    setBusyJobId(jobId);
    try {
      const updated = await retryBrainCapabilityRegenerationJob(jobId);
      setJobs((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
      setPollingNotice(null);
      toast.success('再生成作业已重新排队');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重新排队失败');
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <section className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">发布审批与灰度</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            系统自动生成 Shadow、5%、20%、50%、100% 五个独立发布记录；每个阶段都需通过评测门禁后批准。
          </p>
        </div>
        <button
          type="button"
          title="刷新发布数据"
          aria-label="刷新发布数据"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
          onClick={() => void refresh()}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <div className="grid min-w-0 gap-6 py-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {pollingNotice ? (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {pollingNotice}
            </div>
          ) : null}
          <RolloutProgress releases={releases} />
          {releases.length ? releases.map((release) => {
            const job = jobs.find((item) => item.releaseId === release.id);
            return (
            <ReleaseApprovalCard
              key={release.id}
              release={release}
              regenerationJob={job}
              busy={busyId === release.id}
              retrying={busyJobId === job?.id}
              modifying={modifyingId === release.id}
              requirement={modifyingId === release.id ? requirement : ''}
              onRequirementChange={setRequirement}
              onApprove={() => void approve(release.id)}
              onModify={() => {
                setModifyingId(release.id);
                setRequirement('');
              }}
              onCancelModify={() => {
                setModifyingId(null);
                setRequirement('');
              }}
              onSubmitModification={() => void submitModification(release.id)}
              onReject={() => void reject(release.id)}
              onRollback={() => void rollback(release.id)}
              onRetryJob={() => job && void retryJob(job.id)}
              onOpenBusinessDefinitions={() => navigate('/system/business-definitions')}
            />
            );
          }) : (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              暂无发布记录。先从右侧选择已生成的能力版本。
            </div>
          )}
        </div>

        <aside className="min-w-0 border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <h3 className="text-sm font-semibold">生成五阶段发布</h3>
          <p className="mt-1 text-xs text-muted-foreground">这里只选择能力版本，灰度范围和回滚链由系统自动生成。</p>
          <label htmlFor="release-key" className="mt-4 block text-xs font-medium text-muted-foreground">发布标识</label>
          <input
            id="release-key"
            value={releaseKey}
            onChange={(event) => setReleaseKey(event.target.value)}
            placeholder="例如 brain-2026-07-13"
            className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          />

          <fieldset className="mt-4 min-w-0">
            <legend className="text-xs font-medium text-muted-foreground">待发布能力版本</legend>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {versions.length ? versions.map((version) => (
                <label key={version.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selected.includes(version.id)}
                    onChange={(event) => setSelected((current) => event.target.checked
                      ? [...current, version.id]
                      : current.filter((id) => id !== version.id))}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block break-all font-medium">{businessName(version.snapshot, version.resourceKey)}</span>
                    <span className="mt-1 block break-all text-xs text-muted-foreground">{version.resourceKey} v{version.version}</span>
                  </span>
                </label>
              )) : <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">暂无可发布草稿。</p>}
            </div>
          </fieldset>

          <button
            type="button"
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60"
            onClick={() => void createSequence()}
            disabled={busyId !== null}
          >
            {busyId === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            生成 Shadow 到 100% 序列
          </button>
        </aside>
      </div>
    </section>
  );
}

function RolloutProgress({ releases }: { releases: BrainGovernanceRelease[] }) {
  return (
    <div className="grid min-w-0 grid-cols-5 gap-1" aria-label="灰度发布阶段">
      {ROLLOUT_STAGES.map((stage) => {
        const release = releases.find((item) => rolloutStage(item) === stage.key);
        return (
          <div key={stage.key} className="min-w-0 border-t-2 border-border pt-2 text-center">
            <p className="break-words text-xs font-medium">{stage.label}</p>
            <p className="mt-1 break-words text-[11px] text-muted-foreground">{release ? statusLabel(release.status) : '未生成'}</p>
          </div>
        );
      })}
    </div>
  );
}

function ReleaseApprovalCard(props: {
  release: BrainGovernanceRelease;
  regenerationJob?: BrainCapabilityRegenerationJob;
  busy: boolean;
  retrying: boolean;
  modifying: boolean;
  requirement: string;
  onRequirementChange: (value: string) => void;
  onApprove: () => void;
  onModify: () => void;
  onCancelModify: () => void;
  onSubmitModification: () => void;
  onReject: () => void;
  onRollback: () => void;
  onRetryJob: () => void;
  onOpenBusinessDefinitions: () => void;
}) {
  const summary = summarizeRelease(props.release);
  const isDraft = props.release.status === 'draft';
  const isActive = props.release.status === 'active';

  return (
    <article className="min-w-0 rounded-md border border-border p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all text-sm font-semibold">{props.release.releaseKey}</h3>
            <span className={`rounded border px-2 py-0.5 text-xs ${statusClass(props.release.status)}`}>
              {statusLabel(props.release.status)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm text-muted-foreground">{summary.description}</p>
        </div>
        <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
          <p>{rolloutLabel(props.release)}</p>
          <p className="mt-1">发布记录 #{props.release.id}</p>
        </div>
      </div>

      <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 sm:grid-cols-3 lg:grid-cols-6">
        <BusinessField label="数据范围" value={summary.dataScope} />
        <BusinessField label="允许角色" value={summary.roles} />
        <BusinessField label="风险" value={riskLabel(summary.riskLevel)} />
        <BusinessField label="确认策略" value={summary.confirmation} />
        <BusinessField label="自动测试" value={summary.testStatus} />
        <BusinessField label="回滚点" value={props.release.previousReleaseId ? `发布 #${props.release.previousReleaseId}` : '当前 rules 配置'} />
      </dl>

      <div className="mt-4 min-w-0">
        <p className="text-xs font-medium text-muted-foreground">影响面</p>
        <p className="mt-1 break-words text-sm">{summary.impact}</p>
      </div>

      {props.regenerationJob ? (
        <RegenerationStatus
          job={props.regenerationJob}
          retrying={props.retrying}
          onRetry={props.onRetryJob}
          onModify={props.onModify}
          onOpenBusinessDefinitions={props.onOpenBusinessDefinitions}
        />
      ) : null}

      {props.modifying ? (
        <div className="mt-4 border-t border-border pt-4">
          <label htmlFor={`release-requirement-${props.release.id}`} className="text-sm font-medium">修改要求</label>
          <textarea
            id={`release-requirement-${props.release.id}`}
            value={props.requirement}
            onChange={(event) => props.onRequirementChange(event.target.value)}
            placeholder="例如：只允许店长使用，手机号必须脱敏，先走 5% 灰度。涉及指标公式或实体关系时，系统会转到业务口径中心。"
            className="mt-2 min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-background p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
              onClick={props.onSubmitModification}
              disabled={props.busy}
            >
              {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              提交修改要求
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
              onClick={props.onCancelModify}
              disabled={props.busy}
            >
              <X className="h-4 w-4" />取消
            </button>
          </div>
        </div>
      ) : null}

      {isDraft && !props.modifying ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
            onClick={props.onApprove}
            disabled={props.busy || Boolean(props.regenerationJob)}
            title={props.regenerationJob ? '该发布已提交修改要求，需使用新生成草稿重新创建发布' : undefined}
          >
            {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            批准发布
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
            onClick={props.onModify}
            disabled={props.busy}
          >
            <FilePenLine className="h-4 w-4" />修改要求
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
            onClick={props.onReject}
            disabled={props.busy}
          >
            <ShieldAlert className="h-4 w-4" />拒绝
          </button>
        </div>
      ) : null}

      {isActive ? (
        <button
          type="button"
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
          onClick={props.onRollback}
          disabled={props.busy}
        >
          {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          一键回滚
        </button>
      ) : null}
    </article>
  );
}

function RegenerationStatus(props: {
  job: BrainCapabilityRegenerationJob;
  retrying: boolean;
  onRetry: () => void;
  onModify: () => void;
  onOpenBusinessDefinitions: () => void;
}) {
  const retryable = props.job.retryable && props.job.nextAction === 'retry';
  return (
    <section className="mt-4 border-t border-border pt-4" aria-label="自动再生成状态">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{regenerationStatusLabel(props.job.status)}</p>
          <p className="mt-1 text-xs text-muted-foreground">进度 {Math.max(0, Math.min(100, props.job.progress))}%</p>
        </div>
        {retryable ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
            onClick={props.onRetry}
            disabled={props.retrying}
          >
            {props.retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            重新排队
          </button>
        ) : null}
        {props.job.nextAction === 'modify_requirement' ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
            onClick={props.onModify}
          >
            <FilePenLine className="h-4 w-4" />修改要求
          </button>
        ) : null}
        {props.job.nextAction === 'complete_business_definition' ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
            onClick={props.onOpenBusinessDefinitions}
          >
            <ChevronRight className="h-4 w-4" />去业务口径中心
          </button>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <BusinessField label="影响能力" value={String(props.job.affectedCapabilities.length)} />
        <BusinessField label="静态门禁通过" value={String(props.job.staticGatesPassed ?? 0)} />
        <BusinessField label="契约/编译/安全门禁" value={props.job.contractCompileSecurity.length ? props.job.contractCompileSecurity.join('、') : '待执行'} />
        <BusinessField label="风险" value={String(props.job.risk.overall ?? '待评估')} />
      </dl>
      {props.job.blockingReasons.length ? (
        <div className="mt-3 text-xs text-destructive">
          {props.job.blockingReasons.map((reason) => <p key={reason} className="break-words">{reason}</p>)}
        </div>
      ) : null}
      {props.job.errorMessage && !props.job.blockingReasons.includes(props.job.errorMessage)
        ? <p className="mt-3 break-words text-xs text-destructive">{props.job.errorMessage}</p>
        : null}
      {props.job.generatedResourceVersionIds.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          新草稿版本：{props.job.generatedResourceVersionIds.join('、')}
        </p>
      ) : null}
    </section>
  );
}

function regenerationStatusLabel(status: BrainCapabilityRegenerationJob['status']) {
  const labels: Record<BrainCapabilityRegenerationJob['status'], string> = {
    queued: '等待自动再生成',
    leased: '正在自动再生成',
    retry_scheduled: '等待重试',
    completed: '已生成新草稿',
    blocked: '需要修改后重试',
    dead_letter: '自动再生成失败',
  };
  return labels[status];
}

function BusinessField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function summarizeRelease(release: BrainGovernanceRelease) {
  const items = release.items ?? [];
  const snapshots = items.map((item) => record(item.snapshot));
  const sideEffect = snapshots.some((snapshot) => snapshot.sideEffect === true || snapshot.readOnly === false);
  const roles = unique(snapshots.flatMap((snapshot) => strings(snapshot.allowedRoles)));
  const riskLevel = highestRisk(snapshots.map((snapshot) => String(snapshot.riskLevel ?? 'low') as BrainRiskLevel));
  const tests = snapshots.flatMap((snapshot) => Object.values(record(snapshot.tests)));
  const testsPassed = tests.length > 0 && tests.every((value) => value === 'passed' || value === true);
  const confirmation = snapshots.some((snapshot) => snapshot.requiresConfirmation === true)
    ? '真实执行需再次确认'
    : sideEffect ? '发布后按风险确认' : '无需执行确认';
  return {
    description: snapshots.map((snapshot) => String(snapshot.description ?? '')).find(Boolean)
      ?? `本次发布包含 ${items.length} 个能力版本。`,
    dataScope: sideEffect ? '读取并生成操作预览' : '只读',
    roles: roles.length ? roles.map(roleLabel).join('、') : '按权限自动收口',
    riskLevel,
    confirmation,
    testStatus: testsPassed ? '全部通过' : '等待评测门禁',
    impact: items.length
      ? items.map((item) => businessName(item.snapshot, item.resourceKey)).join('、')
      : '尚未绑定能力版本',
  };
}

function rolloutStage(release: BrainGovernanceRelease) {
  return String(record(release.rollout).stage ?? '');
}

function rolloutLabel(release: BrainGovernanceRelease) {
  const rollout = record(release.rollout);
  const stage = rolloutStage(release);
  const configured = ROLLOUT_STAGES.find((item) => item.key === stage);
  return configured ? `${configured.label} 阶段` : `${String(rollout.userPercentage ?? '-')}% 灰度`;
}

function highestRisk(values: BrainRiskLevel[]) {
  const order: BrainRiskLevel[] = ['low', 'medium', 'high', 'critical'];
  return values.reduce((highest, value) => order.indexOf(value) > order.indexOf(highest) ? value : highest, 'low');
}

function riskLabel(value: BrainRiskLevel) {
  return ({ low: '低风险', medium: '中风险', high: '高风险', critical: '严重风险' } as const)[value];
}

function roleLabel(value: string) {
  const labels: Record<string, string> = {
    store_manager: '店长',
    receptionist: '前台',
    beautician: '美容师',
    marketing: '营销',
    finance: '财务',
    inventory: '库存',
    customer_service: '客服',
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: '待审批',
    active: '已生效',
    archived: '已归档',
    rolled_back: '已回滚',
    failed: '失败',
  };
  return labels[value] ?? value;
}

function statusClass(value: string) {
  if (value === 'active') return 'border-emerald-300 text-emerald-700';
  if (value === 'draft') return 'border-amber-300 text-amber-700';
  if (value === 'failed') return 'border-destructive text-destructive';
  return 'border-border text-muted-foreground';
}

function businessName(snapshot: unknown, fallback: string) {
  const value = record(snapshot);
  return String(value.name ?? value.title ?? fallback);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
