export const STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION =
  '20260717130000_store_manager_supply_manage_permission';
export const CUSTOMER_SERVICE_FEEDBACK_MIGRATION = '20260717220000_customer_service_feedback_core';
export const CUSTOMER_WAITING_EPISODE_MIGRATION = '20260717233000_customer_waiting_episode_core';
export const BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION =
  '20260718153000_beautician_brain_self_permissions';

export type BrainMigrationPreflightStatus = 'ready' | 'needs_review' | 'blocked' | 'already_applied';
export type BrainMigrationHistoryStatus = 'pending' | 'applied' | 'failed' | 'rolled_back';
export type BrainMigrationCheckStatus = 'pass' | 'warn' | 'fail';

export type BrainMigrationHistoryState = {
  status: BrainMigrationHistoryStatus;
  finishedAt?: string | null;
  rolledBackAt?: string | null;
  logs?: string | null;
};

export type BrainMigrationPreflightInput = {
  migrationTableExists: boolean;
  migrations: Record<
    | typeof STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION
    | typeof CUSTOMER_SERVICE_FEEDBACK_MIGRATION
    | typeof CUSTOMER_WAITING_EPISODE_MIGRATION
    | typeof BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION,
    BrainMigrationHistoryState
  >;
  roleSchema: {
    tableExists: boolean;
    columns: string[];
  };
  storeManagerRole: {
    exists: boolean;
    status: string | null;
    permissions: string[];
  };
  beauticianRole: {
    exists: boolean;
    status: string | null;
    permissions: string[];
  };
  customerFeedbackSchema: {
    tableExists: boolean;
    columns: string[];
    constraints: string[];
    indexes: string[];
  };
  customerWaitingSchema: {
    tableExists: boolean;
    columns: string[];
    constraints: string[];
    indexes: string[];
  };
  dependencies: {
    Store: boolean;
    Customer: boolean;
    Reservation: boolean;
  };
};

export type BrainMigrationPreflightCheck = {
  key: string;
  status: BrainMigrationCheckStatus;
  message: string;
  evidence?: unknown;
};

export type BrainMigrationPreflightItem = {
  migrationName: string;
  status: BrainMigrationPreflightStatus;
  directApplyAllowed: boolean;
  summary: string;
  checks: BrainMigrationPreflightCheck[];
  risks: string[];
  rollbackBoundary: string;
};

export type BrainPendingMigrationPreflightResult = {
  status: BrainMigrationPreflightStatus;
  databaseWritePerformed: false;
  generatedAt: string;
  migrations: BrainMigrationPreflightItem[];
  approval: {
    decisionRequired: boolean;
    allowedDecisions: Array<'approve' | 'modify' | 'reject'>;
    summary: string;
  };
};

export const CUSTOMER_FEEDBACK_REQUIRED_COLUMNS = [
  'id',
  'storeId',
  'customerId',
  'serviceTaskId',
  'reservationId',
  'orderId',
  'beauticianId',
  'projectId',
  'feedbackType',
  'rating',
  'category',
  'severity',
  'content',
  'sourceChannel',
  'status',
  'assignedUserId',
  'handledByUserId',
  'resolutionNote',
  'occurredAt',
  'handledAt',
  'resolvedAt',
  'createdBy',
  'createdAt',
  'updatedAt',
] as const;

export const CUSTOMER_FEEDBACK_REQUIRED_CONSTRAINTS = [
  'customer_service_feedback_pkey',
  'customer_service_feedback_rating_check',
  'customer_service_feedback_type_check',
  'customer_service_feedback_severity_check',
  'customer_service_feedback_status_check',
  'customer_service_feedback_storeId_fkey',
  'customer_service_feedback_customerId_fkey',
] as const;

