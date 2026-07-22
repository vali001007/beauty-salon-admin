import { SupplyPlatformController } from './supply-platform.controller.js';

describe('SupplyPlatformController idempotency boundary', () => {
  let service: any;
  let controller: SupplyPlatformController;

  beforeEach(() => {
    service = {
      createOrder: jest.fn(),
      createOrdersFromReplenishment: jest.fn(),
      receiveOrder: jest.fn(),
    };
    controller = new SupplyPlatformController(service);
  });

  it('uses Idempotency-Key headers as the authoritative create keys', async () => {
    await controller.createOrder({ idempotencyKey: 'body-key', storeId: 6 } as any, ' header-key ');
    await controller.createOrdersFromReplenishment(
      { idempotencyKey: 'body-batch', storeId: 6 } as any,
      ' header-batch ',
    );

    expect(service.createOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'header-key' }));
    expect(service.createOrdersFromReplenishment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'header-batch' }),
    );
  });

  it('takes the receipt operator from the authenticated user instead of request body data', async () => {
    await controller.receiveOrder(
      3001,
      { idempotencyKey: 'body-key', operatorId: 999, items: [] } as any,
      { user: { id: 12 } } as any,
      ' header-key ',
    );

    expect(service.receiveOrder).toHaveBeenCalledWith(3001, {
      idempotencyKey: 'header-key',
      operatorId: 12,
      items: [],
    });
  });
});
