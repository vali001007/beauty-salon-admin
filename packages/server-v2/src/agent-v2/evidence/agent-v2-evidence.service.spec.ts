import { AgentV2EvidenceService } from './agent-v2-evidence.service.js';

describe('AgentV2EvidenceService', () => {
  const service = new AgentV2EvidenceService();

  it('merges evidence with field policy audit and generic query trace', () => {
    const result = service.merge([
      {
        status: 'success',
        title: '支付方式收款拆分',
        summary: '今天收款 ¥230.00。',
        data: {
          rows: [{ methodLabel: '微信', revenueText: '¥150.00' }],
          fieldPolicyApplied: {
            mode: 'manifest_field_policy',
            allowedFields: ['methodLabel', 'revenueText'],
            maskedFields: ['reason'],
            deniedFields: ['customerPhone'],
            droppedFields: ['internalId'],
          },
          evidencePolicyApplied: {
            mode: 'agent_v2_authorized_evidence',
            allowedFields: ['methodLabel', 'revenueText'],
            maskedFields: ['reason'],
            deniedFields: ['customerPhone'],
          },
          queryTrace: {
            engine: 'generic_query_engine',
            queryKey: 'finance.payment-method-breakdown.metric',
            kind: 'metric.query',
            sourceModel: 'PaymentRecord',
            sqlSummary: {
              dialect: 'prisma_sql_summary',
              model: 'PaymentRecord',
              statementPreview: 'SELECT * FROM "PaymentRecord" WHERE order.storeId = :storeId LIMIT 2000;',
              sensitiveValuesRedacted: true,
            },
          },
        },
        evidence: {
          source: ['PaymentRecord'],
          sourceModels: ['PaymentRecord', 'ProductOrder'],
          sourceApis: ['/api/finance/payment-method-breakdown'],
          sourceTables: ['PaymentRecord', 'ProductOrder'],
          timeRange: '2026-07-05 至 2026-07-06',
          dateRange: '2026-07-05 至 2026-07-06',
          storeScope: 'required',
          metricDefinition: '支付方式收款拆分。',
          filters: ['order.storeId=1'],
          sampleSize: 3,
          limitations: ['只读支付流水。'],
          queryTraceId: 'trace-payment-method-breakdown',
        },
        actions: [],
      },
    ]);

    expect(result).toMatchObject({
      source: ['PaymentRecord'],
      sourceModels: ['PaymentRecord', 'ProductOrder'],
      sourceApis: ['/api/finance/payment-method-breakdown'],
      sourceTables: ['PaymentRecord', 'ProductOrder'],
      timeRange: '2026-07-05 至 2026-07-06',
      storeScope: 'required',
      filters: ['order.storeId=1'],
      sampleSize: 3,
      queryTraceId: 'trace-payment-method-breakdown',
      fieldPolicy: {
        allowedFields: ['methodLabel', 'revenueText'],
        maskedFields: ['reason'],
        deniedFields: ['customerPhone'],
        droppedFields: ['internalId'],
      },
      evidencePolicy: expect.objectContaining({ mode: 'agent_v2_authorized_evidence' }),
    });
    expect(result?.limitations?.join('\n')).toContain('V2 EvidenceService');
    expect(result?.queryTraces?.[0]).toMatchObject({
      engine: 'generic_query_engine',
      sourceModel: 'PaymentRecord',
    });
    expect(result?.sqlSummaries?.[0]).toMatchObject({
      model: 'PaymentRecord',
      sensitiveValuesRedacted: true,
    });
  });

  it('returns undefined when no tool evidence is available', () => {
    expect(service.merge([{ status: 'success', title: '空结果', summary: '无证据。', data: {}, actions: [] }])).toBeUndefined();
  });
});
