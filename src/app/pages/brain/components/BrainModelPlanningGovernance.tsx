import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Database,
  RefreshCw,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getBrainGovernanceRuntimeConfig,
  getBrainTrace,
  listBrainResourceVersions,
  listBrainSkills,
  listBrainTraces,
} from '@/api/brain';
import type {
  BrainGovernanceResourceVersion,
  BrainGovernanceRuntimeConfigResponse,
  BrainGovernanceSkill,
  BrainGovernanceTrace,
} from '@/types/brain';

type RecordValue = Record<string, unknown>;

export function BrainModelPlanningGovernance() {
  const [skills, setSkills] = useState<BrainGovernanceSkill[]>([]);
  const [versions, setVersions] = useState<BrainGovernanceResourceVersion[]>([]);
  const [traces, setTraces] = useState<BrainGovernanceTrace[]>([]);
  const [runtime, setRuntime] = useState<BrainGovernanceRuntimeConfigResponse | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [trace, setTrace] = useState<BrainGovernanceTrace | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [skillResponse, versionResponse, traceResponse, runtimeResponse] = await Promise.all([
        listBrainSkills(),
        listBrainResourceVersions(),
        listBrainTraces(),
        getBrainGovernanceRuntimeConfig(),
      ]);
      setSkills(skillResponse.items ?? []);
      setVersions(versionResponse.items ?? []);
      setTraces(traceResponse.items ?? []);
      setRuntime(runtimeResponse);
      setSelectedRunId((current) => current ?? traceResponse.items?.[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模型规划治理数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedRunId) {
      setTrace(null);
      return;
    }
    let active = true;
    void getBrainTrace(selectedRunId)
      .then((result) => {
        if (active) setTrace(result);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : '运行轨迹加载失败');
      });
    return () => {
      active = false;
    };
  }, [selectedRunId]);

  const semanticVersions = useMemo(
    () => versions.filter((item) => /intent/i.test(item.resourceType) || /intent/i.test(item.resourceKey)),
    [versions],
  );
  const planTemplates = useMemo(
    () => versions.filter((item) => /plan/i.test(item.resourceType) || /plan/i.test(item.resourceKey)),
    [versions],
  );
  const output = record(trace?.output);
  const semanticIntent = record(output.semanticIntent);
  const adapterMetadata = record(output.adapterMetadata);
  const plan = record(adapterMetadata.supervisorPlan ?? adapterMetadata.executionPlan ?? findStep(trace, 'supervisor_model_plan')?.output?.plan);
  const planNodes = arrayOfRecords(plan.nodes);
  const observations = arrayOfRecords(adapterMetadata.observations ?? findStep(trace, 'bounded_dag_execution')?.output?.observations);
  const completion = record(adapterMetadata.completion ?? findStep(trace, 'bounded_dag_execution')?.output?.completion);
  const intentDiff = record(findStep(trace, 'cognition_diff')?.output);
  const candidates = candidateCapabilities(trace, output);

  return (
    <section className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">模型规划治理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            查看模型如何理解问题、检索能力、生成计划并判定任务完成；业务口径仍由 Ami Core 统一定义。
          </p>
        </div>
        <button
          type="button"
          title="刷新模型规划数据"
          aria-label="刷新模型规划数据"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
          onClick={() => void loadOverview()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="grid min-w-0 gap-4 py-5 md:grid-cols-2 xl:grid-cols-4">
        <GovernanceSummary
          icon={BrainCircuit}
          title="语义意图版本"
          value={semanticVersions[0] ? `${semanticVersions[0].resourceKey} v${semanticVersions[0].version}` : String(semanticIntent.schemaVersion ?? '暂无已发布版本')}
          detail={semanticVersions[0]?.status ?? String(semanticIntent.intent ?? '等待运行样本')}
        />
        <GovernanceSummary
          icon={ShieldCheck}
          title="模型运行配置"
          value={runtime ? `${runtime.configured?.cognitionMode ?? 'rules'} / ${runtime.configured?.plannerMode ?? 'rules'}` : '加载中'}
          detail={runtime ? `当前生效：${runtime.effective.mode}${runtime.effective.releaseKey ? ` · ${runtime.effective.releaseKey}` : ''}` : '未读取配置'}
        />
        <GovernanceSummary
          icon={Database}
          title="Capability Card"
          value={`${skills.length} 个已启用能力`}
          detail={skills[0] ? `${skills[0].name} v${skills[0].version}` : '暂无已发布能力'}
        />
        <GovernanceSummary
          icon={Workflow}
          title="Plan Template"
          value={planTemplates[0] ? `${planTemplates[0].resourceKey} v${planTemplates[0].version}` : `${planNodes.length} 节点运行计划`}
          detail={planTemplates[0]?.status ?? String(plan.objective ?? '等待复合任务')}
        />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 border-t border-border pt-4 xl:border-r xl:border-t-0 xl:pr-5 xl:pt-0">
          <label htmlFor="brain-trace-select" className="text-sm font-medium">选择运行</label>
          <select
            id="brain-trace-select"
            value={selectedRunId ?? ''}
            onChange={(event) => setSelectedRunId(Number(event.target.value) || null)}
            className="mt-2 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          >
            {!traces.length ? <option value="">暂无运行轨迹</option> : null}
            {traces.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} · {questionOf(item)}
              </option>
            ))}
          </select>
          <div className="mt-4 space-y-3 text-sm">
            <KeyValue label="问题" value={questionOf(trace)} />
            <KeyValue label="意图" value={String(semanticIntent.intent ?? '未生成')} />
            <KeyValue label="目标" value={String(semanticIntent.objective ?? plan.objective ?? '未生成')} />
            <KeyValue label="置信度" value={formatConfidence(semanticIntent.confidence)} />
            <KeyValue label="模型" value={String(output.model ?? '未记录')} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <TraceSection title="规则 / 模型意图差异" emptyText="当前运行没有 shadow diff。" empty={!Object.keys(intentDiff).length}>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {Object.entries(intentDiff).map(([key, value]) => {
                const diff = record(value);
                return (
                  <div key={key} className="min-w-0 rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{diffLabel(key)}</span>
                      <span className={diff.matched === true ? 'text-emerald-700' : 'text-amber-700'}>
                        {diff.matched === true ? '一致' : '有差异'}
                      </span>
                    </div>
                    <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span className="break-words">规则：{displayValue(diff.rules)}</span>
                      <span className="break-words">模型：{displayValue(diff.model)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </TraceSection>

          <TraceSection title="候选能力" emptyText="当前运行没有候选能力记录。" empty={!candidates.length}>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {candidates.map((candidate) => (
                <article key={`${candidate.key}:${candidate.version}`} className="min-w-0 rounded-md border border-border p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-medium">{String(candidate.name ?? candidate.key)}</h4>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{String(candidate.key)} v{String(candidate.version ?? '-')}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">{formatScore(candidate.score)}</span>
                  </div>
                </article>
              ))}
            </div>
          </TraceSection>

          <TraceSection title="执行 DAG" emptyText="当前运行没有执行计划。" empty={!planNodes.length}>
            <div className="space-y-3">
              {planNodes.map((node, index) => (
                <article key={String(node.id ?? index)} className="min-w-0 rounded-md border border-border p-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="break-all text-sm font-medium">{String(node.id ?? `node_${index + 1}`)}</h4>
                        {node.previewOnly === true ? <span className="rounded border border-amber-300 px-1.5 py-0.5 text-xs text-amber-700">仅预览</span> : null}
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {String(node.capabilityKey ?? 'unknown')} v{String(node.capabilityVersion ?? '-')}
                      </p>
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        依赖：{arrayOfStrings(node.dependsOn).length ? arrayOfStrings(node.dependsOn).join('、') : '无'}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </TraceSection>

          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <TraceSection title="Observation" emptyText="当前运行没有执行观察。" empty={!observations.length}>
              <div className="space-y-2">
                {observations.map((observation, index) => (
                  <div key={`${String(observation.nodeId)}:${index}`} className="flex min-w-0 items-start gap-2 rounded-md border border-border p-3 text-sm">
                    {observation.status === 'completed'
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0">
                      <p className="break-all font-medium">{String(observation.nodeId ?? observation.capabilityKey ?? '执行节点')}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {String(observation.status ?? 'unknown')} · {String(observation.grounding ?? '未记录依据')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </TraceSection>
            <TraceSection title="完成判定" emptyText="当前运行没有完成判定。" empty={!Object.keys(completion).length}>
              {Object.keys(completion).length ? (
                <div className="rounded-md border border-border p-4">
                  <div className="flex items-center gap-2">
                    {completion.status === 'complete'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                      : <CircleDashed className="h-5 w-5 text-amber-700" />}
                    <span className="font-medium">{completion.status === 'complete' ? '完整完成' : '未完整完成'}</span>
                  </div>
                  <p className="mt-2 break-words text-sm text-muted-foreground">
                    {arrayOfStrings(completion.missingCriteria).length
                      ? `缺失条件：${arrayOfStrings(completion.missingCriteria).join('；')}`
                      : '所有成功标准均已满足。'}
                  </p>
                </div>
              ) : null}
            </TraceSection>
          </div>
        </div>
      </div>
    </section>
  );
}

function GovernanceSummary({ icon: Icon, title, value, detail }: {
  icon: typeof BrainCircuit;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="min-w-0 rounded-md border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <h3 className="font-medium text-foreground">{title}</h3>
      </div>
      <p className="mt-3 break-words text-sm font-semibold">{value}</p>
      <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function TraceSection({ title, emptyText, empty = false, children }: {
  title: string;
  emptyText: string;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 min-w-0">{empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words">{value}</p>
    </div>
  );
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function arrayOfRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function findStep(trace: BrainGovernanceTrace | null, stepKey: string) {
  return trace?.steps?.find((step) => step.stepKey === stepKey);
}

function candidateCapabilities(trace: BrainGovernanceTrace | null, output: RecordValue) {
  const fromPlan = arrayOfRecords(findStep(trace, 'supervisor_model_plan')?.output?.candidateCapabilities);
  if (fromPlan.length) return fromPlan;
  const capabilityKey = output.capabilityKey;
  return typeof capabilityKey === 'string'
    ? [{ key: capabilityKey, version: output.capabilityVersion, name: capabilityKey, score: 1 }]
    : [];
}

function questionOf(trace: BrainGovernanceTrace | null | undefined) {
  const input = record(trace?.input);
  return String(input.message ?? input.question ?? '未记录问题');
}

function formatConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(0)}%` : '未记录';
}

function formatScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(0)}%` : '-';
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join('、') || '空';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === null || value === undefined || value === '' ? '空' : String(value);
}

function diffLabel(key: string) {
  const labels: Record<string, string> = {
    domain: '业务域',
    intent: '意图',
    metric: '指标',
    dimension: '维度',
    entity: '实体',
    time: '时间范围',
    answerShape: '输出形态',
    confidence: '置信度',
  };
  return labels[key] ?? key;
}