export const CUSTOMER_FEEDBACK_REQUIRED_INDEXES = [
  'customer_service_feedback_storeId_occurredAt_idx',
  'customer_service_feedback_storeId_feedbackType_status_idx',
  'customer_service_feedback_storeId_rating_idx',
  'customer_service_feedback_customerId_occurredAt_idx',
  'customer_service_feedback_beauticianId_occurredAt_idx',
  'customer_service_feedback_serviceTaskId_idx',
  'customer_service_feedback_reservationId_idx',
  'customer_service_feedback_orderId_idx',
] as const;

export const CUSTOMER_WAITING_REQUIRED_COLUMNS = [
  'id', 'storeId', 'customerId', 'reservationId', 'status', 'outcome', 'leaveReasonCode', 'leaveReasonNote',
  'expectedWaitMinutes', 'actualWaitMinutes', 'startedAt', 'endedAt', 'sourceChannel', 'recordedByUserId',
  'createdAt', 'updatedAt',
] as const;

export const CUSTOMER_WAITING_REQUIRED_CONSTRAINTS = [
  'customer_waiting_episode_pkey',
  'customer_waiting_episode_status_check',
  'customer_waiting_episode_outcome_check',
  'customer_waiting_episode_reason_check',
  'customer_waiting_episode_expected_minutes_check',
  'customer_waiting_episode_actual_minutes_check',
  'customer_waiting_episode_end_check',
  'customer_waiting_episode_storeId_fkey',
  'customer_waiting_episode_customerId_fkey',
  'customer_waiting_episode_reservationId_fkey',
] as const;

export const CUSTOMER_WAITING_REQUIRED_INDEXES = [
  'customer_waiting_episode_active_reservation_key',
  'customer_waiting_episode_storeId_startedAt_idx',
  'customer_waiting_episode_storeId_status_startedAt_idx',
  'customer_waiting_episode_storeId_outcome_leaveReasonCode_startedAt_idx',
  'customer_waiting_episode_reservationId_status_idx',
  'customer_waiting_episode_customerId_startedAt_idx',
] as const;

const ROLE_REQUIRED_COLUMNS = ['key', 'status', 'permissions'] as const;
const SUPPLY_PERMISSION = 'core:supply:manage';
const BEAUTICIAN_BRAIN_SELF_PERMISSIONS = [
  'core:brain:use',
  'core:brain:beautician-view',
  'core:store:reservations',
] as const;

function missing(required: readonly string[], actual: readonly string[]) {
  const actualSet = new Set(actual);
  return required.filter((item) => !actualSet.has(item));
}

function normalizePostgresIdentifier(identifier: string) {
  const maxBytes = 63;
  if (Buffer.byteLength(identifier, 'utf8') <= maxBytes) return identifier;

  let end = identifier.length;
  while (end > 0 && Buffer.byteLength(identifier.slice(0, end), 'utf8') > maxBytes) end -= 1;
  return identifier.slice(0, end);
}

function missingPostgresIdentifiers(required: readonly string[], actual: readonly string[]) {
  const actualSet = new Set(actual.map(normalizePostgresIdentifier));
  return required.filter((item) => !actualSet.has(normalizePostgresIdentifier(item)));
}

function historyCheck(history: BrainMigrationHistoryState): BrainMigrationPreflightCheck {
  if (history.status === 'applied') {
    return {
      key: 'migration_history',
      status: 'pass',
      message: 'Prisma migration 历史已记录该迁移成功应用。',
      evidence: history,
    };
  }
  if (history.status === 'pending') {
    return {
      key: 'migration_history',
      status: 'pass',
      message: '该迁移仍待应用，未发现失败或回滚记录。',
      evidence: history,
    };
  }
  return {
    key: 'migration_history',
    status: 'fail',
    message: `迁移历史状态为 ${history.status}，修复历史前禁止直接执行。`,
    evidence: history,
  };
}

function blockedItem(
  migrationName: string,
  summary: string,
  checks: BrainMigrationPreflightCheck[],
  risks: string[],
  rollbackBoundary: string,
): BrainMigrationPreflightItem {
  return {
    migrationName,
    status: 'blocked',
    directApplyAllowed: false,
    summary,
    checks,
    risks,
    rollbackBoundary,
  };
}

