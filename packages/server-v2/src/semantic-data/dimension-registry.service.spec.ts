import { DimensionRegistryService } from './dimension-registry.service.js';

describe('DimensionRegistryService', () => {
  const registry = new DimensionRegistryService();

  it('registers business dimensions used by the unified query hub', () => {
    expect(registry.findByKey('date')).toMatchObject({ label: '日期', sensitive: false });
    expect(registry.findByKey('productName')).toMatchObject({ label: '商品名称' });
    expect(registry.findByKey('customerName')).toMatchObject({ label: '客户姓名', sensitive: true });
    expect(registry.findByKey('beauticianName')).toMatchObject({ label: '员工姓名' });
    expect(registry.findByKey('campaignName')).toMatchObject({ label: '活动名称' });
    expect(registry.findByKey('paymentMethod')).toMatchObject({
      label: '支付方式',
      source: ['ProductOrder.payMethod', 'PaymentRecord.method'],
    });
    expect(registry.findByKey('payMethod')).toBeUndefined();
  });

  it('rejects unknown dimensions instead of silently allowing free fields', () => {
    expect(registry.allKnown(['date', 'productName'])).toBe(true);
    expect(registry.allKnown(['date', 'rawSqlColumn'])).toBe(false);
  });
});
