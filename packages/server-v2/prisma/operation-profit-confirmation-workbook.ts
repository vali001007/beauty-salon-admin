import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type WorkbookArgs = {
  assigneeFile: string;
  assigneeManualReviewFile: string;
  beauticianUserFile: string;
  staffUserFile: string;
  projectMasterFile: string;
  output: string;
};

type AssigneeAssignment = {
  orderItemId: number;
  beauticianId: number;
  source?: string;
  confidence?: string;
  score?: number;
  reason?: string;
  confirmedBy?: string;
};

type ManualReviewItem = {
  orderItemId: number;
  orderNo?: string;
  itemType?: string;
  itemName?: string;
  customerName?: string;
  subtotal?: number;
  reason?: string;
  reviewStatus?: string;
  resolution?: string;
  beauticianId?: number;
  confirmedBy?: string;
};

type BeauticianUserBinding = {
  beauticianId: number;
  userId: number;
  confidence?: string;
  score?: number;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

type MissingUserBindingNoCandidate = {
  beauticianId: number;
  beauticianName?: string;
  phone?: string | null;
  storeId?: number;
  impactedOrderItemIds?: number[];
  impactedAssignments?: number;
  requiredAction?: string;
  reason?: string;
};

type StaffUserCreate = {
  action?: string;
  beauticianId: number;
  username: string;
  name?: string;
  phone?: string | null;
  roleKey: string;
  storeId: number;
  impactedOrderItemIds?: number[];
  impactedAssignments?: number;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

type ProjectMasterFix = {
  orderItemId: number;
  resolution?: string;
  targetProjectId?: number;
  targetProjectName?: string;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

function parseArgs(): WorkbookArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  return {
    assigneeFile: args.get('assigneeFile') ?? 'docs/04-测试数据/operation-profit-assignee-candidates.pending.json',
    assigneeManualReviewFile: args.get('assigneeManualReviewFile') ?? 'docs/04-测试数据/operation-profit-assignee-manual-review.pending.json',
    beauticianUserFile: args.get('beauticianUserFile') ?? 'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
    staffUserFile: args.get('staffUserFile') ?? 'docs/04-测试数据/operation-profit-staff-user-create.pending.json',
    projectMasterFile: args.get('projectMasterFile') ?? 'docs/04-测试数据/operation-profit-project-master-candidates.pending.json',
    output: args.get('output') ?? 'docs/04-测试数据/经营利润业务确认包填报单.md',
  };
}

function resolveFile(file: string) {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`File not found: ${file}`);
  }
  return filePath;
}

function readJson(file: string) {
  return JSON.parse(readFileSync(resolveFile(file), 'utf8'));
}

function escapeCell(value: unknown) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function isPending(value: unknown) {
  return String(value ?? '').trim() === 'pending_business_confirmation';
}

function pendingCount<T extends { confirmedBy?: string }>(items: T[]) {
  return items.filter((item) => isPending(item.confirmedBy)).length;
}

function loadAssignments(file: string): AssigneeAssignment[] {
  const parsed = readJson(file);
  if (!Array.isArray(parsed?.assignments)) throw new Error('Assignee file must contain assignments array.');
  return parsed.assignments;
}

function loadManualReviewItems(file: string): ManualReviewItem[] {
  const parsed = readJson(file);
  if (!Array.isArray(parsed?.items)) throw new Error('Manual review file must contain items array.');
  return parsed.items;
}

function loadBeauticianUserFile(file: string): {
  bindings: BeauticianUserBinding[];
  missingUserBindingNoCandidates: MissingUserBindingNoCandidate[];
} {
  const parsed = readJson(file);
  if (!Array.isArray(parsed?.bindings)) throw new Error('Beautician user file must contain bindings array.');
  return {
    bindings: parsed.bindings,
    missingUserBindingNoCandidates: Array.isArray(parsed?.missingUserBindingNoCandidates) ? parsed.missingUserBindingNoCandidates : [],
  };
}

function loadProjectFixes(file: string): ProjectMasterFix[] {
  const parsed = readJson(file);
  if (!Array.isArray(parsed?.fixes)) throw new Error('Project master file must contain fixes array.');
  return parsed.fixes;
}

function loadStaffUsers(file: string): StaffUserCreate[] {
  const parsed = readJson(file);
  if (!Array.isArray(parsed?.users)) throw new Error('Staff user file must contain users array.');
  return parsed.users;
}

