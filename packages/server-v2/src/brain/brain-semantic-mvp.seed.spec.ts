import { BRAIN_MVP_DIMENSIONS, BRAIN_MVP_DOMAINS, BRAIN_MVP_METRICS } from './seed/brain-semantic-mvp.seed.js';

describe('Brain semantic MVP seed', () => {
  it('covers ten beauty business ontology domains', () => {
    expect(BRAIN_MVP_DOMAINS.map((domain) => domain.domain)).toEqual([
      'customer',
      'staff',
      'catalog',
      'transaction',
      'fulfillment',
      'inventory',
      'finance',
      'marketing',
      'supply_chain',
      'industry',
    ]);
  });

  it('defines enough metrics and dimensions for M1/M2', () => {
    expect(BRAIN_MVP_METRICS.length).toBeGreaterThanOrEqual(12);
    expect(BRAIN_MVP_DIMENSIONS.length).toBeGreaterThanOrEqual(8);
  });
});
