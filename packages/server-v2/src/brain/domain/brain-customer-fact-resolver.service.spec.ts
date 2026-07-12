import { BrainCustomerFactResolverService } from './brain-customer-fact-resolver.service.js';

describe('BrainCustomerFactResolverService', () => {
  it('requires both customer name and phone tail when both are provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    await service.answerExactCustomerQuestion({
      storeId: 6,
      message: '有个客人说她叫李梅，手机尾号3256，帮我找一下',
      permissions: ['*'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 6,
          AND: [{ name: { contains: '李梅' } }, { phone: { endsWith: '3256' } }],
        }),
      }),
    );
  });

  it('extracts a customer name from a reservation lookup', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    await service.answerExactCustomerQuestion({
      storeId: 6,
      message: '张美丽的预约是几点，做什么项目',
      permissions: ['*'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: { contains: '张美丽' } }) }),
    );
  });
});
