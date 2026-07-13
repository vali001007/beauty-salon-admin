# 洞悉美业 Agent 详细开发计划

版本：v2.3
日期：2026-06-27
关联方案：`docs/03-开发计划/洞悉美业_Agent最新改进方案.md`
目标产品：洞悉美业·新一代美业门店运营智能体
实施原则：基于 Ami_Core 现有 Agent、业务 API、权限和数据模型升级，不推倒重建。

最新进度：阶段 0 已完成并补齐 50 条 P0 高频问答基线、输出形态负向断言和独立 Eval 门禁；阶段 1 后端主链路、Answer Contract Validator 初版、真实接口和 `/ami-agent` 页面验收已完成；阶段 2 已完成 P0 Skills Registry 雏形与 Skill-first 计划记录，`customer.lifecycle.insight` 已完成真实接口验收；阶段 3 已完成 BusinessTask v2 schema、LLM Structured Output 校验/重试、PreParser 降级为 Slot Enhancer、单问题澄清/高风险确认策略，以及客户/活动指代类多轮上下文；阶段 4 已完成 P0 消费客户清单 QueryPlan 模板、P1 营收订单分析 QueryPlan 模板、P1 预约/库存/会员/员工/营销 QueryPlan 模板映射、统一查询执行器、Evidence 标准化初版，以及权限/风险网关原因记录；阶段 5 已完成 AgentRun 阶段耗时记录初版、Fast Path 白名单标记、Fast Path 结构化直返标记、Fast Path 组合回答降级原因记录、Deep Path 分阶段输出、工具步骤 QueryPlan/数据量观测和缓存/预聚合性能建议，以及消费客户清单/营收问数/客户回访推荐真实首屏 2 秒内返回；阶段 6 已完成 AuraResponseBlock 基础类型标准化、前端富输出渲染增强、Deep Path 阶段面板和通用回复顺序规范；阶段 7 已完成 6 个 P1 Skills 和 5 个 P2 Skills，P2 已覆盖卡项会员资产、服务质量记录、自动化事件触发、多门店经营对比和终端健康运维；阶段 8 已完成 T8.1 观测 traceSummary、T8.2 Skill Eval Harness 和 T8.3 人工反馈闭环初版；后续重点进入生产级看板体验增强和更严格的全链路验收。

本轮验证记录（2026-06-27）：

