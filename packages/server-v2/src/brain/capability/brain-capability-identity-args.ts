export const FORBIDDEN_CAPABILITY_IDENTITY_ARG_KEYS = [
  'storeid',
  'storeids',
  'currentstoreid',
  'selectedstoreid',
  'targetstoreid',
  'visiblestoreids',
  'shopid',
  'shopids',
  'branchid',
  'branchids',
  'tenantid',
  'tenantids',
  'orgid',
  'organizationid',
  'userid',
  'currentuserid',
  'sessionuserid',
  'actorid',
  'operatorid',
  'principalid',
  'permissions',
  'permissioncodes',
  'deniedpermissions',
  'role',
  'roles',
  'rolehint',
  'activerole',
] as const;

const FORBIDDEN_IDENTITY_ARG_KEYS = new Set<string>(FORBIDDEN_CAPABILITY_IDENTITY_ARG_KEYS);

export function isForbiddenCapabilityIdentityArgKey(value: string): boolean {
  return FORBIDDEN_IDENTITY_ARG_KEYS.has(normalizeIdentityArgKey(value));
}

export function findForbiddenCapabilityIdentityArg(value: unknown): string | undefined {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): string | undefined => {
    if (!current || typeof current !== 'object') return undefined;
    if (seen.has(current)) return undefined;
    seen.add(current);

    try {
      if (Array.isArray(current)) {
        for (const item of current) {
          const forbidden = visit(item);
          if (forbidden) return forbidden;
        }
        return undefined;
      }

      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== 'string') return String(key);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return key;
        if (isForbiddenCapabilityIdentityArgKey(key)) return key;
        const forbidden = visit(descriptor.value);
        if (forbidden) return forbidden;
      }
      return undefined;
    } finally {
      seen.delete(current);
    }
  };

  return visit(value);
}

function normalizeIdentityArgKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
