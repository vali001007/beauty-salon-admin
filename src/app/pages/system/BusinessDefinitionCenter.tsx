import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookKey,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getBusinessDefinition,
  getBusinessDefinitions,
  publishBusinessDefinitionVersion,
  validateBusinessDefinitionVersion,
} from '@/api';
import { usePermission } from '@/hooks/usePermission';
import type {
  BusinessDefinitionDetail,
  BusinessDefinitionKind,
  BusinessDefinitionLifecycleStatus,
  BusinessDefinitionListItem,
  BusinessDefinitionListQuery,
  BusinessDefinitionStatus,
  BusinessDefinitionValidationStatus,
  BusinessDefinitionVersion,
} from '@/types/businessDefinition';
import { Button } from '../../components/UI';

const KIND_LABELS: Record<BusinessDefinitionKind, string> = {
  entity: '实体',
  field: '字段',
  relation: '关系',
  metric: '指标',
  dimension: '维度',
  status_dictionary: '状态字典',
  time_policy: '时间策略',
  query_definition: '查询定义',
};

const DEFINITION_STATUS_LABELS: Record<BusinessDefinitionStatus, string> = {
  active: '启用',
  archived: '已归档',
};

const LIFECYCLE_LABELS: Record<BusinessDefinitionLifecycleStatus, string> = {
  candidate: '候选',
  draft: '草稿',
  validated: '已验证',
  published: '已发布',
};

const VALIDATION_LABELS: Record<BusinessDefinitionValidationStatus, string> = {
  pending: '待验证',
  passed: '验证通过',
  failed: '验证失败',
};

const PAGE_SIZE = 50;

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const match = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      if (match) return match.trim();
    }
  }
  return '';
}

function stringList(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      if (items.length) return items;
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
  }
  return [];
}

function sourceParts(payload: Record<string, unknown>) {
  const source = record(payload.source);
  const measure = record(payload.measure);
  const formula = record(payload.formula);
  const model = firstString(
    source.model,
    payload.model,
    payload.sourceModel,
    payload.fromModel,
    formula.model,
    measure.model,
    payload.sourceModels,
  );
  const field = firstString(
    source.field,
    payload.field,
    payload.sourceField,
    payload.dateField,
    formula.field,
    measure.field,
  );
  return { model, field };
}

interface BusinessSummaryItem {
  label: string;
  value: string;
}

function uiDefinitionProjectionData(version: BusinessDefinitionVersion): Record<string, unknown> | undefined {
  for (const projection of version.projections) {
    if (projection.targetType !== 'ui_definition_view') continue;
    const payload = record(projection.payload);
    if (payload.projectionSchemaVersion !== '2.0' || payload.projectionType !== 'ui_definition_view') continue;
    const data = record(payload.data);
    if (!Object.keys(data).length || firstString(data.definitionKind) === '') continue;
    return data;
  }
  return undefined;
}

function displayValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '-';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') {
    return Object.entries(record(value))
      .map(([key, item]) => `${key}=${displayValue(item)}`)
      .join(', ');
  }
  return String(value);
}

