import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import type {
  BusinessDefinitionDetail,
  BusinessDefinitionListItem,
  BusinessDefinitionListVersion,
  BusinessDefinitionVersion,
  CanonicalMetricPayload,
} from '@/types/businessDefinition';
import { BusinessDefinitionCenter } from './BusinessDefinitionCenter';

const api = vi.hoisted(() => ({
  getBusinessDefinition: vi.fn(),
  getBusinessDefinitions: vi.fn(),
  publishBusinessDefinitionVersion: vi.fn(),
  validateBusinessDefinitionVersion: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/api', () => api);
vi.mock('sonner', () => ({ toast: notifications }));

const canonicalMetricPayload: CanonicalMetricPayload = {
  metricKey: 'net_revenue',
  description: '统计已完成支付并扣除退款后的净营业额',
  valueType: 'money',
  measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
  sourceModels: ['PaymentRecord', 'RefundRecord'],
  joinPath: [{ fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' }],
  filters: [
    { model: 'PaymentRecord', field: 'status', operator: 'in', value: ['paid', 'success'] },
    { model: 'ProductOrder', field: 'deletedAt', operator: 'eq', value: null },
  ],
  dimensions: ['storeId', 'paymentMethod'],
  timePolicy: {
    mode: 'event_time',
    field: 'paidAt',
    boundary: '[start,end)',
    timezone: 'Asia/Shanghai',
  },
  storeScope: { mode: 'current_store', model: 'PaymentRecord', field: 'storeId', joinPath: [] },
  permissionPolicies: [
    { bindingRef: 'capability:finance.net_revenue', allOf: ['core:finance:view', 'core:order:view'] },
  ],
  exceptionPolicy: {
    cancelled: 'exclude',
    refunded: 'subtract',
    gifts: 'exclude',
    fallback: 'manual_review',
  },
  bindings: {
    template: ['finance.net_revenue'],
    capability: ['finance.net_revenue.query'],
    executor: ['business_definition'],
    outputField: ['value'],
  },
};

const publishedVersion = {
  id: 101,
  definitionId: 10,
  version: 1,
  schemaVersion: '1.0',
  payload: canonicalMetricPayload,
  lifecycleStatus: 'published',
  fingerprint: 'definition-fingerprint-v1',
  sourceFingerprint: 'source-fingerprint-v1',
  validationStatus: 'passed',
  validationReport: { passed: true },
  canonicalQueryRef: 'finance.net_revenue',
  fixtureSetKey: 'finance.net_revenue.v1',
  timezone: 'Asia/Shanghai',
  storeScope: { mode: 'current_store' },
  createdBy: 1,
  validatedBy: 1,
  validatedAt: '2026-07-12T08:00:00.000Z',
  publishedBy: 1,
  publishedAt: '2026-07-12T09:00:00.000Z',
  createdAt: '2026-07-12T07:00:00.000Z',
  evidence: [
    {
      id: 1,
      versionId: 101,
      sourceType: 'prisma_schema',
      sourcePath: 'packages/server-v2/prisma/schema.prisma',
      sourceSymbol: 'Payment.amount',
      evidenceKind: 'field',
      evidenceFingerprint: 'evidence-v1',
      confidence: 1,
      createdAt: '2026-07-12T07:00:00.000Z',
    },
  ],
  projections: [
    {
      id: 1,
      definitionVersionId: 101,
      targetType: 'metric_query_view',
      targetKey: 'metric.net_revenue',
      definitionKey: 'metric.net_revenue',
      definitionVersion: 1,
      definitionFingerprint: 'definition-fingerprint-v1',
      sourceFingerprint: 'source-fingerprint-v1',
      payload: {},
      projectionFingerprint: 'projection-v1',
      generatedAt: '2026-07-12T09:00:00.000Z',
      readOnly: true,
    },
  ],
} satisfies BusinessDefinitionVersion;

const draftVersion = {
  ...publishedVersion,
  id: 102,
  version: 2,
  lifecycleStatus: 'draft',
  validationStatus: 'pending',
  validationReport: null,
  fingerprint: 'definition-fingerprint-v2',
  sourceFingerprint: 'source-fingerprint-v2',
  validatedBy: null,
  validatedAt: null,
  publishedBy: null,
  publishedAt: null,
  projections: [],
} satisfies BusinessDefinitionVersion;

const validatedVersion = {
  ...draftVersion,
  lifecycleStatus: 'validated',
  validationStatus: 'passed',
  validationReport: { passed: true },
  validatedBy: 2,
  validatedAt: '2026-07-13T08:00:00.000Z',
} satisfies BusinessDefinitionVersion;

function toListPublishedVersion(version: BusinessDefinitionVersion): BusinessDefinitionListVersion {
  const result = { ...version };
  Reflect.deleteProperty(result, 'evidence');
  Reflect.deleteProperty(result, 'definition');
  return result as BusinessDefinitionListVersion;
}

const listItem: BusinessDefinitionListItem = {
  id: 10,
  definitionKey: 'metric.net_revenue',
  kind: 'metric',
  domain: 'finance',
  name: '净营业额',
  ownerType: 'system',
  ownerId: 'finance-center',
  status: 'active',
  currentPublishedVersionId: 101,
  createdAt: '2026-07-12T07:00:00.000Z',
  updatedAt: '2026-07-13T08:00:00.000Z',
  currentPublishedVersion: toListPublishedVersion(publishedVersion),
};

function detailWith(version: BusinessDefinitionVersion = draftVersion): BusinessDefinitionDetail {
  return {
    ...listItem,
    versions: [version, publishedVersion],
    currentPublishedVersion: publishedVersion,
  };
}

function definitionItem(overrides: Partial<BusinessDefinitionListItem>): BusinessDefinitionListItem {
  return { ...listItem, ...overrides };
}

const relationItem = definitionItem({
  id: 11,
  definitionKey: 'relation.payment_record.order',
  kind: 'relation',
  domain: 'order',
  name: '支付记录关联订单',
  currentPublishedVersionId: null,
  currentPublishedVersion: null,
});

const statusDictionaryItem = definitionItem({
  id: 12,
  definitionKey: 'status_dictionary.order_status',
  kind: 'status_dictionary',
  domain: 'shared',
  name: '订单状态字典',
  currentPublishedVersionId: null,
  currentPublishedVersion: null,
});

function definitionDetail(
  item: BusinessDefinitionListItem,
  versions: BusinessDefinitionVersion[],
  currentPublishedVersion: BusinessDefinitionVersion | null = publishedVersion,
): BusinessDefinitionDetail {
  return { ...item, versions, currentPublishedVersion };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function mockList(items = [listItem]) {
  api.getBusinessDefinitions.mockResolvedValue({ items, total: items.length, page: 1, pageSize: 50 });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    token: 'test-token',
    isAuthenticated: true,
    user: {
      id: 1,
      username: 'admin',
      name: '管理员',
      roles: ['super_admin'],
      permissions: ['*'],
      deniedPermissions: [],
      storeIds: [1],
      phone: '',
    },
  });
  mockList();
  api.getBusinessDefinition.mockResolvedValue(detailWith());
  api.validateBusinessDefinitionVersion.mockResolvedValue(validatedVersion);
  api.publishBusinessDefinitionVersion.mockResolvedValue({ ...validatedVersion, lifecycleStatus: 'published' });
});

describe('BusinessDefinitionCenter', () => {
  it('加载业务口径列表', async () => {
    render(<BusinessDefinitionCenter />);

    expect(await screen.findByRole('heading', { name: '业务口径中心' })).toBeInTheDocument();
    expect(await screen.findByText('净营业额')).toBeInTheDocument();
    expect(screen.getAllByText('指标').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('finance')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(api.getBusinessDefinitions).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it('按 50 条分页并在筛选时重置到第一页', async () => {
    api.getBusinessDefinitions.mockImplementation((query) =>
      Promise.resolve({ items: [listItem], total: 51, page: query.page, pageSize: 50 }),
    );
    render(<BusinessDefinitionCenter />);

    await screen.findByText('净营业额');
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(api.getBusinessDefinitions).toHaveBeenLastCalledWith({ page: 2, pageSize: 50 }));

    await userEvent.click(screen.getByRole('button', { name: '上一页' }));
    await waitFor(() => expect(api.getBusinessDefinitions).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 }));

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await userEvent.type(screen.getByPlaceholderText('例如 finance'), 'finance');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() =>
      expect(api.getBusinessDefinitions).toHaveBeenLastCalledWith({ domain: 'finance', page: 1, pageSize: 50 }),
    );
  });

  it('打开定义详情并展示版本历史', async () => {
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(await screen.findByRole('heading', { name: '净营业额' })).toBeInTheDocument();
    expect(api.getBusinessDefinition).toHaveBeenCalledWith('metric', 'metric.net_revenue');
    expect(screen.getByText('版本历史')).toBeInTheDocument();
    expect(screen.getByText('definition-fingerprint-v2')).toBeInTheDocument();
    expect(screen.getAllByText('证据 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('投影 0')).toBeInTheDocument();
  });

  it('完整展示 canonical metric 摘要而不渲染原始 JSON', async () => {
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(await screen.findByText(canonicalMetricPayload.description)).toBeInTheDocument();
    expect(screen.getByText('money')).toBeInTheDocument();
    expect(screen.getByText('sum PaymentRecord.amount')).toBeInTheDocument();
    expect(screen.getByText('PaymentRecord、RefundRecord')).toBeInTheDocument();
    expect(screen.getByText('PaymentRecord.order -> ProductOrder')).toBeInTheDocument();
    expect(
      screen.getByText('PaymentRecord.status in paid, success；ProductOrder.deletedAt eq null'),
    ).toBeInTheDocument();
    expect(screen.getByText('storeId、paymentMethod')).toBeInTheDocument();
    expect(screen.getByText('event_time / paidAt / [start,end) / Asia/Shanghai')).toBeInTheDocument();
    expect(
      screen.getByText('cancelled=exclude；refunded=subtract；gifts=exclude；fallback=manual_review'),
    ).toBeInTheDocument();
    expect(screen.getByText('core:finance:view、core:order:view')).toBeInTheDocument();
    expect(screen.getByText('current_store / PaymentRecord.storeId')).toBeInTheDocument();
    expect(screen.getByText('finance.net_revenue')).toBeInTheDocument();
    expect(screen.getByText('finance.net_revenue.query')).toBeInTheDocument();
    expect(screen.getByText('business_definition')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
    expect(screen.queryByText(/"metricKey"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{"/)).not.toBeInTheDocument();
  });

  it('优先展示 ui_definition_view 生成的统一业务摘要与别名', async () => {
    const projectedVersion = {
      ...draftVersion,
      projections: [
        {
          ...publishedVersion.projections[0],
          definitionVersionId: draftVersion.id,
          targetType: 'ui_definition_view',
          payload: {
            projectionSchemaVersion: '2.0',
            projectionType: 'ui_definition_view',
            preview: true,
            definitionRef: {},
            data: {
              definitionKind: 'metric',
              domain: 'finance',
              name: '净营业额',
              aliases: ['扣退款后收入', '净实收'],
              summary: '净营业额：sum，数据来源 PaymentRecord、RefundRecord',
            },
          },
        },
      ],
    } satisfies BusinessDefinitionVersion;
    api.getBusinessDefinition.mockResolvedValue(detailWith(projectedVersion));

    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(await screen.findByText('净营业额：sum，数据来源 PaymentRecord、RefundRecord')).toBeInTheDocument();
    expect(screen.getByText('扣退款后收入、净实收')).toBeInTheDocument();
  });

  it('展示自动候选的阻塞原因供用户审批判断', async () => {
    const blockedVersion = {
      ...draftVersion,
      lifecycleStatus: 'candidate' as const,
      validationStatus: 'failed' as const,
      validationReport: {
        source: 'scheduled_capability_scanner',
        passed: false,
        blockedReasons: ['conflict:measure.field', 'missing_verified_executable_binding'],
      },
    } satisfies BusinessDefinitionVersion;
    api.getBusinessDefinition.mockResolvedValue(detailWith(blockedVersion));

    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(
      await screen.findByText('自动扫描发现：conflict:measure.field；missing_verified_executable_binding'),
    ).toBeInTheDocument();
  });

  it('count_distinct 指标优先展示去重字段', async () => {
    const countDistinctVersion = {
      ...draftVersion,
      payload: {
        ...canonicalMetricPayload,
        metricKey: 'active_customer_count',
        measure: {
          aggregation: 'count_distinct',
          model: 'PaymentRecord',
          field: 'id',
          distinctField: 'customerId',
        },
      },
    } satisfies BusinessDefinitionVersion;
    api.getBusinessDefinition.mockResolvedValue(detailWith(countDistinctVersion));

    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(await screen.findByText('count_distinct PaymentRecord.customerId')).toBeInTheDocument();
    expect(screen.queryByText('count_distinct PaymentRecord.id')).not.toBeInTheDocument();
  });

  it('展示 relation 与 status_dictionary 的 canonical 摘要', async () => {
    const relationVersion = {
      ...publishedVersion,
      id: 201,
      definitionId: 11,
      payload: {
        fromModel: 'PaymentRecord',
        relationField: 'order',
        toModel: 'ProductOrder',
        relationName: 'PaymentRecordToProductOrder',
        cardinality: 'many-to-one',
      },
    } satisfies BusinessDefinitionVersion;
    const statusDictionaryVersion = {
      ...publishedVersion,
      id: 301,
      definitionId: 12,
      payload: { enumName: 'OrderStatus', values: ['pending', 'paid', 'cancelled'] },
    } satisfies BusinessDefinitionVersion;
    mockList([relationItem, statusDictionaryItem]);
    api.getBusinessDefinition.mockImplementation((_kind, definitionKey) => {
      if (definitionKey === relationItem.definitionKey) {
        return Promise.resolve(definitionDetail(relationItem, [relationVersion], null));
      }
      return Promise.resolve(definitionDetail(statusDictionaryItem, [statusDictionaryVersion], null));
    });
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看支付记录关联订单' }));
    expect(await screen.findByText('PaymentRecord.order -> ProductOrder')).toBeInTheDocument();
    expect(screen.getByText('PaymentRecordToProductOrder')).toBeInTheDocument();
    expect(screen.getByText('many-to-one')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '查看订单状态字典' }));
    expect(await screen.findByText('OrderStatus')).toBeInTheDocument();
    expect(await screen.findByText('pending、paid、cancelled')).toBeInTheDocument();
    expect(screen.queryByText(/"values"/)).not.toBeInTheDocument();
  });

  it('快速切换详情时忽略较晚返回的旧响应', async () => {
    const itemA = definitionItem({ id: 21, definitionKey: 'metric.a', name: '指标 A' });
    const itemB = definitionItem({ id: 22, definitionKey: 'metric.b', name: '指标 B' });
    const requestA = deferred<ReturnType<typeof detailWith>>();
    const requestB = deferred<ReturnType<typeof detailWith>>();
    mockList([itemA, itemB]);
    api.getBusinessDefinition.mockImplementation((_kind, definitionKey) =>
      definitionKey === 'metric.a' ? requestA.promise : requestB.promise,
    );
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看指标 A' }));
    await userEvent.click(screen.getByRole('button', { name: '查看指标 B' }));
    await act(async () => requestB.resolve({ ...detailWith(), ...itemB, currentPublishedVersion: publishedVersion }));

    const detailPanel = screen.getByRole('complementary', { name: '业务口径详情' });
    expect(await within(detailPanel).findByRole('heading', { name: '指标 B' })).toBeInTheDocument();

    await act(async () => requestA.resolve({ ...detailWith(), ...itemA, currentPublishedVersion: publishedVersion }));
    expect(within(detailPanel).getByRole('heading', { name: '指标 B' })).toBeInTheDocument();
  });

  it('筛选时使尚未返回的旧详情失效', async () => {
    const pendingDetail = deferred<ReturnType<typeof detailWith>>();
    api.getBusinessDefinition.mockReturnValue(pendingDetail.promise);
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));
    await userEvent.type(screen.getByPlaceholderText('例如 finance'), 'finance');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));
    await act(async () => pendingDetail.resolve(detailWith()));

    const detailPanel = screen.getByRole('complementary', { name: '业务口径详情' });
    expect(await within(detailPanel).findByText('选择一个业务定义')).toBeInTheDocument();
    expect(within(detailPanel).queryByRole('heading', { name: '净营业额' })).not.toBeInTheDocument();
  });

  it('翻页时使尚未返回的旧详情失效', async () => {
    const pendingDetail = deferred<ReturnType<typeof detailWith>>();
    api.getBusinessDefinitions.mockImplementation((query) =>
      Promise.resolve({ items: [listItem], total: 51, page: query.page, pageSize: 50 }),
    );
    api.getBusinessDefinition.mockReturnValue(pendingDetail.promise);
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await act(async () => pendingDetail.resolve(detailWith()));

    const detailPanel = screen.getByRole('complementary', { name: '业务口径详情' });
    expect(await within(detailPanel).findByText('选择一个业务定义')).toBeInTheDocument();
  });

  it('操作期间切换定义时旧定义刷新不得覆盖新详情', async () => {
    const itemA = definitionItem({ id: 31, definitionKey: 'metric.action_a', name: '操作指标 A' });
    const itemB = definitionItem({ id: 32, definitionKey: 'metric.action_b', name: '操作指标 B' });
    const detailA: BusinessDefinitionDetail = { ...detailWith(), ...itemA, currentPublishedVersion: publishedVersion };
    const detailB: BusinessDefinitionDetail = {
      ...detailWith(publishedVersion),
      ...itemB,
      currentPublishedVersion: publishedVersion,
      versions: [publishedVersion],
    };
    const refreshA = deferred<typeof detailA>();
    let aRequestCount = 0;
    mockList([itemA, itemB]);
    api.getBusinessDefinition.mockImplementation((_kind, definitionKey) => {
      if (definitionKey === itemA.definitionKey) {
        aRequestCount += 1;
        return aRequestCount === 1 ? Promise.resolve(detailA) : refreshA.promise;
      }
      return Promise.resolve(detailB);
    });
    render(<BusinessDefinitionCenter />);

    await userEvent.click(await screen.findByRole('button', { name: '查看操作指标 A' }));
    await userEvent.click(
      within(await screen.findByTestId('business-definition-version-102')).getByRole('button', { name: '验证 v2' }),
    );
    await waitFor(() => expect(aRequestCount).toBe(2));
    await userEvent.click(screen.getByRole('button', { name: '查看操作指标 B' }));

    const detailPanel = screen.getByRole('complementary', { name: '业务口径详情' });
    expect(await within(detailPanel).findByRole('heading', { name: '操作指标 B' })).toBeInTheDocument();
    await act(async () => refreshA.resolve(detailA));
    expect(within(detailPanel).getByRole('heading', { name: '操作指标 B' })).toBeInTheDocument();
  });

  it('点击验证 draft 版本', async () => {
    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    const versionRow = await screen.findByTestId('business-definition-version-102');
    await userEvent.click(within(versionRow).getByRole('button', { name: '验证 v2' }));

    await waitFor(() => expect(api.validateBusinessDefinitionVersion).toHaveBeenCalledWith(102, {}));
  });

  it('发布 validated 版本时携带当前已发布版本 id', async () => {
    api.getBusinessDefinition.mockResolvedValue(detailWith(validatedVersion));
    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    const versionRow = await screen.findByTestId('business-definition-version-102');
    await userEvent.click(within(versionRow).getByRole('button', { name: '发布 v2' }));

    await waitFor(() => {
      expect(api.publishBusinessDefinitionVersion).toHaveBeenCalledWith(102, {
        expectedCurrentVersionId: 101,
      });
    });
  });

  it('写操作成功但刷新失败时提示操作已成功', async () => {
    api.getBusinessDefinition.mockResolvedValueOnce(detailWith()).mockRejectedValueOnce(new Error('refresh failed'));
    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    await userEvent.click(
      within(await screen.findByTestId('business-definition-version-102')).getByRole('button', { name: '验证 v2' }),
    );

    await waitFor(() => expect(notifications.error).toHaveBeenCalledWith('操作已成功，但页面刷新失败'));
    expect(notifications.error).not.toHaveBeenCalledWith(expect.stringContaining('验证失败'));
  });

  it('操作期间筛选时不会用旧查询覆盖新列表', async () => {
    const validation = deferred<typeof validatedVersion>();
    api.validateBusinessDefinitionVersion.mockReturnValue(validation.promise);
    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    await userEvent.click(
      within(await screen.findByTestId('business-definition-version-102')).getByRole('button', { name: '验证 v2' }),
    );
    await userEvent.type(screen.getByPlaceholderText('例如 finance'), 'finance');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() =>
      expect(api.getBusinessDefinitions).toHaveBeenLastCalledWith({ domain: 'finance', page: 1, pageSize: 50 }),
    );
    const listCallCount = api.getBusinessDefinitions.mock.calls.length;

    await act(async () => validation.resolve(validatedVersion));

    await waitFor(() => expect(notifications.success).toHaveBeenCalledWith('v2 验证完成'));
    expect(api.getBusinessDefinitions).toHaveBeenCalledTimes(listCallCount);
    expect(api.getBusinessDefinitions).toHaveBeenLastCalledWith({ domain: 'finance', page: 1, pageSize: 50 });
  });

  it('暴露当前选中定义和动作忙碌状态', async () => {
    const validation = deferred<typeof validatedVersion>();
    api.validateBusinessDefinitionVersion.mockReturnValue(validation.promise);
    render(<BusinessDefinitionCenter />);

    const openButton = await screen.findByRole('button', { name: '查看净营业额' });
    await userEvent.click(openButton);
    expect(openButton).toHaveAttribute('aria-current', 'true');

    const validateButton = within(await screen.findByTestId('business-definition-version-102')).getByRole('button', {
      name: '验证 v2',
    });
    await userEvent.click(validateButton);
    expect(validateButton).toHaveAttribute('aria-busy', 'true');
    await act(async () => validation.resolve(validatedVersion));
  });

  it('没有系统权限时不显示验证和发布按钮', async () => {
    useAuthStore.setState({
      user: {
        id: 2,
        username: 'viewer',
        name: '只读用户',
        roles: ['viewer'],
        permissions: ['core:system:view'],
        deniedPermissions: [],
        storeIds: [1],
        phone: '',
      },
    });
    const publishableVersion = { ...validatedVersion, id: 103, version: 3 };
    api.getBusinessDefinition.mockResolvedValue({
      ...detailWith(),
      versions: [draftVersion, publishableVersion, publishedVersion],
    });
    render(<BusinessDefinitionCenter />);
    await userEvent.click(await screen.findByRole('button', { name: '查看净营业额' }));

    expect(await screen.findByText('版本历史')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '验证 v2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布 v3' })).not.toBeInTheDocument();
  });

  it('列表为空时展示空状态', async () => {
    mockList([]);
    render(<BusinessDefinitionCenter />);

    expect(await screen.findByText('暂无业务口径')).toBeInTheDocument();
    expect(screen.getByText('当前筛选条件下没有可治理的定义。')).toBeInTheDocument();
  });

  it('错误状态使用 alert，其他动态状态使用 status 和 aria-live', async () => {
    const listRequest = deferred<{ items: never[]; total: number; page: number; pageSize: number }>();
    api.getBusinessDefinitions.mockReturnValue(listRequest.promise);
    const view = render(<BusinessDefinitionCenter />);

    const loadingStatus = screen.getAllByRole('status')[0];
    expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    await act(async () => listRequest.resolve({ items: [], total: 0, page: 1, pageSize: 50 }));
    const settledStatuses = await screen.findAllByRole('status');
    settledStatuses.forEach((message) => expect(message).toHaveAttribute('aria-live', 'polite'));

    view.unmount();
    api.getBusinessDefinitions.mockRejectedValue(new Error('list failed'));
    render(<BusinessDefinitionCenter />);
    expect(await screen.findByRole('alert')).toHaveTextContent('业务口径加载失败');
  });
});
