import { spawnSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

type DryRunArgs = {
  storeId: number;
  from: string;
  to: string;
  assigneeFile: string;
  assigneeManualReviewFile: string;
  beauticianUserFile: string;
  staffUserFile?: string;
  projectMasterFile: string;
  summaryOnly: boolean;
};

type StepResult = {
  name: string;
  command: string;
  exitCode: number | null;
  skipped?: boolean;
};

function parseArgs(): DryRunArgs {
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  if (flags.has('--apply') || flags.has('--yes')) {
    throw new Error('operation-profit:confirmed-dry-run is read-only. Do not pass --apply or --yes.');
  }

  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : 6;
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('--storeId must be a positive integer');
  }
  const missingRequiredFiles = ['assigneeFile', 'assigneeManualReviewFile', 'beauticianUserFile', 'projectMasterFile'].filter((key) => !args.has(key));
  if (missingRequiredFiles.length) {
    throw new Error(
      `operation-profit:confirmed-dry-run requires explicit confirmation JSON files: ${missingRequiredFiles
        .map((key) => `--${key}=<confirmed-json>`)
        .join(', ')}. Do not rely on pending default files after business confirmation.`,
    );
  }

  return {
    storeId,
    from: args.get('from') ?? defaultFrom,
    to: args.get('to') ?? defaultTo,
    assigneeFile: args.get('assigneeFile') ?? 'docs/04-测试数据/operation-profit-assignee-candidates.pending.json',
    assigneeManualReviewFile: args.get('assigneeManualReviewFile') ?? 'docs/04-测试数据/operation-profit-assignee-manual-review.pending.json',
    beauticianUserFile: args.get('beauticianUserFile') ?? 'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
    staffUserFile: args.get('staffUserFile'),
    projectMasterFile: args.get('projectMasterFile') ?? 'docs/04-测试数据/operation-profit-project-master-candidates.pending.json',
    summaryOnly: flags.has('--summaryOnly'),
  };
}

function runStep(name: string, script: string, scriptArgs: string[]) {
  const command = `npm.cmd run ${script} -- ${scriptArgs.join(' ')}`;
  console.log(`\n===== ${name} =====`);
  console.log(command);
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', 'run', script, '--', ...scriptArgs], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  return { name, command, exitCode: result.status };
}

function main() {
  const args = parseArgs();
  const commonScope = [`--storeId=${args.storeId}`, `--from=${args.from}`, `--to=${args.to}`];
  const results: StepResult[] = [];

  results.push(
    runStep('confirmation hard gate', 'operation-profit:confirmation-audit', [
      ...commonScope,
      `--assigneeFile=${args.assigneeFile}`,
      `--assigneeManualReviewFile=${args.assigneeManualReviewFile}`,
      `--beauticianUserFile=${args.beauticianUserFile}`,
      ...(args.staffUserFile ? [`--staffUserFile=${args.staffUserFile}`] : []),
      `--projectMasterFile=${args.projectMasterFile}`,
      '--requireReady',
      ...(args.summaryOnly ? ['--summaryOnly'] : []),
    ]),
  );

  const confirmation = results[0];
  if (confirmation.exitCode !== 0) {
    const skipped = [
      ...(args.staffUserFile ? ['staff user create dry-run'] : []),
      'beautician user binding dry-run',
      'assignee candidate dry-run',
      'manual review assignee dry-run',
      'project master dry-run',
      'commission backfill dry-run',
    ].map((name) => ({ name, command: 'skipped because confirmation hard gate failed', exitCode: null, skipped: true }));
    results.push(...skipped);
    console.log(
      JSON.stringify(
        {
          mode: 'read-only-confirmed-dry-run',
          storeId: args.storeId,
          from: args.from,
          to: args.to,
          status: 'blocked_by_confirmation_gate',
          steps: results,
          nextStep: 'Complete business confirmation files and rerun this script. No dry-run backfill was executed.',
        },
        null,
        2,
      ),
    );
    process.exitCode = confirmation.exitCode ?? 2;
    return;
  }

  if (args.staffUserFile) {
    results.push(runStep('staff user create dry-run', 'operation-profit:staff-user-backfill', [`--storeId=${args.storeId}`, `--file=${args.staffUserFile}`]));
  }
  results.push(runStep('beautician user binding dry-run', 'operation-profit:beautician-user-backfill', [`--storeId=${args.storeId}`, `--file=${args.beauticianUserFile}`]));
  results.push(runStep('assignee candidate dry-run', 'operation-profit:assignee-backfill', [...commonScope, `--file=${args.assigneeFile}`]));
  results.push(runStep('manual review assignee dry-run', 'operation-profit:assignee-backfill', [...commonScope, `--file=${args.assigneeManualReviewFile}`]));
  results.push(runStep('project master dry-run', 'operation-profit:project-master-backfill', [...commonScope, `--file=${args.projectMasterFile}`]));
  results.push(runStep('commission backfill dry-run', 'operation-profit:backfill', commonScope));

  const failed = results.filter((result) => result.exitCode !== 0);
  console.log(
    JSON.stringify(
      {
        mode: 'read-only-confirmed-dry-run',
        storeId: args.storeId,
        from: args.from,
        to: args.to,
        status: failed.length ? 'dry_run_failed' : 'dry_run_complete',
        steps: results,
        nextStep: failed.length
          ? 'Resolve failed dry-run steps before any apply command.'
          : 'Review all dry-run plans with business owner before running individual --apply --yes commands.',
      },
      null,
      2,
    ),
  );
  process.exitCode = failed.length ? 1 : 0;
}

main();
