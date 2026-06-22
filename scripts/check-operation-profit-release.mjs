import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredFiles = [
  'packages/server-v2/src/operation-profit/operation-profit.module.ts',
  'packages/server-v2/src/operation-profit/operation-profit.controller.ts',
  'packages/server-v2/src/operation-profit/operation-profit.service.ts',
  'packages/server-v2/src/operation-profit/operation-costs.controller.ts',
  'packages/server-v2/src/operation-profit/operation-costs.service.ts',
  'packages/server-v2/src/operation-profit/operation-profit.controller.spec.ts',
  'packages/server-v2/src/operation-profit/operation-profit.service.spec.ts',
  'packages/server-v2/src/operation-profit/operation-costs.controller.spec.ts',
  'packages/server-v2/src/operation-profit/operation-costs.service.spec.ts',
  'packages/server-v2/tsconfig.operation-profit-scripts.json',
  'packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts',
  'packages/server-v2/prisma/operation-profit-confirmation-template.ts',
  'packages/server-v2/prisma/operation-profit-staff-user-backfill.ts',
  'packages/server-v2/prisma/operation-profit-staff-user-template.ts',
  'src/app/pages/operation-profit/OperationProfitOverview.tsx',
  'src/app/pages/operation-profit/OperationProfitOverview.test.tsx',
  'src/app/pages/operation-profit/ProductMarginAnalysis.tsx',
  'src/app/pages/operation-profit/ProjectMarginAnalysis.tsx',
  'src/app/pages/operation-profit/MarginAnalysis.test.tsx',
  'src/app/pages/operation-profit/PrepaidLiabilityAnalysis.tsx',
  'src/app/pages/operation-profit/BeauticianPerformance.tsx',
  'src/app/pages/operation-profit/OperationCostSettings.tsx',
  'src/app/pages/operation-profit/OperationCostSettings.test.tsx',
  'src/app/pages/operation-profit/OperationProfitRiskPages.test.tsx',
  'src/api/operationProfit.ts',
  'src/api/real/operationProfit.ts',
  'src/api/real/operationProfit.test.ts',
  'src/types/operationProfit.ts',
  'docs/03-开发计划/经营利润一级模块下一步详细计划.md',
  'docs/03-开发计划/经营利润一级模块提交前差异清单.md',
  'docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md',
  'docs/03-开发计划/经营利润一级模块PR草稿.md',
  'docs/04-测试数据/经营利润页面验收记录模板.md',
  'docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md',
  'docs/04-测试数据/经营利润真实迁移与写库执行记录.md',
  'docs/04-测试数据/经营利润当前验收阻断快照.md',
  'docs/04-测试数据/经营利润业务确认包执行清单.md',
  'docs/04-测试数据/经营利润业务确认后真实写库手册.md',
  'docs/04-测试数据/经营利润业务确认包填报单.md',
  'docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md',
  'docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md',
  'docs/04-测试数据/经营利润项目BOM缺口确认清单.md',
  'docs/04-测试数据/经营利润毛利抽样复算验收记录.md',
  'docs/04-测试数据/经营利润页面技术预检记录.md',
  'docs/04-测试数据/operation-profit-assignee-candidates.pending.json',
  'docs/04-测试数据/operation-profit-assignee-manual-review.pending.json',
  'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
  'docs/04-测试数据/operation-profit-staff-user-create.pending.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-beautician-user-bindings-confirmed.draft.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-project-master-confirmed.draft.json',
  'docs/04-测试数据/operation-profit-confirmation-drafts/README.md',
  'docs/04-测试数据/operation-profit-project-master-candidates.pending.json',
  'docs/04-测试数据/operation-profit-project-master-historical-exception.example.json',
];

const requiredMigrations = [
  '20260619093000_operation_profit',
  '20260619110000_commission_rule_user',
  '20260619113000_commission_staff_user',
  '20260619121500_member_card_operator',
  '20260619124500_customer_card_operator',
  '20260619131500_operation_profit_query_indexes',
];

const requiredPackageScripts = [
  'operation-profit:audit',
  'operation-profit:assignee-audit',
  'operation-profit:assignee-backfill',
  'operation-profit:backfill',
  'operation-profit:beautician-user-audit',
  'operation-profit:beautician-user-backfill',
  'operation-profit:bom-audit',
  'operation-profit:confirmation-audit',
  'operation-profit:confirmation-template',
  'operation-profit:confirmation-workbook',
  'operation-profit:confirmed-dry-run',
  'operation-profit:cost-seed',
  'operation-profit:project-master-backfill',
  'operation-profit:readiness',
  'operation-profit:sample-reconcile',
  'operation-profit:scripts:typecheck',
  'operation-profit:staff-user-backfill',
  'operation-profit:staff-user-template',
];

const requiredRootScripts = [
  'check:operation-profit',
  'check:operation-profit:frontend',
  'check:operation-profit:build',
  'check:operation-profit:whitespace',
  'check:operation-profit:full',
];

const requiredRoutes = [
  ['operation-profit/overview', 'core:operation-profit:view'],
  ['operation-profit/product-margins', 'core:product-margin:view'],
  ['operation-profit/project-margins', 'core:project-margin:view'],
  ['operation-profit/prepaid-liabilities', 'core:prepaid-liability:view'],
  ['operation-profit/beautician-performance', 'core:beautician-performance:view'],
  ['operation-profit/costs', 'core:operation-cost:view'],
];

const requiredMenuItems = [
  ['/operation-profit/overview', 'core:operation-profit:view'],
  ['/operation-profit/product-margins', 'core:product-margin:view'],
  ['/operation-profit/project-margins', 'core:project-margin:view'],
  ['/operation-profit/prepaid-liabilities', 'core:prepaid-liability:view'],
  ['/operation-profit/beautician-performance', 'core:beautician-performance:view'],
  ['/operation-profit/costs', 'core:operation-cost:view'],
];

const requiredPermissionCodes = [
  'core:operation-profit:view',
  'core:product-margin:view',
  'core:project-margin:view',
  'core:prepaid-liability:view',
  'core:beautician-performance:view',
  'core:operation-cost:view',
  'core:operation-cost:manage',
];

const requiredApiExports = [
  './operationProfit',
  'realGetOperationProfitOverview',
  'realGetProductMargins',
  'realGetProjectMargins',
  'realGetPrepaidLiabilities',
  'realGetBeauticianPerformance',
  'realGetOperationCosts',
  'realCreateOperationCost',
  'realUpdateOperationCost',
  'realDeleteOperationCost',
  'realCopyOperationCostsFromPreviousMonth',
];

const requiredReadinessChecks = [
  'required_prisma_migrations',
  'schema_migration_columns',
  'schema_migration_indexes',
  'operating_cost_migration',
  'operating_cost_data',
  'margin_source_orders',
  'product_cost_data',
  'project_master_data',
  'project_bom_data',
  'assignee_data',
  'commission_data',
  'commission_rule_coverage',
];

const violations = [];

function repoPath(path) {
  return join(root, ...path.split('/'));
}

function read(path) {
  return readFileSync(repoPath(path), 'utf8');
}

function requireFile(path) {
  if (!existsSync(repoPath(path))) {
    violations.push(`缺少文件：${path}`);
  }
}

