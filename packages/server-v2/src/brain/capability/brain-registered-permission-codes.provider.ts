import { getRegisteredPermissionCodes } from '../../permissions/permission-catalog.js';

export function loadRegisteredBrainPermissionCodes(): ReadonlySet<string> {
  return getRegisteredPermissionCodes();
}