- [x] 后端 Agent 主链路定向测试通过：14 个测试套件、182 条用例。
- [x] 前端 Agent Block 渲染与 API 基线测试通过：2 个测试文件、12 条用例。
- [x] `packages/server-v2` 后端构建通过。
- [x] 管理端 Vite 构建通过。
- [x] `git diff --check` 未发现空白错误；仅存在 Windows 换行转换提示。
- [x] T8.1 AgentRun traceSummary 单测通过：`agent-orchestrator.service.spec.ts` 23 条用例。
- [x] `/api/agent/runs` 真实接口验收通过：runId=112，问题“昨天有哪些消费的客户，列出清单”返回 7 位消费客户、35 笔订单、`structured_blocks`，接口耗时约 1535ms。
- [x] 阶段 1 复验通过：runId=125，问题“昨天有哪些消费的客户，列出清单”命中 `order.customer.consumption.list` / `order_customer_consumption_list`，返回 `text/kpi_card/table/evidence_panel`，7 位消费客户、35 笔有效订单，Answer Contract valid，接口耗时约 1691ms。
- [x] `/ami-agent` 页面真实登录问答验收通过：Playwright 登录 admin，页面发送同一问题，约 1642ms 渲染客户表格，无 `Internal server error`。
- [x] 修复真实链路错配：`order_customer_consumption_list` 已映射到统一查询模板，不再被 `paid_amount/order_count` 误路由到收银趋势模板。
- [x] 阶段 6 渲染增强测试通过：`AgentBlockRenderer.test.tsx` 5 条用例覆盖客户清单、表格排序/空态、操作卡、未知 block 兜底和 Deep Path 阶段面板。
- [x] 阶段 0 复核通过：`agent-eval.service.spec.ts` 6 条测试通过；默认 Eval 及 50 条 P0 高频问答基线均为 0 失败。`agent-skills.registry.spec.ts` 3 条测试通过。
- [x] 阶段 0/Skill 编译链路复核通过：`agent-eval.service.spec.ts`、`agent-skills.registry.spec.ts`、`business-task-compiler.service.spec.ts`、`agent-planner.service.spec.ts` 共 4 个测试套件、74 条用例通过。
- [x] 按“从阶段 0 开始”重新复跑基线：`agent-eval.service.spec.ts`、`agent-skills.registry.spec.ts`、`business-task-compiler.service.spec.ts`、`agent-planner.service.spec.ts`、`answer-contract-validator.service.spec.ts` 共 5 个测试套件、87 条用例通过；`packages/server-v2` 后端构建通过。
- [x] 阶段 1 后端复验通过：`business-query.service.spec.ts`、`semantic-query-executor.service.spec.ts`、`agent-planner.service.spec.ts`、`agent-orchestrator.service.spec.ts`、`answer-contract-validator.service.spec.ts`、`agent-eval.service.spec.ts` 共 6 个测试套件、123 条用例通过；`packages/server-v2` 后端构建通过。
- [x] 阶段 1 前端表格渲染复验通过：`AgentBlockRenderer.test.tsx` 5 条用例通过；管理端 Vite 构建通过。
- [x] 阶段 2 Skills Registry 复验通过：`agent-skills.registry.spec.ts`、`business-task-compiler.service.spec.ts`、`agent-planner.service.spec.ts`、`agent-orchestrator.service.spec.ts` 共 4 个测试套件、99 条用例通过，覆盖 Skill 注册、角色边界、Compiler Skill-first、Planner/Orchestrator 计划记录。
- [x] `packages/server-v2` 后端构建通过，阶段 0 复核改动无 TypeScript 构建阻塞。
- [x] 多轮上下文回归通过：`business-task-preparser.service.spec.ts` 14 条、`agent-planner.service.spec.ts` 44 条、`agent-orchestrator.service.spec.ts` 24 条测试通过。
- [x] `/api/agent/runs` 真实多轮验收通过：runId=115，首轮“昨天有哪些消费的客户，列出清单”沉淀 `conversationFocus.currentCustomer=林晓雯`；追加“这个客户还有什么卡和权益？”时工具参数带 `customerId=4606`、`customerName=林晓雯`，返回“林晓雯共0张有效次卡”，无 Internal Server Error。
- [x] `/api/agent/runs` 真实营收问数验收通过：runId=116，问题“今天营收多少”返回 `structured_blocks`，包含营收、实收、订单数、客单价、退款、净额 6 个 KPI、支付方式表格和 Evidence 口径说明，接口耗时约 1752ms，无 Internal Server Error。
- [x] `/api/agent/runs` 真实客户回访问数验收通过：runId=119，问题“哪些客户该回访”返回 `structured_blocks`，包含客户优先级表格、原因、建议动作和 Evidence 口径说明，接口耗时约 1807ms，无 Internal Server Error。
- [x] `/api/agent/runs` 真实利润诊断问数验收通过：runId=121，问题“为什么利润下降”返回诊断结论、原因表、KPI 和 Evidence；当前真实数据不支持“利润下降”判断，Agent 已明确纠偏并给出耗材/商品成本、提成成本、低毛利项目/商品三条线索，接口耗时约 3943ms，无 Internal Server Error。
- [x] `/api/agent/runs` 真实召回活动草稿验收通过：runId=123，问题“帮我生成召回活动”进入 `waiting_approval`，返回 `activity_draft_card` 和 `confirm_action`；确认后仅创建 draft 状态营销活动，不自动发布、不自动触达客户，接口耗时约 1068ms，无 Internal Server Error。
- [x] 阶段 3 复验通过：补齐营销活动对象跨轮指代，`business-task-preparser.service.spec.ts`、`business-task-llm-compiler.service.spec.ts`、`business-task-compiler.service.spec.ts`、`agent-planner.service.spec.ts`、`agent-policy.service.spec.ts`、`agent-orchestrator.service.spec.ts` 共 6 个测试套件、116 条用例通过；后端构建通过。
- [x] 阶段 3 真实接口抽样通过：runId=126 “发布活动并群发给所有客户”返回 `clarify`、不执行工具；runId=127 “帮我生成召回活动”沉淀 `conversationFocus.currentActivity.activityTitle=流失客户召回活动`，追加“这个活动转化效果怎么样”命中 `marketing.effect.diagnose` 并携带 `activityTitle`。
- [x] 阶段 4 复验通过：补齐 P1 查询型 capability 到 QueryPlan 模板的显式映射，并在模板命中后过滤非模板指标；`query-template-registry.service.spec.ts`、`query-planner.service.spec.ts`、`query-safety-guard.service.spec.ts`、`semantic-query-executor.service.spec.ts`、`business-query.service.spec.ts`、`agent-policy.service.spec.ts`、`agent-orchestrator.service.spec.ts` 共 7 个测试套件、86 条用例通过；后端构建通过。
- [x] 阶段 4 真实接口抽样通过：`/api/agent/query-plan/preview` 对“本周预约排班有什么风险”生成 `reservation_schedule_diagnosis` / `reservation_schedule`，指标收敛为 `reservation_count,arrival_rate`；`/api/agent/semantic-query/execute` 对“今天营收多少”返回 `order_revenue`、Evidence sourceTables=`ProductOrder,PaymentRecord,RefundRecord`、sampleSize=4；前台角色查询“本月毛利怎么样”被拒绝，未生成 QueryPlan。

---

## 1. 总目标

把当前 Ami_Core `/ami-agent` 从“规则预解析 + 工具兜底 + 文本总结”的问答助手，升级为“语义优先、Skills 驱动、受控查询、富输出渲染、可观测评测”的美业门店运营智能体。

核心交付结果：

- 用户自然语言问题能稳定转为结构化业务任务。
- 高频经营问数走 Fast Path，首屏 1-2 秒返回。
- 复杂经营诊断走 Deep Path，支持多 Skill 编排和分阶段输出。
- 清单类问题必须输出表格，趋势类问题必须输出图表或趋势块，动作类问题必须输出确认卡。
- 每条关键结论都有数据来源、时间范围、筛选条件和口径说明。
- 新增业务能力优先通过 Skill 扩展，而不是散落补关键词规则。

---

## 2. 当前可复用基础

| 模块 | 当前能力 | 本计划处理方式 |
|---|---|---|
| `packages/server-v2/src/agent` | 已有 Agent Orchestrator、Planner、Tool Registry、Persona、Eval、Memory、Observability | 保留并增强 |
| `packages/server-v2/src/business-query` | 已有经营问数能力和部分 Query Planner 接入 | 作为受控查询底座继续复用 |
| `src/api/real/agent.ts` | 管理端 Agent API 已接入 | 视新增接口同步扩展 |
| `/ami-agent` 前端 | 已有对话工作台、角色切换、Block 渲染雏形 | 扩展富输出和调试信息 |
| 现有业务 API / Prisma | 客户、订单、预约、库存、财务、营销等数据可查 | 通过 Tool / Query Executor 封装，不直接暴露给模型 |

---

## 3. 阶段划分

