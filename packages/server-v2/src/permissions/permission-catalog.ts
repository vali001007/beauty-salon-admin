export type RegisteredPermissionPlatform = 'core' | 'assist' | 'terminal';
export type RegisteredPermissionType = 'menu' | 'operation' | 'action' | 'api';
export type RegisteredPermissionRisk = 'low' | 'medium' | 'high' | 'critical';

export interface RegisteredPermissionDefinition {
  code: string;
  name: string;
  platform: RegisteredPermissionPlatform;
  module: string;
  type: RegisteredPermissionType;
  riskLevel: RegisteredPermissionRisk;
  description: string;
}

const REGISTERED_PERMISSION_CODE_LIST = [
  'core:dashboard:view', 'core:agent:view', 'core:agent-governance:view', 'core:agent-governance:manage',
  'core:brain:use', 'core:brain:execute', 'core:brain:beautician-view', 'core:brain:sensitive:view',
  'core:brain-governance:view', 'core:brain-governance:manage', 'core:customer:view', 'core:customer:create',
  'core:customer:update', 'core:customer:delete', 'core:customer:export', 'core:customer:profile',
  'core:customer:script', 'core:marketing:view', 'core:marketing:create', 'core:marketing:update',
  'core:marketing:delete', 'core:marketing:recommend', 'core:marketing:template', 'core:marketing:analytics',
  'core:store:view', 'core:store:projects', 'core:store:project-types', 'core:store:beauticians',
  'core:store:beautician-levels', 'core:store:scheduling', 'core:store:scheduling:smart',
  'core:store:scheduling:publish', 'core:store:scheduling:rollback', 'core:store:scheduling:config',
  'core:store:scheduling:gap:view', 'core:store:scheduling:gap:task', 'core:store:scheduling:gap:draft',
  'core:store:scheduling:gap:config', 'core:store:reservations', 'core:goods:types', 'core:goods:products',
  'core:goods:cards', 'core:order:products', 'core:order:projects', 'core:order:member-cards',
  'core:order:card-orders', 'core:order:card-usage', 'core:order:create', 'core:order:update',
  'core:order:refund', 'core:project-order-profit:view', 'core:product-order-profit:view',
  'core:card-order-profit:view', 'core:inventory:products', 'core:inventory:stock',
  'core:inventory:adjustment', 'core:inventory:stocktake', 'core:inventory:purchase',
  'core:inventory:expiry', 'core:inventory:transfer', 'core:inventory:consumption', 'core:finance:view',
  'core:finance:manage', 'core:finance:export', 'core:platform-revenue:view', 'core:operation-profit:view',
  'core:operation-profit:export', 'core:operation-cost:view', 'core:operation-cost:manage',
  'core:product-margin:view', 'core:project-margin:view', 'core:prepaid-liability:view',
  'core:beautician-performance:view', 'core:supply:view', 'core:supply:manage', 'core:supply:supplier',
  'core:industry:view', 'core:industry:manage', 'core:industry:data-source', 'core:industry:service-template',
  'core:industry:bom-template', 'core:industry:product-template', 'core:industry:salary',
  'core:industry:knowledge', 'core:industry:adoption', 'core:industry:supply-mapping', 'core:system:users',
  'core:system:roles', 'core:system:permissions', 'core:system:stores', 'core:system:logs', 'core:system:view',
  'assist:chat:view', 'assist:chat:reply', 'assist:booking:create', 'assist:followup:create',
  'terminal:device:login', 'terminal:service:view', 'terminal:service:start', 'terminal:service:complete',
  'terminal:skin:record', 'aura:manager:view', 'aura:reception:view', 'aura:beautician:view',
  'aura:customer:read', 'aura:appointment:read', 'aura:appointment:write', 'aura:card:consume',
  'aura:cashier:create', 'aura:card-order:create', 'aura:recharge:create', 'aura:service-record:create',
  'aura:inventory:read', 'aura:staff:read',
] as const;

const HIGH_RISK_ACTIONS = new Set(['delete', 'refund', 'rollback', 'adjustment', 'complete', 'write', 'consume']);
const MEDIUM_RISK_ACTIONS = new Set(['create', 'update', 'manage', 'publish', 'start', 'task', 'draft', 'config', 'export']);

function inferDefinition(code: string): RegisteredPermissionDefinition {
  const parts = code.split(':');
  const namespace = parts[0];
  const action = parts.at(-1) ?? 'view';
  const module = parts.slice(1, -1).join(':') || parts[1] || namespace;
  const platform: RegisteredPermissionPlatform = namespace === 'assist'
    ? 'assist'
    : namespace === 'terminal' || namespace === 'aura'
      ? 'terminal'
      : 'core';
  const riskLevel: RegisteredPermissionRisk = HIGH_RISK_ACTIONS.has(action)
    ? 'high'
    : MEDIUM_RISK_ACTIONS.has(action)
      ? 'medium'
      : 'low';
  const type: RegisteredPermissionType = action === 'view'
    ? 'menu'
    : action === 'read' || action === 'login'
      ? 'api'
      : riskLevel === 'high'
        ? 'action'
        : 'operation';
  return { code, name: code, platform, module, type, riskLevel, description: `后端统一权限目录：${code}` };
}

export const REGISTERED_PERMISSION_DEFINITIONS: readonly RegisteredPermissionDefinition[] = Object.freeze(
  REGISTERED_PERMISSION_CODE_LIST.map(inferDefinition),
);

export function getRegisteredPermissionCodes(): ReadonlySet<string> {
  return new Set(REGISTERED_PERMISSION_CODE_LIST);
}

export function listRegisteredPermissionDefinitions(): readonly RegisteredPermissionDefinition[] {
  return REGISTERED_PERMISSION_DEFINITIONS;
}
