# Agent 评测问题库测试计划

版本：v1.0  
日期：2026-06-29  
输入问题库：`docs/04-测试数据/agent-eval-questions.md`  
适用对象：洞悉美业·门店运营智能体、Ami_Agent、Ami Aura Lite 智能终端问答链路

---

## 1. 测试目标

基于 `agent-eval-questions.md` 的 650 条自然语言问题，建立一套可持续回归的 Agent 测试体系，验证智能体是否真正做到：

1. 能识别用户意图和角色归属，不靠临时关键词补丁。
2. 能路由到正确 Persona / Skill / Tool。
3. 能调用真实业务数据，输出可核对的业务事实。
4. 能按场景输出文字、KPI、表格、图表、行动卡、澄清问题和 Evidence。
5. 能遵守权限、字段脱敏、审批和高风险操作边界。
6. 能处理多轮追问、代词、纠正、否定、模糊表达和压力问题。

本计划不建议把 650 条一次性作为上线阻断门禁，而是拆成 P0/P1/P2 三层：P0 每次必跑，P1 每日/合并前跑，P2 周期性全量回归。

### 2026-06-30 收口结果

本轮按四阶段开发计划完成后，剩余支持问题评测已从 190/500 提升到 466/500。

| 指标 | 基线 | 最新 |
|---|---:|---:|
| 剩余实际评测 | 500 | 500 |
| 通过 | 190 | 466 |
| 失败 | 310 | 34 |
| 通过率 | 38.0% | 93.2% |
| `missing_output_kind` | 246 | 7 |
| `missing_evidence` | 243 | 0 |
| `wrong_intent` | 233 | 14 |
| `skill_missing` | 243 | 25 |
| `route_error` | 91 | 12 |
| `permission_error` | 10 | 4 |
| `tool_missing` | 2 | 0 |

按角色结果：

| 角色 | 通过 | 失败 | 通过率 |
|---|---:|---:|---:|
| 店长经营 | 69 | 2 | 97.2% |
| 营销增长 | 76 | 8 | 90.5% |
| 前台接待 | 78 | 2 | 97.5% |
| 美容师服务 | 67 | 16 | 80.7% |
| 库存采购 | 80 | 0 | 100.0% |
| 财务风控 | 81 | 2 | 97.6% |
| Edge Case | 15 | 4 | 78.9% |

剩余 34 条不再作为本轮上线阻断，但需要进入下一轮专项：

- 美容师高级护理建议、复购跟进和服务记录细节。
- 营销自动化规则、ROI 深度分析和活动方案二次改写。
- 少量 `action_card` 输出形态补齐。
- 4 条权限边界承接卡：需要展示安全摘要、转交店长/财务、申请权限。

---

## 2. 问题库结构盘点

当前问题库覆盖：

| 模块 | 数量 | 覆盖范围 |
|---|---:|---|
| 店长经营 Agent | 100 | 经营概览、客户管理、员工管理、库存运营、风险预警 |
| 营销增长 Agent | 100 | 客群识别、活动策划、话术生成、权益 ROI、自动化触达 |
| 前台接待 Agent | 100 | 客户查询、预约管理、收银核销、现场协调 |
| 美容师服务 Agent | 100 | 今日安排、护理建议、服务记录、个人业绩 |
| 库存采购 Agent | 100 | 库存查询、临期损耗、采购建议、消耗分析、供应链协调 |
| 财务风控 Agent | 100 | 收入对账、成本毛利、退款折扣、财务风险 |
| Edge Case / 多轮对话 | 50 | 模糊意图、上下文继承、跨场景、否定纠正、压力测试 |

合计：650 条。

---

## 3. 测试分层

### L0：静态评测集建设

目标：把 Markdown 问题库转成机器可执行的结构化用例。

每条问题需要补齐以下字段：

```ts
type AgentEvalQuestionCase = {
  id: string;
  sourceCategory: string;
  persona: 'manager' | 'marketing' | 'reception' | 'beautician' | 'inventory' | 'finance';
  input: string;
  priority: 'P0' | 'P1' | 'P2';
  expectedRoute?: string;
  expectedSkill?: string;
  expectedTool?: string;
  expectedIntentType?: 'query' | 'analysis_and_recommendation' | 'draft' | 'clarify';
  expectedOutputKinds?: Array<'text' | 'kpi' | 'table' | 'chart' | 'action_card' | 'clarify' | 'evidence'>;
  expectedDataSources?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
  notes?: string;
};
```

交付物：

- `agent-eval-questions.md` 保留为产品口径问题库。
- 新增结构化用例源：`packages/server-v2/src/agent/agent-eval-question-bank.ts`。
- 对多轮问题单独建 `conversationCases`，保留轮次、上下文变量和预期继承行为。

