export function resolveFinanceGrossMarginValue({ expectedAnswerShape, settlements }) {
  const grossProfit = settlements.reduce((sum, row) => sum + toNumber(row.grossProfit), 0);
  if (expectedAnswerShape === 'money') return roundMoney(grossProfit);
  if (expectedAnswerShape === 'ratio') {
    const revenue = settlements.reduce((sum, row) => sum + toNumber(row.totalRevenue), 0);
    return revenue > 0 ? Number((grossProfit / revenue).toFixed(4)) : 0;
  }
  throw new Error(`finance gross margin answer shape unsupported:${expectedAnswerShape ?? 'missing'}`);
}

export function resolveFinanceOrderProfitValue({ projection, rows }) {
  const normalized = rows.map((row) => ({
    orderId: Number(row.orderId),
    totalCost: roundMoney(toNumber(row.totalCost)),
    grossProfit: roundMoney(toNumber(row.grossProfit)),
  }));
  if (normalized.some((row) => !Number.isInteger(row.orderId) || row.orderId <= 0)) {
    throw new Error('finance order profit row orderId invalid');
  }
  if (projection === 'gross_profit') {
    return roundMoney(normalized.reduce((sum, row) => sum + row.grossProfit, 0));
  }
  if (projection === 'cost_and_gross_profit') {
    return {
      totalCost: roundMoney(normalized.reduce((sum, row) => sum + row.totalCost, 0)),
      grossProfit: roundMoney(normalized.reduce((sum, row) => sum + row.grossProfit, 0)),
    };
  }
  if (projection === 'per_order_gross_profit') {
    return normalized
      .map((row) => ({ orderId: row.orderId, grossProfit: row.grossProfit }))
      .sort((left, right) => left.orderId - right.orderId);
  }
  if (projection === 'negative_order_ids') {
    return normalized
      .filter((row) => row.grossProfit < 0)
      .map((row) => row.orderId)
      .sort((left, right) => left - right);
  }
  throw new Error(`finance order profit projection unsupported:${projection ?? 'missing'}`);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return 0;
}
