import { PERMISSIONS_KEY } from '../common/decorators/index.js';
import { OperationProfitController } from './operation-profit.controller.js';

describe('OperationProfitController permissions', () => {
  const permissionsOf = (methodName: keyof OperationProfitController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, OperationProfitController.prototype[methodName]);

  it('keeps overview scoped to operation profit view permission', () => {
    expect(permissionsOf('getOverview')).toEqual(['core:operation-profit:view']);
  });

  it('allows detail pages through either their page permission or overview permission', () => {
    expect(permissionsOf('getProductMargins')).toEqual(['core:product-margin:view', 'core:operation-profit:view']);
    expect(permissionsOf('getProjectMargins')).toEqual(['core:project-margin:view', 'core:operation-profit:view']);
    expect(permissionsOf('getPrepaidLiabilities')).toEqual(['core:prepaid-liability:view', 'core:operation-profit:view']);
    expect(permissionsOf('getBeauticianPerformance')).toEqual(['core:beautician-performance:view', 'core:operation-profit:view']);
  });
});