### L1：Planner / Router / Skill 单元评测

目标：验证问题能否被识别到正确方向，不调用真实数据库。

检查项：

| 指标 | 说明 | 目标 |
|---|---|---:|
| Route Accuracy | 自动分诊到正确 Persona | P0 100%，P1 >= 95% |
| Tool Accuracy | 首个工具命中正确 | P0 >= 95%，P1 >= 90% |
| Capability Accuracy | Skill / Capability 命中正确 | P0 >= 95%，P1 >= 90% |
| Clarification Accuracy | 模糊问题该追问时追问，不该追问时不追问 | P0 >= 95% |
| Risk Classification | 高风险动作识别为需确认/审批 | P0 100% |

执行入口：

```powershell
npm.cmd --prefix packages/server-v2 run agent:eval:question-bank
npm.cmd --prefix packages/server-v2 run agent:eval
npm.cmd --prefix packages/server-v2 run agent:eval:skills
npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts agent-orchestrator.service.spec.ts agent-tool-registry.service.spec.ts --runInBand
```

### L2：Runtime 工具结果与输出契约评测

目标：验证工具执行后的输出结构是否满足前端渲染和业务可读性。

重点检查：

1. 清单类问题必须输出 `table`，且表头为中文业务字段。
2. 单指标问题优先输出 `kpi` 或简洁结论，不应反问“你想查询数据还是分析原因”。
3. 财务、库存、客户、预约类回答必须带 `evidence` 或数据来源。
4. 营销、自动化、退款、批量触达等高风险动作必须输出 `action_card` 并要求确认。
5. 数据缺失时要明确说明缺口，不编造。

门禁指标：

| 指标 | P0 | P1 | P2 |
|---|---:|---:|---:|
| Output Contract Accuracy | 100% | >= 95% | >= 90% |
| Evidence Coverage | >= 95% | >= 90% | >= 85% |
| No Internal Field Leakage | 100% | 100% | 100% |
| High-risk Approval Gate | 100% | 100% | 100% |

### L3：真实数据 API 评测

目标：验证 Agent 不只是“答得像”，而是能查到真实业务数据。

建议固定测试门店：

- 门店：`Ami 全量演示门店`
- 店长/前台/美容师/系统管理员角色各准备一个账号。
- 数据必须覆盖：今日订单、昨日订单、本月营收、预约、到店、客户卡项、核销、办卡、充值、退款、临期库存、低库存、员工排班、服务记录、提成、营销活动、自动化规则。

抽样策略：

| 类型 | 数量 | 示例 |
|---|---:|---|
| P0 真实数据问数 | 50 | 本月营业额、今天预约、昨天消费客户、临期库存 |
| P0 清单输出 | 20 | 消费客户清单、退款明细、收款明细、低库存列表 |
| P0 高风险动作 | 20 | 发券、退款、自动触达、批量营销 |
| 角色权限边界 | 20 | 前台问财务、员工问全店利润、美容师问他人客户 |
| 多轮上下文 | 20 | “这个客户”“她”“那怎么处理” |

验收口径：

- 真实接口返回的数字与数据库查询结果一致。
- 表格行数和关键字段可核对。
- 不允许用 mock 兜底冒充真实数据。
- 数据范围必须说明，如“截至今日”“本月 1 日至今日”。

### L4：Kiosk / 管理端 UI 验收

目标：验证前端实际体验。

管理端 `/ami-agent`：

1. 发送普通问题默认不传 personaCode，后端自动分诊。
2. 显示“由 X Agent 处理”和 route reason。
3. 表格、KPI、Evidence、Action Card 能正确渲染。
4. 失败项能进入评测/质量大盘追踪。

Kiosk 智能终端：

1. 底部快捷入口继续走 FlowCard，不进入 Agent Router。
2. 文本输入“今天营业额”“临期库存”“昨天消费客户”等走 Agent/业务问答。
3. “收银/核销/办卡/充值/打印”等快捷操作打开对应业务流。
4. 表格表头必须是中文字段，不能显示 `0/1/2` 或 `beauticianId` 这类内部字段。
5. 无数据时给出明确空态和下一步操作，不报 Internal Server Error。

