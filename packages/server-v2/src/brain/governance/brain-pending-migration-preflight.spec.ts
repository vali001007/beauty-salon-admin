import {
  buildBrainPendingMigrationPreflight,
  CUSTOMER_FEEDBACK_REQUIRED_COLUMNS,
  CUSTOMER_FEEDBACK_REQUIRED_CONSTRAINTS,
  CUSTOMER_FEEDBACK_REQUIRED_INDEXES,
  CUSTOMER_SERVICE_FEEDBACK_MIGRATION,
  STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION,
  type BrainMigrationPreflightInput,
} from './brain-pending-migration-preflight.js';

type InputOverrides = Omit<Partial<BrainMigrationPreflightInput>, 'migrations'> & {
  migrations?: Partial<BrainMigrationPreflightInput['migrations']>;
};

function input(overrides: InputOverrides = {}): BrainMigrationPreflightInput {
  const base: BrainMigrationPreflightInput = {
    migrationTableExists: true,
    migrations: {
      [STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION]: { status: 'pending' },
      [CUSTOMER_SERVICE_FEEDBACK_MIGRATION]: { status: 'pending' },
    },
    roleSchema: { tableExists: true, columns: ['key', 'status', 'permissions'] },
    storeManagerRole: { exists: true, status: 'active', permissions: ['core:supply:view'] },
    customerFeedbackSchema: { tableExists: false, columns: [], constraints: [], indexes: [] },
    dependencies: { Store: true, Customer: true },
  };
  return {
    ...base,
    ...overrides,
    migrations: { ...base.migrations, ...overrides.migrations },
    roleSchema: { ...base.roleSchema, ...overrides.roleSchema },
    storeManagerRole: { ...base.storeManagerRole, ...overrides.storeManagerRole },
    customerFeedbackSchema: { ...base.customerFeedbackSchema, ...overrides.customerFeedbackSchema },
    dependencies: { ...base.dependencies, ...overrides.dependencies },
  };
}

describe('brain pending migration preflight', () => {
  it('marks both clean pending migrations ready without performing a write', () => {
    const result = buildBrainPendingMigrationPreflight(input(), '2026-07-17T00:00:00.000Z');

    expect(result.status).toBe('ready');
    expect(result.databaseWritePerformed).toBe(false);
    expect(result.approval).toMatchObject({ decisionRequired: true, allowedDecisions: ['approve', 'modify', 'reject'] });
    expect(result.migrations.every((item) => item.directApplyAllowed)).toBe(true);
  });

  it('blocks the permission migration when store_manager is absent', () => {
    const result = buildBrainPendingMigrationPreflight(input({ storeManagerRole: { exists: false, status: null, permissions: [] } }));

    expect(result.status).toBe('blocked');
    expect(result.migrations[0]).toMatchObject({ status: 'blocked', directApplyAllowed: false });
    expect(result.migrations[0].summary).toContain('store_manager');
  });

  it('requires review when the permission effect predates migration history', () => {
    const result = buildBrainPendingMigrationPreflight(
      input({ storeManagerRole: { exists: true, status: 'active', permissions: ['core:supply:manage'] } }),
    );

    expect(result.status).toBe('needs_review');
    expect(result.migrations[0]).toMatchObject({ status: 'needs_review', directApplyAllowed: false });
  });

  it('blocks a pending customer feedback migration when the target table already exists', () => {
    const result = buildBrainPendingMigrationPreflight(
      input({ customerFeedbackSchema: { tableExists: true, columns: ['id'], constraints: [], indexes: [] } }),
    );

    expect(result.status).toBe('blocked');
    expect(result.migrations[1].summary).toContain('已经存在');
  });

  it('blocks customer feedback migration when a foreign-key dependency is missing', () => {
    const result = buildBrainPendingMigrationPreflight(input({ dependencies: { Store: true, Customer: false } }));

    expect(result.status).toBe('blocked');
    expect(result.migrations[1].summary).toContain('依赖');
  });

  it('accepts fully aligned applied migrations as already applied', () => {
    const result = buildBrainPendingMigrationPreflight(
      input({
        migrations: {
          [STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION]: { status: 'applied', finishedAt: '2026-07-17T01:00:00.000Z' },
          [CUSTOMER_SERVICE_FEEDBACK_MIGRATION]: { status: 'applied', finishedAt: '2026-07-17T01:00:01.000Z' },
        },
        storeManagerRole: { exists: true, status: 'active', permissions: ['core:supply:manage'] },
        customerFeedbackSchema: {
          tableExists: true,
          columns: [...CUSTOMER_FEEDBACK_REQUIRED_COLUMNS],
          constraints: [...CUSTOMER_FEEDBACK_REQUIRED_CONSTRAINTS],
          indexes: [...CUSTOMER_FEEDBACK_REQUIRED_INDEXES],
        },
      }),
    );

    expect(result.status).toBe('already_applied');
    expect(result.approval.decisionRequired).toBe(false);
    expect(result.migrations.every((item) => item.status === 'already_applied')).toBe(true);
  });

  it('blocks schema drift when history says customer feedback migration is applied', () => {
    const result = buildBrainPendingMigrationPreflight(
      input({
        migrations: { [CUSTOMER_SERVICE_FEEDBACK_MIGRATION]: { status: 'applied' } },
        customerFeedbackSchema: { tableExists: true, columns: ['id'], constraints: [], indexes: [] },
      }),
    );

    expect(result.status).toBe('blocked');
    expect(result.migrations[1].summary).toContain('不完整');
  });

  it('blocks failed migration history instead of recommending a retry', () => {
    const result = buildBrainPendingMigrationPreflight(
      input({ migrations: { [STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION]: { status: 'failed', logs: 'boom' } } }),
    );

    expect(result.status).toBe('blocked');
    expect(result.migrations[0].checks[0]).toMatchObject({ status: 'fail' });
  });
});
