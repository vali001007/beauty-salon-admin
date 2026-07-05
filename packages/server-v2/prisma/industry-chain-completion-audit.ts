import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

type CloseLoopMode = 'dry-run' | 'apply';

type Report<T = any> = {
  name: string;
  path: string;
  exists: boolean;
  data: T | null;
  error: string | null;
};

const completionDefinitions = [
  '任一已发布标准品能看到是否已采用、采用到哪个本地产品。',
  '任一本地产品能看到来源标准品、BOM 使用情况、库存流水、采购记录、销售/服务消耗。',
  '任一低库存产品能判断是否有供应链映射和可用报价。',
  '有映射和报价的产品能从补货建议直接生成平台采购单。',
  '平台采购单能完成供应商确认、发货、门店收货、库存入库。',
  '收货入库能写批次、产品库存和库存流水。',
  '服务完成能按 BOM 扣库存。',
  '商品销售能生成销售出库流水。',
  '链路总览能显示每个阶段的数量和断点。',
  '真实数据库有可复验样例，不只停留在 mock 或单测。',
];

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
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

function reportPath(name: string) {
  return resolve(process.cwd(), `../../docs/04-测试数据/${name}-${businessDate}.json`);
}

function closeLoopReportName(mode: CloseLoopMode) {
  return `industry-chain-close-loop-${mode}`;
}

function resolveCloseLoopMode(): CloseLoopMode {
  const mode = argValue('mode', 'auto');
  if (mode === 'dry-run' || mode === 'apply') return mode;
  return existsSync(reportPath(closeLoopReportName('apply'))) ? 'apply' : 'dry-run';
}

