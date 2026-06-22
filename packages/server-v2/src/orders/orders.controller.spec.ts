import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators/index.js';
import { OrdersController } from './orders.controller.js';

describe('OrdersController permissions', () => {
  const permissionsOf = (methodName: keyof OrdersController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, OrdersController.prototype[methodName]);

  it('keeps project order profit scoped to project order access and manager-only detail permission', () => {
    expect(permissionsOf('findProjectOrderProfit')).toEqual(['core:order:projects', 'core:project-order-profit:view']);
  });

  it('allows only store managers and super admins to view project order profit', async () => {
    const service = { findProjectOrderProfit: jest.fn(async () => ({ orderId: 1 })) };
    const controller = new OrdersController(service as any);

    expect(() => controller.findProjectOrderProfit(1, { roles: ['cashier'], permissions: ['core:order:projects'] })).toThrow(
      ForbiddenException,
    );
    await expect(controller.findProjectOrderProfit(1, { roles: ['store_manager'], permissions: ['core:order:projects'] })).resolves.toEqual({
      orderId: 1,
    });
    await expect(controller.findProjectOrderProfit(1, { roles: ['cashier'], permissions: ['*'] })).resolves.toEqual({ orderId: 1 });
  });
});