function businessSummary(kind: BusinessDefinitionKind, version: BusinessDefinitionVersion): BusinessSummaryItem[] {
  const payload = record(version.payload);
  const uiProjection = uiDefinitionProjectionData(version);
  const projectedSummary = firstString(uiProjection?.summary);
  const projectedAliases = stringList(uiProjection?.aliases);
  const projectionItems: BusinessSummaryItem[] = [
    ...(projectedSummary ? [{ label: '业务摘要', value: projectedSummary }] : []),
    ...(projectedAliases.length ? [{ label: '业务别名', value: projectedAliases.join('、') }] : []),
  ];
  const { model, field } = sourceParts(payload);
  const source = model
    ? `${model}${field ? `.${field}` : ''}`
    : firstString(payload.source, payload.sourcePath) || '已登记来源';
  const directPermissions = stringList(payload.permissions, payload.permissionAllOf, payload.requiredPermission);
  const policyPermissions = Array.isArray(payload.permissionPolicies)
    ? payload.permissionPolicies.flatMap((policy) => stringList(record(policy).allOf))
    : [];
  const permissions = Array.from(new Set([...directPermissions, ...policyPermissions]));
  const permissionText = permissions.length ? permissions.join('、') : '按门店范围控制';

  if (kind === 'metric') {
    const measure = record(payload.measure);
    const aggregation = firstString(measure.aggregation, payload.aggregation) || '-';
    const measureModel = firstString(measure.model, model) || '-';
    const measureField =
      (aggregation === 'count_distinct'
        ? firstString(measure.distinctField, measure.field, field)
        : firstString(measure.field, measure.distinctField, field)) || '-';
    const sourceModels = stringList(payload.sourceModels);
    const filters = Array.isArray(payload.filters)
      ? payload.filters.map((item) => {
          const filter = record(item);
          const filterModel = firstString(filter.model) || '-';
          const filterField = firstString(filter.field) || '-';
          const operator = firstString(filter.operator) || '-';
          return `${filterModel}.${filterField} ${operator} ${displayValue(filter.value)}`;
        })
      : [];
    const dimensions = stringList(payload.dimensions);
    const timePolicy = record(payload.timePolicy);
    const exceptionPolicy = record(payload.exceptionPolicy);
    const exceptions = Object.entries(exceptionPolicy).map(([key, value]) => `${key}=${displayValue(value)}`);
    const joinPath = formatJoinPath(payload.joinPath);
    const storeScope = record(payload.storeScope);
    const storeScopeJoinPath = formatJoinPath(storeScope.joinPath);
    const bindings = record(payload.bindings);

    return [
      ...projectionItems,
      { label: '说明', value: firstString(payload.description) || '-' },
      { label: '值类型', value: firstString(payload.valueType) || '-' },
      { label: '度量', value: `${aggregation} ${measureModel}.${measureField}` },
      { label: '来源模型', value: sourceModels.length ? sourceModels.join('、') : '-' },
      { label: '关联路径', value: joinPath.length ? joinPath.join('；') : '-' },
      { label: '过滤条件', value: filters.length ? filters.join('；') : '-' },
      { label: '维度', value: dimensions.length ? dimensions.join('、') : '-' },
      {
        label: '时间策略',
        value: [timePolicy.mode, timePolicy.field, timePolicy.boundary, timePolicy.timezone]
          .map((item) => firstString(item) || '-')
          .join(' / '),
      },
      { label: '异常策略', value: exceptions.length ? exceptions.join('；') : '-' },
      {
        label: '门店范围',
        value:
          [storeScope.mode, compactPhysicalField(storeScope.model, storeScope.field), ...storeScopeJoinPath]
            .map((item) => firstString(item))
            .filter(Boolean)
            .join(' / ') || '-',
      },
      { label: '权限', value: permissionText },
      { label: '模板绑定', value: stringList(bindings.template).join('、') || '-' },
      { label: '能力绑定', value: stringList(bindings.capability).join('、') || '-' },
      { label: '执行器', value: stringList(bindings.executor).join('、') || '-' },
      { label: '输出字段', value: stringList(bindings.outputField).join('、') || '-' },
    ];
  }

  if (kind === 'relation') {
    const fromModel = firstString(payload.fromModel) || '-';
    const relationField = firstString(payload.relationField) || '-';
    const toModel = firstString(payload.toModel) || '-';
    return [
      ...projectionItems,
      { label: '关联路径', value: `${fromModel}.${relationField} -> ${toModel}` },
      { label: '关系名称', value: firstString(payload.relationName) || '-' },
      { label: '基数', value: firstString(payload.cardinality) || '-' },
    ];
  }

  if (kind === 'status_dictionary') {
    const values = stringList(payload.values);
    return [
      ...projectionItems,
      { label: '枚举', value: firstString(payload.enumName) || '-' },
      { label: '字典值', value: values.length ? values.join('、') : '-' },
    ];
  }

  if (kind === 'time_policy') {
    return [
      ...projectionItems,
      {
        label: '摘要',
        value: `${source} 使用 ${firstString(payload.timePolicy, payload.policy, payload.granularity) || version.timezone} 时间策略，作用范围为 ${scopeLabel(version.storeScope)}。`,
      },
    ];
  }

  if (kind === 'query_definition') {
    return [
      ...projectionItems,
      {
        label: '摘要',
        value: `${firstString(payload.queryKey, version.canonicalQueryRef) || '治理查询'} 基于 ${source}，权限 ${permissionText}。`,
      },
    ];
  }

  return [
    ...projectionItems,
    {
      label: '摘要',
      value: `${KIND_LABELS[kind]}基于 ${source}，来源 ${firstString(payload.sourceType, payload.sourcePath) || '治理登记'}，作用范围为 ${scopeLabel(version.storeScope)}。`,
    },
  ];
}

