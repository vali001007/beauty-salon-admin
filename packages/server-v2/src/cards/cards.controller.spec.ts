import { CardsController } from './cards.controller.js';

describe('CardsController', () => {
  it.each(['verifyUsage', 'createUsage'] as const)('forces the authenticated user as card usage operator for %s', async (method) => {
    const cardsService = {
      verifyCardUsage: jest.fn().mockResolvedValue({ id: 71 }),
    };
    const controller = new CardsController(cardsService as never);

    await controller[method]({ customerCardId: 66, projectName: '深层补水护理', consumedTimes: 1, operatorId: 999 }, 9);

    expect(cardsService.verifyCardUsage).toHaveBeenCalledWith({
      customerCardId: 66,
      projectName: '深层补水护理',
      consumedTimes: 1,
      operatorId: 9,
    });
  });
});
