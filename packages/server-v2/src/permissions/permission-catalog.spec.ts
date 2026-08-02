import {
  getRegisteredPermissionCodes,
  isRoleAssignablePermission,
  listRegisteredPermissionDefinitions,
} from './permission-catalog.js';

describe('permission catalog', () => {
  it('registers receipt ingest as a machine-only permission without exposing it to role editors', () => {
    const machinePermission = 'core:brain-governance:receipt-ingest';

    expect(getRegisteredPermissionCodes().has(machinePermission)).toBe(true);
    expect(isRoleAssignablePermission(machinePermission)).toBe(false);
    expect(listRegisteredPermissionDefinitions().some((item) => item.code === machinePermission)).toBe(false);
    expect(isRoleAssignablePermission('core:brain-governance:manage')).toBe(true);
  });
});
