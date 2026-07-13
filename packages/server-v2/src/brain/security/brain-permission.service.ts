import { Injectable } from '@nestjs/common';

interface SkillPermissionInput {
  userPermissions: string[];
  userDeniedPermissions: string[];
  requiredPermissions: string[];
}

export interface SkillPermissionResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class BrainPermissionService {
  canUseSkill(input: SkillPermissionInput): SkillPermissionResult {
    for (const permission of input.requiredPermissions) {
      if (input.userDeniedPermissions.includes(permission) || input.userDeniedPermissions.includes('*')) {
        return { allowed: false, reason: `denied_permission:${permission}` };
      }

      if (input.userPermissions.includes('*') || input.userPermissions.includes(permission)) {
        continue;
      }

      return { allowed: false, reason: `missing_permission:${permission}` };
    }

    return { allowed: true };
  }

  assertStoreScope(storeId: number, visibleStoreIds: number[]): SkillPermissionResult {
    if (visibleStoreIds.includes(storeId)) return { allowed: true };
    return { allowed: false, reason: `store_scope_denied:${storeId}` };
  }
}
