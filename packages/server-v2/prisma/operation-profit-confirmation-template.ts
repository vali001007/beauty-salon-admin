import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type TemplateArgs = {
  assigneeFile: string;
  assigneeManualReviewFile: string;
  beauticianUserFile: string;
  staffUserFile: string;
  projectMasterFile: string;
  outputDir: string;
};

const PLACEHOLDER_CONFIRMER = 'TODO_REAL_BUSINESS_CONFIRMER';

function parseArgs(): TemplateArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  if (args.has('confirmer')) {
    throw new Error('Do not pass --confirmer. This script only generates TODO drafts; business must confirm each JSON item explicitly.');
  }

  return {
    assigneeFile: args.get('assigneeFile') ?? 'docs/04-测试数据/operation-profit-assignee-candidates.pending.json',
    assigneeManualReviewFile: args.get('assigneeManualReviewFile') ?? 'docs/04-测试数据/operation-profit-assignee-manual-review.pending.json',
    beauticianUserFile: args.get('beauticianUserFile') ?? 'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
    staffUserFile: args.get('staffUserFile') ?? 'docs/04-测试数据/operation-profit-staff-user-create.pending.json',
    projectMasterFile: args.get('projectMasterFile') ?? 'docs/04-测试数据/operation-profit-project-master-candidates.pending.json',
    outputDir: args.get('outputDir') ?? 'docs/04-测试数据/operation-profit-confirmation-drafts',
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

function withConfirmedBy<T extends Record<string, unknown>>(items: T[]) {
  return items.map((item) => ({ ...item, confirmedBy: PLACEHOLDER_CONFIRMER }));
}

function buildTemplates(args: TemplateArgs) {
  const assignee = readJson(args.assigneeFile);
  const manualReview = readJson(args.assigneeManualReviewFile);
  const beauticianUser = readJson(args.beauticianUserFile);
  const staffUser = readJson(args.staffUserFile);
  const projectMaster = readJson(args.projectMasterFile);

  if (!Array.isArray(assignee?.assignments)) throw new Error('Assignee file must contain assignments array.');
  if (!Array.isArray(manualReview?.items)) throw new Error('Manual review file must contain items array.');
  if (!Array.isArray(beauticianUser?.bindings)) throw new Error('Beautician user file must contain bindings array.');
  if (!Array.isArray(staffUser?.users)) throw new Error('Staff user file must contain users array.');
  if (!Array.isArray(projectMaster?.fixes)) throw new Error('Project master file must contain fixes array.');

  return {
    'operation-profit-assignee-confirmed.draft.json': {
      ...assignee,
      purpose: 'operation-profit-assignee-confirmed-business-template',
      warning: 'Draft only. Replace TODO values, confirm every assignment, then run confirmation-audit --requireReady before dry-run/apply.',
      assignments: withConfirmedBy(assignee.assignments),
    },
    'operation-profit-assignee-manual-review-confirmed.draft.json': {
      ...manualReview,
      purpose: 'operation-profit-assignee-manual-review-confirmed-business-template',
      warning:
        'Draft only. For every item choose resolution=assign/historical_exception/ignore_non_margin. If resolution=assign, beauticianId is required.',
      items: withConfirmedBy(
        manualReview.items.map((item: Record<string, unknown>) => ({
          ...item,
          resolution: item.resolution ?? 'TODO_assign_or_historical_exception_or_ignore_non_margin',
          ...(item.beauticianId ? { beauticianId: item.beauticianId } : { beauticianIdTodo: 'TODO_REQUIRED_IF_ASSIGN' }),
        })),
      ),
    },
    'operation-profit-beautician-user-bindings-confirmed.draft.json': {
      ...beauticianUser,
      purpose: 'operation-profit-beautician-user-bindings-confirmed-business-template',
      warning: 'Draft only. Confirm every beauticianId/userId binding before running confirmation-audit --requireReady.',
      bindings: withConfirmedBy(beauticianUser.bindings),
    },
    'operation-profit-staff-user-create-confirmed.draft.json': {
      ...staffUser,
      purpose: 'operation-profit-staff-user-create-confirmed-business-template',
      warning:
        'Draft only. Confirm every staff user account create plan, username, role, store, and password policy before running confirmation-audit --requireReady.',
      users: withConfirmedBy(staffUser.users),
    },
    'operation-profit-project-master-confirmed.draft.json': {
      ...projectMaster,
      purpose: 'operation-profit-project-master-confirmed-business-template',
      warning: 'Draft only. Choose resolution=repair_project or historical_exception for every item before running confirmation-audit --requireReady.',
      fixes: withConfirmedBy(projectMaster.fixes),
    },
  };
}

function main() {
  const args = parseArgs();
  const outputDir = resolve(import.meta.dirname, '..', '..', '..', args.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const templates = buildTemplates(args);
  const written = Object.entries(templates).map(([fileName, content]) => {
    const outputPath = resolve(outputDir, fileName);
    writeFileSync(outputPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
    return `${args.outputDir}/${fileName}`.replace(/\\/g, '/');
  });

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        outputDir: args.outputDir,
        confirmer: PLACEHOLDER_CONFIRMER,
        written,
        nextStep:
          'Business replaces TODO values, then run operation-profit:confirmation-audit --requireReady --summaryOnly with these draft files.',
      },
      null,
      2,
    ),
  );
}

main();
