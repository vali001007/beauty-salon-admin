import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveFinanceGrossMarginValue,
  resolveFinanceOrderProfitValue,
} from './ami-brain-gold-standard-audit-core.mjs';

test('finance gross margin returns money for money-shaped contracts', () => {
  assert.equal(
    resolveFinanceGrossMarginValue({
      expectedAnswerShape: 'money',
      settlements: [
        { totalRevenue: '4264', grossProfit: '2847.48' },
        { totalRevenue: 100, grossProfit: 40.125 },
      ],
    }),
    2887.61,
  );
});

test('finance gross margin returns normalized ratio for ratio-shaped contracts', () => {
  assert.equal(
    resolveFinanceGrossMarginValue({
      expectedAnswerShape: 'ratio',
      settlements: [{ totalRevenue: '4264', grossProfit: '2847.48' }],
    }),
    0.6678,
  );
});

test('finance gross margin returns zero for a zero-revenue ratio and rejects unknown shapes', () => {
  assert.equal(
    resolveFinanceGrossMarginValue({
      expectedAnswerShape: 'ratio',
      settlements: [{ totalRevenue: 0, grossProfit: 0 }],
    }),
    0,
  );
  assert.throws(
    () => resolveFinanceGrossMarginValue({ expectedAnswerShape: 'table', settlements: [] }),
    /finance gross margin answer shape unsupported:table/u,
  );
});

test('finance order profit projects accounting rows without treating prepaid cash as profit', () => {
  const rows = [
    { orderId: 1046, totalCost: 242.4, grossProfit: 205.6 },
    { orderId: 1047, totalCost: 0, grossProfit: 0 },
    { orderId: 1049, totalCost: 98, grossProfit: 200 },
  ];
  assert.equal(resolveFinanceOrderProfitValue({ projection: 'gross_profit', rows }), 405.6);
  assert.deepEqual(resolveFinanceOrderProfitValue({ projection: 'cost_and_gross_profit', rows }), {
    totalCost: 340.4,
    grossProfit: 405.6,
  });
  assert.deepEqual(resolveFinanceOrderProfitValue({ projection: 'per_order_gross_profit', rows }), [
    { orderId: 1046, grossProfit: 205.6 },
    { orderId: 1047, grossProfit: 0 },
    { orderId: 1049, grossProfit: 200 },
  ]);
});

test('finance order profit returns only negative order ids and rejects invalid contracts', () => {
  assert.deepEqual(
    resolveFinanceOrderProfitValue({
      projection: 'negative_order_ids',
      rows: [
        { orderId: 2, totalCost: 120, grossProfit: -20 },
        { orderId: 1, totalCost: 50, grossProfit: 10 },
        { orderId: 3, totalCost: 200, grossProfit: -5.5 },
      ],
    }),
    [2, 3],
  );
  assert.throws(
    () => resolveFinanceOrderProfitValue({ projection: 'table', rows: [] }),
    /finance order profit projection unsupported:table/u,
  );
  assert.throws(
    () => resolveFinanceOrderProfitValue({ projection: 'gross_profit', rows: [{ orderId: 0, totalCost: 0, grossProfit: 0 }] }),
    /finance order profit row orderId invalid/u,
  );
});
