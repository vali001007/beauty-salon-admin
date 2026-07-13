import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
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
  return resolve(process.cwd(), `../../docs/04-测试数据/${name}-${today}.json`);
}

type CloseLoopMode = 'dry-run' | 'apply';

function closeLoopReportName(mode: CloseLoopMode) {
  return `industry-chain-close-loop-${mode}`;
}

function resolveCloseLoopMode(): CloseLoopMode {
  const mode = argValue('mode', 'auto');
  if (mode === 'dry-run' || mode === 'apply') return mode;
  if (existsSync(reportPath(closeLoopReportName('apply')))) return 'apply';
  return 'dry-run';
}

function readJson<T = any>(name: string): { exists: boolean; path: string; data: T | null; error: string | null } {
  const path = reportPath(name);
  try {
    if (!existsSync(path)) {
      return { exists: false, path, data: null, error: '文件不存在' };
    }
    return { exists: true, path, data: JSON.parse(readFileSync(path, 'utf8')) as T, error: null };
  } catch (error) {
    return { exists: true, path, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function table(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function bool(value: unknown) {
  return Boolean(value);
}

function passFail(value: unknown) {
  return bool(value) ? '通过' : '未通过';
}

function reportState(report: ReturnType<typeof readJson>) {
  if (!report.exists) return '缺失';
  if (report.error) return `读取失败：${report.error}`;
  return '已读取';
}

function valueOrDash(value: unknown) {
  return value === undefined || value === null ? '-' : value;
}

function main() {
  const strict = hasFlag('strict');
  const closeLoopMode = resolveCloseLoopMode();
  const closeLoop = readJson(closeLoopReportName(closeLoopMode));
  const readiness = readJson('industry-chain-apply-readiness');
  const sampleGate = readJson('industry-chain-sample-gate');
  const completionGate = readJson('industry-chain-completion-gate');
  const baseline = readJson('industry-sku-chain-baseline');
  const unitAudit = readJson('product-unit-consistency-audit');
  const fulfillment = readJson('supply-platform-fulfillment-readiness');

  const closeData: any = closeLoop.data;
  const readinessData: any = readiness.data;
  const sampleData: any = sampleGate.data;
  const completionData: any = completionGate.data;
  const baselineData: any = baseline.data;
  const unitData: any = unitAudit.data;
  const fulfillmentData: any = fulfillment.data;

  const reportStatuses = [
    [`close-loop ${closeLoopMode}`, reportState(closeLoop), closeLoop.path],
    ['apply readiness', reportState(readiness), readiness.path],
    ['sample gate', reportState(sampleGate), sampleGate.path],
    ['completion gate', reportState(completionGate), completionGate.path],
    ['baseline', reportState(baseline), baseline.path],
    ['unit audit', reportState(unitAudit), unitAudit.path],
    ['fulfillment readiness', reportState(fulfillment), fulfillment.path],
  ];

  const evidenceChecks = [
    {
      id: '1',
      name: '执行计划就绪',
      pass: closeData?.executionReady === true,
      evidence: `executionReady=${closeData?.executionReady ?? '-'}`,
      nextAction:
        closeLoopMode === 'apply'
          ? '查看 apply 报告中的失败步骤和失败类型。'
          : '先运行 industry-chain:close-loop dry-run，确保所有只读/预览步骤通过。',
    },
    {
      id: '2',
      name: '真实业务闸门完成',
      pass: closeData?.businessComplete === true,
      evidence: `businessComplete=${closeData?.businessComplete ?? '-'}`,
      nextAction: '授权执行 close-loop apply 后复验。',
    },
    {
      id: '3',
      name: 'readiness guard 通过',
      pass: readinessData?.guard?.pass === true,
      evidence: `guard=${readinessData?.guard?.pass ?? '-'}；brokenAdoptions=${readinessData?.brokenAdoptions?.length ?? '-'}；bomUnitRepairs=${readinessData?.bomUnitRepairs?.length ?? '-'}`,
      nextAction: '若 guard 失败，先缩小影响面或调整 guard 上限。',
    },
    {
      id: '4',
      name: '样本级闸门完成',
      pass: sampleData?.complete === true,
      evidence: `complete=${sampleData?.complete ?? '-'}；pass=${sampleData?.statusCounts?.pass ?? '-'}；fail=${sampleData?.statusCounts?.fail ?? '-'}`,
      nextAction: '授权 apply 后要求 10 个样本节点全部通过。',
    },
    {
      id: '5',
      name: '完成度闸门完成',
      pass: completionData?.complete === true,
      evidence: `complete=${completionData?.complete ?? '-'}；pass=${completionData?.statusCounts?.pass ?? '-'}；fail=${completionData?.statusCounts?.fail ?? '-'}`,
      nextAction: '授权 apply 后要求 10 条完成标准全部通过。',
    },
    {
      id: '6',
      name: '没有脚本/连接失败',
      pass: Array.isArray(closeData?.steps) && closeData.steps.every((step: any) => step.failureType === 'none'),
      evidence: Array.isArray(closeData?.steps)
        ? closeData.steps.map((step: any) => `${step.id}:${step.failureType}`).join(', ')
        : '无步骤结果',
      nextAction: '若出现 db_timeout，先恢复数据库连接后重跑；若 script_error，先修脚本或数据。',
    },
  ];

  const deliverableReady = evidenceChecks.every((item) => item.pass);
  const baselineSummary = baselineData?.summary ?? {};
  const completionCounts = completionData?.counts ?? {};
  const fulfillmentCounts = fulfillmentData?.counts ?? {};
  const realDataAcceptanceRows = [
    ['标准品总数', valueOrDash(baselineSummary.productTemplates), 'baseline.summary.productTemplates'],
    ['有效采用数', valueOrDash(baselineSummary.adoptionValidActive), 'baseline.summary.adoptionValidActive'],
    ['失效采用数', valueOrDash(baselineSummary.adoptionInvalid), 'baseline.summary.adoptionInvalid'],
    ['本地产品数', valueOrDash(baselineSummary.activeProducts), 'baseline.summary.activeProducts'],
    ['已进入 BOM 的产品数', valueOrDash(completionCounts.productsInBom ?? baselineSummary.productsInBom), 'completion.counts.productsInBom'],
    ['有库存流水的产品数', valueOrDash(completionCounts.productsWithStockMovements), 'completion.counts.productsWithStockMovements'],
    ['有供应链映射的产品数', valueOrDash(completionCounts.activeMappings ?? baselineSummary.supplyMappings), 'completion.counts.activeMappings'],
    ['有可用报价的产品数', valueOrDash(completionCounts.mappingsWithQuote ?? baselineSummary.supplyMappingsWithQuote), 'completion.counts.mappingsWithQuote'],
    ['低库存样本数', valueOrDash(completionCounts.lowStockProducts), 'completion.counts.lowStockProducts'],
    ['低库存样本中有供应链映射数量', valueOrDash(completionCounts.lowStockWithMapping), 'completion.counts.lowStockWithMapping'],
    ['低库存样本中有可用报价数量', valueOrDash(completionCounts.lowStockWithQuote), 'completion.counts.lowStockWithQuote'],
    ['平台采购单数', valueOrDash(completionCounts.replenishmentOrders ?? fulfillmentCounts.replenishmentOrders), 'completion.counts.replenishmentOrders'],
    ['平台收货入库流水数', valueOrDash(completionCounts.procurementInboundMovements ?? fulfillmentCounts.stockMovements), 'completion.counts.procurementInboundMovements'],
  ];
  const businessImpactRows = [
    [
      '本地经营基础',
      baselineSummary.activeProducts ? '已具备' : '待补齐',
      `本地产品 ${valueOrDash(baselineSummary.activeProducts)}；进入 BOM 产品 ${valueOrDash(completionCounts.productsInBom ?? baselineSummary.productsInBom)}；有库存流水产品 ${valueOrDash(completionCounts.productsWithStockMovements)}`,
      '门店内部库存、BOM 扣耗和销售出库已有基础证据。',
    ],
    [
      '标准品采用健康',
      baselineSummary.adoptionInvalid ? '待修复' : '已通过',
      `有效采用 ${valueOrDash(baselineSummary.adoptionValidActive)}；失效采用 ${valueOrDash(baselineSummary.adoptionInvalid)}`,
      '存在失效采用时，标准品到本地 SKU 的关系不能作为完整交付证据。',
    ],
    [
      '平台采购可用性',
      completionCounts.activeMappings && completionCounts.mappingsWithQuote ? '已具备' : '待写入/待运营配置',
      `供应链映射 ${valueOrDash(completionCounts.activeMappings ?? baselineSummary.supplyMappings)}；可用报价 ${valueOrDash(completionCounts.mappingsWithQuote ?? baselineSummary.supplyMappingsWithQuote)}`,
      '映射和有效报价为 0 时，补货建议只能走手工采购兜底，不能自动生成平台采购单。',
    ],
    [
      '履约闭环证据',
      completionCounts.replenishmentOrders && completionCounts.procurementInboundMovements ? '已具备' : '待写入',
      `平台采购单 ${valueOrDash(completionCounts.replenishmentOrders ?? fulfillmentCounts.replenishmentOrders)}；平台入库流水 ${valueOrDash(completionCounts.procurementInboundMovements ?? fulfillmentCounts.stockMovements)}`,
      '平台采购单、发货收货、入库流水和结算未形成前，供应链闭环仍不可交付。',
    ],
    [
      '最终交付判定',
      deliverableReady ? '可交付' : '未完成',
      `deliverableReady=${deliverableReady}；businessComplete=${closeData?.businessComplete ?? '-'}`,
      closeLoopMode === 'apply'
        ? 'apply 报告仍未达标时，按阻断项逐条处理后复验。'
        : '当前是 dry-run 证据，需授权执行 close-loop apply 后复验。',
    ],
  ];
  const blockers = [
    ...(Array.isArray(closeData?.completionGate?.blockingItems) ? closeData.completionGate.blockingItems : []),
    ...(Array.isArray(sampleData?.gates)
      ? sampleData.gates.filter((gate: any) => gate.status !== 'pass').map((gate: any) => `${gate.name}：${gate.evidence}`)
      : []),
  ];

  const generatedAt = new Date();
  const summary = {
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: shanghaiTimestamp(generatedAt),
    businessDate: today,
    closeLoopMode,
    strict,
    deliverableReady,
    store: closeData?.parameters?.storeId
      ? { id: Number(closeData.parameters.storeId), name: sampleData?.store?.name ?? completionData?.store?.name ?? '-' }
      : sampleData?.store ?? completionData?.store ?? null,
    reports: {
      closeLoop: { path: closeLoop.path, state: reportState(closeLoop) },
      readiness: { path: readiness.path, state: reportState(readiness) },
      sampleGate: { path: sampleGate.path, state: reportState(sampleGate) },
      completionGate: { path: completionGate.path, state: reportState(completionGate) },
      baseline: { path: baseline.path, state: reportState(baseline) },
      unitAudit: { path: unitAudit.path, state: reportState(unitAudit) },
      fulfillment: { path: fulfillment.path, state: reportState(fulfillment) },
    },
    sourceSnapshots: {
      closeLoop: {
        generatedAt: closeData?.generatedAt ?? null,
        mode: closeData?.mode ?? closeLoopMode,
        executionReady: closeData?.executionReady ?? null,
        businessComplete: closeData?.businessComplete ?? null,
      },
      readiness: {
        generatedAt: readinessData?.generatedAt ?? null,
        guardPass: readinessData?.guard?.pass ?? null,
      },
      sampleGate: {
        checkedAt: sampleData?.checkedAt ?? null,
        complete: sampleData?.complete ?? null,
        sample: sampleData?.sample ?? null,
      },
      completionGate: {
        checkedAt: completionData?.checkedAt ?? null,
        complete: completionData?.complete ?? null,
        statusCounts: completionData?.statusCounts ?? null,
      },
      baseline: {
        generatedAt: baselineData?.generatedAt ?? null,
        summary: baselineData?.summary ?? null,
      },
      unitAudit: {
        checkedAt: unitData?.checkedAt ?? null,
        totals: unitData?.totals ?? null,
      },
      fulfillment: {
        checkedAt: fulfillmentData?.checkedAt ?? null,
        complete: fulfillmentData?.complete ?? null,
        counts: fulfillmentData?.counts ?? null,
      },
    },
    realDataAcceptance: realDataAcceptanceRows.map(([name, value, source]) => ({ name, value, source })),
    businessImpact: businessImpactRows.map(([area, status, evidence, impact]) => ({ area, status, evidence, impact })),
    evidenceChecks,
    blockers: [...new Set(blockers)],
  };

  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-evidence-summary-${today}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-evidence-summary-${today}.json`);

const markdown = `# 行业标准品到库存采购 BOM 销售链路收口证据汇总

业务日期：${summary.businessDate}

生成时间（北京时间）：${summary.generatedAtLocal}

生成时间（UTC）：${summary.generatedAt}

close-loop 报告模式：${closeLoopMode}

strict 模式：${strict ? '开启' : '关闭'}

交付状态：${deliverableReady ? '可交付' : '未完成'}

验收门店：${summary.store ? `${summary.store.name}（ID ${summary.store.id}）` : '-'}

## 1. 报告读取状态

${table(['报告', '状态', '路径'], reportStatuses)}

## 2. 交付判定

${table(
  ['序号', '检查项', '结果', '证据', '下一步'],
  evidenceChecks.map((item) => [item.id, item.name, passFail(item.pass), item.evidence, item.nextAction]),
)}

## 3. 当前阻断项

${summary.blockers.length ? summary.blockers.map((item: string) => `- ${item}`).join('\n') : '- 暂无阻断项。'}

## 4. 真实数据验收摘要

${table(
  ['指标', '当前值', '证据来源'],
  realDataAcceptanceRows,
)}

## 5. 业务影响与交付口径

${table(
  ['范围', '状态', '证据', '交付影响'],
  businessImpactRows,
)}

## 6. 授权后验收命令

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run industry-chain:close-loop -- --apply --yes
npm.cmd --prefix packages/server-v2 run industry-chain:evidence-summary:strict -- --mode=apply
\`\`\`

说明：本汇总只读，不会创建、修复或删除任何业务数据。
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  console.log(`deliverableReady=${deliverableReady}`);
  if (strict && !deliverableReady) {
    console.error('Strict evidence summary failed: deliverableReady=false');
    process.exit(2);
  }
}

main();