function classifySupplyPermissionMigration(input: BrainMigrationPreflightInput): BrainMigrationPreflightItem {
  const migrationName = STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION;
  const history = input.migrations[migrationName];
  const missingRoleColumns = missing(ROLE_REQUIRED_COLUMNS, input.roleSchema.columns);
  const hasPermission = input.storeManagerRole.permissions.includes(SUPPLY_PERMISSION);
  const checks: BrainMigrationPreflightCheck[] = [
    historyCheck(history),
    {
      key: 'role_schema',
      status: input.roleSchema.tableExists && missingRoleColumns.length === 0 ? 'pass' : 'fail',
      message:
        input.roleSchema.tableExists && missingRoleColumns.length === 0
          ? 'Role 表及迁移所需字段齐全。'
          : 'Role 表或迁移所需字段缺失。',
      evidence: { tableExists: input.roleSchema.tableExists, missingColumns: missingRoleColumns },
    },
    {
      key: 'store_manager_role',
      status: input.storeManagerRole.exists && input.storeManagerRole.status === 'active' ? 'pass' : 'fail',
      message:
        input.storeManagerRole.exists && input.storeManagerRole.status === 'active'
          ? '有效的 store_manager 角色存在。'
          : '缺少有效的 store_manager 角色，迁移 UPDATE 将影响 0 行。',
      evidence: { exists: input.storeManagerRole.exists, status: input.storeManagerRole.status },
    },
    {
      key: 'permission_effect',
      status: hasPermission ? (history.status === 'applied' ? 'pass' : 'warn') : 'pass',
      message: hasPermission
        ? history.status === 'applied'
          ? `store_manager 已拥有 ${SUPPLY_PERMISSION}。`
          : `迁移尚未登记，但 store_manager 已拥有 ${SUPPLY_PERMISSION}。`
        : `store_manager 尚未获得 ${SUPPLY_PERMISSION}。`,
      evidence: { hasPermission },
    },
  ];

  if (!input.migrationTableExists) {
    return blockedItem(
      migrationName,
      '缺少 Prisma migration 历史表。',
      checks,
      ['无法证明权限迁移是否已经执行。'],
      '先恢复或初始化 Prisma migration 历史，再进入执行审批。',
    );
  }
  if (history.status === 'failed' || history.status === 'rolled_back') {
    return blockedItem(
      migrationName,
      '权限迁移存在失败或回滚记录。',
      checks,
      ['未修复迁移历史就重试，会造成权限事实与迁移记录不一致。'],
      '先审查失败记录并修复迁移历史，再重新预检。',
    );
  }
  if (!input.roleSchema.tableExists || missingRoleColumns.length > 0) {
    return blockedItem(
      migrationName,
      'Role schema 不满足迁移合同。',
      checks,
      ['当前 schema 无法执行该 UPDATE。'],
      '先修复 Role schema，再重新预检。',
    );
  }
  if (!input.storeManagerRole.exists || input.storeManagerRole.status !== 'active') {
    return blockedItem(
      migrationName,
      '执行迁移前必须存在有效的 store_manager 角色。',
      checks,
      ['迁移可能被记录为已应用，但实际没有授予任何权限。'],
      '通过角色治理创建或启用 store_manager 后重新预检。',
    );
  }
  if (history.status === 'applied') {
    if (!hasPermission) {
      return blockedItem(
        migrationName,
        '迁移历史显示已应用，但目标权限缺失。',
        checks,
        ['即使迁移历史正常，运行时供应链操作仍会被拒绝。'],
        '通过受治理的角色管理修复权限并保留审计记录。',
      );
    }
    return {
      migrationName,
      status: 'already_applied',
      directApplyAllowed: false,
      summary: '迁移历史与 store_manager 权限效果一致。',
      checks,
      risks: [],
      rollbackBoundary: '无需数据库操作。',
    };
  }
  if (hasPermission) {
    return {
      migrationName,
      status: 'needs_review',
      directApplyAllowed: false,
      summary: '权限效果已经存在，但 Prisma migration 历史仍显示待应用。',
      checks,
      risks: ['需确认权限授予来源，并决定是否通过幂等迁移补齐历史。'],
      rollbackBoundary: '不得自动移除现有权限，必须保留原角色审计链。',
    };
  }
  return {
    migrationName,
    status: 'ready',
    directApplyAllowed: true,
    summary: '有效的 store_manager 已满足授予已注册供应链管理权限的条件。',
    checks,
    risks: ['执行后会扩大 store_manager 对受治理供应链操作的授权范围。'],
    rollbackBoundary: `回滚必须通过受治理的角色管理从 store_manager 移除 ${SUPPLY_PERMISSION}。`,
  };
}

