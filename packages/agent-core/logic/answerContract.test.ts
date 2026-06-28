import { describe, expect, it } from 'vitest';
import {
  getAgentResultActions,
  getAgentResultDisplayBlocks,
  getAgentResultDisplayModel,
  getAgentResultEvidence,
  getAgentResultFollowUps,
  getAgentResultLimitations,
  getAgentResultStatusNotice,
} from './answerContract';

describe('answerContract display adapter', () => {
  it('excludes follow-up chips from display blocks', () => {
    const blocks = getAgentResultDisplayBlocks({
      renderedBlocks: [
        { kind: 'summary_text', content: '核心结论' },
        { kind: 'follow_up_chips', suggestions: ['看明细'] },
        { kind: 'table', columns: ['客户'], rows: [['马美琳']] },
      ],
    });

    expect(blocks.map((block) => block.kind)).toEqual(['summary_text', 'table']);
  });

  it('prefers top-level follow-ups and limits them to three', () => {
    const suggestions = getAgentResultFollowUps({
      followUpSuggestions: ['客户明细', '生成话术', '安排跟进', '不展示'],
      renderedBlocks: [{ kind: 'follow_up_chips', suggestions: ['库存明细'] }],
    });

    expect(suggestions).toEqual(['客户明细', '生成话术', '安排跟进']);
  });

  it('falls back to follow-up chips and removes duplicate suggestions', () => {
    const suggestions = getAgentResultFollowUps({
      renderedBlocks: [
        { kind: 'follow_up_chips', suggestions: ['查看库存', '生成采购单'] },
        { kind: 'follow_up_chips', suggestions: ['查看库存', '联系供应商'] },
      ],
    });

    expect(suggestions).toEqual(['查看库存', '生成采购单', '联系供应商']);
  });

  it('falls back to tool evidence and tool actions when top-level fields are empty', () => {
    const evidence = getAgentResultEvidence({
      toolResults: [
        {
          status: 'success',
          title: '消费客户清单',
          summary: '昨日 2 位客户消费',
          evidence: {
            source: ['订单', '客户'],
            metricDefinition: '昨日已支付订单客户',
            filters: ['paidAt=昨天'],
          },
          actions: [
            { label: '生成回访话术', action: 'customer.followup.draft', riskLevel: 'low' },
          ],
        },
      ],
    });
    const actions = getAgentResultActions({
      toolResults: [
        {
          status: 'success',
          title: '消费客户清单',
          summary: '昨日 2 位客户消费',
          actions: [
            { label: '生成回访话术', action: 'customer.followup.draft', riskLevel: 'low' },
            { label: '生成回访话术', action: 'customer.followup.draft', riskLevel: 'low' },
          ],
        },
      ],
    });

    expect(evidence?.source).toEqual(['订单', '客户']);
    expect(actions).toEqual([{ label: '生成回访话术', action: 'customer.followup.draft', riskLevel: 'low' }]);
  });

  it('combines limitations from evidence, evidence panels and contract warnings', () => {
    const limitations = getAgentResultLimitations({
      limitations: ['仅统计本店'],
      evidence: {
        source: ['库存'],
        metricDefinition: '未来 90 天到期批次',
        filters: ['stock>0'],
        limitations: ['不含已出库批次'],
      },
      renderedBlocks: [
        {
          kind: 'evidence_panel',
          sources: ['库存批次'],
          metricDefinition: '批次效期',
          limitations: ['缺少供应商批次号'],
        },
      ],
      answerContract: {
        warnings: ['缺少成本字段'],
      },
    });

    expect(limitations).toEqual(['仅统计本店', '不含已出库批次', '缺少供应商批次号', '缺少成本字段']);
  });

  it('returns a full display model', () => {
    const model = getAgentResultDisplayModel({
      renderedBlocks: [
        { kind: 'text', content: '已找到客户' },
        { kind: 'follow_up_chips', suggestions: ['查看明细'] },
      ],
      actions: [{ label: '导出清单', action: 'export.customers', riskLevel: 'medium' }],
    });

    expect(model.blocks.map((block) => block.kind)).toEqual(['text']);
    expect(model.followUpSuggestions).toEqual(['查看明细']);
    expect(model.actions).toHaveLength(1);
  });

  it('maps no_data, unsupported and failed tool outcomes to display notices', () => {
    expect(getAgentResultStatusNotice({
      toolResults: [{ status: 'no_data', title: '临期库存', summary: '未来 90 天暂无临期库存。' }],
    })).toEqual({
      kind: 'no_data',
      title: '暂无数据',
      message: '未来 90 天暂无临期库存。',
    });

    expect(getAgentResultStatusNotice({
      toolResults: [{ status: 'unsupported', title: '暂不支持', summary: '暂不支持这个问题。' }],
    })).toMatchObject({ kind: 'unsupported', title: '暂不支持' });

    expect(getAgentResultStatusNotice({
      status: 'failed',
      answerContract: { errors: ['Answer Contract 校验失败'] },
      toolResults: [{ status: 'failed', title: '失败', summary: '工具失败' }],
    })).toEqual({
      kind: 'failed',
      title: '执行失败',
      message: 'Answer Contract 校验失败',
    });
  });

  it('does not show empty-state notices when at least one tool succeeds', () => {
    expect(getAgentResultStatusNotice({
      toolResults: [
        { status: 'success', title: '客户', summary: '查到 2 位客户' },
        { status: 'no_data', title: '库存', summary: '暂无库存风险' },
      ],
    })).toBeUndefined();
  });
});
