import { createReleaseFingerprint, selectAffectedCapability } from './brain-capability-regeneration-fingerprint.js';

describe('brain capability regeneration release identity', () => {
  const items = [
    { resourceVersionId: 22, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: { checksum: 'b', snapshot: { name: '客户事实' } } },
    { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'product_sales_ranking', resourceVersion: { checksum: 'a', snapshot: { name: '商品销售排行' } } },
  ];

  it('creates the same canonical fingerprint for every stage sharing resource versions', () => {
    expect(createReleaseFingerprint(items)).toBe(createReleaseFingerprint([...items].reverse()));
  });

  it('selects only a single release item or a uniquely named capability', () => {
    expect(selectAffectedCapability([items[0]!], '限制角色')).toEqual(['customer_facts']);
    expect(selectAffectedCapability(items, '请修改商品销售排行，只允许店长')).toEqual(['product_sales_ranking']);
  });

  it('returns no capability when the requirement has zero or multiple matches', () => {
    expect(selectAffectedCapability(items, '限制角色')).toEqual([]);
    expect(selectAffectedCapability(items, '修改 customer_facts 和 product_sales_ranking')).toEqual([]);
  });
});
