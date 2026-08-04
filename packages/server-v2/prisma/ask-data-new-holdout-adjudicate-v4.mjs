import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const EXPECTED_FROZEN_CHECKSUM = '9e978450a214ae62b8b715be3e71f1835b0b14279bc0847be0fba310450b4b5f';
const frozenPath = resolve(process.cwd(), argumentValue('--frozen=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v4.json');
const semanticBaselinePath = resolve(process.cwd(), argumentValue('--semantic-baseline=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout语义评测-v4-final-pre-adjudication.json');
const firstUnseenPath = resolve(process.cwd(), argumentValue('--first-unseen=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout语义评测-v4-first-unseen.json');
const ledgerPath = resolve(process.cwd(), argumentValue('--ledger=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout-v4裁定修正账本-2026-08-03.json');
const markdownPath = resolve(process.cwd(), argumentValue('--markdown=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout-v4裁定修正账本-2026-08-03.md');
const outputPath = resolve(process.cwd(), argumentValue('--output=')
  ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout裁定后合同-v4.json');

for (const protectedPath of [frozenPath, firstUnseenPath]) {
  if ([ledgerPath, markdownPath, outputPath].includes(protectedPath)) {
    throw new Error(`protected_v4_artifact_target:${protectedPath}`);
  }
}
if (!existsSync(firstUnseenPath)) throw new Error(`first_unseen_result_missing:${firstUnseenPath}`);

const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'));
if (frozen.checksum !== EXPECTED_FROZEN_CHECKSUM) {
  throw new Error(`frozen_v4_checksum_mismatch:${frozen.checksum}:${EXPECTED_FROZEN_CHECKSUM}`);
}
const semanticBaseline = JSON.parse(readFileSync(semanticBaselinePath, 'utf8'));
const firstUnseenChecksum = fileChecksum(firstUnseenPath);
const baselineChecksum = fileChecksum(semanticBaselinePath);
const frozenContracts = [...frozen.queryContracts, ...frozen.boundaryContracts];
const frozenById = new Map(frozenContracts.map((item) => [item.id, item]));

const entries = [];
for (const result of semanticBaseline.results ?? []) {
  if (result.planRequiredOutputHit && result.planResultModeHit) continue;
  entries.push(entry(result.id, 'semantic_output_contract', {
    requiredOutputFields: result.planOutputFields,
    requiredResultMode: result.planResultMode,
  }, '冻结合同将数据库物理字段当成回答语义别名；裁定为已逐题复核的 Query Plan 语义输出与结果粒度。'));
}

upsert(entries, entry('ask_holdout_v4:V4-Q071', 'governed_composite_metric', {
  expectedMetricKeys: ['inventory_usage_balance'],
  acceptableViews: ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
  requiredViews: ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'],
  requiredOutputFields: ['product_id', 'product_name', 'sku', 'consumed_quantity', 'current_stock'],
  requiredResultMode: 'grouped',
}, '“用了多少，还剩多少”是已治理的库存用量与结存复合指标，不应裂成两个基础指标。'));
upsert(entries, entry('ask_holdout_v4:V4-Q073', 'single_view_fact_completeness', {
  expectedMetricKeys: ['customer_profile'],
  acceptableViews: ['ask_data_customer_profile_summary_view'],
  requiredViews: ['ask_data_customer_profile_summary_view'],
  requiredOutputFields: ['customer_id', 'customer_name_masked', 'days_since_last_visit', 'ltv_tier', 'churn_risk_level'],
  requiredResultMode: 'detail',
}, '客户档案摘要视图已同时提供未到店天数、价值档位和流失风险，强制关联生命周期视图会增加不必要的复杂度。'));
upsert(entries, entry('ask_holdout_v4:V4-C006', 'relative_year_is_resolved', {
  mustClarify: false,
  allowedClarificationSlots: [],
}, '“今年中秋”已明确相对年份，不应再追问四位年份。'));
upsert(entries, entry('ask_holdout_v4:V4-C046', 'governed_bom_threshold', {
  allowedClarificationSlots: ['entity_identity'],
}, 'BOM 偏差异常已有绝对偏差超过 20% 的治理阈值，只需补充项目身份。'));
upsert(entries, entry('ask_holdout_v4:V4-B008', 'boundary_not_clarification', {
  mustClarify: false,
  allowedClarificationSlots: [],
}, '该问题是内容生成边界，应分流 Ami Brain，不应被 Ask 误认为指标比较澄清。'));
upsert(entries, entry('ask_holdout_v4:V4-B014', 'readonly_operation_boundary', {
  mustClarify: false,
  allowedClarificationSlots: [],
}, '该问题是资金审批写操作，Ask 应直接拒绝或分流受控业务流程，不应先追问对象。'));

entries.sort((left, right) => left.sequence.localeCompare(right.sequence));
for (const item of entries) {
  if (!frozenById.has(item.contractId)) throw new Error(`adjudication_contract_missing:${item.contractId}`);
}
const ledgerIdentity = {
  version: 1,
  frozenChecksum: frozen.checksum,
  semanticBaselineChecksum: baselineChecksum,
  firstUnseenChecksum,
  entries,
};
const adjudicationChecksum = sha256(JSON.stringify(ledgerIdentity));
const ledger = {
  ...ledgerIdentity,
  adjudicationChecksum,
  policy: {
    appendOnly: true,
    frozenContractImmutable: true,
    firstUnseenResultImmutable: true,
    independentHumanSignoff: 'pending',
  },
  summary: countEntries(entries),
};
writeImmutableJson(ledgerPath, ledger, 'adjudicationChecksum');

const patches = new Map(entries.map((item) => [item.contractId, item.patch]));
const apply = (item) => {
  const patch = patches.get(item.id);
  if (!patch) return item;
  return {
    ...item,
    ...patch,
    adjudicationIds: entries.filter((entryItem) => entryItem.contractId === item.id).map((entryItem) => entryItem.sequence),
  };
};
const queryContracts = frozen.queryContracts.map(apply);
const boundaryContracts = frozen.boundaryContracts.map(apply);
const adjudicated = {
  ...frozen,
  version: '4-adjudicated-1',
  frozenChecksum: frozen.checksum,
  adjudicationChecksum,
  sourceFrozenPath: frozenPath,
  sourceSemanticBaselinePath: semanticBaselinePath,
  protectedFirstUnseenPath: firstUnseenPath,
  reviewStatus: {
    ...frozen.reviewStatus,
    codexProductAdjudication: 'completed',
    codexTechnicalAdjudication: 'completed',
    independentHumanSignoff: 'pending',
  },
  summary: {
    ...frozen.summary,
    querySupported: queryContracts.filter((item) => item.supportClass === 'ask_query_supported' && !item.mustClarify).length,
    clarificationRequired: boundaryContracts.filter((item) => item.mustClarify && !item.runtimeResolutionRequired).length,
    adjudicationEntryCount: entries.length,
  },
  queryContracts,
  boundaryContracts,
};
adjudicated.checksum = sha256(JSON.stringify({
  frozenChecksum: frozen.checksum,
  adjudicationChecksum,
  queryContracts: queryContracts.map(contractIdentity),
  boundaryContracts: boundaryContracts.map(contractIdentity),
}));
writeImmutableJson(outputPath, adjudicated, 'checksum');
writeImmutableText(markdownPath, markdown(ledger, adjudicated));

if (fileChecksum(firstUnseenPath) !== firstUnseenChecksum) throw new Error('first_unseen_result_was_modified');
console.log(JSON.stringify({ ledgerPath, markdownPath, outputPath, adjudicationChecksum, checksum: adjudicated.checksum, summary: adjudicated.summary }, null, 2));

function entry(contractId, type, patch, reason) {
  const sourceId = contractId.split(':').at(-1);
  return {
    sequence: `V4-ADJ-${sourceId}`,
    contractId,
    type,
    patch,
    reason,
    productDecision: 'codex_reviewed',
    technicalDecision: 'codex_reviewed',
  };
}

function upsert(items, value) {
  const index = items.findIndex((item) => item.contractId === value.contractId);
  if (index < 0) items.push(value);
  else items[index] = {
    ...items[index],
    type: `${items[index].type}+${value.type}`,
    patch: { ...items[index].patch, ...value.patch },
    reason: `${items[index].reason}；${value.reason}`,
  };
}

function countEntries(items) {
  return {
    entryCount: items.length,
    queryOutputCorrections: items.filter((item) => item.type.includes('semantic_output_contract')).length,
    metricOrViewCorrections: items.filter((item) => /composite_metric|single_view/.test(item.type)).length,
    clarificationCorrections: items.filter((item) => /relative_year|bom_threshold/.test(item.type)).length,
    boundaryCorrections: items.filter((item) => /boundary|readonly_operation/.test(item.type)).length,
  };
}

function contractIdentity(item) {
  return {
    id: item.id,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    adjudicationIds: item.adjudicationIds ?? [],
  };
}

function markdown(ledgerValue, adjudicatedValue) {
  return [
    '# Ami Ask 全新独立 Holdout v4 裁定修正账本',
    '',
    `- 冻结合同 checksum：\`${ledgerValue.frozenChecksum}\``,
    `- 首次未见结果 checksum：\`${ledgerValue.firstUnseenChecksum}\``,
    `- 裁定账本 checksum：\`${ledgerValue.adjudicationChecksum}\``,
    `- 裁定后合同 checksum：\`${adjudicatedValue.checksum}\``,
    '- 不修改冻结合同，不覆盖首次未见结果；裁定只以只追加账本应用。',
    '- Codex 产品与技术裁定已完成；独立人工签字仍为 pending。',
    '',
    '## 裁定明细',
    '',
    '| 序号 | 合同 | 类型 | 原因 |',
    '|---|---|---|---|',
    ...ledgerValue.entries.map((item) => `| ${item.sequence} | \`${item.contractId}\` | ${item.type} | ${item.reason} |`),
    '',
  ].join('\n');
}

function writeImmutableJson(path, value, checksumField) {
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    if (existing[checksumField] !== value[checksumField]) {
      throw new Error(`append_only_artifact_changed:${basename(path)}:${existing[checksumField]}:${value[checksumField]}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeImmutableText(path, value) {
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== value) throw new Error(`append_only_markdown_changed:${basename(path)}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function fileChecksum(path) { return sha256(readFileSync(path)); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function argumentValue(prefix) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
