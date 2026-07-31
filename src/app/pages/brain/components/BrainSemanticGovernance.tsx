import { useCallback, useEffect, useState } from 'react';
import { BookKey, Bug, FileClock, Loader2, Power, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  isBrainGovernanceReadCancelled,
  listBrainSemanticGovernanceHistory,
  listBrainSemanticGovernanceSummaries,
  setBrainPublishedSemanticEnabled,
} from '@/api/brain';
import { usePermission } from '@/hooks/usePermission';
import type {
  BrainSemanticGovernanceHistoryItem,
  BrainSemanticGovernanceResource,
  BrainSemanticGovernanceSummary,
} from '@/types/brain';
import { BrainSemanticGraph } from './BrainSemanticGraph';

type SemanticTab = BrainSemanticGovernanceResource | 'graph';

const resources: Record<SemanticTab, { title: string; singular: string }> = {
  metrics: { title: '指标版本', singular: '指标' },
  entities: { title: '实体版本', singular: '实体' },
  relations: { title: '关系版本', singular: '关系' },
  actions: { title: '动作版本', singular: '动作' },
  graph: { title: '语义图谱', singular: '图谱' },
};

export function BrainSemanticGovernance() {
  const navigate = useNavigate();
  const canManage = usePermission('core:brain-governance:manage');
  const [tab, setTab] = useState<SemanticTab>('metrics');
  const [items, setItems] = useState<BrainSemanticGovernanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historyTarget, setHistoryTarget] = useState<BrainSemanticGovernanceSummary | null>(null);
  const [historyItems, setHistoryItems] = useState<BrainSemanticGovernanceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const resource = tab === 'graph' ? null : tab;
  const config = resources[tab];

  const load = useCallback(async () => {
    if (!resource) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const response = await listBrainSemanticGovernanceSummaries(resource, { take: 200 });
      setItems(response.items ?? []);
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
      const message = error instanceof Error ? error.message : `${config.singular}列表加载失败`;
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [config.singular, resource]);

  useEffect(() => {
    setItems([]);
    setHistoryTarget(null);
    void load();
  }, [load]);

  async function openHistory(item: BrainSemanticGovernanceSummary) {
    if (!resource) return;
    setHistoryTarget(item);
    setHistoryItems([]);
    setHistoryLoading(true);
    try {
      const response = await listBrainSemanticGovernanceHistory(resource, item.resourceKey, { take: 100 });
      setHistoryItems(response.items ?? []);
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '历史版本加载失败');
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  function debugResource(item: BrainSemanticGovernanceSummary) {
    if (!resource) return;
    const question = `请对${config.singular}“${item.name}”（${item.resourceKey}）执行一次只读语义命中调试，并说明识别结果和匹配依据。`;
    navigate(
      `/brain?question=${encodeURIComponent(question)}&debugSemantic=${encodeURIComponent(`${resource}:${item.resourceKey}`)}`,
    );
  }

  async function toggleResource(item: BrainSemanticGovernanceSummary) {
    if (!resource || !canManage || !item.managed || !item.definitionVersionId) return;
    const nextEnabled = !item.enabled;
    const confirmed = window.confirm(
      nextEnabled
        ? `确认启用${config.singular}“${item.name}”的已发布版本 v${item.version}？`
        : `确认停用${config.singular}“${item.name}”？停用后 Ami Brain 不再使用该业务口径。`,
    );
    if (!confirmed) return;
    setTogglingKey(item.resourceKey);
    try {
      await setBrainPublishedSemanticEnabled(resource, item.resourceKey, nextEnabled);
      toast.success(nextEnabled ? `${config.singular}已启用` : `${config.singular}已停用`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${config.singular}启停失败`);
    } finally {
      setTogglingKey(null);
    }
  }

  return (
    <section className="min-w-0">
      <div className="mb-4 flex gap-1 border-b border-border">
        {(Object.keys(resources) as SemanticTab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`px-3 py-2 text-sm ${tab === key ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setTab(key)}
          >
            {resources[key].title}
          </button>
        ))}
      </div>

      {tab === 'graph' ? (
        <BrainSemanticGraph />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-base font-semibold">{config.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {resource === 'actions'
                  ? '同时展示 Registry 版本与尚未同步的本地受治理候选；本地候选不可启用，也不代表当前 Release 已发布。'
                  : '展示业务口径中心发布后的运行投影；命中率为当前门店近 30 天已完成问答中的真实命中占比。'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
                onClick={() => navigate('/system/business-definitions')}
              >
                <BookKey className="h-4 w-4" />
                业务口径中心
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-60"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </header>

          <div className="min-w-0 py-5">
            {loadError ? (
              <div className="mb-3 flex items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <span>{loadError}</span>
                <button type="button" className="underline" onClick={() => void load()}>
                  重试
                </button>
              </div>
            ) : null}
            <div className="min-w-0 overflow-x-auto border border-border">
              <table
                className={`w-full text-left text-sm ${resource === 'actions' ? 'min-w-[2220px]' : 'min-w-[1580px]'}`}
              >
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">名称</th>
                    <th className="px-3 py-2">所属业务领域</th>
                    <th className="px-3 py-2">版本</th>
                    <th className="px-3 py-2">语义说明</th>
                    {resource === 'actions' ? (
                      <>
                        <th className="px-3 py-2">动作语义</th>
                        <th className="px-3 py-2">能力绑定</th>
                        <th className="px-3 py-2">竞争动作</th>
                        <th className="px-3 py-2">Profile 完整度</th>
                      </>
                    ) : null}
                    <th className="px-3 py-2">关联数据表</th>
                    <th className="px-3 py-2">模糊词条</th>
                    <th className="px-3 py-2">命中率</th>
                    <th className="px-3 py-2">更新时间</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? (
                    items.map((item) => (
                      <tr key={item.resourceKey} className="border-t border-border align-top">
                        <td className="px-3 py-3 font-mono text-xs">
                          <div>{item.id}</div>
                          {item.definitionId ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">口径 #{item.definitionId}</div>
                          ) : null}
                        </td>
                        <td className="max-w-52 px-3 py-3">
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="mt-1 break-all text-xs text-muted-foreground">{item.resourceKey}</div>
                        </td>
                        <td className="max-w-44 px-3 py-3">{renderBusinessDomain(item.domain)}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-medium">v{item.version}</div>
                          <div
                            className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(item.status)}`}
                          >
                            {statusLabel(item.status)}
                          </div>
                        </td>
                        <td className="max-w-sm px-3 py-3 text-sm leading-6 text-muted-foreground">
                          {item.semanticDescription || '暂无语义说明'}
                        </td>
                        {resource === 'actions' ? (
                          <>
                            <td className="max-w-80 px-3 py-3">
                              <ActionSemantics item={item} />
                            </td>
                            <td className="max-w-72 px-3 py-3">
                              <ActionBindings item={item} />
                            </td>
                            <td className="max-w-96 px-3 py-3">
                              <ActionContrasts item={item} />
                            </td>
                            <td className="max-w-96 px-3 py-3">
                              <ActionProfiles item={item} />
                            </td>
                          </>
                        ) : null}
                        <td className="max-w-64 px-3 py-3">{renderTags(item.dataTables, '待映射')}</td>
                        <td className="max-w-72 px-3 py-3">{renderTags(item.fuzzyTerms, '暂无词条')}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {item.hitRate == null ? (
                            <span className="text-muted-foreground">暂无样本</span>
                          ) : (
                            <>
                              <div className="font-medium">{formatPercent(item.hitRate)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.hitCount}/{item.sampleCount} 次问答
                              </div>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                          {formatDateTime(item.updatedAt)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"
                              onClick={() => void openHistory(item)}
                            >
                              <FileClock className="h-3.5 w-3.5" />
                              历史版本 ({item.historyCount})
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"
                              onClick={() => debugResource(item)}
                            >
                              <Bug className="h-3.5 w-3.5" />
                              调试
                            </button>
                            <button
                              type="button"
                              className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${item.enabled ? 'border-destructive/40 text-destructive' : 'border-emerald-300 text-emerald-700'}`}
                              disabled={
                                !canManage ||
                                !item.managed ||
                                !item.definitionVersionId ||
                                togglingKey === item.resourceKey
                              }
                              title={
                                !item.managed
                                  ? '历史投影尚未纳入业务口径版本治理'
                                  : !canManage
                                    ? '当前账号没有语义治理权限'
                                    : undefined
                              }
                              onClick={() => void toggleResource(item)}
                            >
                              {togglingKey === item.resourceKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                              {!item.managed ? '未纳管' : item.enabled ? '停用' : '启用'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={resource === 'actions' ? 14 : 10}
                        className="px-3 py-10 text-center text-muted-foreground"
                      >
                        {loading ? '加载中' : `暂无${config.singular}版本`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {historyTarget ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="semantic-history-title"
                className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
              >
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div>
                    <h3 id="semantic-history-title" className="font-semibold">
                      {historyTarget.name} · 历史版本
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">{historyTarget.resourceKey}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭历史版本"
                    className="rounded-md p-2 hover:bg-muted"
                    onClick={() => setHistoryTarget(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>
                <div className="max-h-[68vh] overflow-auto p-5">
                  <table
                    className={`w-full text-left text-sm ${resource === 'actions' ? 'min-w-[1820px]' : 'min-w-[1100px]'}`}
                  >
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">所属业务领域</th>
                        <th className="px-3 py-2">版本/状态</th>
                        <th className="px-3 py-2">语义说明</th>
                        {resource === 'actions' ? (
                          <>
                            <th className="px-3 py-2">动作语义</th>
                            <th className="px-3 py-2">竞争动作</th>
                            <th className="px-3 py-2">Profile 完整度</th>
                          </>
                        ) : null}
                        <th className="px-3 py-2">关联数据表</th>
                        <th className="px-3 py-2">模糊词条</th>
                        <th className="px-3 py-2">更新时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.length ? (
                        historyItems.map((item) => (
                          <tr key={item.id} className="border-t border-border align-top">
                            <td className="px-3 py-3 font-mono text-xs">{item.id}</td>
                            <td className="max-w-44 px-3 py-3">{renderBusinessDomain(item.domain)}</td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <div className="font-medium">v{item.version}</div>
                              <span
                                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(item.status)}`}
                              >
                                {statusLabel(item.status)}
                              </span>
                            </td>
                            <td className="max-w-sm px-3 py-3 text-muted-foreground">
                              {item.semanticDescription || '暂无语义说明'}
                            </td>
                            {resource === 'actions' ? (
                              <>
                                <td className="max-w-80 px-3 py-3">
                                  <ActionSemantics item={item} />
                                </td>
                                <td className="max-w-96 px-3 py-3">
                                  <ActionContrasts item={item} />
                                </td>
                                <td className="max-w-96 px-3 py-3">
                                  <ActionProfiles item={item} />
                                </td>
                              </>
                            ) : null}
                            <td className="max-w-64 px-3 py-3">{renderTags(item.dataTables, '待映射')}</td>
                            <td className="max-w-72 px-3 py-3">{renderTags(item.fuzzyTerms, '暂无词条')}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                              {formatDateTime(item.updatedAt)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={resource === 'actions' ? 10 : 7}
                            className="px-3 py-10 text-center text-muted-foreground"
                          >
                            {historyLoading ? '加载历史版本' : '暂无历史版本'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

const businessDomainLabels: Record<string, string> = {
  business_overview: '经营概览',
  store_operation: '门店经营',
  customer: '客户经营',
  service: '服务履约',
  reservation: '预约服务',
  order: '订单收银',
  payment: '支付收款',
  product: '商品项目',
  project: '项目服务',
  inventory: '库存供应',
  inventory_procurement: '采购库存',
  supply: '供应链',
  finance: '财务经营',
  marketing: '营销增长',
  staff: '员工绩效',
  governance: '治理',
};

function renderBusinessDomain(domain: string | null) {
  if (!domain) return <span className="text-xs text-muted-foreground">待归类</span>;
  const label = businessDomainLabels[domain] ?? domain;
  return (
    <div>
      <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-foreground">
        {label}
      </span>
      {label !== domain ? <div className="mt-1 font-mono text-[11px] text-muted-foreground">{domain}</div> : null}
    </div>
  );
}

function renderTags(values: string[], emptyText: string) {
  if (!values.length) return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <span key={value} className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {value}
        </span>
      ))}
    </div>
  );
}

type ActionGovernanceItem = BrainSemanticGovernanceSummary | BrainSemanticGovernanceHistoryItem;

function ActionSemantics({ item }: { item: ActionGovernanceItem }) {
  const details = item.actionDetails;
  if (!details) return <span className="text-xs text-destructive">动作结构不可用</span>;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1">
        <span
          className={`rounded-full border px-2 py-0.5 ${details.origin === 'registry' ? 'border-blue-300 text-blue-700' : 'border-amber-300 text-amber-700'}`}
        >
          {details.origin === 'registry' ? 'Registry' : '本地候选'}
        </span>
        <span className="rounded bg-muted px-2 py-0.5">{details.domain || '未声明领域'}</span>
        <span className="rounded bg-muted px-2 py-0.5">{details.actionClass || '未声明动作类别'}</span>
      </div>
      <div>
        <span className="text-muted-foreground">作用对象：</span>
        {details.targetEntityRefs.join('、') || '未声明'}
      </div>
      <div>
        <span className="text-muted-foreground">槽位：</span>
        {details.inputSlots.map((slot) => `${slot.label}(${slot.semanticRole || '-'})`).join('、') || '未声明'}
      </div>
      <div>
        <span className="text-muted-foreground">政策：</span>
        {[details.riskPolicy, details.confirmationPolicy, details.idempotencyPolicy].filter(Boolean).join(' / ') ||
          '未声明'}
      </div>
      {item.fingerprint ? (
        <div className="break-all font-mono text-[11px] text-muted-foreground">
          definition {shortFingerprint(item.fingerprint)}
        </div>
      ) : null}
    </div>
  );
}

function ActionBindings({ item }: { item: ActionGovernanceItem }) {
  const bindings = item.actionDetails?.capabilityBindings ?? [];
  if (!bindings.length) return <span className="text-xs text-destructive">缺少能力绑定</span>;
  return (
    <div className="space-y-2">
      {bindings.map((binding) => (
        <div
          key={`${binding.capabilityKey}:${binding.gatewayActionKey}`}
          className="rounded border border-border p-2 text-xs"
        >
          <div className="font-mono">{binding.capabilityKey || 'capability missing'}</div>
          <div className="mt-1 font-mono text-muted-foreground">→ {binding.gatewayActionKey || 'gateway missing'}</div>
          <div className={`mt-1 ${binding.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
            {binding.enabled ? '绑定启用' : '绑定停用'}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionContrasts({ item }: { item: ActionGovernanceItem }) {
  const contrasts = item.actionDetails?.contrasts ?? [];
  if (!contrasts.length) return <span className="text-xs text-destructive">缺少竞争动作差异</span>;
  return (
    <div className="space-y-2">
      {contrasts.map((contrast) => (
        <div key={contrast.conceptKey} className="rounded border border-border p-2 text-xs">
          <div className="font-medium">{contrast.name}</div>
          <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{contrast.conceptKey}</div>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {contrast.discriminators.map((entry, index) => (
              <li
                key={`${entry.dimension}:${index}`}
                title={`当前动作：${entry.currentActionValue}\n竞争动作：${entry.contrastActionValue}`}
              >
                • {entry.dimension}：{entry.currentActionValue}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ActionProfiles({ item }: { item: ActionGovernanceItem }) {
  const details = item.actionDetails;
  if (!details) return <span className="text-xs text-destructive">Profile 不可用</span>;
  const invalidProfiles = details.profiles
    .filter((profile) => profile.status === 'invalid')
    .map((profile) => profile.key);
  const missingProfiles = details.profiles
    .filter((profile) => profile.status === 'missing')
    .map((profile) => profile.key);
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {details.profiles.map((profile) => (
          <span
            key={profile.key}
            title={profile.fingerprint ? `${profile.key}\n${profile.fingerprint}` : profile.key}
            className={`rounded-full border px-2 py-0.5 text-xs ${profile.status === 'available' ? 'border-emerald-300 text-emerald-700' : profile.status === 'invalid' ? 'border-amber-400 text-amber-700' : 'border-destructive/40 text-destructive'}`}
          >
            {profile.label}
            {profile.schemaVersion ? ` ${profile.schemaVersion}` : ''}
            {profile.status === 'invalid' ? ' 异常' : ''}
          </span>
        ))}
      </div>
      <div className={`mt-2 text-xs ${details.profileGaps.length ? 'text-destructive' : 'text-emerald-700'}`}>
        {details.profileGaps.length
          ? [
              invalidProfiles.length ? `异常 ${invalidProfiles.join('、')}` : '',
              missingProfiles.length ? `缺失 ${missingProfiles.join('、')}` : '',
            ]
              .filter(Boolean)
              .join('；')
          : '结构 Profile 齐全；发布身份仍由 Release Contract 校验'}
      </div>
    </div>
  );
}

function shortFingerprint(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: string) {
  return (
    (
      {
        active: '已启用',
        disabled: '已停用',
        archived: '已归档',
        draft: '草稿',
        candidate: '候选',
        validated: '已校验',
        published: '已发布',
        local_candidate: '本地候选',
      } as Record<string, string>
    )[status] ?? status
  );
}

function statusClass(status: string) {
  if (status === 'active') return 'border-emerald-300 text-emerald-700';
  if (status === 'disabled' || status === 'archived') return 'border-slate-300 text-slate-600';
  if (status === 'local_candidate') return 'border-blue-300 text-blue-700';
  return 'border-amber-300 text-amber-700';
}
