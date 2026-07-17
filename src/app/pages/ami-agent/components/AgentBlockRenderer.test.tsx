import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentPhaseOutput, AuraResponseBlock } from '@/types/agent';
import { AgentBlockRenderer, AgentPhaseOutputRenderer } from './AgentBlockRenderer';

describe('AgentBlockRenderer', () => {
  it('renders order customer consumption list blocks as table, evidence, and follow-up chips', () => {
    const onCommand = vi.fn();
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'text',
        content: '昨天共有 2 位有效消费客户，优先关注高价值客户复购承接。',
      },
      {
        kind: 'kpi_card',
        label: '消费客户',
        value: '2',
        unit: '人',
        hint: '按有效支付订单去重统计',
      },
      {
        kind: 'table',
        columns: ['客户', '手机号', '消费金额', '订单数', '最近消费', '消费摘要'],
        rows: [
          ['马美琳', '188****1234', '¥1,280', '2', '2026-06-26 15:20', '深层补水护理、修护精华'],
          ['李晓雯', '139****5678', '¥680', '1', '2026-06-26 11:05', '肩颈护理'],
        ],
        caption: '仅统计当前门店已支付或已完成订单，排除取消和退款完成订单。',
      },
      {
        kind: 'evidence_panel',
        sources: ['ProductOrder', 'OrderItem', 'Customer'],
        dateRange: 'yesterday',
        metricDefinition: '有效消费客户 = 指定时间范围内存在已支付或已完成订单的客户去重。',
        limitations: ['不包含已取消订单。'],
      },
      {
        kind: 'follow_up_chips',
        suggestions: ['查看复购建议', '导出客户清单', '生成回访话术'],
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} onCommand={onCommand} />);

    expect(screen.getByText('昨天共有 2 位有效消费客户，优先关注高价值客户复购承接。')).toBeInTheDocument();
    expect(screen.getByText('消费客户')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '客户' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '马美琳' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '¥1,280' })).toBeInTheDocument();
    expect(screen.getByText('仅统计当前门店已支付或已完成订单，排除取消和退款完成订单。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /数据来源 · 订单、订单明细、客户/ }));
    expect(screen.getByText('统计区间：yesterday')).toBeInTheDocument();
    expect(screen.getByText('口径：有效消费客户 = 指定时间范围内存在已支付或已完成订单的客户去重。')).toBeInTheDocument();
    expect(screen.getByText('注意：不包含已取消订单。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看复购建议' }));
    expect(onCommand).toHaveBeenCalledWith('查看复购建议');
  });

  it('supports sortable and empty table states', () => {
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'table',
        columns: ['客户', '消费金额'],
        rows: [
          ['李若溪', '¥680'],
          ['马美琳', '¥1,280'],
        ],
        sortable: true,
      },
      {
        kind: 'table',
        columns: ['客户', '消费金额'],
        rows: [],
        caption: '没有命中当前筛选条件。',
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} />);

    const tables = screen.getAllByRole('table');
    expect(within(tables[0]).getByRole('cell', { name: '李若溪' })).toBeInTheDocument();

    fireEvent.click(within(tables[0]).getByRole('button', { name: '按消费金额排序' }));
    let amountCells = within(tables[0]).getAllByRole('cell').filter((cell) => cell.textContent?.startsWith('¥'));
    expect(amountCells.map((cell) => cell.textContent)).toEqual(['¥680', '¥1,280']);

    fireEvent.click(within(tables[0]).getByRole('button', { name: '按消费金额排序' }));
    amountCells = within(tables[0]).getAllByRole('cell').filter((cell) => cell.textContent?.startsWith('¥'));
    expect(amountCells.map((cell) => cell.textContent)).toEqual(['¥1,280', '¥680']);

    expect(within(tables[1]).getByText('暂无数据')).toBeInTheDocument();
    expect(screen.getByText('没有命中当前筛选条件。')).toBeInTheDocument();
  });

  it('infers Chinese table headers when source columns are array indexes', () => {
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'table',
        columns: ['0', '1', '2', '3'],
        rows: [['沉睡客户（45-90天未到店）', '585人', '高', '发召回优惠券']],
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '客户分群' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '人数' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '优先级' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '建议动作' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: '0' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: '字段 1' })).not.toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '沉睡客户（45-90天未到店）' })).toBeInTheDocument();
  });

  it('renders known business field keys as Chinese table headers', () => {
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'table',
        columns: ['beauticianId', 'beauticianName', 'levelName', 'status', 'performanceScore', 'performanceLevel'],
        rows: [['43', '宋乔', '明星顾问', 'active', '413', '表现突出']],
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '员工ID' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '员工姓名' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '等级' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '状态' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '表现分' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '表现等级' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'beauticianName' })).not.toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '宋乔' })).toBeInTheDocument();
  });

  it('renders order revenue field keys and payment values in Chinese', () => {
    render(
      <AgentBlockRenderer
        blocks={[
          {
            kind: 'table',
            columns: ['payMethod', 'revenue', 'paidAmount', 'refundAmount', 'netAmount', 'orderCount'],
            rows: [['wechat', '84265.67', '84265.67', '0', '84265.67', '101']],
          },
          {
            kind: 'evidence_panel',
            sources: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
            metricDefinition: '按支付方式统计订单实收、退款和净额。',
          },
        ]}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '支付方式' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '实收金额' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '退款金额' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '微信' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'payMethod' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /数据来源 · 订单、收款记录、退款记录/ })).toBeInTheDocument();
  });

  it('renders entity badge and marketing link card', () => {
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'entity_resolution_badge',
        objectType: '营销活动',
        entityName: '老朋友回店礼',
        confidence: 0.92,
        sourceModel: 'MarketingActivity',
      },
      {
        kind: 'link_card',
        title: '老朋友回店礼',
        description: '推广页：老朋友回店礼 H5',
        primaryUrl: 'https://example.com/old-friend',
        miniappPath: '/pages/marketing/old-friend',
        qrCodeUrl: 'https://example.com/old-friend.png',
        statusLabel: '已发布',
        links: [
          { label: '活动链接', value: 'https://example.com/old-friend', type: 'url' },
          { label: '小程序路径', value: '/pages/marketing/old-friend', type: 'miniapp_path' },
          { label: '二维码', value: 'https://example.com/old-friend.png', type: 'qr_code' },
        ],
      },
      {
        kind: 'capability_trace',
        capabilityId: 'marketing.activity.link.lookup',
        queryTemplateId: 'marketing_activity_link_lookup',
        action: 'get_link',
        executionPath: 'business_query',
        schemaPath: ['MarketingActivity', 'MarketingPage'],
        confidence: 0.92,
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} />);

    expect(screen.getByText('已识别业务对象')).toBeInTheDocument();
    expect(screen.getByText('营销活动 · 老朋友回店礼')).toBeInTheDocument();
    expect(screen.getAllByText('92%')).toHaveLength(2);
    expect(screen.getByText('营销活动链接')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/old-friend')).toBeInTheDocument();
    expect(screen.getByText('/pages/marketing/old-friend')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/old-friend.png')).toBeInTheDocument();
    expect(screen.getByText('能力命中调试')).toBeInTheDocument();
    expect(screen.getByText('marketing.activity.link.lookup')).toBeInTheDocument();
    expect(screen.getByText('MarketingActivity → MarketingPage')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders action cards and unsupported block fallback', () => {
    const onAction = vi.fn();
    const blocks = [
      {
        kind: 'action_card',
        title: '发送前确认',
        preview: '将给 7 位客户生成复购跟进草稿。',
        actionId: 'customer.followup.task.draft',
        riskLevel: 'medium',
      },
      {
        kind: 'unknown_demo',
        payload: 'future block',
      },
    ] as unknown as AuraResponseBlock[];

    render(<AgentBlockRenderer blocks={blocks} onAction={onAction} />);

    expect(screen.getByText('发送前确认')).toBeInTheDocument();
    expect(screen.getByText('将给 7 位客户生成复购跟进草稿。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onAction).toHaveBeenCalledWith('customer.followup.task.draft');
    expect(screen.getByText('暂不支持的内容类型：unknown_demo')).toBeInTheDocument();
  });

  it('renders clarification cards and continues with the selected option', () => {
    const onCommand = vi.fn();
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'clarification_card',
        title: '需要确认对象',
        question: '你是指哪个回店礼活动？',
        options: [
          { label: '老朋友回店护理礼', value: '查询老朋友回店护理礼活动链接', description: '已发布推广页' },
          { label: '老朋友回店礼', value: '查询老朋友回店礼活动链接', description: '草稿活动' },
        ],
        allowFreeText: true,
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} onCommand={onCommand} />);

    expect(screen.getByText('需要确认对象')).toBeInTheDocument();
    expect(screen.getByText('你是指哪个回店礼活动？')).toBeInTheDocument();
    expect(screen.getByText('已发布推广页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /老朋友回店护理礼/ }));
    expect(onCommand).toHaveBeenCalledWith('查询老朋友回店护理礼活动链接');
  });

  it('orders response blocks with evidence before actions and follow-up chips last', () => {
    const blocks: AuraResponseBlock[] = [
      {
        kind: 'confirm_action',
        title: '确认发送',
        preview: '将生成 3 位客户的回访任务。',
        actionId: 'approve:1',
        riskLevel: 'medium',
      },
      {
        kind: 'evidence_panel',
        sources: ['Customer', 'ProductOrder'],
        metricDefinition: '按有效订单和最近服务记录统计。',
      },
      {
        kind: 'table',
        columns: ['客户', '建议'],
        rows: [['马美琳', '做复购承接']],
      },
      {
        kind: 'text',
        content: '昨天有消费客户，优先看高价值会员。',
      },
      {
        kind: 'follow_up_chips',
        suggestions: ['生成话术'],
      },
    ];

    render(<AgentBlockRenderer blocks={blocks} />);

    const text = screen.getByText('昨天有消费客户，优先看高价值会员。');
    const table = screen.getByRole('table');
    const evidence = screen.getByRole('button', { name: /数据来源 · 客户、订单/ });
    const action = screen.getByText('确认发送');
    const followUp = screen.getByRole('button', { name: '生成话术' });
    expect(text.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action.compareDocumentPosition(followUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders deep-path phase outputs for staged diagnosis', () => {
    const phases: AgentPhaseOutput[] = [
      {
        phase: 'core_conclusion',
        title: '核心结论',
        summary: '本月利润下降主要来自退款增加和低毛利项目占比提升。',
        blockKinds: ['text', 'table', 'evidence_panel'],
      },
      {
        phase: 'recommendations',
        title: '建议动作',
        summary: '先核查退款明细，再调整低毛利项目套餐。',
        actionLabels: ['查看退款明细', '生成整改清单'],
      },
    ];

    render(<AgentPhaseOutputRenderer phases={phases} />);

    expect(screen.getByText('分阶段分析')).toBeInTheDocument();
    expect(screen.getByText('1. 核心结论')).toBeInTheDocument();
    expect(screen.getByText('本月利润下降主要来自退款增加和低毛利项目占比提升。')).toBeInTheDocument();
    expect(screen.getByText('查看退款明细')).toBeInTheDocument();
    expect(screen.getByText('生成整改清单')).toBeInTheDocument();
  });
});
