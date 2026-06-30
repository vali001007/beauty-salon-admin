import { SchemaGraphService } from './schema-graph.service.js';

describe('SchemaGraphService', () => {
  let service: SchemaGraphService;

  beforeEach(() => {
    service = new SchemaGraphService();
  });

  it('exposes marketing activity to marketing page relationship for link lookup', () => {
    const relations = service.findPath('MarketingActivity', 'MarketingPage');

    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromModel: 'MarketingActivity',
          toModel: 'MarketingPage',
          joinFields: [{ from: 'id', to: 'activityId' }],
        }),
      ]),
    );
  });

  it('loads generated Prisma schema graph models', () => {
    const generatedNodes = service.listGeneratedNodes();
    const productOrder = generatedNodes.find((node) => node.modelName === 'ProductOrder');
    const marketingActivity = generatedNodes.find((node) => node.modelName === 'MarketingActivity');

    expect(generatedNodes.length).toBeGreaterThan(50);
    expect(productOrder).toMatchObject({
      objectType: 'Order',
      storeScoped: true,
    });
    expect(productOrder?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'checkoutGroupNo', type: 'String', queryable: true }),
        expect.objectContaining({ name: 'storeId', type: 'Int', indexed: true }),
      ]),
    );
    expect(marketingActivity?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'title', type: 'String', queryable: true }),
        expect.objectContaining({ name: 'publishStatus', type: 'String', queryable: true }),
      ]),
    );
  });

  it('provides business object and Chinese field display names', () => {
    expect(service.getNode('MarketingActivity')).toMatchObject({
      objectType: 'MarketingActivity',
      displayName: '营销活动',
      storeScoped: false,
    });
    expect(service.displayNameForField('shareUrl')).toBe('活动链接');
    expect(service.displayNameForField('miniappPath')).toBe('小程序路径');
  });

  it('merges generated fields into business nodes without leaking global field aliases', () => {
    const store = service.listGeneratedNodes().find((node) => node.modelName === 'Store');
    const order = service.getNode('ProductOrder');

    expect(store?.fields.find((field) => field.name === 'id')?.displayName).toBe('ID');
    expect(store?.fields.find((field) => field.name === 'name')?.displayName).toBe('Name');
    expect(order?.fields.find((field) => field.name === 'checkoutGroupNo')).toMatchObject({
      displayName: '收银组号',
      type: 'String',
      queryable: true,
    });
  });

  it('exposes high-frequency entity relationship paths', () => {
    expect(service.findPath('Customer', 'Reservation')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('客户今日/近期预约') })]),
    );
    expect(service.findPath('Product', 'StockBatch')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('临期') })]),
    );
    expect(service.findPath('Project', 'ServiceTask')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('服务次数') })]),
    );
    expect(service.findPath('Beautician', 'ServiceTask')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('绩效') })]),
    );
    expect(service.findPath('ProductOrder', 'PaymentRecord')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('实收') })]),
    );
    expect(service.findPath('CustomerCard', 'CardUsageRecord')).toEqual(
      expect.arrayContaining([expect.objectContaining({ businessMeaning: expect.stringContaining('剩余次数') })]),
    );
  });

  it('includes generated Prisma relation paths for source model inspection', () => {
    expect(service.findPath('ProductOrder', 'Store')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          joinFields: [{ from: 'storeId', to: 'id' }],
          businessMeaning: expect.stringContaining('Prisma relation'),
        }),
      ]),
    );
  });
});
