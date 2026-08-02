import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainSemanticGovernance } from './BrainSemanticGovernance';

const api = vi.hoisted(() => ({
  getBrainSemanticGraph: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainSemanticGovernanceHistory: vi.fn(),
  listBrainSemanticGovernanceSummaries: vi.fn(),
  setBrainPublishedSemanticEnabled: vi.fn(),
}));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

const metric = {
  id: 33,
  resourceType: 'metric' as const,
  resourceKey: 'paid_amount',
  name: '实收金额',
  domain: 'finance',
  version: 3,
  status: 'active',
  semanticDescription: '支付成功后的实际收款金额。',
  dataTables: ['Order', 'PaymentRecord'],
  fuzzyTerms: ['实收', '到账金额'],
  hitCount: 3,
  sampleCount: 12,
  hitRate: 0.25,
  updatedAt: '2026-07-21T10:00:00.000Z',
  managed: true,
  enabled: true,
  definitionId: 41,
  definitionKey: 'paid_amount',
  definitionVersionId: 51,
  historyCount: 3,
  fingerprint: null,
  sourceFingerprint: null,
  actionDetails: null,
};

const action = {
  id: -101,
  resourceType: 'action' as const,
  resourceKey: 'action.create_purchase_order',
  name: '创建采购单',
  domain: 'inventory_procurement',
  version: 1,
  status: 'local_candidate',
  semanticDescription: '为当前门店创建待确认采购单。',
  dataTables: [],
  fuzzyTerms: ['采购下单', '下采购单'],
  hitCount: 0,
  sampleCount: 12,
  hitRate: null,
  updatedAt: null,
  managed: false,
  enabled: false,
  definitionId: null,
  definitionKey: 'action.create_purchase_order',
  definitionVersionId: null,
  historyCount: 1,
  fingerprint: null,
  sourceFingerprint: null,
  actionDetails: {
    origin: 'local_candidate' as const,
    domain: 'inventory_procurement',
    actionClass: 'create',
    targetEntityRefs: ['entity.product', 'entity.purchase_order'],
    inputSlots: [
      {
        slotKey: 'product',
        label: '采购商品',
        semanticRole: 'object',
        requiredAt: ['recognition', 'preview', 'execution'],
      },
    ],
    preconditions: ['product_belongs_to_context_store'],
    effects: ['purchase_order_created_in_context_store_with_governed_submission_state'],
    capabilityBindings: [
      { capabilityKey: 'purchase_order_draft', gatewayActionKey: 'create_purchase_order', enabled: true },
    ],
    contrasts: [
      {
        conceptKey: 'action.receive_purchase_order',
        name: '采购收货入库',
        discriminators: [{ dimension: 'effect', currentActionValue: '创建采购单', contrastActionValue: '增加库存' }],
      },
    ],
    profiles: [
      {
        key: 'lexical_frame',
        label: '词义/竞争动作',
        status: 'available' as const,
        schemaVersion: '1.0',
        fingerprint: 'a'.repeat(64),
      },
      {
        key: 'side_effect_invariant',
        label: '副作用/不变量',
        status: 'available' as const,
        schemaVersion: '1.1',
        fingerprint: 'b'.repeat(64),
      },
    ],
    profileGaps: [],
    riskPolicy: 'high',
    confirmationPolicy: 'required',
    idempotencyPolicy: 'required',
  },
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/brain-governance']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <BrainSemanticGovernance />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BrainSemanticGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainSemanticGovernanceSummaries.mockImplementation((resource: string) =>
      Promise.resolve({ items: resource === 'actions' ? [action] : [metric] }),
    );
    api.listBrainSemanticGovernanceHistory.mockImplementation((resource: string) =>
      Promise.resolve({
        items:
          resource === 'actions'
            ? [action]
            : [
                {
                  id: metric.id,
                  resourceType: metric.resourceType,
                  resourceKey: metric.resourceKey,
                  name: metric.name,
                  domain: metric.domain,
                  version: metric.version,
                  status: metric.status,
                  semanticDescription: metric.semanticDescription,
                  dataTables: metric.dataTables,
                  fuzzyTerms: metric.fuzzyTerms,
                  updatedAt: metric.updatedAt,
                  managed: true,
                  enabled: true,
                  definitionId: metric.definitionId,
                  definitionKey: metric.definitionKey,
                  definitionVersionId: metric.definitionVersionId,
                  fingerprint: null,
                  sourceFingerprint: null,
                  actionDetails: null,
                },
              ],
      }),
    );
    api.setBrainPublishedSemanticEnabled.mockResolvedValue({ enabled: false });
    api.getBrainSemanticGraph.mockResolvedValue({
      nodes: [
        {
          id: 'entity.customer',
          key: 'entity.customer',
          label: '客户',
          kind: 'entity',
          status: 'active',
          version: 1,
          description: '客户实体',
          dataTables: ['Customer'],
          fuzzyTerms: ['会员'],
          actionDetails: null,
        },
        {
          id: 'relation.order.customer',
          key: 'relation.order.customer',
          label: '订单客户',
          kind: 'relation',
          status: 'active',
          version: 1,
          description: '',
          dataTables: ['ProductOrder', 'Customer'],
          fuzzyTerms: [],
          actionDetails: null,
        },
        {
          id: 'metric.paid_amount',
          key: 'metric.paid_amount',
          label: '实收金额',
          kind: 'metric',
          status: 'active',
          version: 2,
          description: '支付实收',
          dataTables: ['ProductOrder'],
          fuzzyTerms: ['实收'],
          actionDetails: null,
        },
        {
          id: action.resourceKey,
          key: action.resourceKey,
          label: action.name,
          kind: 'action',
          status: action.status,
          version: action.version,
          description: action.semanticDescription,
          dataTables: action.dataTables,
          fuzzyTerms: action.fuzzyTerms,
          actionDetails: action.actionDetails,
        },
        {
          id: 'predicate:product_belongs_to_context_store',
          key: 'product_belongs_to_context_store',
          label: 'product_belongs_to_context_store',
          kind: 'predicate',
          status: 'governed_reference',
          version: null,
          description: '商品必须属于当前门店。',
          dataTables: [],
          fuzzyTerms: [],
          actionDetails: null,
        },
        {
          id: 'effect:purchase_order_created_in_context_store_with_governed_submission_state',
          key: 'purchase_order_created_in_context_store_with_governed_submission_state',
          label: '采购单已创建',
          kind: 'effect',
          status: 'governed_reference',
          version: null,
          description: '采购单创建效果。',
          dataTables: [],
          fuzzyTerms: [],
          actionDetails: null,
        },
        {
          id: 'role:object',
          key: 'object',
          label: 'object',
          kind: 'role',
          status: 'governed_reference',
          version: null,
          description: '动作对象角色。',
          dataTables: [],
          fuzzyTerms: [],
          actionDetails: null,
        },
        {
          id: 'table:Customer',
          key: 'Customer',
          label: 'Customer',
          kind: 'table',
          status: 'active',
          version: null,
          description: '数据表',
          dataTables: ['Customer'],
          fuzzyTerms: [],
          actionDetails: null,
        },
      ],
      edges: [
        {
          id: 'relation_to',
          source: 'relation.order.customer',
          target: 'entity.customer',
          kind: 'relation_to',
          label: '指向',
        },
        {
          id: 'requires_predicate',
          source: action.resourceKey,
          target: 'predicate:product_belongs_to_context_store',
          kind: 'requires_predicate',
          label: '前置条件',
        },
        {
          id: 'asserts_effect',
          source: action.resourceKey,
          target: 'effect:purchase_order_created_in_context_store_with_governed_submission_state',
          kind: 'asserts_effect',
          label: '声明效果',
        },
        {
          id: 'uses_role',
          source: action.resourceKey,
          target: 'role:object',
          kind: 'uses_role',
          label: '使用角色',
        },
        { id: 'backed_by', source: 'entity.customer', target: 'table:Customer', kind: 'backed_by', label: '数据表' },
      ],
      summary: {
        entities: 1,
        relations: 1,
        metrics: 1,
        actions: 1,
        predicates: 1,
        effects: 1,
        events: 0,
        roles: 1,
        tables: 1,
        edges: 5,
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows semantic governance columns and readable metadata instead of a JSON snapshot', async () => {
    renderPage();

    expect(await screen.findByText('实收金额')).toBeInTheDocument();
    for (const column of [
      'ID',
      '名称',
      '所属业务领域',
      '版本',
      '语义说明',
      '关联数据表',
      '模糊词条',
      '命中率',
      '更新时间',
      '操作',
    ]) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByText('财务经营')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
    expect(screen.getByText('支付成功后的实际收款金额。')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
    expect(screen.getByText('PaymentRecord')).toBeInTheDocument();
    expect(screen.getByText('实收')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('3/12 次问答')).toBeInTheDocument();
  });

  it('opens historical versions for the selected semantic resource', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '历史版本 (3)' }));

    expect(await screen.findByRole('dialog', { name: '实收金额 · 历史版本' })).toBeInTheDocument();
    expect(api.listBrainSemanticGovernanceHistory).toHaveBeenCalledWith('metrics', 'paid_amount', { take: 100 });
  });

  it('opens Ami Brain with a prefilled semantic debug question', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '调试' }));

    await waitFor(() => expect(screen.getByLabelText('current-location')).toHaveTextContent('/brain?'));
    expect(screen.getByLabelText('current-location')).toHaveTextContent('debugSemantic=metrics%3Apaid_amount');
  });

  it('requires confirmation before disabling the published business definition', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '停用' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(api.setBrainPublishedSemanticEnabled).toHaveBeenCalledWith('metrics', 'paid_amount', false),
    );
  });

  it('shows no sample instead of inventing a hit rate', async () => {
    api.listBrainSemanticGovernanceSummaries.mockResolvedValue({
      items: [{ ...metric, hitCount: 0, sampleCount: 0, hitRate: null }],
    });
    renderPage();

    expect(await screen.findByText('暂无样本')).toBeInTheDocument();
  });

  it('shows local Action Ontology candidates, competition differences and Profile completeness without marking them released', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '动作版本' }));

    expect(await screen.findByText('创建采购单')).toBeInTheDocument();
    expect(api.listBrainSemanticGovernanceSummaries).toHaveBeenLastCalledWith('actions', { take: 200 });
    expect(screen.getAllByText('本地候选').length).toBeGreaterThan(0);
    expect(screen.getByText('entity.product、entity.purchase_order')).toBeInTheDocument();
    expect(screen.getByText('purchase_order_draft')).toBeInTheDocument();
    expect(screen.getByText('采购收货入库')).toBeInTheDocument();
    expect(screen.getByText('词义/竞争动作 1.0')).toBeInTheDocument();
    expect(screen.getByText('副作用/不变量 1.1')).toBeInTheDocument();
    expect(screen.getByText('结构 Profile 齐全；发布身份仍由 Release Contract 校验')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '未纳管' })).toBeDisabled();
  });

  it('renders the institutional-effect Profile supplied by governance for applicable actions', async () => {
    const user = userEvent.setup();
    api.listBrainSemanticGovernanceSummaries.mockImplementation((resource: string) =>
      Promise.resolve({
        items:
          resource === 'actions'
            ? [
                {
                  ...action,
                  resourceKey: 'action.cancel_reservation',
                  name: '取消预约',
                  actionDetails: {
                    ...action.actionDetails,
                    profiles: [
                      ...action.actionDetails.profiles,
                      {
                        key: 'institutional_effect',
                        label: '制度性效力',
                        status: 'available' as const,
                        schemaVersion: '1.0',
                        fingerprint: 'c'.repeat(64),
                      },
                    ],
                  },
                },
              ]
            : [metric],
      }),
    );
    renderPage();

    await user.click(screen.getByRole('button', { name: '动作版本' }));

    expect(await screen.findByText('制度性效力 1.0')).toBeInTheDocument();
  });

  it('distinguishes invalid Action Profiles from missing Profiles', async () => {
    const user = userEvent.setup();
    api.listBrainSemanticGovernanceSummaries.mockImplementation((resource: string) =>
      Promise.resolve({
        items:
          resource === 'actions'
            ? [
                {
                  ...action,
                  actionDetails: {
                    ...action.actionDetails,
                    profiles: [
                      {
                        key: 'lexical_frame',
                        label: '词义/竞争动作',
                        status: 'invalid' as const,
                        schemaVersion: '1.0',
                        fingerprint: 'a'.repeat(64),
                      },
                      {
                        key: 'side_effect_invariant',
                        label: '副作用/不变量',
                        status: 'missing' as const,
                        schemaVersion: null,
                        fingerprint: null,
                      },
                    ],
                    profileGaps: ['lexical_frame', 'side_effect_invariant'],
                  },
                },
              ]
            : [metric],
      }),
    );
    renderPage();

    await user.click(screen.getByRole('button', { name: '动作版本' }));

    expect(await screen.findByText('词义/竞争动作 1.0 异常')).toBeInTheDocument();
    expect(screen.getByText('异常 lexical_frame；缺失 side_effect_invariant')).toBeInTheDocument();
  });

  it('opens the semantic graph tab and supports node detail and debug navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '语义图谱' }));
    expect(await screen.findByRole('img', { name: 'Ami Brain 语义图谱' })).toBeInTheDocument();
    expect(api.getBrainSemanticGraph).toHaveBeenCalledTimes(1);
    expect(screen.getByText('连接')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '动作：创建采购单' }));
    expect(screen.getByText('action.create_purchase_order')).toBeInTheDocument();
    expect(screen.getByText('purchase_order_draft → create_purchase_order')).toBeInTheDocument();
    expect(screen.getByText('采购收货入库 (action.receive_purchase_order)')).toBeInTheDocument();
    expect(screen.getByText('Profile 结构齐全')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '实体：客户' }));
    expect(screen.getByText('entity.customer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '调试此节点' }));

    await waitFor(() =>
      expect(screen.getByLabelText('current-location')).toHaveTextContent('debugSemanticGraph=entity.customer'),
    );
  });
});
