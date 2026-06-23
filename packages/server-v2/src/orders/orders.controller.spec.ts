import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators/index.js';
import { OrdersController } from './orders.controller.js';

describe('OrdersController permissions', () => {
  const permissionsOf = (methodName: keyof OrdersController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, OrdersController.prototype[methodName]);

  it('keeps project order profit scoped to project order access and manager-only detail permission', () => {
    expect(permissionsOf('findProjectOrderProfit')).toEqual(['core:order:projects', 'core:project-order-profit:view']);
  });

  it('keeps product order profit scoped to product order access and manager-only detail permission', () => {
    expect(permissionsOf('findProductOrderProfit')).toEqual(['core:order:products', 'core:product-order-profit:view']);
  });

  it('keeps card order profit scoped to card order access and manager-only detail permission', () => {
    expect(permissionsOf('findCardOrderProfit')).toEqual(['core:order:card-orders', 'core:card-order-profit:view']);
  });

  it('keeps card usage profit scoped to card usage access and manager-only detail permission', () => {
    expect(permissionsOf('findCardUsageProfit')).toEqual(['core:order:card-usage', 'core:card-order-profit:view']);
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

  it('allows only store managers and super admins to view product order profit', async () => {
    const service = { findProductOrderProfit: jest.fn(async () => ({ orderId: 2 })) };
    const controller = new OrdersController(service as any);

    expect(() => controller.findProductOrderProfit(2, { roles: ['cashier'], permissions: ['core:order:products'] })).toThrow(
      ForbiddenException,
    );
    await expect(controller.findProductOrderProfit(2, { roles: ['store_manager'], permissions: ['core:order:products'] })).resolves.toEqual({
      orderId: 2,
    });
    await expect(controller.findProductOrderProfit(2, { roles: ['cashier'], permissions: ['*'] })).resolves.toEqual({ orderId: 2 });
  });

  it('allows only store managers and super admins to view card order profit', async () => {
    const service = { findCardOrderProfit: jest.fn(async () => ({ customerCardId: 3 })) };
    const controller = new OrdersController(service as any);

    expect(() => controller.findCardOrderProfit(3, { roles: ['cashier'], permissions: ['core:order:card-orders'] })).toThrow(
      ForbiddenException,
    );
    await expect(controller.findCardOrderProfit(3, { roles: ['store_manager'], permissions: ['core:order:card-orders'] })).resolves.toEqual({
      customerCardId: 3,
    });
    await expect(controller.findCardOrderProfit(3, { roles: ['cashier'], permissions: ['*'] })).resolves.toEqual({ customerCardId: 3 });
  });

  it('allows only store managers and super admins to view card usage profit', async () => {
    const service = { findCardUsageProfit: jest.fn(async () => ({ id: 4 })) };
    const controller = new OrdersController(service as any);

    expect(() => controller.findCardUsageProfit(4, { roles: ['cashier'], permissions: ['core:order:card-usage'] })).toThrow(
      ForbiddenException,
    );
    await expect(controller.findCardUsageProfit(4, { roles: ['store_manager'], permissions: ['core:order:card-usage'] })).resolves.toEqual({
      id: 4,
    });
    await expect(controller.findCardUsageProfit(4, { roles: ['cashier'], permissions: ['*'] })).resolves.toEqual({ id: 4 });
  });
});
