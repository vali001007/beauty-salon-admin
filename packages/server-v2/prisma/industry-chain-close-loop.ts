import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const today = new Date().toISOString().slice(0, 10);
const apply = process.argv.includes('--apply');
const yes = process.argv.includes('--yes');
const mode = apply && yes ? 'apply' : 'dry-run';
const scriptFiles: Record<string, string> = {
  'industry-chain:repair': 'prisma/industry-adoption-repair.ts',
  'industry-chain:baseline': 'prisma/industry-sku-chain-baseline.ts',
  'industry-chain:apply-readiness': 'prisma/industry-chain-apply-readiness.ts',
  'product-unit:repair': 'prisma/product-unit-repair.ts',
  'product-unit:audit': 'prisma/product-unit-consistency-audit.ts',
  'supply-platform:mvp-flow': 'prisma/supply-platform-mvp-flow.ts',
  'supply-platform:mvp-flow:dry-run': 'prisma/supply-platform-mvp-flow.ts',
  'supply-platform:mvp-flow:verify': 'prisma/supply-platform-mvp-flow.ts',
  'supply-platform:fulfillment-readiness': 'prisma/supply-platform-fulfillment-readiness.ts',
  'industry-chain:sample-gate': 'prisma/industry-chain-sample-gate.ts',
  'industry-chain:completion-gate': 'prisma/industry-chain-completion-gate.ts',
};

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function optionalArg(name: string) {
  const value = argValue(name);
  return value ? [`--${name}=${value}`] : [];
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function table(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

type Step = {
  id: string;
  title: string;
  script: string;
  args: string[];
  writes: boolean;
  requiredForCompletion: boolean;
};

type ApplyPreviewStep = {
  id: string;
  title: string;
  type: '写库' | '只读/预览';
  command: string;
};

type StepResult = Step & {
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  exitCode: number | null;
  attempts: number;
  stdoutTail: string;
  stderrTail: string;
};

function tail(value: string, max = 2400) {
  const normalized = String(value ?? '').trim();
  return normalized.length > max ? normalized.slice(normalized.length - max) : normalized;
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function commandText(script: string, args: string[]) {
  const file = scriptFiles[script] ?? script;
  return [process.execPath, 'node_modules/ts-node/dist/bin-esm.js', file, ...scriptModeArgs(script), ...args].join(' ');
}

function scriptModeArgs(script: string) {
  if (script === 'supply-platform:mvp-flow') return ['--apply', '--yes'];
  if (script === 'supply-platform:mvp-flow:dry-run') return ['--dry-run'];
  if (script === 'supply-platform:mvp-flow:verify') return ['--verify'];
  return [];
}

function runStep(step: Step): StepResult {
  const command = commandText(step.script, step.args);
  if (step.writes && mode !== 'apply') {
    return {
      ...step,
      command,
      status: 'skipped',
      exitCode: null,
      attempts: 0,
      stdoutTail: 'dry-run 模式跳过真实写库步骤。',
      stderrTail: '',
    };
  }

  const file = scriptFiles[step.script];
  if (!file) {
    return {
      ...step,
      command,
      status: 'failed',
      exitCode: null,
      attempts: 0,
      stdoutTail: '',
      stderrTail: `未配置脚本文件映射：${step.script}`,
    };
  }

  const maxAttempts = step.writes ? 1 : 3;
  let result: ReturnType<typeof spawnSync> | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    result = spawnSync(process.execPath, ['node_modules/ts-node/dist/bin-esm.js', file, ...scriptModeArgs(step.script), ...step.args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_CONNECTION_TIMEOUT_MS: process.env.DATABASE_CONNECTION_TIMEOUT_MS || '30000',
      },
      stdio: 'pipe',
      shell: false,
    });
    if (result.status === 0 || attempt === maxAttempts) break;
    sleep(1500 * attempt);
  }

  return {
    ...step,
    command,
    status: result?.status === 0 ? 'passed' : 'failed',
    exitCode: result?.status ?? null,
    attempts,
    stdoutTail: tail(result?.stdout ?? ''),
    stderrTail: tail(result?.stderr || result?.error?.message || ''),
  };
}

function reportPaths() {
  return {
    md: resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-close-loop-${mode}-${today}.md`),
    json: resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-close-loop-${mode}-${today}.json`),
  };
}

function completionGatePath() {
  return resolve(process.cwd(), `../../docs/04-测试数据/industry-chain-completion-gate-${today}.json`);
}