建议执行：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts src/app/components/SmartCommandBar.test.tsx --runInBand
npx.cmd vitest run src/app/pages/ami-agent/AmiAgentWorkspace.test.tsx
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
```

---

## 4. P0 必测样本建议

从 650 条中先抽 120 条作为 P0 门禁。

### 4.1 六大角色各 15 条

每个角色优先覆盖：

1. 单指标查询 3 条。
2. 清单查询 3 条。
3. 原因分析 3 条。
4. 建议/方案 3 条。
5. 高风险动作或权限边界 3 条。

合计：90 条。

### 4.2 Edge Case 30 条

建议优先抽：

- 意图模糊：10 条全收。
- 代词和上下文继承：10 条全收。
- 否定与纠正：抽 5 条。
- 压力测试：抽 5 条。

合计：30 条。

P0 总计：120 条。

---

## 5. 评测结果分级

| 等级 | 判定 | 处理 |
|---|---|---|
| S0 阻断 | 错数据、错权限、执行高风险动作未确认、Internal Server Error | 必须修复后才能发布 |
| S1 高优先级 | 路由错、工具错、清单缺表格、表头错误、Evidence 缺失 | 本轮迭代修复 |
| S2 中优先级 | 回答不够完整、建议泛化、多轮上下文弱 | 进入优化池 |
| S3 低优先级 | 文案不自然、排版细节、推荐问题质量一般 | 体验优化 |

---

## 6. 测试执行节奏

### 每次开发提交前

必跑：

```powershell
npm.cmd --prefix packages/server-v2 run agent:eval
npm.cmd --prefix packages/server-v2 run agent:eval:skills
npm.cmd --prefix packages/server-v2 run build
```

如果涉及 Kiosk：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

### 每日回归

1. 跑 P0 120 条。
2. 跑失败样本回归池。
3. 输出失败 Top 10：按 persona、skill、tool、output kind 分类。
4. 失败样本自动写入 `AgentEvalCase.status=draft`。

### 每周全量回归

1. 跑 650 条全量问题库。
2. 抽 30 条人工核查真实数据。
3. 抽 20 条 UI 浏览器验收。
4. 更新质量大盘：通过率、失败类型、能力缺口。

---

## 7. 通过标准

### P0 发布门禁

必须同时满足：

1. P0 总通过率 100%。
2. Route Accuracy 100%。
3. 高风险审批门禁 100%。
4. No Internal Field Leakage 100%。
5. 无 Internal Server Error。
6. 真实数据抽检 100% 可解释。

### P1 合并门禁

1. P1 总通过率 >= 95%。
2. Output Contract Accuracy >= 95%。
3. Evidence Coverage >= 90%。
4. 权限边界 100%。

### P2 质量目标

1. 全量问题库通过率 >= 90%。
2. 同类失败连续两周下降。
3. 负反馈样本能在下一轮进入回归池。

---

## 8. 落地任务清单

- [x] T1：清理 `agent-eval-questions.md` 重复标题，补充版本变更记录。
- [x] T2：编写 Markdown 问题库解析脚本，输出结构化 TS case。
- [x] T3：给 650 条问题补 `persona / priority / expectedSkill / outputKinds / dataSources / riskLevel`。
- [x] T4：先抽 P0 120 条接入独立 Question Bank P0 门禁。
- [x] T5：为多轮问题新增 conversation eval runner。
- [x] T6：为真实数据问数新增数据库 fixture 对账脚本。
- [x] T7：把失败样本导入现有 `AgentEvalCase` 草稿池。
- [x] T8：管理端质量大盘增加“问题库覆盖率”和“P0/P1/P2 通过率”。
- [x] T9：Kiosk 增加 10 条核心自然语言 E2E 验收。
- [x] T10：建立每日 P0 自动回归命令或 CI job。

当前已落地文件：

- `packages/server-v2/src/agent/agent-eval-question-bank.ts`
- `packages/server-v2/src/agent/agent-eval-question-bank.spec.ts`
- `packages/server-v2/prisma/agent-eval-remaining-supported.ts`
- `packages/server-v2/tsconfig.agent-eval-scripts.json`
- `packages/server-v2/prisma/agent-eval-real-data-fixtures.ts`
- `packages/server-v2/prisma/agent-eval-fixture-backfill.ts`
- `packages/server-v2/src/agent/agent-observability.service.ts`
- `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
- `packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts`
- `packages/server-v2/package.json`：新增 `agent:eval:question-bank`、`agent:eval:conversation`、`agent:eval:fixtures`、`agent:eval:fixtures:plan`、`agent:eval:fixtures:backfill`、`agent:eval:fixtures:backfill:apply`、`agent:eval:p0:daily`
- `docs/04-测试数据/agent-eval-remaining-supported-plan.json`
- `docs/04-测试数据/agent-eval-remaining-supported-report.json`

