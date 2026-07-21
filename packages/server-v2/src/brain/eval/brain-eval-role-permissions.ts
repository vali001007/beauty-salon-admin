import type { AgentQuestionBankPersona } from '../../agent/agent-eval-question-bank.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

export type BrainEvalRolePermissionMap = ReadonlyMap<string, readonly string[]>;

export function buildBrainEvalRolePermissionMap(
  roles: Array<{ key: string; permissions: readonly string[] }>,
): BrainEvalRolePermissionMap {
  return new Map(
    roles.map((role) => [role.key, Object.freeze([...new Set(role.permissions)].sort())] as const),
  );
}

export function resolveBrainEvalRolePermissions(
  permissionsByRole: BrainEvalRolePermissionMap,
  roleKey: string,
): readonly string[] {
  const permissions = permissionsByRole.get(roleKey);
  if (!permissions) throw new Error(`brain_eval_role_not_registered:${roleKey}`);
  return permissions;
}

export function resolveBrainEvalQuestionRole(
  evaluationRoleKey: string,
  persona: AgentQuestionBankPersona,
): string {
  if (evaluationRoleKey !== 'persona') return evaluationRoleKey;
  if (persona === 'marketing') return 'marketing';
  if (persona === 'reception') return 'receptionist';
  if (persona === 'beautician') return 'beautician';
  if (persona === 'inventory') return 'inventory';
  if (persona === 'finance') return 'finance';
  return 'store_manager';
}

export function resolveBrainEvalContextPermissions(
  permissionsByRole: BrainEvalRolePermissionMap,
  roleKey: string,
  capabilityCandidates: readonly BrainCapabilityCandidate[] = [],
): readonly string[] {
  const backendPermissions = permissionsByRole.get(roleKey) ?? [];
  const candidatePermissions = capabilityCandidates
    .filter((candidate) => {
      if (!Array.isArray(candidate.allowedRoles)) return false;
      const allowedRoles = strings(candidate.allowedRoles);
      return allowedRoles.length === 0 || allowedRoles.includes('*') || allowedRoles.includes(roleKey);
    })
    .flatMap((candidate) => strings(candidate.requiredPermissions));
  const permissions = [...new Set([...backendPermissions, ...candidatePermissions])].sort();
  if (permissions.length === 0) throw new Error(`brain_eval_role_not_registered:${roleKey}`);
  return Object.freeze(permissions);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}