function compactPhysicalField(model: unknown, field: unknown) {
  const modelName = firstString(model);
  const fieldName = firstString(field);
  return modelName ? `${modelName}${fieldName ? `.${fieldName}` : ''}` : '';
}

function formatJoinPath(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((step) => {
    const record = step && typeof step === 'object' && !Array.isArray(step) ? (step as Record<string, unknown>) : {};
    const fromModel = firstString(record.fromModel) || '-';
    const relationField = firstString(record.relationField) || '-';
    const toModel = firstString(record.toModel) || '-';
    return `${fromModel}.${relationField} -> ${toModel}`;
  });
}

function scopeLabel(value: Record<string, unknown>) {
  const mode = firstString(value.mode);
  if (mode === 'current_store') return '当前门店';
  if (mode === 'global') return '全局';
  return mode || '已登记范围';
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; payload?: { message?: unknown } };
    if (typeof candidate.payload?.message === 'string') return candidate.payload.message;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return fallback;
}

function lifecycleTone(status: BusinessDefinitionLifecycleStatus) {
  if (status === 'published') return 'bg-emerald-50 text-emerald-700';
  if (status === 'validated') return 'bg-blue-50 text-blue-700';
  if (status === 'candidate') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-700';
}

function validationTone(status: BusinessDefinitionValidationStatus) {
  if (status === 'passed') return 'text-emerald-700';
  if (status === 'failed') return 'text-red-700';
  return 'text-amber-700';
}

