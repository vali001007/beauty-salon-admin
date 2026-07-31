import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateAmiBrainGoldRuntimeResponse,
  extractAmiBrainGoldActualValue,
  extractAmiBrainGoldObservedCapabilityKeys,
  parseAmiBrainGoldRuntimeCases,
  selectAmiBrainGoldRuntimeCases,
  type AmiBrainGoldRuntimeCase,
} from './ami-brain-gold-runtime.js';

describe('Ami Brain gold standard runtime evaluation', () => {
  it('extracts and compares payment rows from structured blocks', () => {
    const testCase = goldCase({
      audit: { resolverKey: 'finance.payment_method_amounts', comparison: 'ordered_rows', tolerance: null },
      expectedCapabilityKey: 'finance_payment_breakdown',
      expectedSnapshot: {
        status: 'ready',
        value: [
          { method: 'wechat', amount: 12.5 },
          { method: 'cash', amount: 3 },
        ],
        checksum: 'a'.repeat(64),
      },
    });
    const result = evaluateAmiBrainGoldRuntimeResponse({
      testCase,
      response: {
        status: 'completed',
        answer: '支付方式拆分完成。',
        capabilityKeys: ['finance_payment_breakdown'],
        blocks: [
          {
            kind: 'table',
            columns: ['paymentMethod', 'amount', 'count'],
            rows: [
              { paymentMethod: '微信', amount: 12.5, count: 1 },
              { paymentMethod: '现金', amount: 3, count: 1 },
            ],
          },
        ],
      },
    });
    expect(result).toMatchObject({ passed: true, status: 'matched' });
  });

  it('uses explicit row identities and rejects duplicate actual ids', () => {
    const testCase = goldCase({
      audit: { resolverKey: 'staff.project_skill_set', comparison: 'id_set_exact', tolerance: null },
      expectedCapabilityKey: 'manager_staff_overview',
      expectedSnapshot: { status: 'ready', value: [11], checksum: 'b'.repeat(64) },
    });
    const result = evaluateAmiBrainGoldRuntimeResponse({
      testCase,
      response: {
        status: 'completed',
        answer: '会做补水护理。',
        capabilityKeys: ['manager_staff_overview'],
        blocks: [
          {
            kind: 'table',
            columns: ['projectId', 'projectName'],
            rows: [
              { projectId: 11, projectName: '补水护理' },
              { projectId: 11, projectName: '补水护理' },
            ],
          },
        ],
      },
    });
    expect(result).toMatchObject({ passed: false, status: 'value_mismatch', comparisonCode: 'duplicate_actual_rows' });
  });

  it('fails closed when the expected capability was not observed', () => {
    const result = evaluateAmiBrainGoldRuntimeResponse({
      testCase: goldCase(),
      response: {
        status: 'completed',
        answer: '新增客户 9 人。',
        capabilityKeys: ['store_operations_overview'],
        blocks: [{ kind: 'kpi', items: [{ label: '新增客户', value: '9 人' }] }],
      },
    });
    expect(result).toMatchObject({ passed: false, status: 'capability_mismatch' });
  });

  it('normalizes count units from Brain KPI values', () => {
    const result = evaluateAmiBrainGoldRuntimeResponse({
      testCase: goldCase(),
      response: {
        status: 'completed',
        answer: '新增客户 9 人。',
        capabilityKeys: ['customer_facts'],
        blocks: [{ kind: 'kpi', items: [{ label: '新增客户', value: '9 人' }] }],
      },
    });
    expect(result).toMatchObject({ passed: true, status: 'matched', normalizedActual: '9' });
  });

  it('keeps provider unavailability as a failed gold result', () => {
    const result = evaluateAmiBrainGoldRuntimeResponse({
      testCase: goldCase(),
      response: {
        status: 'failed',
        answer: '',
        capabilityKeys: [],
        blocks: [],
        failureCode: 'MODEL_PROVIDER_UNAVAILABLE',
      },
    });
    expect(result).toMatchObject({ passed: false, status: 'provider_unavailable' });
  });

  it('accepts empty sets only from a matching structured empty table', () => {
    const testCase = goldCase({
      audit: { resolverKey: 'customer.expiring_card_unbooked', comparison: 'id_set_exact', tolerance: null },
      expectedSnapshot: { status: 'ready', value: [], checksum: 'c'.repeat(64) },
    });
    expect(
      extractAmiBrainGoldActualValue({
        testCase,
        response: { answer: '当前没有符合条件的客户。', blocks: [{ kind: 'table', columns: ['customerId'], rows: [] }] },
      }),
    ).toEqual({ found: true, value: [] });
    expect(
      extractAmiBrainGoldActualValue({
        testCase,
        response: {
          answer: '当前后台没有接入该业务事实，无法查询。',
          blocks: [{ kind: 'limitations', items: ['当前后台没有接入该业务事实'] }],
        },
      }),
    ).toMatchObject({ found: false });
  });

  it('keeps structured empty schedule and null procurement facts auditable', () => {
    expect(
      extractAmiBrainGoldActualValue({
        testCase: goldCase({
          audit: { resolverKey: 'staff.schedule_fact', comparison: 'json_exact' },
          expectedSnapshot: { status: 'ready', value: [], checksum: 'f'.repeat(64) },
        }),
        response: {
          answer: '该员工本期没有有效排班记录。',
          blocks: [{ kind: 'table', columns: ['staff', 'date', 'startTime', 'endTime'], rows: [] }],
        },
      }),
    ).toEqual({ found: true, value: [] });
    const procurementCase = goldCase({
      evaluationQuestion: '小气泡一次性探头哪个供应商最便宜',
      audit: { resolverKey: 'inventory.procurement_fact', comparison: 'json_exact' },
      expectedSnapshot: { status: 'ready', value: null, checksum: '1'.repeat(64) },
    });
    expect(
      extractAmiBrainGoldActualValue({
        testCase: procurementCase,
        response: {
          answer: '没有匹配的供应商报价。',
          blocks: [{ kind: 'table', columns: ['supplierId', 'supplierName', 'unitCost'], rows: [] }],
        },
      }),
    ).toEqual({ found: true, value: null });
    expect(
      extractAmiBrainGoldActualValue({
        testCase: procurementCase,
        response: { answer: '当前没有需要采购的商品。', blocks: [{ kind: 'limitations', items: ['没有采购建议'] }] },
      }),
    ).toMatchObject({ found: false });
  });

  it('parses a negative reconciliation answer without matching the positive substring', () => {
    const result = extractAmiBrainGoldActualValue({
      testCase: goldCase({
        audit: { resolverKey: 'finance.cash_shift_reconciliation', comparison: 'boolean_exact' },
        expectedSnapshot: { status: 'ready', value: false, checksum: 'e'.repeat(64) },
      }),
      response: { answer: '本期收银班次不一致。', blocks: [] },
    });
    expect(result).toEqual({ found: true, value: false });
  });

  it('uses completed execution evidence and ignores catalog-only capability selection', () => {
    expect(
      extractAmiBrainGoldObservedCapabilityKeys({
        steps: [
          {
            stepKey: 'capability_catalog_discovery',
            status: 'completed',
            output: { selectedCapabilityKey: 'wrong_catalog_candidate' },
          },
          {
            stepKey: 'capability_execution',
            status: 'completed',
            output: { capabilityKey: 'customer_facts' },
          },
          {
            stepKey: 'domain_adapter_store_manager',
            status: 'completed',
            output: { metadata: { capabilityKey: 'manager_staff_overview' } },
          },
          {
            stepKey: 'capability_execution',
            status: 'failed',
            output: { capabilityKey: 'failed_capability' },
          },
          {
            stepKey: 'bounded_dag_execution',
            status: 'completed',
            output: {
              observations: [
                { status: 'completed', capabilityKey: 'finance_risk_overview' },
                { status: 'failed', capabilityKey: 'failed_dag_capability' },
              ],
            },
          },
        ],
      }),
    ).toEqual(['customer_facts', 'manager_staff_overview', 'finance_risk_overview']);
  });

  it('has a deterministic extraction route for every repository gold case', () => {
    const path = resolve(
      process.cwd(),
      '../../docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-manifest-v1.json',
    );
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { cases: AmiBrainGoldRuntimeCase[] };
    const cases = parseAmiBrainGoldRuntimeCases(manifest);
    expect(cases).toHaveLength(100);
    for (const testCase of cases) {
      expect(testCase.evaluationQuestion).toBeTruthy();
      expect(testCase.expectedCapabilityKey).toBeTruthy();
      expect(testCase.expectedSnapshot.status).toBe('ready');
      const result = extractAmiBrainGoldActualValue({
        testCase,
        response: { answer: '当前没有符合条件的记录。', blocks: [{ kind: 'limitations', items: ['没有符合条件的记录'] }] },
      });
      expect(result).toHaveProperty('found');
    }
  });

  it('rejects a ready manifest when a fixed evaluation question is missing', () => {
    const cases = Array.from({ length: 100 }, (_, index) => goldCase({
      goldCaseId: `GOLD-${index}`,
      sourceCaseId: `BQ-${index}`,
      evaluationQuestion: index === 3 ? '' : `固定问法 ${index}`,
    }));
    expect(() => parseAmiBrainGoldRuntimeCases({ status: 'ready', cases })).toThrow(
      'ami_brain_gold_runtime_case_invalid:BQ-3',
    );
  });

  it('selects a deterministic gold diagnostic subset by source or gold case id', () => {
    const cases = [
      goldCase({ goldCaseId: 'GOLD-BQ0853', sourceCaseId: 'BQ0853' }),
      goldCase({ goldCaseId: 'GOLD-BQ0858', sourceCaseId: 'BQ0858' }),
      goldCase({ goldCaseId: 'GOLD-BQ0859', sourceCaseId: 'BQ0859' }),
    ];
    expect(selectAmiBrainGoldRuntimeCases(cases, ['BQ0859', 'GOLD-BQ0853', 'BQ0859'])).toEqual([
      cases[0],
      cases[2],
    ]);
    expect(selectAmiBrainGoldRuntimeCases(cases, [])).toBe(cases);
  });

  it('rejects unknown gold diagnostic subset ids', () => {
    expect(() => selectAmiBrainGoldRuntimeCases([goldCase()], ['BQ9999'])).toThrow(
      'ami_brain_gold_runtime_target_ids_missing:BQ9999',
    );
  });
});

function goldCase(overrides: Partial<AmiBrainGoldRuntimeCase> = {}): AmiBrainGoldRuntimeCase {
  return {
    goldCaseId: 'GOLD-BQ0001',
    sourceCaseId: 'BQ0001',
    evaluationQuestion: '2026年6月新增了多少个客户',
    expectedCapabilityKey: 'customer_facts',
    audit: { resolverKey: 'customer.new_customer_count', comparison: 'integer_exact', tolerance: '0' },
    expectedSnapshot: { status: 'ready', value: 9, checksum: 'd'.repeat(64) },
    ...overrides,
  };
}
