import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

type VerifyStep = {
  id: string;
  name: string;
  scriptPath: string;
  args: string[];
};

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function shanghaiTimestamp(date = new Date()) {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return `${value.replace(',', '')} Asia/Shanghai`;
}

function table(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function tail(value: string | null | undefined, maxLength = 4000) {
  if (!value) return '';
  return value.length > maxLength ? value.slice(value.length - maxLength) : value;
}

function runStep(step: VerifyStep) {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tsNodeBin = resolve(packageRoot, 'node_modules/ts-node/dist/bin.js');
  const result = spawnSync(process.execPath, [tsNodeBin, '--esm', step.scriptPath, ...step.args], {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_CONNECTION_TIMEOUT_MS: process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '30000',
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ?? '1',
    },
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(`${step.name} 执行失败：${result.error.message}`);

  return {
    ...step,
    status: result.status ?? 1,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
    ok: result.status === 0,
  };
}

function main() {
  const storeId = argValue('store-id', '6');
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outMd = resolve(packageRoot, argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-post-apply-verify-${today}.md`);
  const outJson = resolve(packageRoot, argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-post-apply-verify-${today}.json`);
  const evidenceSummaryOutMd = `../../docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-${today}.md`;
  const evidenceSummaryOutJson = `../../docs/04-测试数据/industry-chain-evidence-summary-post-apply-verify-${today}.json`;
  const completionAuditOutMd = `../../docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-${today}.md`;
  const completionAuditOutJson = `../../docs/04-测试数据/industry-chain-completion-audit-post-apply-verify-${today}.json`;
  const steps: VerifyStep[] = [
    {
      id: 'sample-gate',
      name: '样本级闭环闸门',
      scriptPath: 'prisma/industry-chain-sample-gate.ts',
      args: ['--strict', `--store-id=${storeId}`],
    },
    {
      id: 'completion-gate',
      name: '完成度闸门',
      scriptPath: 'prisma/industry-chain-completion-gate.ts',
      args: ['--strict', `--store-id=${storeId}`],
    },
    {
      id: 'evidence-summary',
      name: '收口证据汇总',
      scriptPath: 'prisma/industry-chain-evidence-summary.ts',
      args: ['--strict', '--mode=apply', `--out-md=${evidenceSummaryOutMd}`, `--out-json=${evidenceSummaryOutJson}`],
    },
    {
      id: 'completion-audit',
      name: '完成定义逐条审计',
      scriptPath: 'prisma/industry-chain-completion-audit.ts',
      args: [
        '--strict',
        '--mode=apply',
        '--evidence-report=industry-chain-evidence-summary-post-apply-verify',
        `--out-md=${completionAuditOutMd}`,
        `--out-json=${completionAuditOutJson}`,
      ],
    },
  ];

  const results = steps.map(runStep);
  const complete = results.every((result) => result.ok);
  const generatedAt = new Date();
  const summary = {
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: shanghaiTimestamp(generatedAt),
    businessDate: today,
    storeId,
    complete,
    evidenceSummary: {
      md: resolve(packageRoot, evidenceSummaryOutMd),
      json: resolve(packageRoot, evidenceSummaryOutJson),
    },
    completionAudit: {
      md: resolve(packageRoot, completionAuditOutMd),
      json: resolve(packageRoot, completionAuditOutJson),
    },
    results: results.map((result) => ({
      id: result.id,
      name: result.name,
      status: result.status,
      signal: result.signal,
      ok: result.ok,
      scriptPath: result.scriptPath,
      args: result.args,
      error: result.error,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    })),
  };

  const markdown = `# 行业标准品到库存采购 BOM 销售链路授权后复验报告

业务日期：${summary.businessDate}

生成时间（北京时间）：${summary.generatedAtLocal}

生成时间（UTC）：${summary.generatedAt}

验收门店 ID：${storeId}

总状态：${complete ? '通过' : '未通过'}

## 1. 闸门结果

${table(
  ['序号', '闸门', '结果', '退出码', '脚本'],
  results.map((result, index) => [
    index + 1,
    result.name,
    result.ok ? '通过' : '未通过',
    result.status,
    `${result.scriptPath} ${result.args.join(' ')}`,
  ]),
)}

## 2. 处理建议

${complete ? '- 已全部通过，可结合 close-loop apply 报告和写入审计确认交付。' : '- 存在未通过闸门。先查看本报告对应的样本级闸门、完成度闸门和 evidence summary 报告，再按阻断项处理后重跑本命令。'}

post-apply 专用 evidence summary：

- ${resolve(packageRoot, evidenceSummaryOutMd)}
- ${resolve(packageRoot, evidenceSummaryOutJson)}

post-apply 专用完成定义审计：

- ${resolve(packageRoot, completionAuditOutMd)}
- ${resolve(packageRoot, completionAuditOutJson)}

## 3. 子命令输出摘要

${results
  .map(
    (result) => `### ${result.name}

stdout:

\`\`\`text
${tail(result.stdout) || '-'}
\`\`\`

stderr:

\`\`\`text
${tail(result.stderr) || result.error || '-'}
\`\`\`
`,
  )
  .join('\n')}
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('\n行业标准品到库存采购 BOM 销售链路 post-apply 复验结果：');
  for (const result of results) {
    console.log(`- ${result.name}：${result.ok ? '通过' : `未通过(status=${result.status}${result.signal ? `, signal=${result.signal}` : ''})`}`);
  }
  console.log(`报告：${outMd}`);
  console.log(`JSON：${outJson}`);

  if (!complete) {
    process.exit(2);
  }
}

main();
