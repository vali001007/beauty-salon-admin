// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockRenderer } from './BlockRenderer';

describe('BlockRenderer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders summary_text blocks as business conclusions', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'summary_text',
              title: '核心结论',
              content: '近期有 3 个临期库存产品，建议优先处理最近 15 天到期批次。',
            },
          ]}
        />,
      );
    });

    expect(container.textContent).toContain('核心结论');
    expect(container.textContent).toContain('近期有 3 个临期库存产品');
  });

  it('orders unordered blocks with evidence before actions and follow-up chips last', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'follow_up_chips',
              suggestions: ['生成复购话术'],
            },
            {
              kind: 'action_card',
              title: '生成承接任务',
              preview: '为 2 位客户生成复购承接任务。',
              actionId: 'followup',
              riskLevel: 'medium',
            },
            {
              kind: 'evidence_panel',
              sources: ['ProductOrder', 'Customer'],
              metricDefinition: '消费客户清单按有效订单聚合。',
            },
            {
              kind: 'table',
              columns: ['客户', '建议'],
              rows: [['马美琳', '复购承接']],
            },
            {
              kind: 'summary_text',
              content: '昨天共有 2 位消费客户。',
            },
          ]}
        />,
      );
    });

    const summary = Array.from(container.querySelectorAll('*')).find((node) => node.textContent === '昨天共有 2 位消费客户。');
    const table = container.querySelector('table');
    const evidence = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('数据来源'));
    const action = Array.from(container.querySelectorAll('*')).find((node) => node.textContent === '生成承接任务');
    const followUp = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '生成复购话术');

    expect(summary && table && evidence && action && followUp).toBeTruthy();
    expect(summary!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table!.compareDocumentPosition(evidence!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence!.compareDocumentPosition(action!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action!.compareDocumentPosition(followUp!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('infers Chinese table headers when source columns are array indexes', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['0', '1', '2', '3'],
              rows: [['沉睡客户（45-90天未到店）', '585人', '高', '发召回优惠券']],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['客户分群', '人数', '优先级', '建议动作']);
    expect(headers).not.toContain('0');
    expect(headers).not.toContain('字段 1');
    expect(container.textContent).toContain('沉睡客户（45-90天未到店）');
  });

  it('renders known business field keys as Chinese table headers', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['beauticianId', 'beauticianName', 'levelName', 'status', 'performanceScore', 'performanceLevel'],
              rows: [['43', '宋乔', '明星顾问', 'active', '413', '表现突出']],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['员工ID', '员工姓名', '等级', '状态', '表现分', '表现等级']);
    expect(container.textContent).not.toContain('beauticianName');
    expect(container.textContent).toContain('宋乔');
  });

  it('renders order revenue field keys and payment values in Chinese', () => {
    act(() => {
      root.render(
        <BlockRenderer
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
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['支付方式', '实收金额', '消费金额', '退款金额', '净额', '订单数']);
    expect(container.textContent).toContain('微信');
    expect(container.textContent).not.toContain('payMethod');
    expect(container.textContent).not.toContain('wechat');
    expect(container.textContent).toContain('数据来源 · 订单、收款记录、退款记录');
  });

  it('renders V3 snake_case SQL result columns in Chinese and formats decimals globally', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['product_id', 'product_name', 'SKU', 'quantity_sold', 'net_sales_amount'],
              rows: [[
                '86',
                '抗衰紧致眼霜',
                'AMI-DEMO-FULL-SKU-005',
                '14.000000000000000000000000000000',
                '6758.340000000000000000000000000000',
              ]],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['商品ID', '商品', 'SKU', '销量', '净销售额']);
    expect(container.textContent).toContain('14.00');
    expect(container.textContent).toContain('6,758.34');
    expect(container.textContent).not.toContain('quantity_sold');
    expect(container.textContent).not.toContain('6758.340000000000000000000000000000');
  });

  it('renders V3 order time columns and date values in Chinese', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['order_created_at', 'gross_amount', 'discount_amount', 'net_amount'],
              rows: [[
                'Tue Jul 07 2026 08:19:42 GMT+0800 (中国标准时间)',
                '2000.000000000000000000000000000000',
                '0',
                '2000.000000000000000000000000000000',
              ]],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['订单时间', '销售原额', '优惠金额', '净额']);
    expect(container.textContent).toContain('2026年07月07日 08:19');
    expect(container.textContent).toContain('2,000.00');
    expect(container.textContent).not.toContain('order_created_at');
    expect(container.textContent).not.toContain('Tue Jul');
  });

  it('renders entity badge and marketing link card without falling back to a table', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
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
          ]}
        />,
      );
    });

    expect(container.textContent).toContain('已识别业务对象');
    expect(container.textContent).toContain('营销活动 · 老朋友回店礼');
    expect(container.textContent).toContain('92%');
    expect(container.textContent).toContain('营销活动链接');
    expect(container.textContent).toContain('https://example.com/old-friend');
    expect(container.textContent).toContain('/pages/marketing/old-friend');
    expect(container.textContent).toContain('二维码');
    expect(container.textContent).toContain('能力命中调试');
    expect(container.textContent).toContain('marketing.activity.link.lookup');
    expect(container.textContent).toContain('MarketingActivity → MarketingPage');
    expect(container.querySelector('table')).toBeNull();
  });

  it('renders clarification cards and sends the selected option back as text', () => {
    const selected: string[] = [];

    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
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
          ]}
          onCommand={(command) => selected.push(command)}
        />,
      );
    });

    expect(container.textContent).toContain('需要确认对象');
    expect(container.textContent).toContain('你是指哪个回店礼活动？');
    expect(container.textContent).toContain('已发布推广页');
    const option = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('老朋友回店护理礼'));
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual(['查询老朋友回店护理礼活动链接']);
  });
});
