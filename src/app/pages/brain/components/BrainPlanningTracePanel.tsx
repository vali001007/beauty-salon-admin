import { CheckCircle2, CircleDashed, Loader2, Route, ShieldCheck, Workflow, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BrainMessage, BrainRunEvent } from '@/types/brain';

type RecordValue = Record<string, unknown>;

export function BrainPlanningTracePanel({
  message,
  events,
  loading,
}: {
  message: BrainMessage | null;
  events: BrainRunEvent[];
  loading: boolean;
}) {
  if (loading) {
    return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载运行规划</div>;
  }
  if (!message) {
    return <div className="py-8 text-center text-sm leading-6 text-muted-foreground">选择一条回答后查看能力选择、执行计划和完成判定。</div>;
  }

  const adapterMetadata = record(message.metadata?.adapterMetadata);
  const modelCognition = record(findEvent(events, 'cognition_model')?.output);
  const ruleCognition = record(findEvent(events, 'cognition_rules')?.output);
  const semanticIntent = record(
    message.metadata?.semanticIntent
      ?? modelCognition.semanticIntent
      ?? modelCognition.intentResult
      ?? adapterMetadata.semanticIntent
      ?? message.metadata?.routePlan
      ?? modelCognition,
  );
  const planningOutput = record(findEvent(events, 'supervisor_model_plan')?.output);
  const boundedOutput = record(findEvent(events, 'bounded_dag_execution')?.output);
  const plan = record(
    planningOutput.plan
      ?? planningOutput.supervisorPlan
      ?? adapterMetadata.supervisorPlan
      ?? adapterMetadata.executionPlan,
  );
  const planNodes = arrayOfRecords(plan.nodes);
  const candidates = arrayOfRecords(
    planningOutput.candidateCapabilities
      ?? adapterMetadata.candidateCapabilities,
  );
  const observations = arrayOfRecords(adapterMetadata.observations ?? boundedOutput.observations);
  const completion = record(adapterMetadata.completion ?? boundedOutput.completion);
  const intentDiff = record(findEvent(events, 'cognition_diff')?.output);
  const runtime = record(findEvent(events, 'release_runtime_selection')?.output);
  const runtimeIdentity = record(runtime.runtimeProductIdentity);
  const policyIdentity = record(runtime.governancePolicyIdentity);
  const model = findModelIdentity(events, message.metadata);
  const semanticVersion = String(
    message.metadata?.intentSchemaVersion
      ?? semanticIntent.schemaVersion
      ?? modelCognition.schemaVersion
      ?? '未记录',
  );
  const selectedCapability = String(
    planningOutput.capabilityKey
      ?? adapterMetadata.capabilityKey
      ?? message.metadata?.adapterKey
      ?? '',
  );
  const normalizedCandidates = candidates.length
    ? candidates
    : selectedCapability
      ? [{ key: selectedCapability, name: selectedCapability, version: planningOutput.capabilityVersion, score: 1 }]
      : [];

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <TraceSummary
          icon={ShieldCheck}
          title="运行身份"
          value={identityLabel(runtimeIdentity, '运行版本', runtime.releaseKey)}
          detail={[
            runtimeIdentity.stageCode ? `当前阶段 ${String(runtimeIdentity.stageCode)}` : '',
            runtime.mode ? `模式 ${String(runtime.mode)}` : '',
            policyIdentity.code ? `治理策略 ${String(policyIdentity.code)}` : '',
            runtime.governanceTransitionStatus ? `切换 ${String(runtime.governanceTransitionStatus)}` : '',
            runtime.releaseFingerprint ? `fingerprint ${String(runtime.releaseFingerprint).slice(0, 12)}` : '',
            model.provider,
            model.model,
          ].filter(Boolean).join(' · ') || '当前轨迹未记录模型身份'}
        />
        <TraceSummary
          icon={Route}
          title="意图与目标"
          value={String(semanticIntent.intent ?? ruleCognition.intent ?? '未记录意图')}
          detail={`语义版本 ${semanticVersion} · ${String(semanticIntent.objective ?? plan.objective ?? message.content ?? '未记录目标')}`}
        />
      </div>

      <TraceSection title="规则 / 模型意图差异" emptyText="当前运行没有 Shadow 差异。" empty={!Object.keys(intentDiff).length}>
        <div className="space-y-2">
          {Object.entries(intentDiff).map(([key, value]) => {
            const diff = record(value);
            return (
              <div key={key} className="rounded-md border border-border bg-background p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{diffLabel(key)}</span>
                  <span className={diff.matched === true ? 'text-emerald-700' : 'text-amber-700'}>{diff.matched === true ? '一致' : '有差异'}</span>
                </div>
                <div className="mt-2 grid min-w-0 gap-2 text-muted-foreground sm:grid-cols-2">
                  <span className="break-words">规则：{displayValue(diff.rules)}</span>
                  <span className="break-words">模型：{displayValue(diff.model)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </TraceSection>

      <TraceSection title="候选能力" emptyText="当前运行没有候选能力记录。" empty={!normalizedCandidates.length}>
        <div className="space-y-2">
          {normalizedCandidates.map((candidate, index) => (
            <article key={`${String(candidate.key ?? candidate.capabilityKey ?? index)}:${String(candidate.version ?? '')}`} className="rounded-md border border-border bg-background p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-medium">{String(candidate.name ?? candidate.key ?? candidate.capabilityKey ?? '未命名能力')}</h4>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {String(candidate.key ?? candidate.capabilityKey ?? 'unknown')} v{String(candidate.version ?? candidate.capabilityVersion ?? '-')}
                  </p>
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    入选依据：{arrayOfStrings(candidate.matchedFields).join('、') || String(candidate.reason ?? '按当前意图与能力契约匹配')}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatScore(candidate.score)}</span>
              </div>
            </article>
          ))}
        </div>
      </TraceSection>

      <TraceSection title="执行 DAG" emptyText="当前运行没有执行计划。" empty={!planNodes.length}>
        <div className="space-y-2">
          {planNodes.map((node, index) => (
            <article key={String(node.id ?? index)} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="break-all text-sm font-medium">{String(node.id ?? `node_${index + 1}`)}</h4>
                    {node.previewOnly === true ? <span className="rounded border border-amber-300 px-1.5 py-0.5 text-xs text-amber-700">仅预览</span> : null}
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{String(node.capabilityKey ?? 'unknown')} v{String(node.capabilityVersion ?? '-')}</p>
                  <p className="mt-2 break-words text-xs text-muted-foreground">依赖：{arrayOfStrings(node.dependsOn).join('、') || '无'}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </TraceSection>

      <div className="grid gap-5 lg:grid-cols-2">
        <TraceSection title="Observation" emptyText="当前运行没有执行观察。" empty={!observations.length}>
          <div className="space-y-2">
            {observations.map((observation, index) => (
              <div key={`${String(observation.nodeId ?? observation.capabilityKey)}:${index}`} className="flex items-start gap-2 rounded-md border border-border bg-background p-3 text-sm">
                {observation.status === 'completed'
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="break-all font-medium">{String(observation.nodeId ?? observation.capabilityKey ?? '执行节点')}</p>
                  <p className={`mt-1 text-xs font-medium ${observation.errorCode ? 'text-destructive' : observation.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {observation.errorCode ? '系统错误' : observation.status === 'completed' ? '业务结果' : '业务阻塞'}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{String(observation.status ?? 'unknown')} · {String(observation.errorCode ?? observation.grounding ?? '未记录依据')}</p>
                </div>
              </div>
            ))}
          </div>
        </TraceSection>
        <TraceSection title="完成判定" emptyText="当前运行没有完成判定。" empty={!Object.keys(completion).length}>
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              {completion.status === 'complete'
                ? <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                : <CircleDashed className="h-5 w-5 text-amber-700" />}
              <span className="font-medium">{completion.status === 'complete' ? '完整完成' : '未完整完成'}</span>
            </div>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {arrayOfStrings(completion.missingCriteria).length
                ? `缺失条件：${arrayOfStrings(completion.missingCriteria).join('；')}`
                : String(completion.reason ?? '所有成功标准均已满足。')}
            </p>
          </div>
        </TraceSection>
      </div>
    </div>
  );
}

function TraceSummary({ icon: Icon, title, value, detail }: { icon: typeof Workflow; title: string; value: string; detail: string }) {
  return (
    <article className="min-w-0 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /><span>{title}</span></div>
      <p className="mt-2 break-words text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

function TraceSection({ title, emptyText, empty, children }: { title: string; emptyText: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="min-w-0 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 min-w-0">{empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : children}</div>
    </section>
  );
}

function findEvent(events: BrainRunEvent[], stepKey: string) {
  return events.find((event) => event.stepKey === stepKey);
}

function findModelIdentity(events: BrainRunEvent[], metadata: unknown) {
  const queue: unknown[] = [metadata, ...events.map((event) => event.output), ...events.map((event) => event.input)];
  const visited = new Set<object>();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    const candidate = value as RecordValue;
    if (typeof candidate.provider === 'string' || typeof candidate.model === 'string') {
      return {
        provider: typeof candidate.provider === 'string' ? candidate.provider : '',
        model: typeof candidate.model === 'string' ? candidate.model : '',
      };
    }
    queue.push(...Object.values(candidate));
  }
  return { provider: '', model: '' };
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function identityLabel(identity: RecordValue, fallbackType: string, fallbackKey: unknown) {
  const code = String(identity.stageCode ?? identity.code ?? '').trim();
  const name = String(identity.name ?? '').trim();
  if (code) return name && name !== code ? `${code} · ${name}` : code;
  if (typeof fallbackKey === 'string' && fallbackKey.trim()) return `${fallbackType}（历史）· ${fallbackKey}`;
  return `未记录${fallbackType}`;
}

function arrayOfRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '-';
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join('、') || '空';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === null || value === undefined || value === '' ? '空' : String(value);
}

function diffLabel(key: string) {
  return ({ domain: '业务域', intent: '意图', metric: '指标', dimension: '维度', entity: '实体', time: '时间范围', answerShape: '输出形态', confidence: '置信度' } as Record<string, string>)[key] ?? key;
}
