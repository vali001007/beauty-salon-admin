import {
  buildBrainEvalRolePermissionMap,
  resolveBrainEvalContextPermissions,
  resolveBrainEvalQuestionRole,
  resolveBrainEvalRolePermissions,
} from './brain-eval-role-permissions.js';

describe('brain eval role permissions', () => {
  it('uses the server role catalog instead of evaluator permissions', () => {
    const permissions = buildBrainEvalRolePermissionMap([
      { key: 'store_manager', permissions: ['core:brain:use', 'core:customer:view'] },
      { key: 'finance', permissions: ['core:brain:use', 'core:finance:view'] },
    ]);

    expect(resolveBrainEvalRolePermissions(permissions, 'finance')).toEqual([
      'core:brain:use',
      'core:finance:view',
    ]);
  });

  it('fails closed when the target role is not registered', () => {
    const permissions = buildBrainEvalRolePermissionMap([]);
    expect(() => resolveBrainEvalRolePermissions(permissions, 'inventory')).toThrow(
      'brain_eval_role_not_registered:inventory',
    );
  });

  it('maps question personas to the real runtime role by default', () => {
    expect(resolveBrainEvalQuestionRole('persona', 'manager')).toBe('store_manager');
    expect(resolveBrainEvalQuestionRole('persona', 'reception')).toBe('receptionist');
    expect(resolveBrainEvalQuestionRole('persona', 'beautician')).toBe('beautician');
    expect(resolveBrainEvalQuestionRole('persona', 'inventory')).toBe('inventory');
    expect(resolveBrainEvalQuestionRole('persona', 'finance')).toBe('finance');
    expect(resolveBrainEvalQuestionRole('persona', 'marketing')).toBe('marketing');
    expect(resolveBrainEvalQuestionRole('persona', 'edge')).toBe('store_manager');
    expect(resolveBrainEvalQuestionRole('cashier', 'marketing')).toBe('cashier');
  });

  it('adds only the candidate permissions declared for the evaluated role', () => {
    const permissions = buildBrainEvalRolePermissionMap([
      { key: 'store_manager', permissions: ['core:brain:use'] },
    ]);
    const candidates = [
      { allowedRoles: ['finance'], requiredPermissions: ['core:brain:use', 'core:finance:view'] },
      { allowedRoles: ['marketing'], requiredPermissions: ['core:marketing:analytics'] },
    ] as any;

    expect(resolveBrainEvalContextPermissions(permissions, 'finance', candidates)).toEqual([
      'core:brain:use',
      'core:finance:view',
    ]);
    expect(resolveBrainEvalContextPermissions(permissions, 'marketing', candidates)).toEqual([
      'core:marketing:analytics',
    ]);
  });
});
