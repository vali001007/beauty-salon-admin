import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators/index.js';
import { StoreMetricsController } from './store-metrics.controller.js';

describe('StoreMetricsController', () => {
  const permissionsOf = (methodName: keyof StoreMetricsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, StoreMetricsController.prototype[methodName]);

  it('uses dedicated permissions without requiring the legacy dashboard permission', () => {
    expect(permissionsOf('overview')).toEqual(['core:store-metrics:view']);
    expect(permissionsOf('drilldown')).toEqual(['core:store-metrics:drilldown']);
    expect(permissionsOf('createTarget')).toEqual(['core:store-metrics:target:edit']);
  });

  it('rejects cross-store reads from query or X-Store-Id', () => {
    const service = { getOverview: jest.fn() };
    const controller = new StoreMetricsController(service as any);

    expect(() => controller.overview({ storeId: 8 }, undefined, { stores: [6], permissions: ['core:store-metrics:view'] })).toThrow(ForbiddenException);
    expect(() => controller.overview({}, '8', { stores: [6], permissions: ['core:store-metrics:view'] })).toThrow(ForbiddenException);
  });

  it('allows a scoped store and wildcard administrators', () => {
    const service = { getOverview: jest.fn(async () => ({ scope: { storeId: 6 } })) };
    const controller = new StoreMetricsController(service as any);

    expect(() => controller.overview({ storeId: 6 }, undefined, { stores: [6], permissions: ['core:store-metrics:view'] })).not.toThrow();
    expect(() => controller.overview({ storeId: 99 }, undefined, { stores: [], permissions: ['*'] })).not.toThrow();
  });
});