| 阶段 | 名称 | 目标 | 建议优先级 |
|---|---|---|---|
| 阶段 0 | 现状基线与测试集 | 建立问题样本、基线指标、回归用例 | P0 |
| 阶段 1 | 消费客户清单与回复契约 | 先修复答非所问，打穿 P0 高频场景 | P0 |
| 阶段 2 | Skills Registry | 把散落工具组织成业务 Skill 包 | P0 |
| 阶段 3 | Semantic Task Compiler | 语义优先替代规则优先 | P0/P1 |
| 阶段 4 | Query Planner 与 Evidence | 查询受控、可解释、可复盘 | P1 |
| 阶段 5 | Fast Path / Deep Path | 兼顾准确性与响应速度 | P1 |
| 阶段 6 | 富输出与前端体验 | 支持表格、图表、卡片、操作确认 | P1 |
| 阶段 7 | P1/P2 业务 Skills 扩展 | 覆盖经营分析主干能力 | P1/P2 |
| 阶段 8 | 观测、评测与上线治理 | 防回归、可监控、可迭代 | P0/P1 |

---

## 4. 阶段 0：现状基线与测试集

目标：先把“现在到底错在哪里、哪些场景必须答准”固化成可回归的测试集。

### T0.1 梳理现有 Agent 链路

- [x] 确认 `/ami-agent` 前端请求入口、消息结构、Block 渲染组件。
- [x] 确认 `AgentController`、`AgentOrchestratorService`、`AgentPlannerService` 调用链。
- [x] 确认 `BusinessTaskPreParserService`、`BusinessTaskCompilerService`、`CapabilityRegistryService` 当前职责。
- [x] 确认 `business.query.ask` 和 `BusinessQueryService` 的 fallback 行为。
- [x] 输出当前链路图和关键文件清单。

验收：

- 能说明一次用户问题从前端到工具再到渲染的完整链路。
- 能列出当前会导致“消费客户清单答偏”的具体分支。

### T0.2 建立 P0 评测样本

- [x] 新增或整理 `agent-eval` 用例分类：消费客户清单、营收问数、预约清单、库存预警、客户复购。
- [x] 为每类至少准备 10 条自然语言变体。
- [x] 每条用例定义当前阶段的期望工具、意图、领域和能力基线。
- [x] 增加“不得只输出建议”的负向断言。

示例用例：

| 输入 | 期望 Skill | 期望输出 |
|---|---|---|
| 昨天有哪些消费客户，列出清单 | `order.customer.consumption.list` | 表格 |
| 昨日成交会员有哪些 | `order.customer.consumption.list` | 表格 |
| 上周流水客户名单 | `order.customer.consumption.list` | 表格 |
| 今天营收多少 | `revenue.order.analysis` | KPI |
| 哪些客户该回访 | `customer.lifecycle.insight` | 排名卡 + 建议 |

验收：

- [x] P0 eval 可单独运行。
- [x] 当前错误样本已形成基线，后续阶段 1 可将消费客户清单用例升级为专用能力预期。
- [x] 输出契约断言接入后，清单类用例能稳定复现“未输出表格”的失败并在修复后通过。

---

## 5. 阶段 1：消费客户清单与回复契约

目标：优先解决用户已暴露的核心问题，证明新架构方向有效。

### T1.1 新增 `order.customer.consumption.list` 能力定义

后端范围：

- `packages/server-v2/src/agent/capabilities/capability-registry.service.ts`
- `packages/server-v2/src/business-query/business-query.types.ts`
- `packages/server-v2/src/business-query/business-query.capabilities.ts`

任务：

- [x] 新增能力 ID：`order_customer_consumption_list`。
- [x] domain 设置为 `order`；执行口径按有效消费/支付订单处理。
- [x] 支持 `query`、`ranking` 两类任务。
- [x] 默认时间范围支持 `today`、`yesterday`、`last_week`、`last_30_days`、`month_to_date`、`custom` 等主流经营问数范围。
- [x] 输出通过 `card.items` + Orchestrator table block 渲染为清单表格。
- [x] allowedRoles 初版：`manager`、`reception`。

验收：

- [x] 能力注册后可被 Planner 查询到。
- [x] 角色无权限时返回明确权限提示，不进入工具执行。

### T1.2 实现订单消费客户清单查询

后端范围：

- `packages/server-v2/src/business-query/business-query.service.ts`
- 可选新增专用 service：`packages/server-v2/src/agent/skills/order-customer-consumption.skill.ts`

任务：

- [x] 查询有效订单，排除取消/退款完成订单。
- [x] 按 `storeId` 强制隔离门店数据。
- [x] 支持时间范围过滤。
- [x] 聚合客户维度：客户名、脱敏手机号、订单数、消费金额、最近消费时间、项目/商品摘要。
- [x] 支持 limit，默认 20，上限 100。
- [x] 返回 `card.items`，并由 Orchestrator 从 `data.card.items` 生成 table block。
- [x] Evidence 输出：订单表、支付口径、时间范围、状态过滤、样本量。

推荐字段：

| 字段 | 含义 |
|---|---|
| `customerId` | 客户 ID |
| `customerName` | 客户姓名 |
| `phoneMasked` | 脱敏手机号 |
| `paidAmount` | 实付/有效消费金额 |
| `orderCount` | 订单数 |
| `lastOrderTime` | 最近消费时间 |
| `itemsSummary` | 消费项目/商品摘要 |
| `suggestion` | 可选复购承接建议 |

验收：

- [x] “昨天有哪些消费客户，列出清单”返回真实客户清单。
- [x] 不再进入 `customer_growth_opportunity`。
- [x] 没有数据时返回“暂无有效消费客户”，不能编造客户。

### T1.3 新增 Answer Contract Validator 初版

后端范围：

- `packages/server-v2/src/agent/answer-contract/*`
- `packages/server-v2/src/agent/agent-orchestrator.service.ts`

任务：

