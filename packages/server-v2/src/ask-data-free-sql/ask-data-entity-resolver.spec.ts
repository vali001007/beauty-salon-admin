import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { AskDataNamedEntityResolver, resolveAskDataEntities } from './ask-data-entity-resolver.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';

describe('Ami Ask named entity resolution', () => {
  const parser = new AskDataIntentParser();

  it.each([
    ['张美丽的预约是几点，做什么项目', '张美丽'],
    ['预测马欣怡的流失风险有多高', '马欣怡'],
    ['吴晓雯的会员等级是什么', '吴晓雯'],
    ['杨紫萱的客户价值分层预测', '杨紫萱'],
  ])('extracts a plain customer name from %s', (question, expectedName) => {
    expect(parser.parse(question).semanticIntent.entities).toContainEqual({ type: '客户', mention: expectedName });
  });

  it.each([
    ['唐伊是什么职级', '唐伊'],
    ['顾然这半年的提成是多少', '顾然'],
    ['沈晴这个季度的排班是怎样的', '沈晴'],
    ['唐伊今年有几个预约', '唐伊'],
    ['宋乔本周末有几个预约', '宋乔'],
    ['宋乔服务过的客户本月满意度如何', '宋乔'],
  ])('extracts a plain staff name from %s', (question, expectedName) => {
    expect(parser.parse(question).semanticIntent.entities).toContainEqual({ type: '员工', mention: expectedName });
  });

  it.each([
    ['精华导入护理属于哪个项目类型', '项目', '精华导入护理'],
    ['射频紧致提升护理做一次要多久', '项目', '射频紧致提升护理'],
    ['射频仪器导入凝胶的安全库存是多少', '商品', '射频仪器导入凝胶'],
    ['屏障修护精华现在还有多少库存', '商品', '屏障修护精华'],
  ])('extracts a named project or product from %s', (question, type, mention) => {
    expect(parser.parse(question).semanticIntent.entities).toContainEqual({ type, mention });
  });

  it.each([
    '按这半年业绩给我美容师榜单',
    '这个月提成最高的是谁，大概多少',
    '现在几点了，下午还有几个预约',
    '这个月谁的业绩最好',
  ])('does not hallucinate a named staff entity from generic wording: %s', (question) => {
    expect(parser.parse(question).semanticIntent.entities.filter((entity) => /^(?:staff|员工)$/.test(entity.type))).toEqual([]);
  });

  it('resolves one exact store-scoped customer to an internal customer ID filter', async () => {
    const prisma = {
      customer: { findMany: jest.fn().mockResolvedValue([{ id: 4023 }]) },
    };
    const resolver = new AskDataNamedEntityResolver(prisma as any);
    const intent = parser.parse('吴晓雯的会员等级是什么').semanticIntent;
    const resolved = await resolver.resolve(intent, 6);
    const view = ASK_DATA_FREE_SQL_VIEWS.filter((item) => item.viewName === 'ask_data_customer_profile_summary_view');

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, deletedAt: null, name: '吴晓雯' },
      take: 2,
    }));
    expect(resolved.clarificationQuestion).toBeUndefined();
    expect(resolved.semanticIntent.entities[0].resolvedValue).toBe('4023');
    expect(resolveAskDataEntities(resolved.semanticIntent, view)).toContainEqual(expect.objectContaining({
      field: 'customer_id',
      value: 4023,
      resolution: 'id',
    }));
  });

  it.each([
    [[], 'customer_entity_not_found'],
    [[{ id: 1 }, { id: 2 }], 'customer_entity_not_unique'],
  ])('requires a customer ID when exact-name lookup is not unique: %j', async (matches, reason) => {
    const resolver = new AskDataNamedEntityResolver({
      customer: { findMany: jest.fn().mockResolvedValue(matches) },
    } as any);
    const resolved = await resolver.resolve(parser.parse('吴晓雯的会员等级是什么').semanticIntent, 6);

    expect(resolved.clarificationReason).toBe(reason);
    expect(resolved.clarificationQuestion).toContain('客户 ID');
    expect(resolved.semanticIntent.ambiguities.at(-1)?.slot).toBe('entity_identity');
  });

  it('resolves one exact store-scoped staff member to an internal staff ID filter', async () => {
    const prisma = {
      beautician: { findMany: jest.fn().mockResolvedValue([{ id: 24 }]) },
    };
    const resolver = new AskDataNamedEntityResolver(prisma as any);
    const intent = parser.parse('唐伊本月的提成是多少').semanticIntent;
    const resolved = await resolver.resolve(intent, 6);
    const view = ASK_DATA_FREE_SQL_VIEWS.filter((item) => item.viewName === 'ask_data_staff_performance_view');

    expect(prisma.beautician.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, name: '唐伊' },
      take: 2,
    }));
    expect(resolved.clarificationQuestion).toBeUndefined();
    expect(resolved.semanticIntent.entities[0].resolvedValue).toBe('24');
    expect(resolveAskDataEntities(resolved.semanticIntent, view)).toContainEqual(expect.objectContaining({
      field: 'staff_id',
      value: 24,
      resolution: 'id',
    }));
  });

  it.each([
    [[], 'staff_entity_not_found'],
    [[{ id: 1 }, { id: 2 }], 'staff_entity_not_unique'],
  ])('requires a staff ID when exact-name lookup is not unique: %j', async (matches, reason) => {
    const resolver = new AskDataNamedEntityResolver({
      beautician: { findMany: jest.fn().mockResolvedValue(matches) },
    } as any);
    const resolved = await resolver.resolve(parser.parse('唐伊是什么职级').semanticIntent, 6);

    expect(resolved.clarificationReason).toBe(reason);
    expect(resolved.clarificationQuestion).toContain('员工 ID');
    expect(resolved.semanticIntent.ambiguities.at(-1)?.slot).toBe('entity_identity');
  });

  it.each([
    ['精华导入护理属于哪个项目类型', 'project', 'project_id', 91],
    ['屏障修护精华现在还有多少库存', 'product', 'product_id', 92],
  ])('resolves one exact store-scoped %s to an internal ID filter', async (question, model, field, id) => {
    const prisma = { [model]: { findMany: jest.fn().mockResolvedValue([{ id }]) } };
    const resolver = new AskDataNamedEntityResolver(prisma as any);
    const resolved = await resolver.resolve(parser.parse(question).semanticIntent, 6);
    const viewName = model === 'project' ? 'agent_v3_project_catalog_view' : 'agent_v3_product_inventory_view';
    const view = ASK_DATA_FREE_SQL_VIEWS.filter((item) => item.viewName === viewName);

    expect(prisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6 }), take: 2 }));
    expect(resolved.clarificationQuestion).toBeUndefined();
    expect(resolveAskDataEntities(resolved.semanticIntent, view)).toContainEqual(expect.objectContaining({ field, value: id, resolution: 'id' }));
  });
});
