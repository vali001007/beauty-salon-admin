import { PERMISSIONS_KEY } from '../common/decorators/index.js';
import { OperationCostsController } from './operation-costs.controller.js';

describe('OperationCostsController permissions', () => {
  const permissionsOf = (methodName: keyof OperationCostsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, OperationCostsController.prototype[methodName]);

  it('keeps operation cost reads separate from profit overview reads', () => {
    expect(permissionsOf('findAll')).toEqual(['core:operation-cost:view']);
  });

  it('requires manage permission for all operation cost writes', () => {
    expect(permissionsOf('create')).toEqual(['core:operation-cost:manage']);
    expect(permissionsOf('update')).toEqual(['core:operation-cost:manage']);
    expect(permissionsOf('remove')).toEqual(['core:operation-cost:manage']);
    expect(permissionsOf('copyFromPreviousMonth')).toEqual(['core:operation-cost:manage']);
  });
});
