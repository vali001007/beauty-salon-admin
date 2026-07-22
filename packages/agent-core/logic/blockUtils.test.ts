import { describe, expect, it } from 'vitest';
import { groupBlocksForDisplay, mapBrainResponseBlocks, orderBlocksForDisplay } from './blockUtils';
import type { AuraResponseBlock } from '../types/blocks';

describe('blockUtils', () => {
  const blocks: AuraResponseBlock[] = [
    { kind: 'follow_up_chips', suggestions: ['继续追问'] },
    { kind: 'confirm_action', title: '确认', preview: '确认执行', actionId: 'a1', riskLevel: 'medium' },
    { kind: 'table', columns: ['客户'], rows: [['马美琳']] },
    { kind: 'link_card', title: '老朋友回店礼', primaryUrl: 'https://example.com/old-friend' },
    {
      kind: 'clarification_card',
      title: '需要确认对象',
      question: '你是指哪个活动？',
      options: [{ label: '老朋友回店礼', value: '查询老朋友回店礼' }],
    },
    { kind: 'entity_resolution_badge', objectType: '营销活动', entityName: '老朋友回店礼', confidence: 0.92 },
    { kind: 'kpi_card', label: '消费客户', value: '2' },
    { kind: 'evidence_panel', sources: ['ProductOrder'], metricDefinition: '有效订单' },
    { kind: 'summary_text', content: '核心结论' },
    { kind: 'kpi_card', label: '消费金额', value: '¥1,980' },
  ];

  it('orders blocks consistently for all clients', () => {
    expect(orderBlocksForDisplay(blocks).map((block) => block.kind)).toEqual([
      'summary_text',
      'entity_resolution_badge',
      'kpi_card',
      'kpi_card',
      'link_card',
      'table',
      'clarification_card',
      'evidence_panel',
      'confirm_action',
      'follow_up_chips',
    ]);
  });

  it('groups kpi cards after ordering and keeps follow-up chips last', () => {
    const groups = groupBlocksForDisplay(blocks);

    expect(groups).toHaveLength(9);
    expect(groups[0]).toMatchObject({ type: 'single', block: { kind: 'summary_text' } });
    expect(groups[1]).toMatchObject({ type: 'single', block: { kind: 'entity_resolution_badge' } });
    expect(groups[2]).toMatchObject({
      type: 'kpi_group',
      items: [
        { kind: 'kpi_card', label: '消费客户' },
        { kind: 'kpi_card', label: '消费金额' },
      ],
    });
    expect(groups.at(-1)).toMatchObject({ type: 'single', block: { kind: 'follow_up_chips' } });
  });

  it('maps the complete Ami Brain response contract into client display blocks', () => {
    const mapped = mapBrainResponseBlocks([
      { kind: 'kpi', items: [{ label: '本月实收', value: '28,756.30 元' }] },
      { kind: 'ranking', columns: ['商品', '销量'], rows: [{ 商品: '抗衰紧致眼霜', 销量: 14 }] },
      { kind: 'comparison', items: [{ label: '实收', current: '100', previous: '80', delta: '+20' }] },
      { kind: 'diagnosis', findings: [{ title: '退款异常', detail: '退款金额上升', severity: 'warning' }] },
      { kind: 'clarification', question: '查看哪个范围？', options: [{ id: 'month', label: '本月', value: '本月' }] },
      { kind: 'limitations', items: ['缺少满意度采集'] },
      { kind: 'evidence', citations: [{ sourceType: 'metric', sourceId: 'metric.paid_amount', label: '实收' }] },
    ]);

    expect(mapped.map((block) => block.kind)).toEqual([
      'kpi_card',
      'table',
      'table',
      'alert',
      'clarification_card',
      'data_gap',
      'evidence_panel',
    ]);
    expect(mapped).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table', caption: '排行结果' }),
      expect.objectContaining({ kind: 'alert', message: '退款异常：退款金额上升' }),
    ]));
  });
});
