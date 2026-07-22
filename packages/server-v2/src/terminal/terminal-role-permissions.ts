export const TERMINAL_ROLE_PERMISSIONS = Object.freeze({
  manager: Object.freeze([
    'aura:manager:view',
    'aura:customer:read',
    'aura:appointment:read',
    'aura:appointment:write',
    'aura:card:consume',
    'aura:cashier:create',
    'aura:card-order:create',
    'aura:recharge:create',
    'aura:refund:create',
    'aura:inventory:read',
    'aura:staff:read',
  ]),
  reception: Object.freeze([
    'aura:reception:view',
    'aura:customer:read',
    'aura:appointment:read',
    'aura:appointment:write',
    'aura:card:consume',
    'aura:cashier:create',
    'aura:card-order:create',
    'aura:recharge:create',
    'aura:refund:create',
  ]),
  beautician: Object.freeze([
    'aura:beautician:view',
    'aura:customer:read',
    'aura:appointment:read',
    'aura:service-record:create',
  ]),
} as const);

export const TERMINAL_PERMISSION_CODES = Object.freeze([
  ...new Set(Object.values(TERMINAL_ROLE_PERMISSIONS).flat()),
]);
