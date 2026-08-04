import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const manifestPath = resolve(process.cwd(), argumentValue('--manifest=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-manifest.json');
const livePath = resolve(process.cwd(), argumentValue('--live=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-live-results.json');
const retryPath = resolve(process.cwd(), argumentValue('--retry=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/transient-retry-results.json');
const reportPath = resolve(process.cwd(), argumentValue('--report=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/Ami-Ask-Agent问题库实测报告-2026-08-02.md');
const csvPath = resolve(process.cwd(), argumentValue('--csv=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-detailed.csv');

const manifest = readJson(manifestPath);
const live = readJson(livePath);
const retry = readJson(retryPath);
const results = live.results;
const resultById = new Map(results.map((item) => [item.id, item]));
const supportLabels = {
  ask_query_supported: 'Ask 明确支持并实测',
  ask_query_low_confidence: 'Ask 低置信候选并实测',
  clarification_required: '需要补充实体、阈值或上下文',
  multi_turn_context_required: '依赖多轮上下文',
  ask_readonly_boundary: '管理端可操作但 Ask 只读',
  ask_sensitive_boundary: '敏感字段禁止查询',
  ask_scope_limit: '超出单店、时间、行数或双视图范围',
  admin_supported_ask_not_open: '管理端/后台已有相邻能力，Ask 未开放',
  brain_content_or_advice: '策划、诊断或内容生成，适合 Ami Brain',
  admin_backend_unsupported: '管理端/后台暂无结构化闭环',
};
const failureLabels = {
  candidate_selector_miss: '语义候选召回错误',
  semantic_clarification: '语义层无理由或过度澄清',
  AiStructuredOutputError: '模型结构化输出临时不可用',
  clarification: 'SQL 模型仍要求澄清',
  guard_sensitive_field_selected: 'SQL 选择受限字段，被 Guard 拦截',
  model_view_selection_miss: '候选正确但 SQL 模型选错视图',
};

const count = (predicate) => results.filter(predicate).length;
const semanticTimes = results.map((item) => item.semanticRoutingMs).filter(Number.isFinite).sort(numeric);
const deterministicFast = results
  .filter((item) => item.semanticRouteMode === 'deterministic' && item.failureCategory !== 'semantic_clarification')
  .map((item) => item.semanticRoutingMs)
  .filter(Number.isFinite)
  .sort(numeric);
const modelFallbackCount = count((item) => item.semanticRouteMode === 'model_fallback');
const candidateHitCount = count((item) => item.candidateExpectedHit);
const expectedHitCount = count((item) => item.expectedViewHit);
const generationReadyCount = count((item) => item.generationStatus === 'ready');
const databaseExecutedCount = count((item) => Object.hasOwn(item, 'rowCount'));
const groundedCount = count((item) => item.answerGrounded === true);
const strictPassCount = count((item) => item.status === 'pass');
const retryRecovered = retry.results.filter((item) => item.status === 'pass');
const unsupported = manifest.questions.filter((item) => item.supportClass === 'admin_backend_unsupported');
const byRole = groupBy(results, (item) => item.role);

const lines = [];
lines.push('# Ami Ask Agent 问题库实测报告（2026-08-02）', '');
lines.push('## 一、结论', '');
lines.push(
  `本轮对原题库 ${manifest.sourceQuestionCount} 题先做产品边界分类，再对其中 ${results.length} 题执行 Ami Ask 真实链路。原始一轮严格通过 ${strictPassCount}/${results.length}（${percent(strictPassCount, results.length)}）；SQL 已真实执行并生成有据回答 ${groundedCount}/${results.length}（${percent(groundedCount, results.length)}）。`,
  '',
  '当前结果说明 Ami Ask 已能稳定回答订单、预约、基础库存、采购、客户反馈、优惠、已确认利润和营销 ROI 等明确指标，但尚不能把它当成覆盖整套 Agent 题库的通用经营助理。主要短板仍是同义词归属、低置信路由、过度澄清和模型结构化输出稳定性。',
  '',
  `本轮识别出 ${unsupported.length} 题属于“管理端/后台尚未形成可直接回答的结构化事实闭环”，已在第八节逐题标记。另有 ${manifest.summary.bySupportClass.admin_supported_ask_not_open} 题属于管理端或后台已有相邻业务入口、但当前 34 个 Ask 视图没有开放所需字段或组合口径。`,
  '',
);
lines.push('## 二、测试范围与判定口径', '');
lines.push(
  `- 题库：${manifest.sourcePath}`,
  `- 总题数：${manifest.sourceQuestionCount}`,
  `- 真实执行题：${results.length}，覆盖 ${manifest.coveredViews}/34 个 Ask 视图`,
  `- 数据环境：门店 ${live.storeId}，development_admin 连接；这只是开发实测证据，不代表生产专用只读角色验收`,
  `- 模型：${results.find((item) => item.model)?.model ?? 'unknown'}；并发 ${live.concurrency}`,
  '- 严格通过：目标治理视图命中、SQL 通过 Guard、数据库执行成功、回答中的数字可由结果集或时间范围支撑。该自动判定比“接口成功”严格，但仍不等于人工业务专家逐字复核。',
  '- 未把策划建议、写操作、敏感字段、多轮上下文和后台无数据闭环的问题强行发送给 SQL 模型。',
  '',
);
lines.push('## 三、650 题产品边界分类', '', '| 分类 | 题数 | 占比 | 产品含义 |', '|---|---:|---:|---|');
for (const [key, value] of Object.entries(manifest.summary.bySupportClass)) {
  lines.push(`| ${supportLabels[key] ?? key} | ${value} | ${percent(value, manifest.sourceQuestionCount)} | ${supportMeaning(key)} |`);
}
lines.push('', '## 四、真实执行指标', '', '| 指标 | 结果 | 说明 |', '|---|---:|---|');
lines.push(
  `| 语义候选包含目标视图 | ${candidateHitCount}/${results.length}（${percent(candidateHitCount, results.length)}） | 候选召回能力 |`,
  `| 最终 SQL 命中目标治理视图 | ${expectedHitCount}/${results.length}（${percent(expectedHitCount, results.length)}） | 视图选择准确率 |`,
  `| SQL 模型返回 ready | ${generationReadyCount}/${results.length}（${percent(generationReadyCount, results.length)}） | 不含澄清和结构化输出失败 |`,
  `| 数据库真实执行成功 | ${databaseExecutedCount}/${results.length}（${percent(databaseExecutedCount, results.length)}） | 已经过 Guard 和成本门禁 |`,
  `| 回答数字有结果依据 | ${groundedCount}/${results.length}（${percent(groundedCount, results.length)}） | 执行成功题中 ${percent(groundedCount, databaseExecutedCount)} |`,
  `| 最终严格通过 | ${strictPassCount}/${results.length}（${percent(strictPassCount, results.length)}） | 目标视图命中且回答有据 |`,
  `| 无数据返回 | ${count((item) => item.noData)}/${results.length}（${percent(count((item) => item.noData), results.length)}） | 无数据本身不判错 |`,
  `| 模型语义回退 | ${modelFallbackCount}/${results.length}（${percent(modelFallbackCount, results.length)}） | 高于计划目标 ≤20% |`,
  '',
);
lines.push('### 耗时', '', '| 指标 | 耗时 |', '|---|---:|');
lines.push(
  `| 总链路平均 | ${live.summary.averageMs} ms |`,
  `| 总链路 P50 | ${live.summary.p50Ms} ms |`,
  `| 总链路 P95 | ${live.summary.p95Ms} ms |`,
  `| 完整 85 题墙钟时间 | ${formatDuration(live.summary.durationMs)} |`,
  `| 确定性路由 P95（排除进入澄清的低置信题） | ${percentile(deterministicFast, 0.95)} ms |`,
  `| 全部语义路由 P95 | ${percentile(semanticTimes, 0.95)} ms |`,
  '',
);
lines.push('## 五、按角色实测', '', '| 角色 | 实测题 | 严格通过 | 严格准确率 | 平均耗时 |', '|---|---:|---:|---:|---:|');
for (const [role, items] of Object.entries(byRole)) {
  const passed = items.filter((item) => item.status === 'pass').length;
  lines.push(`| ${role} | ${items.length} | ${passed} | ${percent(passed, items.length)} | ${average(items.map((item) => item.totalMs))} ms |`);
}
lines.push(
  '| 四、美容师服务 Agent | 0 | 0 | 不适用 | - |',
  '',
  '美容师题大量使用“我、这个客人、她、这次护理”等身份或上下文指代；当前 Ask 请求上下文没有登录账号到员工 ID 的可靠绑定，且护理建议、皮肤健康和操作记录超出自由 SQL 边界，因此本轮没有把这些题伪装成可独立执行的单轮查询。',
  '',
);
lines.push('## 六、按视图实测', '', '| 视图 | 题数 | 严格通过 | 准确率 | 无数据率 | 平均耗时 |', '|---|---:|---:|---:|---:|---:|');
for (const item of live.byView.filter((view) => view.plannedCount > 0)) {
  lines.push(`| ${item.label} | ${item.completedCount} | ${item.strictPassed} | ${percent(item.strictPassed, item.completedCount)} | ${percent(Math.round(item.noDataRate * item.completedCount), item.completedCount)} | ${item.averageMs} ms |`);
}
lines.push('', '本题库没有给员工档案、次卡核销、客户余额、服务质量、项目目录、营销活动、自动触达、库存调拨、BOM 偏差、客户生命周期等 10 个视图提供可独立执行且口径完整的题；这不是这些视图不可用，而是本题库的对应问法多为写操作、建议、敏感数据、上下文指代或组合能力。', '');
lines.push('## 七、23 题失败明细与原因', '', '| ID | 问题 | 失败类型 | 目标视图 | 实际视图/结果 |', '|---|---|---|---|---|');
for (const item of results.filter((result) => result.status !== 'pass')) {
  lines.push(`| ${item.id} | ${escapeCell(item.question)} | ${failureLabels[item.failureCategory] ?? item.failureCategory ?? item.status} | ${item.expectedViewLabel} | ${escapeCell(item.selectedViews?.join(', ') || item.failureReason || '-')} |`);
}
lines.push('', '失败分布：', '');
for (const [key, value] of Object.entries(live.summary.failureCounts)) {
  lines.push(`- ${failureLabels[key] ?? key}：${value} 题。`);
}
lines.push('', '### 瞬时失败复测', '');
lines.push(
  `原始轮中 3 题出现模型结构化输出不可用；单独复测后 ${retryRecovered.length}/3 恢复严格通过。manager-010 恢复，finance-009 和 finance-010 不再报供应商错误，但暴露为对账候选视图召回错误。因此原始 72.94% 不做回填，复测只用于定位原因。`,
  '',
);
lines.push('## 八、管理端/后台暂不支持的题', '');
lines.push(
  `以下 ${unsupported.length} 题当前没有形成可供 Ami Ask 直接查询的结构化事实闭环。部分领域可能存在相邻页面或基础对象，例如设备管理、门店地址、供应商档案，但不足以回答题目要求的故障历史、停车指引、资质、质检、现金流或合规结论。`,
  '',
  '| ID | 角色 | 问题 | 缺口 |',
  '|---|---|---|---|',
);
for (const item of unsupported) {
  lines.push(`| ${item.id} | ${item.sourceRole} | ${escapeCell(item.question)} | 缺少已治理的结构化字段、流程或事实闭环 |`);
}
lines.push('', '## 九、其他不进入自由 SQL 的边界', '');
lines.push(
  `- 管理端/后台已有相邻能力，但 Ask 未开放：${manifest.summary.bySupportClass.admin_supported_ask_not_open} 题。典型包括实时在店状态、生日、来源渠道、复购率、升单、审批、目标、工资之外的人事指标和跨模块组合口径。`,
  `- 需要澄清：${manifest.summary.bySupportClass.clarification_required} 题。典型缺口是“这个客人、某笔、这批、大额、正常范围”和当前登录美容师身份。`,
  `- 策划、诊断或内容生成：${manifest.summary.bySupportClass.brain_content_or_advice} 题，应由独立 Ami Brain 承接，不应混入 Ask SQL 准确率。`,
  `- Ask 只读边界：${manifest.summary.bySupportClass.ask_readonly_boundary} 题，包括设置规则、发消息、核销、充值、退款、改期和记录入库。`,
  `- 敏感字段边界：${manifest.summary.bySupportClass.ask_sensitive_boundary} 题，包括手机号、皮肤健康、过敏、仪器参数、备注和情绪状态。`,
  `- 多轮上下文：${manifest.summary.bySupportClass.multi_turn_context_required} 题；范围超限：${manifest.summary.bySupportClass.ask_scope_limit} 题。`,
  '',
);
lines.push('## 十、产品问题与修复优先级', '');
lines.push(
  '### P0：语义路由合同补齐',
  '',
  '- 将“项目做得最多”稳定归属项目服务销售，不得落到预约。',
  '- 将“刷卡消费、收款明细”稳定归属支付退款；将“重复收费、漏收、多收、账实一致”稳定归属对账异常。',
  '- 补齐“工作饱和度、超过接待能力”到员工产能，“消耗特别快”到库存流水，“运营成本/成本结构”到经营成本。',
  '- 区分商品效期和次卡到期；“快过期”默认未来 30 天并披露假设，不应无理由澄清。',
  '- “交货最稳定”采用已治理默认口径：平均交付天数最短，并在回答中披露。',
  '',
  '### P0：候选与 Guard 一致性',
  '',
  '- 当前库存报废视图公开 `remark_summary`，但 Guard 仍因字段名包含 remark 将其判敏感。应统一 Catalog 和 Guard：要么从视图移除该字段，要么仅对白名单摘要字段放行。',
  '- 对候选已正确但 SQL 模型选错视图的场景，Prompt 需强化首选视图约束。',
  '',
  '### P1：模型稳定性与成本',
  '',
  `- 模型语义回退占比 ${percent(modelFallbackCount, results.length)}，明显高于目标 20%；应继续扩充确定性同义词和冲突合同。`,
  '- 对结构化输出不可用增加一次同供应商或备用供应商的受控重试，并单独记录基础设施失败，不能与业务错误混算。',
  '- 当前总链路 P95 28.4 秒，优先减少语义回退和 SQL 修复轮次，而不是放宽 Guard。',
  '',
);
lines.push('## 十一、证据与限制', '');
lines.push(
  `- Manifest：${manifestPath}`,
  `- 正式结果：${livePath}`,
  `- 瞬时失败复测：${retryPath}`,
  `- 650 题逐题明细：${csvPath}`,
  '- 本轮使用开发管理员连接；生产仍必须完成专用只读角色、34/34 视图权限、真实权限矩阵和跨店验收。',
  '- 无数据题返回空结果或明确无数据不算错误；但 confirmed 财务、会员负债等页面文案仍应保持“已确认快照”口径。',
  '- 本报告不混用 Ami Brain 历史评测结果，也未将 Brain 的建议/内容生成能力计入 Ask 准确率。',
  '',
);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join('\n')}\n`);

const headers = ['id', 'role', 'section', 'question', 'supportClass', 'supportLabel', 'managementSupport', 'backendSupport', 'reason', 'expectedView', 'evalStatus', 'failureCategory', 'candidateViews', 'selectedViews', 'totalMs', 'answerSummary'];
const csvRows = [headers, ...manifest.questions.map((item) => {
  const result = resultById.get(item.id);
  return [
    item.id, item.sourceRole, item.section, item.question, item.supportClass, supportLabels[item.supportClass] ?? item.supportClass,
    item.managementSupport, item.backendSupport, item.reason, item.expectedView, result?.status ?? 'not_executed', result?.failureCategory ?? '',
    result?.candidateViews?.join('|') ?? '', result?.selectedViews?.join('|') ?? '', result?.totalMs ?? '', result?.answer?.summary ?? '',
  ];
})];
writeFileSync(csvPath, `${csvRows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`);

console.log(JSON.stringify({ reportPath, csvPath, sourceQuestions: manifest.sourceQuestionCount, executed: results.length, strictPassCount, unsupportedCount: unsupported.length }, null, 2));

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function argumentValue(prefix) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
function numeric(a, b) { return a - b; }
function percent(numerator, denominator) { return denominator ? `${(numerator / denominator * 100).toFixed(2)}%` : '0.00%'; }
function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function percentile(values, value) { return values.length ? values[Math.ceil(values.length * value) - 1] : 0; }
function formatDuration(ms) { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`; }
function groupBy(items, key) { return items.reduce((result, item) => { const value = key(item); (result[value] ??= []).push(item); return result; }, {}); }
function escapeCell(value) { return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>'); }
function csvCell(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function supportMeaning(key) {
  return {
    ask_query_supported: '指标合同明确，可直接进入真实 SQL。', ask_query_low_confidence: '有明确目标视图，但语义路由需要低置信处理。',
    clarification_required: '缺实体、身份、阈值或上一轮上下文。', multi_turn_context_required: '单独拿出来无法保持指代和纠正。',
    ask_readonly_boundary: '业务可能支持，但 Ask 不执行写操作。', ask_sensitive_boundary: '受隐私和健康信息策略限制。',
    ask_scope_limit: '超过当前受控查询的范围或复杂度。', admin_supported_ask_not_open: '相邻业务存在，但 Ask 缺字段或组合口径。',
    brain_content_or_advice: '不是事实查询，应由 Brain 做建议、诊断或内容。', admin_backend_unsupported: '后台缺少可核验的结构化数据闭环。',
  }[key] ?? '';
}