已验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent:eval:question-bank
npm.cmd --prefix packages/server-v2 run agent:eval:conversation
npm.cmd --prefix packages/server-v2 run agent:eval:fixtures:plan
npm.cmd --prefix packages/server-v2 run agent:eval:fixtures:backfill
npm.cmd --prefix packages/server-v2 test -- business-task-preparser.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts --runInBand --testNamePattern="multi-turn conversation|failed conversation"
npm.cmd --prefix packages/server-v2 test -- agent-observability.service.spec.ts --runInBand
npx.cmd vitest run src/app/pages/ami-agent/AmiAgentWorkspace.test.tsx
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npm.cmd --prefix packages/server-v2 run agent:eval:p0:daily
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported -- --plan-only --output=../../docs/04-测试数据/agent-eval-remaining-supported-plan.json
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported -- --output=../../docs/04-测试数据/agent-eval-remaining-supported-report.json
```

验证结果：

- 静态问题库：通过 3 个测试，覆盖 650 条解析、120 条 P0 抽样、P0 转换为现有 `AgentEvalCaseDefinition` 结构。
- 多轮评测：通过 conversation baseline，覆盖消费客户清单后追问、客户代词追问、活动追问、无上下文代词追问。
- 失败样本：单轮和多轮失败样本均支持写入现有 `AgentEvalCase.status=draft` 草稿池。
- 真实数据 fixture：`agent:eval:fixtures:plan` 通过；`agent:eval:fixtures` 已真实只读执行，当前 `Ami 全量演示门店` 16 项检查中 15 项通过，1 项失败。
- 真实数据修复：已在明确授权后执行 `agent:eval:fixtures:backfill:apply`，补齐 1 条昨日订单样本。
- 每日 P0 聚合门禁：`agent:eval:p0:daily` 通过；静态问题库、多轮基线、真实数据 fixture 均通过。
- 质量大盘：已展示问题库覆盖率、结构化问题数、多轮轮次、P0/P1/P2 通过率；后端质量报告提供 `questionBank` 聚合字段。
- Kiosk 浏览器验收：`business-agent.spec.ts` 18 条通过；新增 10 条核心自然语言问题覆盖营业额、昨日消费客户、临期库存、业绩排行、紧急召回、预约清单、收银/核销/办卡订单、利润下降、自动提醒、美容师本人客户数。
- 后端构建：通过。
- 剩余支持问题评测：已剔除系统整体不支持 22 条，排除已测 128 条，对剩余 500 条完成 Planner / Skill / Tool / 输出契约评测；190 条通过、310 条进入 Agent 能力补齐池。

真实数据门禁状态：

| 检查项 | 当前结果 | 影响问题 |
|---|---:|---|
| `yesterday_orders` | 1 / 最低 1，通过 | “昨天有哪些消费的客户，列出清单”“昨日成交客户明细” |

已执行修复与复验命令：

```powershell
npm.cmd --prefix packages/server-v2 run agent:eval:fixtures:backfill:apply
npm.cmd --prefix packages/server-v2 run agent:eval:p0:daily
```

已写入样本：

- 门店：`Ami 全量演示门店`（id=6）
- 订单号：`AGENT-EVAL-YDAY-6-20260628`
- 订单 ID：`1044`
- 客户：`马美琳`
- 商品：`抗衰紧致眼霜`
- 金额：`498`
- 复验结果：真实数据 fixture 16 项检查全部通过，`agent:eval:p0:daily` 通过。

---

## 9. 剩余支持问题评测结果

本轮执行口径：只剔除“当前系统整体没有业务对象、页面/API、数据闭环”的问题；系统已有业务但 Agent 不会答、路由不准、缺 Skill、缺 Tool 或输出契约不满足的问题，全部保留为测试对象，并计入 Agent 能力补齐清单。

### 9.1 三层分类结果

| 分类 | 数量 | 本轮处理 |
|---|---:|---|
| `system_unsupported` | 22 | 剔除出本轮失败率，只记录系统缺业务原因 |
| `system_supported_testable` | 471 | 纳入剩余评测 |
| `system_supported_agent_gap` | 29 | 纳入剩余评测，失败后进入 Agent 能力补齐清单 |
| 已测覆盖 | 128 | P0 Daily 119，Kiosk E2E 9 |
| 剩余实际评测 | 500 | 190 通过，310 失败 |

说明：P0 Daily 与 Kiosk E2E 存在语义覆盖重叠，因此已测覆盖统计为 128，而不是简单的 120 + 10。

### 9.2 系统不支持剔除清单

| 剔除原因 | 数量 | 产品影响 |
|---|---:|---|
| 客户投诉、差评、满意度或评价反馈无闭环 | 9 | 当前不能做投诉/差评/满意度事实查询，只能提示缺数据 |
| 服务事故、皮肤过敏或不良反应记录无闭环 | 5 | 当前不能核验过敏史、服务事故记录 |
| 消防安全、税务、发票或纳税无闭环 | 4 | 当前不能回答税务/发票/消防执行事项 |
| 客户等待离店或现场排队流失无闭环 | 1 | 当前不能分析等待离店原因 |
| 员工离职交接或客户被带走无闭环 | 1 | 当前不能做离职带走客户风险判断 |
| 供应商涨价通知无业务对象 | 1 | 当前有采购，但无涨价通知事实源 |
| 美容设备维保或故障无闭环 | 1 | 当前有终端运行诊断，但无美容设备维保记录 |

完整清单见：`docs/04-测试数据/agent-eval-remaining-supported-report.json` 的 `systemUnsupportedList`。

### 9.3 Agent 待补齐能力清单

500 条剩余支持问题中，310 条未通过，按角色分布：

| 角色 | 待补齐数量 |
|---|---:|
| 前台接待 | 59 |
| 营销增长 | 57 |
| 美容师服务 | 52 |
| 财务风控 | 52 |
| 库存采购 | 49 |
| 店长经营 | 28 |
| Edge Case / 多轮 | 13 |

按业务分类 Top 12：

| 分类 | 待补齐数量 |
|---|---:|
| 退款与折扣 | 19 |
| 采购建议 | 18 |
| 今日服务安排 | 17 |
| 服务记录与跟进 | 16 |
| 客户查询 | 16 |
| 收银与核销 | 15 |
| 客户护理建议 | 15 |
| 预约管理 | 14 |
| 现场协调 | 14 |
| 收入与对账 | 14 |
| 话术与内容生成 | 14 |
| 自动化与触达规则 | 13 |

失败原因 Top 分类：

| 失败原因 | 次数 | 交付含义 |
|---|---:|---|
| `missing_output_kind` | 246 | 已理解部分业务，但没有输出应有的 KPI、表格、图表或 Action Card |
| `skill_missing` | 243 | 系统有业务，但 Planner 没有稳定命中 Skill/Capability |
| `missing_evidence` | 243 | 回答缺少数据来源或证据块，不适合上线信任链路 |
| `wrong_intent` | 233 | 查询/分析/草稿/澄清意图判断不稳 |
| `route_error` | 91 | 业务域识别不准，容易答非所问 |
| `permission_error` | 10 | 权限边界需要明确承接说明 |
| `tool_missing` | 2 | Planner 命中工具名但工具注册表未覆盖 |

完整缺口清单见：`docs/04-测试数据/agent-eval-remaining-supported-report.json` 的 `agentGapList`。后续补 Skill/Tool 时，应优先处理 `missing_output_kind + skill_missing + missing_evidence` 交集问题。

### 9.4 新增执行命令

```powershell
# 只看剔除与剩余评测计划，不执行 Planner
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported -- --plan-only

