export const CUSTOMER_MONETARY_TIERS = [
  { score: 5, key: 'm5', label: 'M5 核心消费层', min: 50_000, max: null },
  { score: 4, key: 'm4', label: 'M4 高消费层', min: 20_000, max: 50_000 },
  { score: 3, key: 'm3', label: 'M3 成长消费层', min: 8_000, max: 20_000 },
  { score: 2, key: 'm2', label: 'M2 基础消费层', min: 3_000, max: 8_000 },
  { score: 1, key: 'm1', label: 'M1 初次消费层', min: 0.01, max: 3_000 },
  { score: 0, key: 'm0', label: 'M0 未消费层', min: 0, max: 0.01 },
] as const;

export function scoreCustomerMonetary(totalSpent: number) {
  const amount = Number(totalSpent ?? 0);
  return CUSTOMER_MONETARY_TIERS.find((tier) => amount >= tier.min && (tier.max === null || amount < tier.max))?.score ?? 0;
}

export function customerMonetaryTier(totalSpent: number) {
  const score = scoreCustomerMonetary(totalSpent);
  return CUSTOMER_MONETARY_TIERS.find((tier) => tier.score === score) ?? CUSTOMER_MONETARY_TIERS[CUSTOMER_MONETARY_TIERS.length - 1];
}