function readJson<T = any>(name: string): Report<T> {
  const path = reportPath(name);
  try {
    if (!existsSync(path)) return { name, path, exists: false, data: null, error: '文件不存在' };
    return { name, path, exists: true, data: JSON.parse(readFileSync(path, 'utf8')) as T, error: null };
  } catch (error) {
    return { name, path, exists: true, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function reportState(report: Report) {
  if (!report.exists) return '缺失';
  if (report.error) return `读取失败：${report.error}`;
  return '已读取';
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

function proofLevel(status: string | undefined, reportsReady: boolean) {
  if (!reportsReady) return '报告缺失';
  if (status === 'pass') return '已证明';
  if (status === 'warning' || status === 'not_applicable') return '证据不足';
  if (status === 'fail') return '未完成';
  return '报告缺失';
}

function statusLabel(status: string | undefined) {
  return {
    pass: '通过',
    fail: '未通过',
    warning: '待关注',
    not_applicable: '当前无样本',
  }[String(status)] ?? '未知';
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function main() {
  const strict = hasFlag('strict');
  const mode = resolveCloseLoopMode();
  const generatedAt = new Date();
  const closeLoop = readJson(closeLoopReportName(mode));
  const completionGate = readJson('industry-chain-completion-gate');
  const sampleGate = readJson('industry-chain-sample-gate');
  const evidenceSummary = readJson(
    argValue('evidence-report', mode === 'apply' ? 'industry-chain-evidence-summary-post-apply-verify' : 'industry-chain-evidence-summary'),
  );

  const reportsReady = [closeLoop, completionGate, sampleGate, evidenceSummary].every((report) => report.exists && !report.error);
  const completionData: any = completionGate.data;
  const sampleData: any = sampleGate.data;
  const closeData: any = closeLoop.data;
  const evidenceData: any = evidenceSummary.data;
  const gates: any[] = Array.isArray(completionData?.gates) ? completionData.gates : [];
  const rows = completionDefinitions.map((definition, index) => {
    const gate = gates.find((item) => String(item.id) === String(index + 1));
    return {
      id: index + 1,
      definition,
      gateRequirement: gate?.requirement ?? '-',
      gateStatus: gate?.status ?? 'missing',
      proofLevel: proofLevel(gate?.status, reportsReady),
      evidence: gate?.evidence ?? '完成度闸门报告未提供证据。',
      nextAction: gate?.nextAction ?? '先刷新 completion gate 报告。',
    };
  });
  const proofCounts = rows.reduce<Record<string, number>>((sum, row) => {
    sum[row.proofLevel] = (sum[row.proofLevel] ?? 0) + 1;
    return sum;
  }, {});
  const allProven = reportsReady && rows.every((row) => row.proofLevel === '已证明');
  const blockers = unique([
    ...(Array.isArray(completionData?.blockingItems) ? completionData.blockingItems : []),
    ...(Array.isArray(sampleData?.gates)
      ? sampleData.gates.filter((gate: any) => gate.status !== 'pass').map((gate: any) => `${gate.name}：${gate.evidence}`)
      : []),
    ...(Array.isArray(evidenceData?.blockers) ? evidenceData.blockers : []),
  ]);
  const reportStatuses = [closeLoop, completionGate, sampleGate, evidenceSummary].map((report) => [
    report.name,
    reportState(report),
    report.path,
  ]);
  const summary = {
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: shanghaiTimestamp(generatedAt),
    businessDate,
    mode,
    strict,
    allProven,
    reportsReady,
    store: completionData?.store ?? sampleData?.store ?? evidenceData?.store ?? null,
    sourceState: {
      closeLoop: {
        executionReady: closeData?.executionReady ?? null,
        businessComplete: closeData?.businessComplete ?? null,
      },
      completionGate: {
        complete: completionData?.complete ?? null,
        statusCounts: completionData?.statusCounts ?? null,
      },
      sampleGate: {
        complete: sampleData?.complete ?? null,
        statusCounts: sampleData?.statusCounts ?? null,
      },
      evidenceSummary: {
        deliverableReady: evidenceData?.deliverableReady ?? null,
        closeLoopMode: evidenceData?.closeLoopMode ?? null,
      },
    },
    proofCounts,
    completionDefinitions: rows,
    blockers,
    reports: {
      closeLoop: { path: closeLoop.path, state: reportState(closeLoop) },
      completionGate: { path: completionGate.path, state: reportState(completionGate) },
      sampleGate: { path: sampleGate.path, state: reportState(sampleGate) },
      evidenceSummary: { path: evidenceSummary.path, state: reportState(evidenceSummary) },
    },
  };

  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-completion-audit-${businessDate}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-completion-audit-${businessDate}.json`);
  const markdown = `# 行业标准品到库存采购 BOM 销售链路完成定义审计

业务日期：${businessDate}

生成时间（北京时间）：${summary.generatedAtLocal}

生成时间（UTC）：${summary.generatedAt}

报告模式：${mode}

strict 模式：${strict ? '开启' : '关闭'}

验收门店：${summary.store ? `${summary.store.name}（ID ${summary.store.id}）` : '-'}

完成定义全部证明：${allProven ? '是' : '否'}

## 1. 报告读取状态

${table(['报告', '状态', '路径'], reportStatuses)}

## 2. 总体状态

${table(
  ['检查项', '当前值'],
  [
    ['reportsReady', String(reportsReady)],
    ['closeLoop.executionReady', String(summary.sourceState.closeLoop.executionReady ?? '-')],
    ['closeLoop.businessComplete', String(summary.sourceState.closeLoop.businessComplete ?? '-')],
    ['completionGate.complete', String(summary.sourceState.completionGate.complete ?? '-')],
    ['sampleGate.complete', String(summary.sourceState.sampleGate.complete ?? '-')],
    ['evidenceSummary.deliverableReady', String(summary.sourceState.evidenceSummary.deliverableReady ?? '-')],
    ['proofCounts', JSON.stringify(proofCounts)],
  ],
)}

## 3. 完成定义逐条审计

${table(
  ['序号', '完成定义', '证明等级', '闸门状态', '证据', '下一步'],
  rows.map((row) => [row.id, row.definition, row.proofLevel, statusLabel(row.gateStatus), row.evidence, row.nextAction]),
)}

## 4. 当前阻断项

${blockers.length ? blockers.map((item) => `- ${item}`).join('\n') : '- 暂无阻断项。'}

## 5. 复验命令

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run industry-chain:completion-audit
npm.cmd run check:industry-chain:post-apply
\`\`\`

说明：本审计只读取既有报告，不访问数据库，不执行写库。
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  console.log(`allProven=${allProven}`);
  if (strict && !allProven) {
    console.error('Strict completion audit failed: not all completion definitions are proven');
    process.exit(2);
  }
}

main();