function requireIncludes(file, text, label = text) {
  const content = read(file);
  if (!content.includes(text)) {
    violations.push(`${file} 缺少 ${label}`);
  }
}

function requireRegex(file, pattern, label) {
  const content = read(file);
  if (!pattern.test(content)) {
    violations.push(`${file} 缺少 ${label}`);
  }
}

for (const file of requiredFiles) {
  requireFile(file);
}

for (const migration of requiredMigrations) {
  requireFile(`packages/server-v2/prisma/migrations/${migration}/migration.sql`);
}

const serverPackage = JSON.parse(read('packages/server-v2/package.json'));
for (const script of requiredPackageScripts) {
  if (!serverPackage.scripts?.[script]) {
    violations.push(`packages/server-v2/package.json 缺少 script ${script}`);
  }
}

const rootPackage = JSON.parse(read('package.json'));
for (const script of requiredRootScripts) {
  if (!rootPackage.scripts?.[script]) {
    violations.push(`package.json 缺少 script ${script}`);
  }
}
if (!String(rootPackage.scripts?.['check:operation-profit:full'] ?? '').includes('--runInBand')) {
  violations.push('package.json check:operation-profit:full 必须使用 Jest --runInBand，避免 Windows worker spawn EPERM');
}
if (!String(rootPackage.scripts?.['check:operation-profit:full'] ?? '').includes('operation-profit:scripts:typecheck')) {
  violations.push('package.json check:operation-profit:full 必须串行执行 operation-profit:scripts:typecheck');
}
if (!String(rootPackage.scripts?.['check:operation-profit:full'] ?? '').includes('check:operation-profit:frontend')) {
  violations.push('package.json check:operation-profit:full 必须串行执行 check:operation-profit:frontend');
}
if (!String(rootPackage.scripts?.['check:operation-profit:full'] ?? '').includes('check:operation-profit:whitespace')) {
  violations.push('package.json check:operation-profit:full 必须串行执行 check:operation-profit:whitespace');
}
if (!String(rootPackage.scripts?.['check:operation-profit:full'] ?? '').includes('check:operation-profit:build')) {
  violations.push('package.json check:operation-profit:full 必须串行执行 check:operation-profit:build');
}
if (!String(rootPackage.scripts?.['check:operation-profit:build'] ?? '').includes('npm.cmd --prefix packages/server-v2 run build')) {
  violations.push('package.json check:operation-profit:build 必须执行 server-v2 后端构建');
}
if (!String(rootPackage.scripts?.['check:operation-profit:build'] ?? '').includes('npm.cmd run build')) {
  violations.push('package.json check:operation-profit:build 必须执行管理端前端构建');
}
if (!String(rootPackage.scripts?.['check:operation-profit:whitespace'] ?? '').includes('git diff --check')) {
  violations.push('package.json check:operation-profit:whitespace 必须执行 git diff --check');
}
for (const frontendTest of [
  'src/app/pages/operation-profit/OperationProfitOverview.test.tsx',
  'src/app/pages/operation-profit/MarginAnalysis.test.tsx',
  'src/app/pages/operation-profit/OperationCostSettings.test.tsx',
  'src/app/pages/operation-profit/OperationProfitRiskPages.test.tsx',
  'src/api/real/operationProfit.test.ts',
  'src/test/permissions.test.ts',
  'src/test/api.test.ts',
]) {
  if (!String(rootPackage.scripts?.['check:operation-profit:frontend'] ?? '').includes(frontendTest)) {
    violations.push(`package.json check:operation-profit:frontend 缺少 ${frontendTest}`);
  }
}

for (const [path, permission] of requiredRoutes) {
  requireRegex('src/app/routes.tsx', new RegExp(`path:\\s*['"]${path.replaceAll('/', '\\/')}['"][\\s\\S]*?permission:\\s*['"]${permission}['"]`), `路由 ${path} 权限 ${permission}`);
}

for (const [path, permission] of requiredMenuItems) {
  requireRegex('src/app/components/Layout.tsx', new RegExp(`path:\\s*['"]${path.replaceAll('/', '\\/')}['"][\\s\\S]*?permission:\\s*['"]${permission}['"]`), `菜单 ${path} 权限 ${permission}`);
}

for (const permission of requiredPermissionCodes) {
  requireIncludes('src/config/permissions.ts', permission, `权限码 ${permission}`);
}

for (const exportName of requiredApiExports) {
  const file = exportName === './operationProfit' ? 'src/api/index.ts' : 'src/api/real/operationProfit.ts';
  requireIncludes(file, exportName, `API 导出 ${exportName}`);
}

for (const migration of requiredMigrations) {
  requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', migration, `readiness 必需 migration ${migration}`);
  requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', migration, `发布清单 migration ${migration}`);
}

for (const check of requiredReadinessChecks) {
  requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', check, `readiness 检查 ${check}`);
  requireIncludes('docs/03-开发计划/经营利润一级模块下一步详细计划.md', check, `下一步计划 readiness 检查 ${check}`);
}

requireIncludes(
  'docs/03-开发计划/经营利润一级模块下一步详细计划.md',
  '显式传入 4 个核心正式确认 JSON 的 `operation-profit:confirmation-audit --requireReady --summaryOnly`',
  '下一步计划最小清单要求确认包预检显式传确认 JSON',
);
requireIncludes(
  'docs/03-开发计划/经营利润一级模块下一步详细计划.md',
  '显式传入 4 个核心正式确认 JSON 的 `operation-profit:confirmed-dry-run --summaryOnly`',
  '下一步计划最小清单要求确认后 dry-run 显式传确认 JSON',
);
requireIncludes(
  'docs/03-开发计划/经营利润一级模块下一步详细计划.md',
  '文件路径不能是 `.pending.json`、`.draft.json` 或 `operation-profit-confirmation-drafts/`',
  '下一步计划说明 apply 拒绝 pending/draft 文件路径',
);

requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'ProductOrder_storeId_createdAt_idx', 'readiness 索引存在性检查');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'evaluateCommissionRuleCoverage', 'readiness 提成规则覆盖检查函数');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'assigneeManualReviewFile', 'readiness 支持服务人无候选确认包');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'historical_exception', 'readiness 识别已确认历史异常服务人缺口');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'confirmedExceptionGaps', 'readiness 输出已确认异常缺口数量');
requireIncludes('packages/server-v2/prisma/operation-profit-sample-reconcile.ts', 'missing_project_master', '抽样复算项目档案缺失原因');
requireIncludes('packages/server-v2/prisma/operation-profit-sample-reconcile.ts', 'projectMasterGapItems', '抽样复算项目档案缺失全量摘要');
requireIncludes('packages/server-v2/prisma/operation-profit-sample-reconcile.ts', 'missing_commission_rule', '抽样复算提成规则缺口原因');
requireIncludes('packages/server-v2/prisma/operation-profit-sample-reconcile.ts', 'legacy_without_user_scope', '抽样复算迁移前缺 userId 降级模式');
requireIncludes('packages/server-v2/prisma/operation-profit-sample-reconcile.ts', 'columnExists', '抽样复算 schema 列兼容检查');
requireIncludes('packages/server-v2/prisma/operation-profit-cost-seed.ts', 'information_schema.tables', '成本 seed 迁移前表存在性预检');
requireIncludes('packages/server-v2/prisma/operation-profit-cost-seed.ts', 'schemaPrecheck', '成本 seed 迁移前 schemaPrecheck 输出');
requireIncludes('packages/server-v2/prisma/operation-profit-bom-audit.ts', "mode: 'read-only'", 'BOM 缺口审计只读模式');
requireIncludes('packages/server-v2/prisma/operation-profit-bom-audit.ts', 'referenceTemplates', 'BOM 缺口审计参考模板');
requireIncludes('packages/server-v2/prisma/operation-profit-bom-audit.ts', 'relatedStockMovements', 'BOM 缺口审计关联耗材流水');
requireIncludes('packages/server-v2/prisma/operation-profit-bom-audit.ts', 'project_not_found', 'BOM 缺口审计项目身份诊断');
requireIncludes('packages/server-v2/prisma/operation-profit-audit.ts', 'projectItemsMissingProjectMaster', '审计脚本项目档案缺失数量');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', 'project_master_data', 'readiness 项目档案缺失检查');
requireRegex('packages/server-v2/prisma/operation-profit-cost-seed.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.operatingCost\.create/, '成本 seed 写库必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.orderItem\.update/, '服务人归属写回必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', /args\.apply && !args\.storeId[\s\S]*?--storeId[\s\S]*?避免跨门店误写/, '服务人归属写回 apply 必须指定 storeId');
requireRegex('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', /pending_business_confirmation[\s\S]*?args\.apply[\s\S]*?unconfirmedBusinessApproval/, '服务人归属写回 apply 拒绝未业务确认候选');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', '业务确认人', '服务人归属写回拒绝占位确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', "includes('todo')", '服务人归属写回拒绝包含 TODO 的确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', '不能使用 pending/draft 确认文件', '服务人归属写回 apply 拒绝 pending/draft 文件路径');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', 'manualReviewItems', '服务人归属写回支持无候选人工查证 JSON');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-backfill.ts', "resolution === 'assign'", '服务人归属写回只处理人工查证 assign 结论');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-audit.ts', 'candidateDraft', '服务人归属审计输出候选草稿');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-audit.ts', 'manualReviewDraft', '服务人归属审计输出无候选人工查证草稿');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-audit.ts', 'pending_business_confirmation', '服务人归属候选草稿未确认保护标记');
requireIncludes('packages/server-v2/prisma/operation-profit-assignee-audit.ts', 'candidateDraftAssignments', '服务人归属候选草稿数量摘要');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-audit.ts', 'bindingDraft', '美容师账号绑定审计输出候选草稿');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-audit.ts', 'pending_business_confirmation', '美容师账号绑定候选未确认保护标记');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-audit.ts', 'missingUserBindingNoCandidates', '美容师账号绑定审计输出无账号候选缺口');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-audit.ts', 'missingUserBindingNoCandidateItems', '美容师账号绑定审计汇总无账号候选数量');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-audit.ts', 'create_or_bind_staff_user', '美容师账号绑定审计提示需创建或补绑定员工账号');
requireRegex('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.beautician\.update/, '美容师账号绑定写回必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', /args\.apply && !args\.storeId[\s\S]*?--storeId[\s\S]*?避免跨门店误写/, '美容师账号绑定 apply 必须指定 storeId');
requireRegex('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', /pending_business_confirmation[\s\S]*?args\.apply[\s\S]*?unconfirmedBusinessApproval/, '美容师账号绑定 apply 拒绝未业务确认候选');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', '业务确认人', '美容师账号绑定写回拒绝占位确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', "includes('todo')", '美容师账号绑定写回拒绝包含 TODO 的确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-beautician-user-backfill.ts', '不能使用 pending/draft 确认文件', '美容师账号绑定 apply 拒绝 pending/draft 文件路径');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-template.ts', 'missingUserBindingNoCandidates', '员工账号创建模板读取无账号候选缺口');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-template.ts', 'operation-profit-staff-user-create.pending.json', '员工账号创建模板默认输出 pending JSON');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-template.ts', 'pending_business_confirmation', '员工账号创建模板保留未确认标记');
requireRegex('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.user\.create/, '员工账号创建写回必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', /args\.apply && !args\.storeId[\s\S]*?--storeId[\s\S]*?避免跨门店误写/, '员工账号创建 apply 必须指定 storeId');
requireRegex('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', /pending_business_confirmation[\s\S]*?args\.apply[\s\S]*?unconfirmedBusinessApproval/, '员工账号创建 apply 拒绝未业务确认候选');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', 'OPERATION_PROFIT_NEW_STAFF_DEFAULT_PASSWORD', '员工账号创建 apply 必须显式提供默认密码环境变量');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', '不能使用 pending/draft 确认文件', '员工账号创建 apply 拒绝 pending/draft 文件路径');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', 'roles: { create', '员工账号创建写入角色关联');
requireIncludes('packages/server-v2/prisma/operation-profit-staff-user-backfill.ts', 'stores: { create', '员工账号创建写入门店关联');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'confirmationReady', '业务确认包统一预检 readiness 输出');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'pending_business_confirmation', '业务确认包预检识别未确认候选');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_staff_user', '业务确认包预检识别缺员工账号主体');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'assigneeManualReviewFile', '业务确认包预检读取无候选人工查证文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_or_invalid_resolution', '业务确认包预检识别无候选缺口处理结论');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'requireReady', '业务确认包预检支持写库前硬门禁');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'summaryOnly', '业务确认包预检支持状态短输出');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'writeGate', '业务确认包预检输出写库门禁摘要');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'blocked_by_business_confirmation', '业务确认包预检明确业务确认阻断原因');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', '--requireReady requires explicit confirmation JSON files', '业务确认包硬门禁必须显式传入正式确认 JSON');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'process.exitCode = 2', '业务确认包 requireReady 失败返回非 0');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', '业务确认人', '业务确认包预检拒绝占位确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', "includes('todo')", '业务确认包预检拒绝包含 TODO 的确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_assignee_confirmation_input', '业务确认包预检识别服务人确认漏项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_project_master_confirmation_input', '业务确认包预检识别项目档案确认漏项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missingCoverageItems', '业务确认包预检输出确认包覆盖漏项数量');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'inputIntegrity', '业务确认包预检输出输入完整性摘要');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'inputIntegrityItems', '业务确认包预检把重复冲突项纳入写库门禁');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'buildStaffUserBlockers', '业务确认包短输出汇总缺员工账号主体明细');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'staffUserBlockers', '业务确认包短输出包含账号主体阻断摘要');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'staffUserFile', '业务确认包预检支持员工账号创建确认文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'loadStaffUserCreates', '业务确认包预检读取员工账号创建确认文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', "source: 'staff_user_create'", '业务确认包预检把确认创建账号计划计入员工账号缺口解决项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'username_exists', '业务确认包预检识别员工账号用户名冲突');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_role', '业务确认包预检识别员工账号角色缺失');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'missing_store', '业务确认包预检识别员工账号门店缺失');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'confirmedUsers', '业务确认包短输出包含员工账号创建确认数量');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'confirmedStaffUserPlansByBeauticianId', '业务确认包预检把已确认账号绑定计划计入员工账号缺口解决项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'hasConfirmedStaffUserPlan', '业务确认包预检识别真实已绑定或确认待绑定账号主体');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'duplicate_assignee_assignment_input', '业务确认包预检识别服务人候选重复记录');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'conflicting_assignee_confirmation_sources', '业务确认包预检识别服务人确认来源冲突');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'duplicate_project_master_fix_input', '业务确认包预检识别项目档案确认重复记录');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'operation-profit-assignee-confirmed.draft.json', '业务确认正式 JSON 草稿生成服务人候选文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'operation-profit-assignee-manual-review-confirmed.draft.json', '业务确认正式 JSON 草稿生成无候选人工查证文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'staffUserFile', '业务确认正式 JSON 草稿读取员工账号创建 pending 文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'operation-profit-staff-user-create-confirmed.draft.json', '业务确认正式 JSON 草稿生成员工账号创建文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'TODO_REQUIRED_IF_ASSIGN', '业务确认正式 JSON 草稿提示 assign 必填服务人');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'confirmation-audit --requireReady', '业务确认正式 JSON 草稿提示先跑统一预检');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-template.ts', 'Do not pass --confirmer', '业务确认正式 JSON 草稿禁止脚本批量注入确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'operation-profit:confirmation-workbook', '业务确认包填报单生成脚本说明');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', '经营利润业务确认包填报单.md', '业务确认包填报单默认输出路径');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'resolution=assign/historical_exception/ignore_non_margin', '业务确认包填报单服务人处理选项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'repair_project / historical_exception', '业务确认包填报单项目处理选项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'operation-profit-staff-user-create.pending.json', '业务确认包填报单读取员工账号创建 pending 文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', '员工账号创建确认', '业务确认包填报单呈现员工账号创建正式确认项');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', '--staffUserFile=<员工账号创建确认JSON>', '业务确认包填报单后续命令传员工账号创建确认文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'operation-profit:staff-user-backfill', '业务确认包填报单包含员工账号创建 dry-run 顺序');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-workbook.ts', 'create_or_bind_staff_user', '业务确认包填报单保留账号前置动作来源缺口');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:confirmation-audit', '确认后 dry-run 编排先跑统一确认硬门禁');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', '--requireReady', '确认后 dry-run 编排要求确认包 ready');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', '--summaryOnly', '确认后 dry-run 编排可使用确认包短输出');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'Do not pass --apply or --yes', '确认后 dry-run 编排禁止写库参数');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'requires explicit confirmation JSON files', '确认后 dry-run 必须显式传入正式确认 JSON');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'blocked_by_confirmation_gate', '确认后 dry-run 编排在确认包失败时停止后续步骤');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'staffUserFile', '确认后 dry-run 编排支持员工账号创建确认文件');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', '--staffUserFile=', '确认后 dry-run 编排把员工账号创建确认文件传给确认硬门禁');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:staff-user-backfill', '确认后 dry-run 编排包含员工账号创建 dry-run');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:beautician-user-backfill', '确认后 dry-run 编排包含账号绑定 dry-run');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:assignee-backfill', '确认后 dry-run 编排包含服务人 dry-run');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:project-master-backfill', '确认后 dry-run 编排包含项目档案 dry-run');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmed-dry-run.ts', 'operation-profit:backfill', '确认后 dry-run 编排包含提成 dry-run');
requireRegex('packages/server-v2/prisma/operation-profit-backfill.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.commissionRecord\.create/, '提成回填写库必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-backfill.ts', /args\.apply && !args\.storeId[\s\S]*?--storeId[\s\S]*?避免跨门店误写/, '提成回填 apply 必须指定 storeId');
requireRegex('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', /args\.apply && !args\.yes[\s\S]*?--apply --yes[\s\S]*?if \(args\.apply\)[\s\S]*?prisma\.orderItem\.update/, '项目档案修复写库必须受 --apply --yes 保护');
requireRegex('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', /args\.apply && !args\.storeId[\s\S]*?--storeId[\s\S]*?避免跨门店误写/, '项目档案修复 apply 必须指定 storeId');
requireRegex('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', /pending_business_confirmation[\s\S]*?args\.apply[\s\S]*?unconfirmedBusinessApproval/, '项目档案修复 apply 拒绝未业务确认候选');
requireIncludes('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', '业务确认人', '项目档案修复写回拒绝占位确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', "includes('todo')", '项目档案修复写回拒绝包含 TODO 的确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', '不能使用 pending/draft 确认文件', '项目档案修复 apply 拒绝 pending/draft 文件路径');
requireIncludes('packages/server-v2/prisma/operation-profit-project-master-backfill.ts', "resolution === 'repair_project'", '项目档案修复只处理 repair_project 结论');
requireIncludes('packages/server-v2/prisma/operation-profit-confirmation-audit.ts', 'historical_exception', '业务确认包预检支持项目档案历史异常');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', '业务确认人', 'readiness 确认包模式拒绝占位确认人');
requireIncludes('packages/server-v2/prisma/operation-profit-readiness.ts', "includes('todo')", 'readiness 确认包模式拒绝包含 TODO 的确认人');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'commission_rule_coverage', 'PR 草稿 readiness 提成规则覆盖说明');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'missing_commission_rule', 'PR 草稿抽样复算提成规则缺口说明');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'operation-profit:confirmation-template', 'PR 草稿说明确认 JSON 草稿生成');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'operation-profit:confirmed-dry-run', 'PR 草稿说明确认后 dry-run 编排');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', '--summaryOnly', 'PR 草稿说明确认包短输出');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', '经营利润业务确认后真实写库手册.md', 'PR 草稿关联确认后真实写库手册');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'status=dry_run_complete', 'PR 草稿说明确认后 dry-run 完成标准');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'Unauthorized from loadUserInfo', 'PR 草稿说明未登录鉴权预期错误');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'check:operation-profit:full', 'PR 草稿说明一键工程门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'check:operation-profit:build', 'PR 草稿说明构建门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'git diff --check', 'PR 草稿说明空白检查纳入一键门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'npm.cmd run check:operation-profit:full', 'PR 草稿验证命令使用一键工程门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'PR 当前建议保持 Draft', 'PR 草稿说明保持 Draft 的条件');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', '要求显式传入 4 个核心正式确认 JSON', 'PR 草稿说明确认后流程必须显式传确认 JSON');
requireIncludes('docs/04-测试数据/经营利润毛利抽样复算验收记录.md', 'missing_project_master', '抽样复算记录项目档案缺失复验标准');
requireIncludes('docs/04-测试数据/经营利润毛利抽样复算验收记录.md', 'projectMasterGapItems', '抽样复算记录项目档案缺失摘要');
requireIncludes('docs/04-测试数据/经营利润毛利抽样复算验收记录.md', 'missing_commission_rule', '抽样复算记录提成规则缺口复验标准');
requireIncludes('docs/04-测试数据/经营利润毛利抽样复算验收记录.md', 'legacy_without_user_scope', '抽样复算记录迁移前降级说明');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'operation-profit:readiness', '迁移前烟测 readiness 命令');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'readinessStatus=blocked', '迁移前烟测 readiness blocked 结论');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'migration_required', '迁移前烟测成本 seed 缺 migration 状态');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'schemaPrecheck.exists=false', '迁移前烟测成本 seed schema 预检状态');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'missingAssigneeItems=31', '迁移前烟测服务人缺口数量');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'plannedAssignments=2', '迁移前烟测服务人写回 dry-run 计划数');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'skippedMissingBeautician=31', '迁移前烟测提成回填服务人缺口');
requireIncludes('docs/04-测试数据/经营利润迁移前只读脚本烟测记录.md', 'legacy_without_user_scope', '迁移前烟测抽样复算降级模式');
requireIncludes('docs/04-测试数据/经营利润真实迁移与写库执行记录.md', 'createdCosts=6', '真实执行记录成本写入数量');
requireIncludes('docs/04-测试数据/经营利润真实迁移与写库执行记录.md', 'updatedOrderItems=2', '真实执行记录服务人写回数量');
requireIncludes('docs/04-测试数据/经营利润真实迁移与写库执行记录.md', 'createdCommissionRecords=2', '真实执行记录提成回填数量');
requireIncludes('docs/04-测试数据/经营利润真实迁移与写库执行记录.md', 'commissionRuleCoverageMode=full', '真实执行记录抽样复算 full 模式');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'missingAssigneeItems=33', '当前阻断快照服务人缺口数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'orderCount=43', '当前阻断快照有效订单数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', '真实库数据较上一版阻断快照未新增变化', '当前阻断快照记录继续复验未变化');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'writeGate.blockers.unconfirmedItems=39', '当前阻断快照记录员工账号创建纳入确认包后的未确认数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', '漏传任一核心文件会直接失败', '当前阻断快照记录确认包必须显式传核心文件');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'PO1781893220850', '当前阻断快照新增项目订单缺口');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'POMQL9G69L', '当前阻断快照最新终端订单缺口');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'operation-profit:confirmation-audit', '业务确认包统一预检命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '--summaryOnly', '业务确认包执行清单说明状态短输出');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'operation-profit:confirmation-template', '业务确认包执行清单说明正式 JSON 草稿生成');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'operation-profit:confirmation-workbook', '业务确认包填报单生成命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'operation-profit:confirmed-dry-run', '业务确认包确认后 dry-run 编排命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '经营利润业务确认包填报单.md', '业务确认包执行清单关联填报单');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'confirmationReady=true', '业务确认包通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '--requireReady', '业务确认包写库前硬门禁命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'writeGate.applyAllowed=true', '业务确认包写库门禁通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'missingCoverageItems=0', '业务确认包覆盖当前真实缺口通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'inputIntegrity.issueCount=0', '业务确认包输入完整性通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'writeGate.blockers.inputIntegrityItems=0', '业务确认包重复冲突门禁通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '脚本保护：`--requireReady` 模式必须显式传入上述 4 个核心确认 JSON', '业务确认包执行清单说明 requireReady 必须显式传确认 JSON');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '脚本保护：`operation-profit:confirmed-dry-run` 同样必须显式传入 4 个核心确认 JSON', '业务确认包执行清单说明 confirmed dry-run 必须显式传确认 JSON');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '会直接拒绝 `.pending.json`、`.draft.json` 和 `operation-profit-confirmation-drafts/` 路径', '业务确认包执行清单说明 apply 拒绝 pending/draft 文件路径');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'confirmationReady=true', '确认后真实写库手册要求确认包 ready');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'writeGate.applyAllowed=true', '确认后真实写库手册要求写库门禁通过');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'operation-profit:confirmed-dry-run', '确认后真实写库手册要求先跑确认后 dry-run');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'status=dry_run_complete', '确认后真实写库手册 dry-run 通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'operation-profit:beautician-user-backfill', '确认后真实写库手册包含账号绑定写库顺序');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'operation-profit:assignee-backfill', '确认后真实写库手册包含服务人写库顺序');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'operation-profit:project-master-backfill', '确认后真实写库手册包含项目档案写库顺序');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'operation-profit:backfill', '确认后真实写库手册包含提成回填顺序');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', 'TODO_REAL_BUSINESS_CONFIRMER', '确认后真实写库手册禁止 TODO 草稿写库');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', '`--requireReady` 模式必须显式传入 4 个核心正式确认 JSON', '确认后真实写库手册说明 requireReady 必须显式传确认 JSON');
requireIncludes('docs/04-测试数据/经营利润业务确认后真实写库手册.md', '会直接拒绝 `.pending.json`、`.draft.json` 和 `operation-profit-confirmation-drafts/` 目录下的文件路径', '确认后真实写库手册说明 apply 拒绝 pending/draft 文件路径');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '当前待处理总数：39 条', '业务确认包填报单待处理总数');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '仍为 pending_business_confirmation：39 条', '业务确认包填报单员工账号创建纳入未确认总数');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '无候选服务人缺 resolution：24 条', '业务确认包填报单缺处理结论数量');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'operation-profit:confirmation-audit --requireReady', '业务确认包填报单后续预检命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '员工账号创建确认', '业务确认包填报单列出员工账号创建正式确认项');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '| 员工账号创建 | 2 | 2 |', '业务确认包填报单统计员工账号创建待确认数量');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '--staffUserFile=<员工账号创建确认JSON>', '业务确认包填报单命令包含员工账号创建确认文件');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'operation-profit:staff-user-backfill', '业务确认包填报单包含员工账号创建 dry-run 命令');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'beautician_6_44', '业务确认包填报单列出韩雨账号建议');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'beautician_6_50', '业务确认包填报单列出许诺账号建议');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '韩雨', '业务确认包填报单列出韩雨账号缺口');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '许诺', '业务确认包填报单列出许诺账号缺口');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '正式 JSON 字段速查', '业务确认包填报单包含正式 JSON 字段速查');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', '正式文件不要保留 `.draft.json`、`.pending.json`', '业务确认包填报单禁止草稿文件名作为正式文件');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'unconfirmedItems=0', '业务确认包填报单列出确认项清零标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'missingResolutionItems=0', '业务确认包填报单列出处理结论清零标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包填报单.md', 'missingStaffUserItems=0', '业务确认包填报单列出员工账号主体清零标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'assigneeManualReview.issueCount=0', '业务确认包无候选人工查证通过标准');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'resolution=assign', '业务确认包人工查证 assign 结论说明');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', 'pending_business_confirmation', '业务确认包禁止 pending apply');
requireIncludes('docs/04-测试数据/经营利润业务确认包执行清单.md', '业务确认人', '业务确认包禁止占位确认人');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'margin_source_orders=pass(orderCount=43,productOrderItemCount=9,projectOrderItemCount=26)', '发布验收清单最新订单样本数量');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'assignee_data=fail(productMissingBeautician=9,projectMissingBeautician=24)', '发布验收清单最新服务人缺口数量');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'commission_data=warn(missing=33,total=35)', '发布验收清单最新提成缺口数量');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'pending_business_confirmation', '发布验收清单提示 pending 候选保护');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'operation-profit:confirmed-dry-run', '发布验收清单包含确认后 dry-run 编排');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'operation-profit-confirmation-drafts', '发布验收清单列出正式确认 JSON 草稿');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', '包含 `TODO` 的确认人', '发布验收清单说明 TODO 草稿不会放行');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', 'createdCommissionRecords=0', 'PR 草稿记录授权后提成回填结果');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', '待业务确认包、readiness 和页面验收完成后再转 Ready', 'PR 草稿 Draft 状态说明');
requireIncludes('docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md', 'missingAssigneeItems=33', '剩余服务人归属缺口数量');
requireIncludes('docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md', 'pending_business_confirmation', '剩余服务人候选需业务确认');
requireIncludes('docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md', 'candidateDraft', '剩余服务人候选来自审计草稿');
requireIncludes('docs/04-测试数据/经营利润剩余服务人归属候选确认清单.md', 'manualReviewDraft', '剩余服务人无候选来自审计草稿');
requireIncludes('docs/04-测试数据/operation-profit-assignee-manual-review.pending.json', 'manualReviewItems": 24', '无候选人工查证 JSON 数量');
requireIncludes('docs/04-测试数据/operation-profit-assignee-manual-review.pending.json', 'pending_manual_review', '无候选人工查证 JSON 待处理状态');
requireIncludes('docs/04-测试数据/operation-profit-assignee-manual-review.pending.json', 'pending_business_confirmation', '无候选人工查证 JSON 未确认标记');
requireIncludes('docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md', 'missingUserBindingBeauticians=3', '美容师账号绑定缺口数量');
requireIncludes('docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md', 'bindingDraft', '美容师账号绑定候选来自审计草稿');
requireIncludes('docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md', 'pending_business_confirmation', '美容师账号绑定候选需业务确认');
requireIncludes('docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json', 'pending_business_confirmation', '美容师账号绑定 JSON 未确认标记');
requireIncludes('docs/04-测试数据/经营利润美容师账号绑定候选确认清单.md', 'missingUserBindingNoCandidateItems=2', '美容师账号绑定候选确认清单列出无账号候选数量');
requireIncludes('docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json', 'missingUserBindingNoCandidates', '美容师账号绑定 JSON 包含无账号候选缺口');
requireIncludes('docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json', 'create_or_bind_staff_user', '美容师账号绑定 JSON 提示需创建或补绑定员工账号');
requireIncludes('docs/04-测试数据/operation-profit-staff-user-create.pending.json', 'operation-profit-staff-user-create-pending-business-confirmation', '员工账号创建 pending JSON purpose');
requireIncludes('docs/04-测试数据/operation-profit-staff-user-create.pending.json', 'beautician_6_44', '员工账号创建 pending JSON 包含韩雨账号建议');
requireIncludes('docs/04-测试数据/operation-profit-staff-user-create.pending.json', 'beautician_6_50', '员工账号创建 pending JSON 包含许诺账号建议');
requireIncludes('docs/04-测试数据/operation-profit-staff-user-create.pending.json', 'pending_business_confirmation', '员工账号创建 pending JSON 未确认标记');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json', 'TODO_REAL_BUSINESS_CONFIRMER', '服务人候选正式 JSON 草稿保留业务确认人 TODO');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-confirmed.draft.json', 'operation-profit-assignee-confirmed-business-template', '服务人候选正式 JSON 草稿 purpose');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json', 'TODO_assign_or_historical_exception_or_ignore_non_margin', '无候选服务人正式 JSON 草稿保留处理结论 TODO');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-assignee-manual-review-confirmed.draft.json', 'TODO_REQUIRED_IF_ASSIGN', '无候选服务人正式 JSON 草稿提示 assign 必填服务人');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-beautician-user-bindings-confirmed.draft.json', 'TODO_REAL_BUSINESS_CONFIRMER', '账号绑定正式 JSON 草稿保留业务确认人 TODO');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json', 'operation-profit-staff-user-create-confirmed-business-template', '员工账号创建正式 JSON 草稿 purpose');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json', 'TODO_REAL_BUSINESS_CONFIRMER', '员工账号创建正式 JSON 草稿保留业务确认人 TODO');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json', 'beautician_6_44', '员工账号创建正式 JSON 草稿包含韩雨账号建议');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-staff-user-create-confirmed.draft.json', 'beautician_6_50', '员工账号创建正式 JSON 草稿包含许诺账号建议');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/operation-profit-project-master-confirmed.draft.json', 'operation-profit-project-master-confirmed-business-template', '项目档案正式 JSON 草稿 purpose');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', 'operation-profit:confirmation-template', '正式确认 JSON 草稿说明生成来源');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', 'operation-profit-staff-user-create-confirmed.draft.json', '正式确认 JSON 草稿说明员工账号创建草稿');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', '--staffUserFile=', '正式确认 JSON 草稿说明员工账号文件预检参数');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', 'TODO_REAL_BUSINESS_CONFIRMER', '正式确认 JSON 草稿说明 TODO 不能保留');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', 'operation-profit:confirmation-audit', '正式确认 JSON 草稿说明统一预检命令');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', 'operation-profit:confirmed-dry-run', '正式确认 JSON 草稿说明确认后 dry-run 命令');
requireIncludes('docs/04-测试数据/operation-profit-confirmation-drafts/README.md', '不要把本目录草稿直接用于', '正式确认 JSON 草稿说明禁止直接写库');
requireIncludes('docs/04-测试数据/经营利润项目BOM缺口确认清单.md', 'missingBomItems=3', '项目 BOM 缺口数量');
requireIncludes('docs/04-测试数据/经营利润项目BOM缺口确认清单.md', 'operation-profit:bom-audit', '项目 BOM 缺口审计命令');
requireIncludes('docs/04-测试数据/经营利润项目BOM缺口确认清单.md', 'pending_business_confirmation', '项目 BOM 缺口需业务确认');
requireIncludes('docs/04-测试数据/经营利润项目BOM缺口确认清单.md', 'resolution=repair_project', '项目 BOM 缺口修复结论说明');
requireIncludes('docs/04-测试数据/经营利润项目BOM缺口确认清单.md', 'resolution=historical_exception', '项目 BOM 缺口历史异常结论说明');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', '不等同于业务验收通过记录', '页面技术预检非业务验收结论');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', '/operation-profit/overview', '页面技术预检利润看板路由');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', '/operation-profit/costs', '页面技术预检成本配置路由');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', '继续复核 in-app browser 当前会话', '页面技术预检记录继续复核浏览器会话');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', 'passwordInput=true', '页面技术预检记录登录表单密码框存在');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', 'consoleError=1', '页面技术预检记录未登录鉴权错误数量');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', 'Unauthorized from loadUserInfo', '页面技术预检记录未登录鉴权错误来源');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', 'margin_source_orders=pass(orderCount=43,productOrderItemCount=9,projectOrderItemCount=26)', '页面技术预检最新订单样本数量');
requireIncludes('docs/04-测试数据/经营利润页面技术预检记录.md', 'commission_rule_coverage=pass(covered=35,missing=0,total=35)', '页面技术预检最新提成规则覆盖数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'orderCount=43', '阻断快照最新订单数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'coverage.issueCount=0', '阻断快照确认包覆盖未过期');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'inputIntegrity.issueCount=0', '阻断快照确认包无重复冲突');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'writeGate.blockers.unconfirmedItems=39', '阻断快照最新未确认数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'writeGate.blockers.missingResolutionItems=24', '阻断快照最新缺处理结论数量');
requireIncludes('docs/04-测试数据/经营利润当前验收阻断快照.md', 'writeGate.blockers.missingStaffUserItems=4', '阻断快照最新缺员工账号主体数量');
requireIncludes('docs/04-测试数据/operation-profit-assignee-candidates.pending.json', 'pending_business_confirmation', '候选 JSON 未确认标记');
requireIncludes('docs/04-测试数据/operation-profit-project-master-candidates.pending.json', 'pending_business_confirmation', '项目档案候选 JSON 未确认标记');
requireIncludes('docs/04-测试数据/operation-profit-project-master-candidates.pending.json', 'repair_project', '项目档案候选 JSON 修复结论');
requireIncludes('docs/04-测试数据/operation-profit-project-master-historical-exception.example.json', 'historical_exception', '项目档案历史异常示例 JSON');
requireIncludes('docs/03-开发计划/经营利润一级模块PR草稿.md', '经营利润迁移前只读脚本烟测记录.md', 'PR 草稿关联迁移前烟测记录');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '经营利润迁移前只读脚本烟测记录.md', '提交前差异清单关联迁移前烟测记录');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '经营利润当前验收阻断快照.md', '提交前差异清单关联当前阻断快照');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '经营利润业务确认包执行清单.md', '提交前差异清单关联业务确认包');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '经营利润业务确认后真实写库手册.md', '提交前差异清单关联确认后真实写库手册');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'check:operation-profit:full', '提交前差异清单包含一键工程门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'check:operation-profit:frontend', '提交前差异清单包含前端集合门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'check:operation-profit:build', '提交前差异清单包含构建门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'operation-profit:scripts:typecheck', '提交前差异清单包含脚本 TypeScript 检查');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'check:operation-profit:whitespace', '提交前差异清单包含空白检查门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'tsconfig.operation-profit-scripts.json', '提交前差异清单包含脚本 typecheck tsconfig');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '`package.json`、`packages/server-v2/package.json`', '提交前差异清单包含根级和后端 package 脚本');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '35 个测试通过', '提交前差异清单前端测试数量为最新 35 个');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '经营利润美容师账号绑定候选确认清单.md', '提交前差异清单关联美容师账号绑定确认清单');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'operation-profit-beautician-user-bindings.pending.json', '提交前差异清单关联美容师账号绑定候选 JSON');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '剩余 33 条服务人归属缺口', '提交前差异清单使用最新服务人缺口数量');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'pending_business_confirmation', '提交前差异清单提示 pending 候选不能 apply');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'operation-profit:confirmation-audit -- --storeId=6', '提交前差异清单包含确认包短输出复验命令');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '--assigneeFile=<服务人候选正式确认JSON>', '提交前差异清单确认包命令显式传服务人正式 JSON');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '--beauticianUserFile=<美容师账号绑定正式确认JSON>', '提交前差异清单确认包命令显式传账号绑定正式 JSON');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'operation-profit-confirmation-drafts', '提交前差异清单列出正式确认 JSON 草稿');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'operation-profit-confirmation-drafts/*.draft.json', '提交前差异清单禁止 TODO 草稿写库');
requireIncludes('packages/server-v2/prisma/migrations/20260619131500_operation_profit_query_indexes/migration.sql', 'ProductOrder_storeId_createdAt_idx', '经营利润订单查询组合索引 migration');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'check:operation-profit:full', '发布清单说明完整工程门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', '经营利润前端集合测试', '发布清单说明前端集合测试');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', '经营利润 Prisma 脚本 TypeScript 检查', '发布清单说明脚本 TypeScript 检查');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', '前后端构建', '发布清单说明构建门禁');
requireIncludes('docs/03-开发计划/经营利润一级模块发布迁移与验收清单.md', 'git diff --check', '发布清单说明空白检查');
requireIncludes('src/api/operationProfit.ts', "from './real/operationProfit'", '经营利润 API facade 指向 real implementation');
requireRegex('src/api/real/operationProfit.test.ts', /\/operation-profit\/overview[\s\S]*?\/operation-profit\/product-margins[\s\S]*?\/operation-profit\/project-margins[\s\S]*?\/operation-profit\/prepaid-liabilities[\s\S]*?\/operation-profit\/beautician-performance[\s\S]*?\/operation-costs/, '经营利润 Real API 路径测试');
requireRegex('src/api/real/operationProfit.test.ts', /normalizes legacy paginated data aliases[\s\S]*?data:\s*\[row\][\s\S]*?expect\(page\.data\)\.toBe\(page\.items\)/, '经营利润 Real API 分页兼容测试');
requireIncludes('src/api/real/operationProfit.test.ts', 'realCopyOperationCostsFromPreviousMonth', '经营利润 Real API 复制上月成本测试');
requireIncludes('packages/server-v2/src/app.module.ts', 'OperationProfitModule', '后端主模块注册 OperationProfitModule');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '提交前需单独确认的文件', '提交前差异清单风险提示');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', 'AGENTS.md', '提交前差异清单 AGENTS 确认项');
requireIncludes('docs/03-开发计划/经营利润一级模块提交前差异清单.md', '上游闭环支撑文件', '提交前差异清单上游闭环说明');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.tsx', /handleDelete[\s\S]*?window\.confirm[\s\S]*?deleteOperationCost/, '成本删除二次确认');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.tsx', /handleCopyPrevious[\s\S]*?window\.confirm[\s\S]*?copyOperationCostsFromPreviousMonth/, '复制上月成本二次确认');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.tsx', /amount < 0[\s\S]*?成本金额不能小于 0/, '成本金额非负前端校验');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.tsx', /costDate\.startsWith[\s\S]*?成本日期必须落在所选月份内/, '成本日期月份一致前端校验');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /requires confirmation before deleting[\s\S]*?deleteOperationCost[\s\S]*?not\.toHaveBeenCalled[\s\S]*?toHaveBeenCalledWith\(1\)/, '成本删除二次确认组件测试');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /requires confirmation before copying[\s\S]*?copyOperationCostsFromPreviousMonth[\s\S]*?not\.toHaveBeenCalled[\s\S]*?toHaveBeenCalledWith/, '复制上月成本二次确认组件测试');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /keeps cost write actions hidden for read-only users[\s\S]*?新增成本[\s\S]*?复制上月[\s\S]*?编辑[\s\S]*?删除/, '成本配置只读账号隐藏写入口组件测试');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /blocks invalid cost forms before calling create API[\s\S]*?createOperationCost[\s\S]*?not\.toHaveBeenCalled/, '成本配置非法表单不调用写接口组件测试');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /submits new operating costs and refreshes the list[\s\S]*?createOperationCost[\s\S]*?periodMonth[\s\S]*?amount:\s*6800[\s\S]*?getOperationCosts[\s\S]*?toHaveBeenCalledTimes\(2\)/, '成本配置新增成功组件测试');
requireRegex('src/app/pages/operation-profit/OperationCostSettings.test.tsx', /prefills existing operating costs and submits updates[\s\S]*?updateOperationCost[\s\S]*?amount:\s*12800[\s\S]*?getOperationCosts[\s\S]*?toHaveBeenCalledTimes\(2\)/, '成本配置编辑成功组件测试');
requireRegex('src/app/pages/operation-profit/MarginAnalysis.test.tsx', /shows product margin loss and data-gap labels[\s\S]*?缺成本[\s\S]*?经营成本未录完整[\s\S]*?提成记录缺失[\s\S]*?status:\s*'loss'/, '商品毛利缺口和亏损提示组件测试');
requireRegex('src/app/pages/operation-profit/MarginAnalysis.test.tsx', /shows project margin BOM, actual consumption, and commission gaps[\s\S]*?项目档案缺失[\s\S]*?项目 BOM 缺失[\s\S]*?实际耗材流水缺失[\s\S]*?提成记录缺失[\s\S]*?status:\s*'cost_missing'/, '项目毛利缺口提示组件测试');
requireRegex('src/app/pages/operation-profit/ProductMarginAnalysis.tsx', /const PAGE_SIZE = 100[\s\S]*?setPage\(1\)[\s\S]*?当前页商品毛利[\s\S]*?上一页商品毛利[\s\S]*?下一页商品毛利/, '商品毛利页面分页控件和当前页汇总口径');
requireRegex('src/app/pages/operation-profit/ProjectMarginAnalysis.tsx', /const PAGE_SIZE = 100[\s\S]*?setPage\(1\)[\s\S]*?当前页贡献毛利[\s\S]*?上一页项目毛利[\s\S]*?下一页项目毛利/, '项目毛利页面分页控件和当前页汇总口径');
requireRegex('src/app/pages/operation-profit/MarginAnalysis.test.tsx', /loads the next product margin page[\s\S]*?第 1 \/ 2 页，共 150 个商品[\s\S]*?下一页商品毛利[\s\S]*?page:\s*2[\s\S]*?pageSize:\s*100[\s\S]*?page:\s*1[\s\S]*?status:\s*'loss'/, '商品毛利翻页和筛选重置组件测试');
requireRegex('src/app/pages/operation-profit/MarginAnalysis.test.tsx', /loads the next project margin page[\s\S]*?第 1 \/ 2 页，共 150 个项目[\s\S]*?下一页项目毛利[\s\S]*?page:\s*2[\s\S]*?pageSize:\s*100[\s\S]*?page:\s*1[\s\S]*?status:\s*'cost_missing'/, '项目毛利翻页和筛选重置组件测试');
requireRegex('src/app/pages/operation-profit/ProjectMarginAnalysis.tsx', /function materialCostForMargin[\s\S]*?actualMaterialCost > 0 \? row\.actualMaterialCost : row\.standardMaterialCost[\s\S]*?实耗[\s\S]*?BOM[\s\S]*?按实际耗材扣减[\s\S]*?按 BOM 标准扣减/, '项目毛利页面耗材扣减口径与来源展示');
requireRegex('src/app/pages/operation-profit/MarginAnalysis.test.tsx', /shows actual and BOM material amounts while summing the material cost used by margin[\s\S]*?standardMaterialCost:\s*120[\s\S]*?actualMaterialCost:\s*80[\s\S]*?实耗 ¥80\.00 \/ BOM ¥120\.00[\s\S]*?按实际耗材扣减/, '项目毛利实耗和 BOM 对照组件测试');
requireIncludes('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', 'keeps project order income visible when the project master record is missing', '项目毛利保留缺项目档案历史收入单测');
requireIncludes('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', '历史异常项目', '项目毛利缺项目档案样本');
requireIncludes('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', 'missing_project_master', '项目毛利缺项目档案原因');
requireRegex('src/app/pages/operation-profit/OperationProfitOverview.test.tsx', /shows overview data quality gaps and alerts[\s\S]*?成本缺失[\s\S]*?经营成本未录完整[\s\S]*?提成记录缺失[\s\S]*?成本缺口/, '利润总览数据质量缺口和风险提醒组件测试');
requireRegex('src/app/pages/operation-profit/OperationProfitRiskPages.test.tsx', /shows prepaid liability high-risk reasons[\s\S]*?高风险[\s\S]*?临期未消耗[\s\S]*?高剩余权益[\s\S]*?riskOnly:\s*false/, '会员卡履约高风险原因和筛选组件测试');
requireRegex('src/app/pages/operation-profit/OperationProfitRiskPages.test.tsx', /shows beautician performance contribution and data-gap labels[\s\S]*?王美容师[\s\S]*?经营成本未录完整[\s\S]*?提成记录缺失/, '员工人效贡献毛利和缺口组件测试');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.ts', /orderItemId:\s*\{\s*in:\s*projectOrderItemIds\s*\}[\s\S]*?type:\s*'project'/, '项目毛利提成按订单明细回挂');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /deducts project commissions by order item id[\s\S]*?created after the period[\s\S]*?orderItemId:\s*\{\s*in:\s*\[11\]\s*\}[\s\S]*?commissionCost:\s*50/, '项目毛利提成跨期创建回挂单测');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.ts', /orderItemId:\s*\{\s*in:\s*productOrderItems\.map\(\(item\)\s*=>\s*item\.id\)\s*\}[\s\S]*?type:\s*'product'/, '商品毛利提成按商品订单明细回挂');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /deducts product commissions by product order item id and product type only[\s\S]*?orderItemId:\s*\{\s*in:\s*\[1\]\s*\}[\s\S]*?type:\s*'product'[\s\S]*?commissionCost:\s*6/, '商品毛利提成订单明细回挂单测');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.ts', /orderItemId:\s*\{\s*in:\s*orderItemIds\s*\}[\s\S]*?type:\s*\{\s*in:\s*\['project',\s*'product'\]\s*\}[\s\S]*?staffUserId\s*>\s*0\s*\?\s*\{\s*staffUserId\s*\}\s*:\s*beauticianId\s*>\s*0\s*\?\s*\{\s*beauticianId\s*\}/, '员工人效提成按订单明细和员工主体聚合');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /deducts beautician performance commissions by period order item id and staff user id first[\s\S]*?orderItemId:\s*\{\s*in:\s*\[81\]\s*\}[\s\S]*?staffUserId:\s*701[\s\S]*?not\.toHaveProperty\('createdAt'\)[\s\S]*?commissionCost:\s*120/, '员工人效提成订单明细回挂单测');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /separates cash income from operating income[\s\S]*?date:\s*'2026-06-10'[\s\S]*?operatingIncome:\s*800[\s\S]*?date:\s*'2026-06-11'[\s\S]*?operatingIncome:\s*100/, '总览趋势包含会员卡消课收入单测');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.ts', /singleServiceIncome[\s\S]*?getRefundShare[\s\S]*?productSales[\s\S]*?getRefundShare/, '利润总览服务和商品收入扣减退款分摊');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /deducts completed refunds from overview operating income and trend income[\s\S]*?operatingIncome\)\.toBe\(480\)[\s\S]*?single_service'\)\?\.amount\)\.toBe\(400\)[\s\S]*?product_sales'\)\?\.amount\)\.toBe\(80\)[\s\S]*?grossProfit\)\.toBe\(330\)/, '利润总览退款净收入回归单测');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.ts', /orderServiceIncome[\s\S]*?getRefundShare/, '项目毛利项目订单收入扣减退款分摊');
requireRegex('packages/server-v2/src/operation-profit/operation-profit.service.spec.ts', /deducts completed refunds from project margin service income[\s\S]*?serviceIncome:\s*400[\s\S]*?avgDealPrice:\s*400[\s\S]*?contributionProfit:\s*270/, '项目毛利退款净收入回归单测');

if (violations.length) {
  console.error('经营利润发布前静态检查失败：');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('经营利润发布前静态检查通过。');
console.log(`检查文件根目录：${relative(process.cwd(), root) || '.'}`);
console.log(`必需 migration：${requiredMigrations.length} 条`);
console.log(`经营利润页面/路由：${requiredRoutes.length} 个`);
console.log(`readiness 检查项：${requiredReadinessChecks.length} 个`);