function renderTable(headers: string[], rows: unknown[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function buildWorkbook(args: WorkbookArgs) {
  const assignments = loadAssignments(args.assigneeFile);
  const manualReviewItems = loadManualReviewItems(args.assigneeManualReviewFile);
  const beauticianUser = loadBeauticianUserFile(args.beauticianUserFile);
  const bindings = beauticianUser.bindings;
  const missingUserBindingNoCandidates = beauticianUser.missingUserBindingNoCandidates;
  const staffUsers = loadStaffUsers(args.staffUserFile);
  const projectFixes = loadProjectFixes(args.projectMasterFile);

  const totalItems = assignments.length + manualReviewItems.length + bindings.length + staffUsers.length + projectFixes.length;
  const totalPending =
    pendingCount(assignments) + pendingCount(manualReviewItems) + pendingCount(bindings) + pendingCount(staffUsers) + pendingCount(projectFixes);
  const manualMissingResolution = manualReviewItems.filter((item) => !item.resolution).length;

  const sections = [
    '# 经营利润业务确认包填报单',
    '',
    '生成方式：`operation-profit:confirmation-workbook`',
    '',
    '用途：给业务确认服务人归属、无候选人工查证、账号绑定、员工账号创建和项目档案处理。填完后复制为正式 JSON，再跑 `operation-profit:confirmation-audit --requireReady`。',
    '',
    '---',
    '',
    '## 1. 填报总览',
    '',
    renderTable(
      ['确认类型', '数量', '待业务确认', '业务需要补充'],
      [
        ['服务人候选归属', assignments.length, pendingCount(assignments), '确认是否采用候选 beauticianId；若不采用，改正式 JSON'],
        ['无候选服务人查证', manualReviewItems.length, pendingCount(manualReviewItems), '选择 resolution=assign/historical_exception/ignore_non_margin；assign 必填 beauticianId'],
        ['美容师账号绑定', bindings.length, pendingCount(bindings), '确认 beauticianId 是否绑定 userId'],
        ['员工账号创建', staffUsers.length, pendingCount(staffUsers), '确认用户名、姓名、手机号、角色、门店和默认密码策略；生成正式员工账号创建 JSON'],
        ['项目档案处理', projectFixes.length, pendingCount(projectFixes), '选择 repair_project 或 historical_exception'],
      ],
    ),
    '',
    `当前待处理总数：${totalItems} 条；仍为 pending_business_confirmation：${totalPending} 条；无候选服务人缺 resolution：${manualMissingResolution} 条。`,
    '',
    '填写规则：',
    '',
    '- `confirmedBy` 必须替换为真实确认人，不能保留 `pending_business_confirmation`、`业务确认人`、`待确认`、`TODO` 等占位值。',
    '- 无候选服务人选择 `resolution=assign` 时，必须填写真实 `beauticianId`。',
    '- 无候选服务人选择 `historical_exception` 或 `ignore_non_margin` 时，不会写入 `OrderItem.beauticianId`。',
    '- 员工账号创建必须确认用户名、姓名、手机号、角色、门店和默认密码策略；正式确认 JSON 后续通过 `--staffUserFile` 传入统一预检。',
    '- 项目档案选择 `repair_project` 才会进入项目修复写回；选择 `historical_exception` 只进入确认包和验收说明。',
    '- 填完正式 JSON 后先跑 `operation-profit:confirmation-audit --requireReady`，再 dry-run，不直接 apply。',
    '',
    '---',
    '',
    '## 2. 服务人候选归属',
    '',
    renderTable(
      ['orderItemId', '候选 beauticianId', '置信度', '分数', '线索来源', '建议业务动作', '当前 confirmedBy', '原因'],
      assignments.map((item) => [
        item.orderItemId,
        item.beauticianId,
        item.confidence,
        item.score,
        item.source,
        '确认采用候选，或在正式 JSON 中改为正确 beauticianId',
        item.confirmedBy,
        item.reason,
      ]),
    ),
    '',
    '---',
    '',
    '## 3. 无候选服务人人工查证',
    '',
    renderTable(
      ['orderItemId', '订单号', '类型', '项目/商品', '客户', '金额', '可选 resolution', 'assign 时必填', '当前 confirmedBy', '查证提示'],
      manualReviewItems.map((item) => [
        item.orderItemId,
        item.orderNo,
        item.itemType,
        item.itemName,
        item.customerName,
        item.subtotal,
        'assign / historical_exception / ignore_non_margin',
        'beauticianId',
        item.confirmedBy,
        item.reason,
      ]),
    ),
    '',
    '---',
    '',
    '## 4. 美容师账号绑定',
    '',
    renderTable(
      ['beauticianId', '候选 userId', '置信度', '分数', '线索来源', '建议业务动作', '当前 confirmedBy', '原因'],
      bindings.map((item) => [
        item.beauticianId,
        item.userId,
        item.confidence,
        item.score,
        item.source,
        '确认绑定，或在正式 JSON 中改为正确 userId',
        item.confirmedBy,
        item.reason,
      ]),
    ),
    '',
    '---',
    '',
    '## 5. 员工账号创建确认',
    '',
    staffUsers.length
      ? renderTable(
          ['beauticianId', '建议 username', '姓名', '手机号', '角色', '门店', '影响明细', '影响数量', '当前 confirmedBy', '原因'],
          staffUsers.map((item) => [
            item.beauticianId,
            item.username,
            item.name,
            item.phone,
            item.roleKey,
            item.storeId,
            item.impactedOrderItemIds?.join('、'),
            item.impactedAssignments,
            item.confirmedBy,
            item.reason,
          ]),
        )
      : '当前没有需正式确认的员工账号创建计划。',
    missingUserBindingNoCandidates.length
      ? [
          '',
          '来源缺口：',
          '',
          renderTable(
            ['beauticianId', '美容师', '手机号', '影响明细', '影响数量', '必做动作'],
            missingUserBindingNoCandidates.map((item) => [
              item.beauticianId,
              item.beauticianName,
              item.phone,
              item.impactedOrderItemIds?.join('、'),
              item.impactedAssignments,
              item.requiredAction ?? 'create_or_bind_staff_user',
            ]),
          ),
        ].join('\n')
      : '',
    '',
    '---',
    '',
    '## 6. 项目档案处理',
    '',
    renderTable(
      ['orderItemId', '当前建议 resolution', '目标项目 ID', '目标项目', '线索来源', '业务可选项', '当前 confirmedBy', '原因'],
      projectFixes.map((item) => [
        item.orderItemId,
        item.resolution,
        item.targetProjectId,
        item.targetProjectName,
        item.source,
        'repair_project / historical_exception',
        item.confirmedBy,
        item.reason,
      ]),
    ),
    '',
    '---',
    '',
    '## 7. 填完后的执行顺序',
    '',
    '```powershell',
    'npm.cmd --prefix packages/server-v2 run operation-profit:confirmation-audit -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --assigneeFile=<服务人候选确认JSON> --assigneeManualReviewFile=<服务人无候选确认JSON> --beauticianUserFile=<账号绑定确认JSON> --staffUserFile=<员工账号创建确认JSON> --projectMasterFile=<项目档案确认JSON> --requireReady',
    'npm.cmd --prefix packages/server-v2 run operation-profit:confirmed-dry-run -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --assigneeFile=<服务人候选确认JSON> --assigneeManualReviewFile=<服务人无候选确认JSON> --beauticianUserFile=<账号绑定确认JSON> --staffUserFile=<员工账号创建确认JSON> --projectMasterFile=<项目档案确认JSON> --summaryOnly',
    'npm.cmd --prefix packages/server-v2 run operation-profit:staff-user-backfill -- --storeId=6 --file=<员工账号创建确认JSON>',
    'npm.cmd --prefix packages/server-v2 run operation-profit:beautician-user-backfill -- --storeId=6 --file=<账号绑定确认JSON>',
    'npm.cmd --prefix packages/server-v2 run operation-profit:assignee-backfill -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --file=<服务人候选确认JSON>',
    'npm.cmd --prefix packages/server-v2 run operation-profit:assignee-backfill -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --file=<服务人无候选确认JSON>',
    'npm.cmd --prefix packages/server-v2 run operation-profit:project-master-backfill -- --storeId=6 --from=2026-06-01 --to=2026-06-30 --file=<项目档案确认JSON>',
    'npm.cmd --prefix packages/server-v2 run operation-profit:backfill -- --storeId=6 --from=2026-06-01 --to=2026-06-30',
    '```',
    '',
    '上述命令均为预检或 dry-run；真实写库还需要在 dry-run 通过后再追加 `--apply --yes`。',
    '',
  ];

  return sections.join('\n');
}

function main() {
  const args = parseArgs();
  const outputPath = resolve(import.meta.dirname, '..', '..', '..', args.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  const workbook = buildWorkbook(args);
  writeFileSync(outputPath, workbook, 'utf8');
  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        output: args.output,
        summary: {
          written: true,
        },
        nextStep: 'Business fills confirmed JSON files, then run operation-profit:confirmation-audit --requireReady.',
      },
      null,
      2,
    ),
  );
}

main();