function classifyCustomerFeedbackMigration(input: BrainMigrationPreflightInput): BrainMigrationPreflightItem {
  const migrationName = CUSTOMER_SERVICE_FEEDBACK_MIGRATION;
  const history = input.migrations[migrationName];
  const schema = input.customerFeedbackSchema;
  const missingColumns = missing(CUSTOMER_FEEDBACK_REQUIRED_COLUMNS, schema.columns);
  const missingConstraints = missingPostgresIdentifiers(CUSTOMER_FEEDBACK_REQUIRED_CONSTRAINTS, schema.constraints);
  const missingIndexes = missingPostgresIdentifiers(CUSTOMER_FEEDBACK_REQUIRED_INDEXES, schema.indexes);
  const dependenciesReady = input.dependencies.Store && input.dependencies.Customer;
  const completeSchema =
    schema.tableExists && missingColumns.length === 0 && missingConstraints.length === 0 && missingIndexes.length === 0;
  const checks: BrainMigrationPreflightCheck[] = [
    historyCheck(history),
    {
      key: 'foreign_key_dependencies',
      status: dependenciesReady ? 'pass' : 'fail',
      message: dependenciesReady ? 'Store 与 Customer 依赖表齐全。' : '迁移所需依赖表缺失。',
      evidence: input.dependencies,
    },
    {
      key: 'target_table',
      status: schema.tableExists ? (history.status === 'applied' ? 'pass' : 'fail') : history.status === 'applied' ? 'fail' : 'pass',
      message: schema.tableExists
        ? 'customer_service_feedback 目标表已经存在。'
        : 'customer_service_feedback 尚不存在，不会发生 CREATE TABLE 冲突。',
      evidence: { tableExists: schema.tableExists },
    },
    {
      key: 'target_schema_contract',
      status: schema.tableExists ? (completeSchema ? 'pass' : 'fail') : 'pass',
      message: schema.tableExists
        ? completeSchema
          ? '现有客户反馈表满足字段、约束和索引合同。'
          : '现有客户反馈表结构不完整或已发生漂移。'
        : '待迁移项将创建完整 schema 合同。',
      evidence: { missingColumns, missingConstraints, missingIndexes },
    },
  ];

  if (!input.migrationTableExists) {
    return blockedItem(
      migrationName,
      '缺少 Prisma migration 历史表。',
      checks,
      ['无法证明客户反馈表是否由受治理迁移创建。'],
      '先恢复或初始化 Prisma migration 历史，再进入执行审批。',
    );
  }
  if (history.status === 'failed' || history.status === 'rolled_back') {
    return blockedItem(
      migrationName,
      '客户反馈迁移存在失败或回滚记录。',
      checks,
      ['直接重试可能与部分创建的表、约束或索引冲突。'],
      '先审查并修复残留对象，再重新预检。',
    );
  }
  if (!dependenciesReady) {
    return blockedItem(
      migrationName,
      '缺少 Store 或 Customer 依赖表。',
      checks,
      ['当前 schema 无法创建外键。'],
      '先恢复依赖表，再重新预检。',
    );
  }
  if (history.status === 'applied') {
    if (!completeSchema) {
      return blockedItem(
        migrationName,
        '迁移历史显示已应用，但客户反馈 schema 不完整。',
        checks,
        ['运行时 API 和语义指标会失败，或绕过应有的数据约束。'],
        '通过新的受审查迁移修复 schema 漂移，不得改写已应用历史。',
      );
    }
    return {
      migrationName,
      status: 'already_applied',
      directApplyAllowed: false,
      summary: '迁移历史与客户反馈 schema 一致。',
      checks,
      risks: [],
      rollbackBoundary: '无需数据库操作。',
    };
  }
  if (schema.tableExists) {
    return blockedItem(
      migrationName,
      '迁移历史仍待应用，但目标表已经存在。',
      checks,
      ['直接执行 CREATE TABLE 会失败并中断部署。'],
      '先对比现有表与迁移文件，再选择受审查的结构修复或历史对齐路径。',
    );
  }
  return {
    migrationName,
    status: 'ready',
    directApplyAllowed: true,
    summary: '依赖表齐全，未发现客户反馈 schema 冲突。',
    checks,
    risks: ['迁移将创建一张业务事实表和 8 个索引，应在受控发布窗口执行。'],
    rollbackBoundary: '生产数据采集前可删除新表回滚；产生业务数据后必须先备份并走受审查迁移。',
  };
}