function readCompletionGate() {
  try {
    const raw = readFileSync(completionGatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      available: true,
      complete: Boolean(parsed.complete),
      checkedAt: parsed.checkedAt ?? null,
      statusCounts: parsed.statusCounts ?? null,
      blockingItems: Array.isArray(parsed.blockingItems) ? parsed.blockingItems : [],
    };
  } catch (error) {
    return {
      available: false,
      complete: false,
      checkedAt: null,
      statusCounts: null,
      blockingItems: [`无法读取完成度闸门 JSON：${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function buildApplySteps(storeId: string, strategy: string, mvpArgs: string[], readinessExtraArgs: string[]): Step[] {
  return [
    {
      id: '1',
      title: '收口前链路基线快照',
      script: 'industry-chain:baseline',
      args: [`--store-id=${storeId}`],
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '2',
      title: '收口前单位一致性巡检',
      script: 'product-unit:audit',
      args: [`--store-id=${storeId}`],
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '3',
      title: '真实写库前影响面快照',
      script: 'industry-chain:apply-readiness',
      args: [`--strategy=${strategy}`, `--store-id=${storeId}`, '--strict', ...readinessExtraArgs],
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '4',
      title: '修复失效采用记录',
      script: 'industry-chain:repair',
      args: [`--strategy=${strategy}`, `--store-id=${storeId}`, '--apply', '--yes'],
      writes: true,
      requiredForCompletion: true,
    },
    {
      id: '5',
      title: '修复 BOM 单位到规格单位',
      script: 'product-unit:repair',
      args: [`--store-id=${storeId}`, '--apply', '--yes'],
      writes: true,
      requiredForCompletion: true,
    },
    {
      id: '6',
      title: '执行供应链平台采购履约 MVP flow',
      script: 'supply-platform:mvp-flow',
      args: mvpArgs,
      writes: true,
      requiredForCompletion: true,
    },
    {
      id: '7',
      title: '供应链履约就绪度复验',
      script: 'supply-platform:fulfillment-readiness',
      args: [`--store-id=${storeId}`],
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '8',
      title: 'MVP flow verify 复验',
      script: 'supply-platform:mvp-flow:verify',
      args: mvpArgs,
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '9',
      title: '样本级闭环闸门',
      script: 'industry-chain:sample-gate',
      args: [`--store-id=${storeId}`, '--strict'],
      writes: false,
      requiredForCompletion: true,
    },
    {
      id: '10',
      title: '行业链路完成度闸门',
      script: 'industry-chain:completion-gate',
      args: [`--store-id=${storeId}`, '--strict'],
      writes: false,
      requiredForCompletion: true,
    },
  ];
}

function renderMarkdown(result: {
  generatedAt: string;
  mode: string;
  applyAllowed: boolean;
  applyPreview: ApplyPreviewStep[];
  steps: StepResult[];
  executionReady: boolean;
  businessComplete: boolean;
  completionGate: ReturnType<typeof readCompletionGate>;
}) {
  const failed = result.steps.filter((step) => step.status === 'failed');
  return `# 行业标准品到库存采购 BOM 销售链路收口编排报告

生成时间：${result.generatedAt}

模式：${result.mode}

applyAllowed：${result.applyAllowed}

执行计划就绪：${result.executionReady}

业务闸门完成：${result.businessComplete}

## 1. 步骤汇总

${table(
  ['步骤', '类型', '结果', '尝试', '退出码', '命令'],
  result.steps.map((step) => [
    step.title,
    step.writes ? '写库' : '只读/预览',
    step.status,
    step.attempts,
    step.exitCode ?? '-',
    step.command,
  ]),
)}

## 2. 失败步骤

${failed.length ? failed.map((step) => `- ${step.title}：${step.stderrTail || step.stdoutTail || '无输出'}`).join('\n') : '暂无。'}

## 3. 最终业务闸门

${table(
  ['检查项', '值'],
  [
    ['闸门 JSON', result.completionGate.available ? completionGatePath() : '缺失'],
    ['checkedAt', result.completionGate.checkedAt ?? '-'],
    ['complete', result.completionGate.complete],
    ['statusCounts', result.completionGate.statusCounts ? JSON.stringify(result.completionGate.statusCounts) : '-'],
  ],
)}

${result.completionGate.blockingItems.length ? result.completionGate.blockingItems.map((item) => `- ${item}`).join('\n') : '暂无阻断项。'}

## 4. 授权 apply 命令预览

${table(
  ['步骤', '类型', '命令'],
  result.applyPreview.map((step) => [step.title, step.type, step.command]),
)}

## 5. 步骤输出摘要

${result.steps
  .map(
    (step) => `### ${step.id}. ${step.title}

- 结果：${step.status}
- 尝试：${step.attempts}
- 命令：\`${step.command}\`

stdout：

\`\`\`text
${step.stdoutTail || '无'}
\`\`\`

stderr：

\`\`\`text
${step.stderrTail || '无'}
\`\`\`
`,
  )
  .join('\n')}

说明：

- dry-run 模式不会执行真实写库步骤，只执行预览和只读验收。
- 只读/预览步骤最多自动尝试 3 次，并在失败后短暂退避；写库步骤不自动重试，避免重复写入。
- apply 模式必须传入 \`--apply --yes\`，会按顺序修复采用记录、修复 BOM 单位、创建供应链履约样本，并执行只读验收。
- apply 模式下，只有最终完成度闸门 \`complete=true\` 才视为业务闭环完成。
`;
}

async function main() {
  if (apply && !yes) {
    throw new Error('真实写库必须同时传入 --apply --yes。');
  }

  const storeId = argValue('store-id', argValue('storeId', '6'))!;
  const strategy = argValue('strategy', 'mark-invalid')!;
  const quantity = argValue('quantity');
  const skipLowStockSample = hasFlag('skip-low-stock-sample');
  const mvpArgs = [
    ...(quantity ? [`--quantity=${quantity}`] : []),
    `--storeId=${storeId}`,
    ...(skipLowStockSample ? ['--skip-low-stock-sample'] : []),
  ];
  const guardArgs = [
    ...optionalArg('max-broken-adoptions'),
    ...optionalArg('max-bom-unit-repairs'),
    ...optionalArg('max-stock-increment'),
  ];
  const readinessArgs = [...mvpArgs.filter((arg) => !arg.startsWith('--storeId=')), ...guardArgs];
  const applySteps = buildApplySteps(storeId, strategy, mvpArgs, readinessArgs);
  const readinessExtraArgs = readinessArgs;
  const applyPreview: ApplyPreviewStep[] = applySteps.map((step) => ({
    id: step.id,
    title: step.title,
    type: step.writes ? '写库' : '只读/预览',
    command: commandText(step.script, step.args),
  }));

  const steps: Step[] =
    mode === 'apply'
      ? applySteps
      : [
          {
            id: '1',
            title: '收口前链路基线快照',
            script: 'industry-chain:baseline',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '2',
            title: '收口前单位一致性巡检',
            script: 'product-unit:audit',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '3',
            title: '真实写库前影响面快照',
            script: 'industry-chain:apply-readiness',
            args: [`--strategy=${strategy}`, `--store-id=${storeId}`, '--strict', ...readinessExtraArgs],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '4',
            title: '失效采用记录修复预览',
            script: 'industry-chain:repair',
            args: [`--strategy=${strategy}`, `--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '5',
            title: 'BOM 单位修复预览',
            script: 'product-unit:repair',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '6',
            title: '供应链平台采购履约 MVP flow dry-run',
            script: 'supply-platform:mvp-flow:dry-run',
            args: mvpArgs,
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '7',
            title: '供应链履约就绪度只读验收',
            script: 'supply-platform:fulfillment-readiness',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '8',
            title: '样本级闭环闸门',
            script: 'industry-chain:sample-gate',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
          {
            id: '9',
            title: '行业链路完成度闸门',
            script: 'industry-chain:completion-gate',
            args: [`--store-id=${storeId}`],
            writes: false,
            requiredForCompletion: true,
          },
        ];

  const results: StepResult[] = [];
  for (const step of steps) {
    const result = runStep(step);
    results.push(result);
    if (result.status === 'failed') break;
  }

  const executionReady = results.every((step) => !step.requiredForCompletion || step.status === 'passed');
  const completionGate = readCompletionGate();
  const businessComplete = completionGate.available && completionGate.complete;
  const result = {
    generatedAt: new Date().toISOString(),
    mode,
    applyAllowed: mode === 'apply',
    executionReady,
    businessComplete,
    completionGate,
    parameters: {
      storeId,
      strategy,
      quantity: quantity ?? null,
      skipLowStockSample,
    },
    applyPreview,
    steps: results,
  };

  const paths = reportPaths();
  ensureOutput(paths.md);
  ensureOutput(paths.json);
  writeFileSync(paths.md, renderMarkdown(result), 'utf8');
  writeFileSync(paths.json, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${paths.md}`);
  console.log(`Wrote ${paths.json}`);
  console.log(`mode=${mode} executionReady=${executionReady} businessComplete=${businessComplete}`);

  if (!executionReady) process.exitCode = 2;
  if (mode === 'apply' && !businessComplete) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