- [x] 新增输出意图类型：`text`、`kpi`、`table`、`chart`、`action_card`、`clarify`，并补充 `evidence`。
- [x] 根据 BusinessTask 或 Skill 定义生成 `outputContract`。
- [x] 清单类问题必须校验存在 `table` 或 `items.length > 0`。
- [x] 数值类问题必须校验存在 KPI 或明确数值。
- [x] 诊断类问题初版校验证据存在性；更细的原因链校验留到阶段 8 观测治理增强。
- [x] 消费客户清单已实现 Orchestrator 兜底：工具返回 `card.kpis/card.items` 时生成 KPI block 和 table block，不让模型只写总结。

验收：

- [x] 清单类问题不会只输出一句建议。
- [x] 工具返回 `items` 时，前端至少能看到表格或列表。
- [x] 契约失败会记录到 AgentRun `resultJson.answerContract`，便于排查。

### T1.4 修复前端表格渲染兼容

前端范围：

- `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx`
- `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
- `src/types/agent.ts`

任务：

- [x] 后端已兼容 `data.items`、`data.card.items` 并生成 table block。
- [x] 前端类型与渲染器已支持 `AuraResponseBlock.kind = table`。
- [x] 清单表格可承接客户名、手机号、金额、订单数、时间、摘要等列。
- [x] 窄屏下表格通过横向滚动兜底。
- [x] 数据来源和口径可通过 `evidence_panel` 轻量说明展示。

验收：

- [x] 表格在 `/ami-agent` 页面可读、不溢出、不遮挡输入框：已新增 `AgentBlockRenderer.test.tsx` 覆盖消费客户清单表格、KPI、Evidence 和关联问题渲染。
- 空数据、加载中、错误态都有明确反馈。

### T1.5 阶段 1 测试

- [x] 后端单测：消费客户清单查询。
- [x] Planner / Eval 单测：消费客户自然语言变体命中正确能力。
- [x] Orchestrator 单测：`BusinessQuery` 的 `card.kpis/card.items` 可渲染为 KPI cards 和 table。
- [x] 前端渲染测试或手动验证：表格正常展示。
- [x] 真实接口验证：已使用 admin 登录 token、CSRF token 和 `X-Store-Id=6` 调用 `/api/agent/runs`，runId=112 返回消费客户表格。

阶段 1 通过标准：

- [x] P0 消费客户清单 eval 通过率达到 90% 以上。
- [x] 用户示例问题在后端链路可返回表格、统计口径、数据来源。
- [x] 响应首屏目标不超过 2 秒：真实接口约 1535ms，`/ami-agent` 页面约 1642ms 渲染客户表格。

---

## 6. 阶段 2：Skills Registry

目标：从“工具列表”升级为“业务 Skill 包”，让新增能力有统一入口。

### T2.1 新建 Skill 类型与目录

建议文件：

- `packages/server-v2/src/agent/skills/agent-skill.types.ts`
- `packages/server-v2/src/agent/skills/agent-skills.registry.ts`
- `packages/server-v2/src/agent/skills/index.ts`

任务：

- [x] 定义 `AmiBusinessSkill` 类型。
- [x] 支持 `id`、`domain`、`intents`、`examples`、`entities`、`metrics`。
- [x] 支持 `requiredSlots`、`clarificationPolicy`、`riskPolicy`。
- [x] 支持 `toolPlanFactory`。
- [x] 支持 `outputContract`。
- [x] 支持 `evalCases`。

验收：

- [x] Skill 可独立注册和查询。
- [x] 不影响现有工具注册中心。

### T2.2 注册 P0 Skills

P0 Skills：

- [x] `business.intent.planning`
- [x] `order.customer.consumption.list`
- [x] `answer.contract.rendering`
- [x] `customer.lifecycle.insight`

任务：

- [x] 将现有客户优先级工具映射到 `customer.lifecycle.insight`。
- [x] 将消费客户清单工具映射到 `order.customer.consumption.list`。
- [x] 将输出契约作为 Skill 元数据维护。
- [x] 为 P0 可执行 Skill 提供 examples 和 eval cases。

验收：

- [x] 不同表达能命中同一 Skill。
- [x] 新增 Skill 可通过 `AgentSkillsRegistryService` 集中注册；旧 capability 仍保留兼容。

### T2.3 Planner 改为 Skill-first

范围：

- `packages/server-v2/src/agent/agent-planner.service.ts`
- `packages/server-v2/src/agent/capabilities/capability-registry.service.ts`

任务：

- [x] Planner/Compiler 先根据 BusinessTask 匹配 Skill。
- [x] Skill 匹配失败再进入旧 capability fallback。
- [x] 保留旧链路作为兼容 fallback。
- [x] 在 planJson 中记录 `skillId`、`skillConfidence`、`skillReason` 和 `outputContract`。

验收：

- [x] AgentRun / planJson 可看到本次命中的 Skill。
- [x] skill-first 不破坏现有营销、库存、预约、财务工具。

---

## 7. 阶段 3：Semantic Task Compiler

目标：从规则优先变为语义优先，减少关键词补丁。

### T3.1 定义 BusinessTask v2 Schema

范围：

- `packages/server-v2/src/agent/business-task/business-task.types.ts`
- 新增 `business-task.schema.ts`

任务：

- [x] 增加 `event` 字段，例如 `paid_order`、`reservation_created`、`service_completed`。
- [x] 增加 `outputIntent` 字段。
- [x] 增加 `requiredFields` 字段。
- [x] 保留既有 `confidence`，并增加 `ambiguities`。
- [x] 保持旧字段兼容。

验收：

- [x] 旧 planner 测试不因字段新增失败。
- [x] v2 task 可表达“消费客户清单”。

### T3.2 接入 LLM Structured Output

范围：

- `packages/server-v2/src/agent/business-task/business-task-llm-compiler.service.ts`
- AI Gateway 相关调用封装

任务：

- [x] 让 LLM 只输出 JSON，不输出自然语言解释。
- [x] JSON Schema 校验失败时最多重试 1 次。
- [x] LLM 不可访问数据库，不允许生成 SQL。
- [x] 失败时回退到当前 PreParser。
- [x] LLM 草稿白名单已兼容 `event/outputIntent/requiredFields/ambiguities`，非法字段会被拒绝。

验收：

- [x] 对随机自然语言变体能输出稳定 BusinessTask。
- [x] LLM 失败不会导致用户问题整体 Internal Server Error。

### T3.3 PreParser 降级为 Slot Enhancer

任务：

- [x] PreParser 不再作为主路由决策来源；LLM Structured Draft 成功时可主导 `domain`、`taskType`、`metrics` 等语义字段。
- [x] 保留时间识别：今天、昨天、本周、本月、自定义日期。
- [x] 保留数量识别：前 10、列 20 个、全部。
- [x] 保留高风险词识别：发送、删除、批量、改价、退款。
- [x] 把规则识别结果作为补充 slot 合并进 BusinessTask，并在冲突时记录 `preparser_*_used_as_slot_enhancer`、`llm_*_ignored_by_deterministic_slot` 等 warning。

验收：

- [x] 不再因为 PreParser 的“客户”类规则固定主导路由；LLM 语义草稿可将问题切到更合适的业务域。
- [x] 时间和数量识别仍稳定，LLM 不能覆盖明确时间和数量槽位。
- [x] 高风险 workflow 不能被 LLM 降级成普通 query。

### T3.4 澄清机制

任务：

- [x] 当关键 slot 缺失且无法合理默认时，只问一个问题。
- [x] 低风险可默认处理：如“昨天消费客户清单”不追问，直接进入清单能力。
- [x] 高风险动作必须确认：正式触达、退款、核销、收银等直执行请求只返回确认问题，不执行工具。
- [x] 多轮上下文记录当前关注对象和时间范围：Orchestrator 已沉淀 `conversationFocus.currentCustomer/currentItems/timeRange`，append 时注入 Planner。

验收：

- [x] 不会一次问多个澄清问题。
- [x] “昨天消费客户”不应追问。
- [x] “给长期未到店客户发优惠券”必须确认客户范围和是否先生成草稿预览。
- [x] “她/这个客户”等客户指代可恢复：PreParser 从 `conversationFocus` 补齐 `customerId/customerName/phoneMasked`，Planner 将其传入客户卡项权益工具。
- [x] “上次那个活动”等营销活动对象跨轮指代已扩展：活动草稿卡和审批后活动草稿会沉淀 `conversationFocus.currentActivity`，PreParser 可在后续“这个活动/上次那个活动”中恢复 `activityId/activityTitle` 并传入营销效果诊断。

---

## 8. 阶段 4：Query Planner 与 Evidence

目标：既要语义灵活，也要查询安全、可解释。

### T4.1 Query Plan 模板化

范围：

- `packages/server-v2/src/semantic-query/query-planner.service.ts`
- `packages/server-v2/src/semantic-query/query-plan.types.ts`

任务：

- [x] 为 P0 Skills 建立 Query Plan 模板：已先落地 `order_customer_consumption_list` 消费客户清单模板。
- [x] 为 P1 查询型 Skills/Capability 逐步补模板：已显式映射商品销量、项目服务、客户跟进、库存风险、预约排班、员工业绩、营销转化等 P1 查询型能力；草稿/审批类能力继续走专用 Tool/Approval，不进入 QueryPlan。
- [x] 已为 `revenue.order.analysis` 补 `order_revenue` 模板：默认按 `payMethod` 输出支付方式汇总，趋势类问法仍按 `date` 输出趋势。
- [x] 强制注入 `storeId`。
- [x] 强制 limit 和排序策略：消费客户清单默认 20 条，按 `paid_amount desc` 排序。
- [x] 禁止未授权跨店查询：无有效当前门店范围时拒绝生成 QueryPlan。

验收：

- [x] BusinessTask 能生成可执行 QueryPlan。
- [x] rejectedReason 明确，不返回模糊失败。

### T4.2 Evidence 标准化

任务：

- [x] Evidence 包含 `sourceTables`，并保留旧 `source` 兼容。
- [x] Evidence 包含 `dateRange`。
- [x] Evidence 包含 `filters`。
- [x] Evidence 包含 `metricDefinition`。
- [x] Evidence 包含 `sampleSize`。
- [x] Evidence 可进入前端“数据来源”展示：Agent Orchestrator 生成 `evidence_panel` 时优先使用 `sourceTables`。

验收：

- [x] 每条经营问数都有可展示的数据来源。
- [x] 用户能知道金额按实收、订单总额还是净收入统计。
- [x] 统一查询执行器已补 `order_customer_consumption_list`，避免消费客户清单误走收入汇总。

### T4.3 权限与风险网关

任务：

- [x] 按角色限制 Skill 和 Tool：Tool 侧由 `AgentPolicyService` 校验角色和权限，Query 侧由 `QuerySafetyGuardService` 校验角色范围。
- [x] 财务、多门店、客户隐私字段做权限校验：前台财务敏感指标拒绝，美容师广域员工查询拒绝，无有效门店范围拒绝。
- [x] 中高风险动作输出确认卡，不直接执行。
- [x] 记录 approval required 的原因：等待审批时写入 approval beforeJson、resultJson 和 API 返回 `approval.reason`。

验收：

- [x] 前台不能查看无权限财务利润。
- [x] 美容师只能看本人或授权范围数据。
- [x] 批量触达不会直接发送。

---

## 9. 阶段 5：Fast Path / Deep Path

目标：避免链路太长导致简单问题等待过久。

### T5.1 Fast Path 分类

任务：

- [x] 定义 Fast Path Skill 白名单。
- [x] 包含：消费客户清单、今日预约、营收摘要、库存预警、员工业绩排行。
- [x] Fast Path 不等待 LLM 长篇总结：高频问数路径直接基于工具结果 `summary + renderedBlocks` 返回，并在运行结果记录 `responseMode`。
- [x] 直接返回结构化 blocks：`executionPath = fast` 且存在非文本 block 时，结果标记为 `responseMode = structured_blocks`。

验收：

- [x] 高频问数首屏 1-2 秒内返回：消费客户清单真实 API 约 1535ms，页面约 1642ms，已满足 P0 清单场景目标。
- [x] Fast Path 未形成结构化 blocks 时记录 `fallbackReason` 并降级为组合回答，不阻断用户结果。

### T5.2 Deep Path 编排

任务：

- [x] 支持一个问题触发多个 Skill：利润下降诊断已编排收入摘要、利润/成本、退款折扣、员工绩效风险四路工具。
- [x] 支持先返回“正在分析的数据范围”：Deep Path 计划支持 `progressNotice`，Orchestrator 会先写入 analyzing 消息。
- [x] 支持分阶段追加：Deep Path 结果输出 `phaseOutputs`，包含核心结论、数据明细、建议动作、操作草稿。
- [x] 支持客户焦点类多轮上下文继续追问。

验收：

- [x] “为什么利润下降”能调用收入、成本、退款、员工绩效等多维数据。
- [x] 用户中途追问“那具体是哪几个项目”能继承上下文。
- [x] Deep Path 渲染步骤记录 `phaseOutputs`，前端后续可按阶段追加展示。

### T5.3 性能指标

目标指标：

| 场景 | 首屏目标 | 完整结果目标 |
|---|---:|---:|
| 简单 KPI | < 800ms | < 1.5s |
| 清单查询 | < 1.5s | < 3s |
| 趋势/排行 | < 2s | < 5s |
| 多维诊断 | < 3s | < 10s |

任务：

- [x] AgentRun 记录编译/规划、工具、渲染各阶段耗时：`agent_steps` 已记录 planner、tool、rendering 的 `startedAt/endedAt`，compiler 当前包含在 planner 阶段。
- [x] 慢查询记录 QueryPlan 和数据量：`agent_steps.outputJson.observability` 已记录 `queryPlan`、`dataVolume`、`latencyMs` 和 `slowQuery`。
- [x] 对高频查询加缓存或预聚合建议：工具观测输出 `performanceHints`，可标识 `cacheCandidate`、`preaggregationCandidate` 和原因。

验证记录：

- 2026-06-27：`npm.cmd --prefix packages/server-v2 test -- agent-orchestrator.service.spec.ts agent-planner.service.spec.ts agent-tool-registry.service.spec.ts business-query.service.spec.ts --runInBand` 通过，4 个测试套件、153 条用例；覆盖 Deep Path `phaseOutputs`、Fast Path 结构化直返、高频查询 `performanceHints`、工具注册和经营问数主链路。

---

## 10. 阶段 6：富输出与前端体验

目标：让回复形式按需输出，而不是只有文字。

### T6.1 AuraResponseBlock 扩展

范围：

- `src/types/agent.ts`
- `packages/server-v2/src/agent/agent.types.ts`

任务：

- [x] 标准化 `text` block。
- [x] 标准化 `kpi` block。
- [x] 标准化 `table` block。
- [x] 标准化 `chart` block。
- [x] 标准化 `action_card` block：前后端类型已加入 `action_card`，并兼容现有 `confirm_action`。
- [x] 标准化 `follow_up_chips` block。
- [x] 标准化 `evidence` block。

验收：

- [x] 后端输出 block 与前端类型一致。
- [x] 未识别 block 有兜底渲染。

### T6.2 前端渲染组件

范围：

- `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx`

任务：

- [x] 表格组件：支持排序、空态、窄屏。
- [x] KPI 组件：支持同比/环比和口径提示。
- [x] 图表组件：优先复用项目已有图表库，并补充空态。
- [x] 操作卡：支持确认、取消；编辑草稿继续由具体业务 action 承接。
- [x] 关联问题 chips：回答完成后展示 1-3 个。
- [x] Evidence 折叠展示。

验收：

- [x] 文本不遮挡、不溢出。
- [x] 表格和操作卡在当前 `/ami-agent` 布局中可用。
- [x] Deep Path `phaseOutputs` 已在 `/ami-agent` 消息卡片中展示为阶段面板。

### T6.3 回复顺序规范

任务：

- [x] 清单类：结论摘要 → 表格 → 数据来源 → 关联问题。
- [x] 诊断类：结论 → 原因 → 数据证据 → 建议动作。
- [x] 营销类：客群 → 权益 → 话术 → 发送确认。
- [x] 风险类：风险等级 → 影响范围 → 处理步骤。

验收：

- [x] 建议不再抢在事实清单前面：`AgentBlockRenderer` 已按 text/alert/kpi/data/evidence/action/follow-up 优先级渲染。
- [x] 每轮最多 3 个关联问题。

验证记录：

- 2026-06-27：`npx.cmd vitest run src/app/pages/ami-agent/components/AgentBlockRenderer.test.tsx` 通过，5/5；覆盖清单渲染、表格排序、操作卡、未知 block 兜底、回复顺序规范和 Deep Path 阶段面板。

---

## 11. 阶段 7：业务 Skills 扩展

目标：覆盖洞悉美业的核心门店运营能力。

### T7.1 P1 Skills

- [x] `revenue.order.analysis`：营收、订单、客单价、支付方式、退款。
- [x] `reservation.capacity.schedule`：预约、排班、空档、爽约、人手缺口。
- [x] `marketing.growth.execution`：客群、权益、活动、话术、转化复盘。
- [x] `inventory.supply.risk`：缺货、临期、BOM 耗材、补货、采购。
- [x] `finance.profit.risk`：实收、毛利、成本、退款折扣、利润风险。
- [x] `staff.performance.management`：美容师业绩、提成、完成率、排名。

每个 Skill 必须包含：

- [x] 业务定义。
- [x] 示例问法。
- [x] 需要字段。
- [x] 工具计划。
- [x] 输出契约。
- [x] 权限和风险策略。
- [x] eval cases。

当前已完成项：

- [x] `revenue.order.analysis` 已具备业务定义、示例问法、字段/指标、工具计划、输出契约、店长角色权限、eval cases 和真实接口验收。
- [x] `finance.profit.risk` 已具备业务定义、示例问法、字段/指标、四工具计划、输出契约、店长角色权限、eval cases、Answer Contract 和真实接口验收。
- [x] `marketing.growth.execution` 已具备召回活动草稿业务定义、示例问法、目标客群/权益字段、工具计划、输出契约、店长角色权限、eval cases、审批确认卡和真实接口验收。
- [x] `reservation.capacity.schedule` 已具备业务定义、示例问法、预约/排班/美容师/时段字段、`schedule.diagnose` 工具计划、输出契约、店长/前台权限和 eval cases。
- [x] `inventory.supply.risk` 已具备业务定义、示例问法、库存/BOM/供应商/采购字段、库存风险/项目 BOM/临期处理/补货草稿工具计划、输出契约、店长/前台权限边界和 eval cases；只读库存预警优先走 `inventory.risk.rank`，明确草稿请求才进入补货/临期草稿工具。
- [x] `staff.performance.management` 已具备业务定义、示例问法、员工/服务/提成/预约字段、`staff.performance.rank` 工具计划、输出契约、店长/美容师本人范围权限和 eval cases。

验证记录：

- 2026-06-27：`npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts agent-skills.registry.spec.ts business-task-compiler.service.spec.ts agent-planner.service.spec.ts --runInBand` 通过，4 个测试套件、87/87；覆盖 6 个 P1 Skills、5 个 P2 Skills、默认 Eval 与 P0 高频基线；`packages/server-v2` 后端构建通过。

### T7.2 P2 Skills

- [x] `card.member.asset`：次卡、储值、核销、到期、续卡；已接 `card.diagnose`、输出契约和 eval cases。
- [x] `service.quality.record`：服务记录、护理建议、服务质量；已接 `service.quality.diagnose`、输出契约和 eval cases。
- [x] `automation.event.trigger`：主动提醒、每日简报、异常预警；已接 `automation.execution.diagnose`、输出契约和 eval cases。
- [x] `store.comparison.benchmark`：多门店排名和经营对比；已接 `store.comparison.diagnose`、输出契约和 eval cases。
- [x] `terminal.health.ops`：终端在线、外设、会话失败、高频问题；已接 `terminal.health.diagnose`、输出契约和 eval cases。

验收：

- [x] 每新增一个 Skill，都有同名 eval 分类。
- [x] 不允许只注册 Skill、不接工具、不接输出契约。

---

## 12. 阶段 8：观测、评测与上线治理

目标：避免上线后继续靠人工截图发现答偏。

### T8.1 AgentRun 观测字段

任务：

- [x] 记录 `skillId`：`planJson.skillPlan` 保留完整计划，`resultJson.traceSummary.skillId` 与 planner/rendering step 摘要可直接追踪。
- [x] 记录 `businessTask`：`resultJson.traceSummary.businessTask` 摘取 domain、taskType、outputIntent、metrics、timeRange、confidence。
- [x] 记录 `queryPlan`：工具步骤 `outputJson.observability.queryPlan` 已记录受控查询计划摘要。
- [x] 记录 `outputContract`：`planJson.skillPlan.outputContract` 保留 Skill 输出契约。
- [x] 记录 `contractValidationResult`：`resultJson.answerContract` 与 `traceSummary.answerContract` 同步记录校验结果。
- [x] 记录各阶段耗时：planner、tool、rendering step 记录 `startedAt/endedAt`，工具步骤额外记录 `latencyMs/slowQuery`。
- [x] 记录 fallback 原因：Fast Path 未形成结构化 blocks 时，`traceSummary.fallbackReason` 记录降级原因。

验收：

- 任意一次失败问答能追到是哪一步偏了。

### T8.2 Eval Harness

任务：

- [x] 支持按 Skill 运行评测：`AgentEvalService.runSkillCases(skillId?)` 与 `GET /agent/evals/skills?skillId=...` 已支持。
- [x] 输出命中率、工具正确率、输出契约正确率：Skill Eval 返回 `bySkill` 和 `metrics.toolAccuracy/capabilityAccuracy/outputContractAccuracy`。
- [x] 加入 CI 或本地一键脚本：`packages/server-v2` 新增 `npm.cmd run agent:eval` 与 `npm.cmd run agent:eval:skills`。
- [x] 保存失败样本供回归：Eval 支持 `persistFailures=true` 时将失败样本保存为 `AgentEvalCase.status=draft`。

验收：

- [x] P0 eval 必须作为上线前必跑项。
- [x] 新增 Skill 必须新增 eval。

验证记录：

- 2026-06-27：`npm.cmd --prefix packages/server-v2 run agent:eval:skills` 通过，2/2；覆盖全量 Skill Eval 聚合和单 Skill 过滤。

### T8.3 人工反馈闭环

任务：

- [x] “有用/无用”反馈记录问题、答案、Skill、工具、原因：反馈写入时同步保存 `businessActionJson.snapshot`。
- [x] 支持把高频失败样本加入 eval：`POST /agent/feedback/failures/eval-cases` 可将负反馈样本导入 `AgentEvalCase` 草稿池。
- [x] 支持后台查看失败最多的 Skill：`GET /agent/feedback/failures` 返回 `bySkill` 聚合、负反馈样本和原因。

验收：

- [x] 产品可以按周看到 Agent 准确率和失败类型。

验证记录：

- 2026-06-27：`npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts agent-observability.service.spec.ts --runInBand` 通过，2 个测试套件、11/11；覆盖 Eval 失败样本保存、负反馈按 Skill 聚合和导入 eval 草稿。

---

## 13. 里程碑排期建议

| 里程碑 | 建议周期 | 交付内容 |
|---|---:|---|
| M1：答准清单 | 2-3 天 | 消费客户清单、表格渲染、P0 eval |
| M2：Skill 雏形 | 3-5 天 | Skills Registry、P0 Skills、Skill-first Planner |
| M3：语义编译 | 5-7 天 | BusinessTask v2、LLM structured output、澄清机制 |
| M4：受控查询 | 4-6 天 | Query Planner 模板、Evidence、权限风险网关 |
| M5：富输出体验 | 4-6 天 | KPI、表格、图表、操作卡、关联问题 |
| M6：经营主干 | 1-2 周 | P1 Skills 覆盖营收、预约、营销、库存、财务、员工 |
| M7：上线治理 | 持续 | Eval、观测、反馈闭环、性能优化 |

---

## 14. 优先开发清单

建议从以下 10 个任务开始：

1. [x] T0.2 建立 P0 评测样本。
2. [x] T1.1 新增 `order.customer.consumption.list` 能力定义。
3. [x] T1.2 实现订单消费客户清单查询。
4. [x] T1.3 新增 Answer Contract Validator 初版。
5. [x] T1.4 修复前端表格渲染兼容。
6. [x] T1.5 跑通阶段 1 后端测试。
7. [x] T2.1 新建 Skill 类型与目录。
8. [x] T2.2 注册 P0 Skills。
9. [x] T2.3 Planner 改为 Skill-first。
10. [x] T8.1 AgentRun 记录 `skillId`、`businessTask` 和契约校验结果。

---

## 15. 验收总标准

### 产品验收

- [x] 用户问“昨天有哪些消费客户，列出清单”，返回客户清单表格。
- [x] 用户问“今天营收多少”，返回 KPI 和口径说明。
- [x] 用户问“哪些客户该回访”，返回客户优先级和原因。
- [x] 用户问“为什么利润下降”，返回诊断原因和数据证据。
- [x] 用户问“帮我生成召回活动”，返回活动草稿和确认卡，不直接发送。

### 技术验收

- [x] P0 eval 通过率达到 90% 以上。
- [x] 清单类输出契约通过率达到 95% 以上：`agent:eval:skills` 中 `outputContractAccuracy=1`，全量 Skill Eval 0 失败。
- [x] 高频问数首屏 2 秒内返回：P0 消费客户清单真实页面验收约 1642ms，客户回访推荐真实接口约 1807ms。
- [x] 每次 AgentRun 可追踪 Skill、BusinessTask、QueryPlan、Evidence。
- [x] 新增 Skill 不需要在多个关键词规则处打补丁：P2 本轮只在 `AgentSkillsRegistryService` 集中补 Skill 包、工具计划、输出契约和 eval cases，未新增 PreParser 关键词分支。

### 风险验收

- [x] 模型不直接写 SQL：LLM Structured Output 白名单拒绝 `domain=sql/query/write_sql` 等非法字段，失败后回退 PreParser；QueryPlan 只允许模板指标和维度。
- [x] 所有查询强制注入 `storeId`：QueryPlanner 生成 `storeScope.storeIds=[storeId]` 和 `filters.storeId`，QuerySafetyGuard 拒绝无效门店范围。
- [x] 财务、多门店、客户隐私数据按角色权限控制：QuerySafetyGuard、AgentPolicy 和工具注册按角色/权限拦截前台财务、广域美容师查询、终端管理和多店授权范围。
- [x] 中高风险动作必须人工确认：draft/workflow 请求进入确认卡或 approval 流，批量触达、活动草稿、补货草稿等不直接执行生产动作。
- [x] 无数据时不编造客户、金额或结论：经营问数和工具层无证据返回 `no_data`，测试覆盖商品销售、卡项、财务、排班、服务和美容师本人数据缺失场景。

最终门禁记录：

- 2026-06-27：`npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts agent-skills.registry.spec.ts business-task-llm-compiler.service.spec.ts business-task-compiler.service.spec.ts query-planner.service.spec.ts query-safety-guard.service.spec.ts business-query.service.spec.ts agent-policy.service.spec.ts agent-orchestrator.service.spec.ts agent-tool-registry.service.spec.ts --runInBand` 通过，10 个测试套件、170 条用例。
- 2026-06-27：`npm.cmd --prefix packages/server-v2 run agent:eval:skills` 通过，2/2；覆盖全量 Skill Eval 聚合和单 Skill 过滤。
- 2026-06-27：`npm.cmd --prefix packages/server-v2 run build` 通过。

---

## 16. 开发注意事项

- 不要一次性重构整个 Agent 链路，先用 P0 场景打穿闭环。
- 旧能力保留 fallback，避免影响现有营销、库存、财务、预约工具。
- Skills 是业务能力包，不是关键词规则集合。
- Answer Contract 是底线，模型话术不能覆盖结构化数据。
- Query Planner 是安全边界，不能为了灵活性让模型直接拼 SQL。
- 每完成一个 Skill，必须同步补 eval、Evidence 和前端输出形态。