export function BusinessDefinitionCenter() {
  const canManage = usePermission('core:system:permissions');
  const [kind, setKind] = useState<'all' | BusinessDefinitionKind>('all');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<'all' | BusinessDefinitionStatus>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BusinessDefinitionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<BusinessDefinitionDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [actionKey, setActionKey] = useState('');
  const listRequestSequence = useRef(0);
  const detailRequestSequence = useRef(0);

  const currentQuery = useCallback(
    (requestedPage = page): BusinessDefinitionListQuery => {
      const query: BusinessDefinitionListQuery = { page: requestedPage, pageSize: PAGE_SIZE };
      if (kind !== 'all') query.kind = kind;
      if (domain.trim()) query.domain = domain.trim();
      if (status !== 'all') query.status = status;
      return query;
    },
    [domain, kind, page, status],
  );

  const loadList = useCallback(async (query: BusinessDefinitionListQuery) => {
    const requestSequence = ++listRequestSequence.current;
    setLoadingList(true);
    setListError('');
    try {
      const result = await getBusinessDefinitions(query);
      if (requestSequence !== listRequestSequence.current) return true;
      setItems(result.items ?? []);
      setTotal(result.total ?? result.items?.length ?? 0);
      return true;
    } catch (error) {
      if (requestSequence !== listRequestSequence.current) return true;
      setItems([]);
      setTotal(0);
      setListError(errorMessage(error, '业务口径加载失败，请稍后重试。'));
      return false;
    } finally {
      if (requestSequence === listRequestSequence.current) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList({ page: 1, pageSize: PAGE_SIZE });
  }, [loadList]);

  const invalidateDetail = useCallback(() => {
    detailRequestSequence.current += 1;
    setSelected(null);
    setLoadingDetail(false);
    setDetailError('');
  }, []);

  const openDefinition = async (item: BusinessDefinitionListItem) => {
    const requestSequence = ++detailRequestSequence.current;
    setLoadingDetail(true);
    setDetailError('');
    try {
      const detail = await getBusinessDefinition(item.kind, item.definitionKey);
      if (requestSequence !== detailRequestSequence.current) return;
      setSelected(detail);
    } catch (error) {
      if (requestSequence !== detailRequestSequence.current) return;
      setSelected(null);
      setDetailError(errorMessage(error, '业务口径详情加载失败，请稍后重试。'));
    } finally {
      if (requestSequence === detailRequestSequence.current) setLoadingDetail(false);
    }
  };

  const refreshSelected = async (definition: BusinessDefinitionDetail, expectedSequence: number) => {
    if (expectedSequence !== detailRequestSequence.current) return true;
    try {
      const refreshed = await getBusinessDefinition(definition.kind, definition.definitionKey);
      if (expectedSequence === detailRequestSequence.current) setSelected(refreshed);
      return true;
    } catch {
      return expectedSequence !== detailRequestSequence.current;
    }
  };

  const runVersionAction = async (action: 'validate' | 'publish', version: BusinessDefinitionVersion) => {
    if (!selected) return;
    const actionDefinition = selected;
    const expectedDetailSequence = detailRequestSequence.current;
    const expectedListSequence = listRequestSequence.current;
    const key = `${action}-${version.id}`;
    setActionKey(key);
    try {
      if (action === 'validate') {
        await validateBusinessDefinitionVersion(version.id, {});
      } else {
        const expectedCurrentVersionId = actionDefinition.currentPublishedVersion?.id;
        await publishBusinessDefinitionVersion(
          version.id,
          expectedCurrentVersionId ? { expectedCurrentVersionId } : {},
        );
      }
    } catch (error) {
      toast.error(errorMessage(error, action === 'validate' ? '验证失败，请重试。' : '发布失败，请刷新后重试。'));
      setActionKey('');
      return;
    }

    toast.success(action === 'validate' ? `v${version.version} 验证完成` : `v${version.version} 已发布`);
    try {
      const [detailRefreshed, listRefreshed] = await Promise.all([
        refreshSelected(actionDefinition, expectedDetailSequence),
        expectedListSequence === listRequestSequence.current ? loadList(currentQuery()) : Promise.resolve(true),
      ]);
      if (!detailRefreshed || !listRefreshed) toast.error('操作已成功，但页面刷新失败');
    } finally {
      setActionKey('');
    }
  };

  const handleFilter = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    invalidateDetail();
    void loadList(currentQuery(1));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changePage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    invalidateDetail();
    void loadList(currentQuery(nextPage));
  };

  const selectedSource = useMemo(() => {
    if (!selected) return '';
    return [selected.ownerType, selected.ownerId].filter(Boolean).join(' / ');
  }, [selected]);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm text-gray-500">首页 / 系统设置 / 业务口径中心</div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookKey className="h-5 w-5 text-gray-600" />
            <h1 className="text-xl font-semibold text-gray-900">业务口径中心</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">集中查看业务定义、验证版本并发布已通过的口径。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="刷新业务口径"
          aria-label="刷新业务口径"
          disabled={loadingList}
          onClick={() => void loadList(currentQuery())}
        >
          <RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3 border-y border-gray-200 py-3" onSubmit={handleFilter}>
        <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-gray-600">
          类型
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'all' | BusinessDefinitionKind)}
          >
            <option value="all">全部类型</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-64">
          业务域
          <input
            className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-800 outline-none focus:border-blue-500"
            placeholder="例如 finance"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          />
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-gray-600">
          状态
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | BusinessDefinitionStatus)}
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="archived">已归档</option>
          </select>
        </label>
        <Button type="submit" size="sm" disabled={loadingList}>
          <Search className="h-4 w-4" />
          查询
        </Button>
      </form>

      <div className="grid min-h-[480px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section aria-label="业务口径列表" className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-800">业务定义</span>
            <span className="text-gray-500">共 {total} 条</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            {loadingList ? (
              <StateMessage icon={Loader2} iconClassName="animate-spin" title="正在加载业务口径" />
            ) : listError ? (
              <StateMessage icon={AlertCircle} title="业务口径加载失败" description={listError} tone="error" />
            ) : items.length === 0 ? (
              <StateMessage icon={FileSearch} title="暂无业务口径" description="当前筛选条件下没有可治理的定义。" />
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-4 py-3">业务名称</th>
                    <th className="px-3 py-3">类型</th>
                    <th className="px-3 py-3">业务域</th>
                    <th className="px-3 py-3">发布版本</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">来源 / 更新时间</th>
                    <th className="w-12 px-3 py-3">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const active = selected?.id === item.id;
                    return (
                      <tr key={item.id} className={active ? 'bg-blue-50/60' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-gray-500">{item.definitionKey}</div>
                        </td>
                        <td className="px-3 py-3">
                          <KindBadge kind={item.kind} />
                        </td>
                        <td className="px-3 py-3 text-gray-700">{item.domain}</td>
                        <td className="px-3 py-3 font-medium text-gray-800">
                          {item.currentPublishedVersion ? `v${item.currentPublishedVersion.version}` : '未发布'}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{DEFINITION_STATUS_LABELS[item.status]}</td>
                        <td className="px-3 py-3">
                          <div className="text-gray-700">
                            {[item.ownerType, item.ownerId].filter(Boolean).join(' / ')}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500">{formatDate(item.updatedAt)}</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            aria-label={`查看${item.name}`}
                            aria-current={active ? 'true' : undefined}
                            title={`查看${item.name}`}
                            onClick={() => void openDefinition(item)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-3 flex items-center justify-end gap-3 text-sm text-gray-600">
            <span>
              第 {page} / {totalPages} 页
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingList || page <= 1}
              onClick={() => changePage(page - 1)}
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingList || page >= totalPages}
              onClick={() => changePage(page + 1)}
              aria-label="下一页"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <aside
          className="min-w-0 border-t border-gray-200 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"
          aria-label="业务口径详情"
        >
          {loadingDetail ? (
            <StateMessage icon={Loader2} iconClassName="animate-spin" title="正在加载定义详情" />
          ) : detailError ? (
            <StateMessage icon={AlertCircle} title="定义详情加载失败" description={detailError} tone="error" />
          ) : !selected ? (
            <StateMessage icon={BookKey} title="选择一个业务定义" description="查看业务摘要、版本验证和发布状态。" />
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
                  <KindBadge kind={selected.kind} />
                </div>
                <div className="mt-1 font-mono text-xs text-gray-500">{selected.definitionKey}</div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Meta label="业务域" value={selected.domain} />
                  <Meta
                    label="当前发布"
                    value={selected.currentPublishedVersion ? `v${selected.currentPublishedVersion.version}` : '未发布'}
                  />
                  <Meta label="口径来源" value={selectedSource || '-'} />
                  <Meta label="更新时间" value={formatDate(selected.updatedAt)} />
                </dl>
              </div>

              <div className="border-y border-gray-200 py-4">
                <div className="text-xs font-medium text-gray-500">业务语言摘要</div>
                {selected.versions[0] ? (
                  <dl className="mt-3 grid gap-3 text-sm">
                    {businessSummary(selected.kind, selected.versions[0]).map((item) => (
                      <div key={item.label} className="grid gap-1 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-3">
                        <dt className="text-xs text-gray-500">{item.label}</dt>
                        <dd className="break-words leading-6 text-gray-800">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-gray-800">尚无可展示的版本摘要。</p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">版本历史</h3>
                  <span className="text-xs text-gray-500">{selected.versions.length} 个版本</span>
                </div>
                <div className="divide-y divide-gray-200 border-y border-gray-200">
                  {selected.versions.map((version) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      canManage={canManage}
                      actionKey={actionKey}
                      onAction={runVersionAction}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: BusinessDefinitionKind }) {
  return (
    <span className="inline-flex rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700">
      {KIND_LABELS[kind]}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-800">{value}</dd>
    </div>
  );
}

function VersionRow({
  version,
  canManage,
  actionKey,
  onAction,
}: {
  version: BusinessDefinitionVersion;
  canManage: boolean;
  actionKey: string;
  onAction: (action: 'validate' | 'publish', version: BusinessDefinitionVersion) => Promise<void>;
}) {
  const validating = actionKey === `validate-${version.id}`;
  const publishing = actionKey === `publish-${version.id}`;
  const canValidate = canManage && (version.lifecycleStatus === 'draft' || version.lifecycleStatus === 'candidate');
  const canPublish = canManage && version.lifecycleStatus === 'validated' && version.validationStatus === 'passed';
  const source = version.evidence[0];
  const blockedReasons = stringList(record(version.validationReport).blockedReasons);

  return (
    <div className="py-4" data-testid={`business-definition-version-${version.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">v{version.version}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${lifecycleTone(version.lifecycleStatus)}`}>
            {LIFECYCLE_LABELS[version.lifecycleStatus]}
          </span>
          <span className={`text-xs font-medium ${validationTone(version.validationStatus)}`}>
            {VALIDATION_LABELS[version.validationStatus]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canValidate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(actionKey)}
              aria-busy={validating}
              onClick={() => void onAction('validate', version)}
              aria-label={`验证 v${version.version}`}
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              验证
            </Button>
          )}
          {canPublish && (
            <Button
              type="button"
              size="sm"
              disabled={Boolean(actionKey)}
              aria-busy={publishing}
              onClick={() => void onAction('publish', version)}
              aria-label={`发布 v${version.version}`}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              发布
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Meta label="证据" value={`证据 ${version.evidence.length}`} />
        <Meta label="投影" value={`投影 ${version.projections.length}`} />
        <Meta label="口径来源" value={source ? `${source.sourceType} / ${source.sourcePath}` : '-'} />
        <Meta label="创建时间" value={formatDate(version.createdAt)} />
      </div>
      <div className="mt-3">
        <div className="text-xs text-gray-500">定义指纹</div>
        <div className="mt-1 break-all font-mono text-[11px] text-gray-700">{version.fingerprint}</div>
      </div>
      {blockedReasons.length > 0 && (
        <div className="mt-3 border-l-2 border-red-400 pl-3 text-xs leading-5 text-red-700">
          自动扫描发现：{blockedReasons.join('；')}
        </div>
      )}
      <div className="mt-2">
        <div className="text-xs text-gray-500">来源指纹</div>
        <div className="mt-1 break-all font-mono text-[11px] text-gray-700">{version.sourceFingerprint}</div>
      </div>
    </div>
  );
}

function StateMessage({
  icon: Icon,
  title,
  description,
  iconClassName = '',
  tone = 'default',
}: {
  icon: typeof BookKey;
  title: string;
  description?: string;
  iconClassName?: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? undefined : 'polite'}
    >
      <Icon className={`h-8 w-8 ${tone === 'error' ? 'text-red-500' : 'text-gray-400'} ${iconClassName}`} />
      <div className={`mt-3 text-sm font-medium ${tone === 'error' ? 'text-red-700' : 'text-gray-800'}`}>{title}</div>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>}
    </div>
  );
}
