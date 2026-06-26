import { AgentResponseSafetyService } from './agent-response-safety.service.js';

describe('AgentResponseSafetyService', () => {
  const service = new AgentResponseSafetyService();

  it('normalizes internal enums metrics model names and filter syntax in display text', () => {
    const result = service.sanitizeToolResult({
      status: 'success',
      title: '客户优先跟进',
      summary: 'recommended 客户按 follow_up_priority_score 排序。',
      data: {
        items: [
          {
            customerName: '杨晓雯',
            priority: 'recommended',
            opportunityType: 'opportunity',
            lastVisitWindow: 'next_week',
            actionKey: 'marketing:activity:12',
          },
        ],
      },
      evidence: {
        source: ['CustomerPredictionSnapshot'],
        dateRange: 'next_week',
        metricDefinition: 'follow_up_priority_score 来自 CustomerPredictionSnapshot。',
        filters: ['timeRange=下周', 'limit=10', 'storeId=当前门店'],
      },
      actions: [{ label: '执行 agent:tool:customer.followup.task.draft', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'low' }],
    });

    expect(result.summary).toBe('建议优先跟进 客户按 客户跟进优先评分 排序。');
    expect(result.data).toMatchObject({
      items: [
        {
          priority: '建议优先跟进',
          opportunityType: '可培育机会',
          lastVisitWindow: '下周',
          actionKey: '营销活动',
        },
      ],
    });
    expect(result.evidence?.source).toEqual(['客户流失与复购预测']);
    expect(result.evidence?.dateRange).toBe('下周');
    expect(result.evidence?.metricDefinition).toBe('客户跟进优先评分 来自 客户流失与复购预测。');
    expect(result.evidence?.filters).toEqual(['统计周期：下周', '最多返回 10 条', '当前门店']);
    expect(result.actions?.[0].label).toBe('执行 Agent 动作');
    expect(service.inspectToolResultDisplay(result).passed).toBe(true);
  });

  it('reports user-visible internal text violations for eval gates', () => {
    const inspected = service.inspectTextEntries({
      summary: '使用 recommended、timeRange=next_week 和 CustomerPredictionSnapshot 生成结果。',
      data: '明细仍包含 marketing:activity:12 和 next_week。',
    });

    expect(inspected.passed).toBe(false);
    expect(inspected.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'summary', matched: 'recommended' }),
        expect.objectContaining({ path: 'summary', matched: 'timeRange=' }),
        expect.objectContaining({ path: 'summary', matched: 'CustomerPredictionSnapshot' }),
        expect.objectContaining({ path: 'data', matched: 'next_week' }),
        expect.objectContaining({ path: 'data', matched: 'marketing:activity:12' }),
      ]),
    );
  });

  it('sanitizes operator and beautician scope fields in evidence text', () => {
    const sanitized = service.sanitizeToolResult({
      status: 'success',
      title: '员工表现排行',
      summary: 'role=beautician，operatorId=31，beauticianId=当前登录用户映射。',
      evidence: {
        source: ['Beautician'],
        metricDefinition: 'beauticianId=11',
        filters: ['role=beautician', 'operatorId=31', 'beauticianId=当前登录用户映射', 'deviceId=9'],
      },
      actions: [],
    });

    expect(sanitized.summary).toBe('美容师本人范围，当前账号，当前登录美容师。');
    expect(sanitized.evidence?.metricDefinition).toBe('指定美容师');
    expect(sanitized.evidence?.filters).toEqual(['美容师本人范围', '当前账号', '当前登录美容师', '当前终端']);
    expect(service.inspectToolResultDisplay(sanitized).passed).toBe(true);
  });

  it('removes medicalized and exaggerated efficacy claims from beautician-facing advice', () => {
    const sanitized = service.sanitizeToolResult({
      status: 'success',
      title: '客户护理摘要',
      summary: '本次护理可以治疗痤疮，保证治愈过敏，并诊断为皮炎。',
      data: {
        recommendedSteps: [
          '疗程后一定改善红血丝。',
          '建议根治痘痘方案。',
        ],
      },
      evidence: {
        source: ['ServiceTask', 'Customer'],
        metricDefinition: '护理准备建议，不构成医疗诊断。',
        filters: ['当前门店'],
        limitations: ['护理建议不构成医疗诊断；涉及皮肤异常、过敏或不适时，应建议客户咨询专业医疗机构。'],
      },
      actions: [],
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('治疗痤疮');
    expect(serialized).not.toContain('保证治愈');
    expect(serialized).not.toContain('诊断为皮炎');
    expect(serialized).not.toContain('一定改善');
    expect(serialized).not.toContain('根治痘痘');
    expect(sanitized.summary).toContain('非医疗护理建议');
    expect(service.inspectToolResultDisplay(sanitized).passed).toBe(true);
  });

  it('reports unsafe medicalized claims before sanitization', () => {
    const inspected = service.inspectTextEntries({
      summary: '建议治疗痤疮，保证治愈过敏，并诊断为皮炎。',
    });

    expect(inspected.passed).toBe(false);
    expect(inspected.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ matched: '治疗痤疮' }),
        expect.objectContaining({ matched: '保证治愈' }),
        expect.objectContaining({ matched: '诊断为皮炎' }),
      ]),
    );
  });
});