function classifyCustomerWaitingMigration(input: BrainMigrationPreflightInput): BrainMigrationPreflightItem {
  const migrationName = CUSTOMER_WAITING_EPISODE_MIGRATION;
  const history = input.migrations[migrationName];
  const schema = input.customerWaitingSchema;
  const missingColumns = missing(CUSTOMER_WAITING_REQUIRED_COLUMNS, schema.columns);
  const missingConstraints = missingPostgresIdentifiers(CUSTOMER_WAITING_REQUIRED_CONSTRAINTS, schema.constraints);
  const missingIndexes = missingPostgresIdentifiers(CUSTOMER_WAITING_REQUIRED_INDEXES, schema.indexes);
  const dependenciesReady = input.dependencies.Store && input.dependencies.Customer && input.dependencies.Reservation;
  const completeSchema = schema.tableExists && missingColumns.length === 0 && missingConstraints.length === 0 && missingIndexes.length === 0;
  const checks: BrainMigrationPreflightCheck[] = [
    historyCheck(history),
    {
      key: 'waiting_dependencies',
      status: dependenciesReady ? 'pass' : 'fail',
      message: dependenciesReady ? 'Store、Customer 与 Reservation 依赖表齐全。' : '等待事实迁移所需依赖表缺失。',
      evidence: input.dependencies,
    },
    {
      key: 'waiting_target_table',
      status: schema.tableExists ? (history.status === 'applied' ? 'pass' : 'fail') : history.status === 'applied' ? 'fail' : 'pass',
      message: schema.tableExists ? 'customer_waiting_episode 目标表已经存在。' : 'customer_waiting_episode 尚不存在，不会发生 CREATE TABLE 冲突。',
      evidence: { tableExists: schema.tableExists },
    },
    {
      key: 'waiting_schema_contract',
      status: schema.tableExists ? (completeSchema ? 'pass' : 'fail') : 'pass',
      message: schema.tableExists
        ? completeSchema ? '现有等待事实表满足字段、约束和索引合同。' : '现有等待事实表结构不完整或已发生漂移。'
        : '待迁移项将创建完整等待事实 schema 合同。',
      evidence: { missingColumns, missingConstraints, missingIndexes },
    },
  ];
  if (!input.migrationTableExists) {
    return blockedItem(migrationName, '缺少 Prisma migration 历史表。', checks, ['无法证明等待事实表是否由受治理迁移创建。'], '先恢复 Prisma migration 历史，再进入执行审批。');
  }
  if (history.status === 'failed' || history.status === 'rolled_back') {
    return blockedItem(migrationName, '等待事实迁移存在失败或回滚记录。', checks, ['直接重试可能与部分创建对象冲突。'], '先修复残留对象和迁移历史，再重新预检。');
  }
  if (!dependenciesReady) {
    return blockedItem(migrationName, '等待事实迁移依赖不完整。', checks, ['当前 schema 无法创建全部外键。'], '先恢复依赖表，再重新预检。');
  }
  if (history.status === 'applied') {
    if (!completeSchema) {
      return blockedItem(migrationName, '迁移历史显示已应用，但等待事实 schema 不完整。', checks, ['等待流失统计可能缺字段、约束或幂等索引。'], '通过新的受审查迁移修复漂移，不得改写已应用历史。');
    }
    return { migrationName, status: 'already_applied', directApplyAllowed: false, summary: '迁移历史与等待事实 schema 一致。', checks, risks: [], rollbackBoundary: '无需数据库操作。' };
  }
  if (schema.tableExists) {
    return blockedItem(migrationName, '迁移历史仍待应用，但等待事实目标表已经存在。', checks, ['直接执行 CREATE TABLE 会失败。'], '先对比现有表与迁移，再选择结构修复或历史对齐路径。');
  }
  return {
    migrationName,
    status: 'ready',
    directApplyAllowed: true,
    summary: '依赖表齐全，未发现等待事实 schema 冲突。',
    checks,
    risks: ['迁移将创建客户等待业务事实、原因约束和预约级活动等待唯一索引。'],
    rollbackBoundary: '产生真实等待数据前可删表回滚；产生业务数据后必须先备份并走受审查迁移。',
  };
}