# 全量评测剩余支持问题
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported

# 按角色分批评测
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported -- --persona=inventory

# 输出完整报告文件
npm.cmd --prefix packages/server-v2 run agent:eval:remaining-supported -- --output=../../docs/04-测试数据/agent-eval-remaining-supported-report.json
```

---

## 10. 风险与注意事项

1. 650 条问题里有不少“现实业务尚未建模”的能力，例如消防安全、税务事项、供应商涨价通知、员工离职带走客户风险。这类不应强行要求工具命中，应标记为 `clarify`、`advice` 或 `not_supported_with_next_step`。
2. 口语化问题不能全部靠关键词规则解决，评测重点应落在 Skill/Capability 语义命中，而不是新增规则补丁。
3. 财务、员工、客户隐私类问题必须带账号权限和字段范围测试。
4. 压力测试不要求一次性返回巨量明细，应验证是否能分批、追问、生成报告任务或提示导出。
5. 如果真实数据缺少临期库存、投诉、差评、供应商报价等表，应在回答中说明数据缺口，并给出可操作的补录路径。

---

## 11. 建议下一步

T1-T10 已落地，真实数据门禁已补齐并通过每日 P0 聚合门禁。当前 10 条核心自然语言问题已进入 Kiosk 浏览器回归：

1. “这个月营业额是多少”
2. “昨天有哪些消费的客户，列出清单”
3. “哪些产品快过期了”
4. “这个月谁的业绩最好”
5. “请列出10个需要紧急召回的客户”
6. “今天所有的预约给我列一下”
7. “今天所有收银、核销、办卡订单列表”
8. “本月利润为什么下降”
9. “我今天有几个客人”
10. “帮我设置客户45天没来自动提醒”