function classifyBeauticianBrainSelfPermissionMigration(
  input: BrainMigrationPreflightInput,
): BrainMigrationPreflightItem {
  const migrationName = BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION;
  const history = input.migrations[migrationName];
  const missingRoleColumns = missing(ROLE_REQUIRED_COLUMNS, input.roleSchema.columns);
  const missingPermissions = missing(BEAUTICIAN_BRAIN_SELF_PERMISSIONS, input.beauticianRole.permissions);
  const checks: BrainMigrationPreflightCheck[] = [
    historyCheck(history),
    {
      key: 'role_schema',
      status: input.roleSchema.tableExists && missingRoleColumns.length === 0 ? 'pass' : 'fail',
      message:
        input.roleSchema.tableExists && missingRoleColumns.length === 0
          ? 'Role 表及迁移所需字段齐全。'
          : 'Role 表或迁移所需字段缺失。',
      evidence: { tableExists: input.roleSchema.tableExists, missingColumns: missingRoleColumns },
    },
    {
      key: 'beautician_role',
      status: input.beauticianRole.exists && input.beauticianRole.status === 'active' ? 'pass' : 'fail',
      message:
        input.beauticianRole.exists && input.beauticianRole.status === 'active'
          ? '有效的 beautician 角色存在。'
          : '缺少有效的 beautician 角色，迁移 UPDATE 将影响 0 行。',
      evidence: { exists: input.beauticianRole.exists, status: input.beauticianRole.status },
    },
    {
      key: 'permission_effect',
      status:
        missingPermissions.length === 0 ? (history.status === 'applied' ? 'pass' : 'warn') : 'pass',
      message:
        missingPermissions.length === 0
          ? 'beautician 已具备全部本人范围 Brain 权限。'
          : `beautician 仍缺少 ${missingPermissions.join('、')}。`,
      evidence: { missingPermissions },
    },
  ];

  if (!input.migrationTableExists) {
    return blockedItem(
      migrationName,
      '缺少 Prisma migration 历史表。',
      checks,
      ['无法证明美容师本人范围权限迁移是否已经执行。'],
      '先恢复或初始化 Prisma migration 历史，再进入执行审批。',
    );
  }
  if (history.status === 'failed' || history.status === 'rolled_back') {
    return blockedItem(
      migrationName,
      '美容师 Brain 权限迁移存在失败或回滚记录。',
      checks,
      ['未修复迁移历史就重试，会造成角色权限事实与迁移记录不一致。'],
      '先审查失败记录并修复迁移历史，再重新预检。',
    );
  }
  if (!input.roleSchema.tableExists || missingRoleColumns.length > 0) {
    return blockedItem(
      migrationName,
      'Role schema 不满足迁移合同。',
      checks,
      ['当前 schema 无法执行该 UPDATE。'],
      '先修复 Role schema，再重新预检。',
    );
  }
  if (!input.beauticianRole.exists || input.beauticianRole.status !== 'active') {
    return blockedItem(
      migrationName,
      '执行迁移前必须存在有效的 beautician 角色。',
      checks,
      ['迁移可能被记录为已应用，但实际没有授予任何权限。'],
      '通过角色治理创建或启用 beautician 后重新预检。',
    );
  }
  if (history.status === 'applied') {
    if (missingPermissions.length > 0) {
      return blockedItem(
        migrationName,
        '迁移历史显示已应用，但美容师本人范围权限缺失。',
        checks,
        ['真实美容师账号仍无法使用对应 Ami Brain 能力。'],
        '通过新的受审查迁移修复权限，不得改写已应用历史。',
      );
    }
    return {
      migrationName,
      status: 'already_applied',
      directApplyAllowed: false,
      summary: '迁移历史与 beautician 本人范围权限一致。',
      checks,
      risks: [],
      rollbackBoundary: '无需数据库操作。',
    };
  }
  if (missingPermissions.length === 0) {
    return {
      migrationName,
      status: 'needs_review',
      directApplyAllowed: false,
      summary: '权限效果已经存在，但 Prisma migration 历史仍显示待应用。',
      checks,
      risks: ['需确认权限授予来源，并决定是否通过幂等迁移补齐历史。'],
      rollbackBoundary: '不得自动移除现有权限，必须保留原角色审计链。',
    };
  }
  return {
    migrationName,
    status: 'ready',
    directApplyAllowed: true,
    summary: '有效的 beautician 角色已满足授予本人范围 Ami Brain 权限的条件。',
    checks,
    risks: [
      '执行后美容师可访问 Ami Brain，但能力执行仍受当前门店、登录账号绑定美容师身份和能力声明共同限制。',
    ],
    rollbackBoundary: `回滚必须通过受治理的角色管理移除 ${BEAUTICIAN_BRAIN_SELF_PERMISSIONS.join('、')}。`,
  };
}

function overallStatus(items: BrainMigrationPreflightItem[]): BrainMigrationPreflightStatus {
  if (items.some((item) => item.status === 'blocked')) return 'blocked';
  if (items.some((item) => item.status === 'needs_review')) return 'needs_review';
  if (items.every((item) => item.status === 'already_applied')) return 'already_applied';
  return 'ready';
}

export function buildBrainPendingMigrationPreflight(
  input: BrainMigrationPreflightInput,
  generatedAt = new Date().toISOString(),
): BrainPendingMigrationPreflightResult {
  const migrations = [
    classifySupplyPermissionMigration(input),
    classifyCustomerFeedbackMigration(input),
    classifyCustomerWaitingMigration(input),
    classifyBeauticianBrainSelfPermissionMigration(input),
  ];
  const status = overallStatus(migrations);
  const directApplyCount = migrations.filter((item) => item.directApplyAllowed).length;
  return {
    status,
    databaseWritePerformed: false,
    generatedAt,
    migrations,
    approval: {
      decisionRequired: status === 'ready' || status === 'needs_review',
      allowedDecisions: ['approve', 'modify', 'reject'],
      summary:
        status === 'ready'
          ? `${directApplyCount} 条待迁移项通过只读预检，可以进入执行审批。`
          : status === 'needs_review'
            ? '至少一条迁移需要先审查来源或历史，再进入审批。'
            : status === 'already_applied'
              ? '目标迁移均已应用并验证，无需再次审批。'
              : '至少一条迁移被阻断；修复失败检查前不得开放执行审批。',
    },
  };
}
