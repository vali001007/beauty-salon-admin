# Ami_Agent 六大角色 Agent 详细开发计划

更新时间：2026-06-25
关联 PRD：`docs/02-产品设计/Ami_Agent_新一代美业门店运营智能体产品需求文档.md`
关联对标：`docs/02-产品设计/Ami_Agent_主流Agent对标与美业应用借鉴分析.md`
适用范围：Ami_Core 管理端、`packages/server-v2`、新 Ami_Agent 前端入口、新 Agent Runtime、新工具注册中心、新自动化执行引擎、权限审批审计体系。

---

## 1. 目标与边界

### 1.1 开发目标

本计划目标是把 Ami_Agent 从产品 PRD 推进到可落地的开发路线，首期覆盖 6 个美业角色 Agent：

1. 店长经营 Agent
2. 营销增长 Agent
3. 前台接待 Agent
4. 美容师服务 Agent
5. 库存采购 Agent
6. 财务风控 Agent

最终交付不是一个聊天框，而是一套可查询、可解释、可执行、可审批、可追踪、可归因的美业经营智能体工作台。

### 1.2 关键边界

| 边界 | 要求 |
| --- | --- |
| 旧 AI Gateway | 不复用作为 Ami_Agent 核心链路，只能作为失败经验和历史对照 |
| 旧自动化任务系统 | 不复用作为 Ami_Agent 自动化执行底座 |
| 现有 Ami_Aura | 不复用产品形态、UI、终端式工作台和微应用入口 |
| 现有 web app | 不复用传统后台菜单式体验，但可复用稳定业务 API 和权限数据 |
| 业务 API | 可复用经过验证的 `server-v2` 业务服务，但必须通过新 Agent 工具层重新封装 |
| 写操作 | 先草稿、预览、确认、审批，再执行；禁止 Agent 直接自动发布高风险动作 |

### 1.3 当前代码基础判断

当前仓库已经存在一部分可作为起点的能力，但还未达到 Ami_Agent 产品级要求：

| 能力 | 当前状态 | 本计划处理 |
| --- | --- | --- |
| Agent 模块 | `packages/server-v2/src/agent` 已有 `AgentRun`、`ToolCall`、`Approval`、`Eval`、Planner、Tool Registry、Policy 等骨架 | 保留代码资产，按 Ami_Agent 新产品要求重构和扩展 |
| Agent 角色 | 当前类型主要是 `manager`、`reception`、`beautician` | 扩展为“用户角色 + 角色 Agent”双层模型 |
| 工具注册 | 已有客户优先级、收入诊断、商品销售、库存风险、营销机会、活动草稿、跟进草稿、补货草稿等工具 | 扩展为六大 Agent 工具包，并补权限、证据、输出组件 |
| 数据模型 | Prisma 已有 `AgentDefinition`、`AgentRun`、`AgentMessage`、`AgentStep`、`AgentToolCall`、`AgentApproval`、`AgentEvalCase`、`AgentEvalRun` | 增补 Agent 配置、记忆、触发器、自动化执行、效果归因模型 |
| 业务模块 | 已有 customers、marketing、promotions、inventory、orders、terminal、operation-profit、dashboard、beauticians 等模块 | 作为工具层的数据和动作来源 |
| 前端 API | 已有 `src/api/real/agent.ts`、`src/types/agent.ts` | 扩展为 Ami_Agent 产品入口 API，不只做审计接口 |

---

## 2. 总体架构

### 2.1 产品架构

```text
Ami_Agent 独立入口
  -> 智能会话
  -> 任务画布
  -> Agent 角色切换
  -> 自动化中心
  -> 记忆与归档
  -> 审批与审计

后端新 Agent Runtime
  -> 经营语义层
  -> 角色 Agent 编排
  -> 工具注册中心
  -> 权限与审批网关
  -> 回复渲染引擎
  -> 自动化执行引擎
  -> 观测评估与效果归因
```

### 2.2 后端模块建议

```text
packages/server-v2/src/agent
  agent-runtime/
  agent-personas/
  agent-tools/
  agent-rendering/
  agent-memory/
  agent-automation/
  agent-observability/
  agent-evaluation/
  agent-permissions/
```

不要求一次物理拆成上述目录，但开发时必须按这些边界组织职责，避免继续把所有逻辑堆进单一 `agent-tool-registry.service.ts`。

### 2.3 前端模块建议

```text
src/app/pages/ami-agent/
  AmiAgentWorkspace.tsx
  components/
    AgentSidebar.tsx
    AgentConversation.tsx
    AgentTaskCanvas.tsx
    AgentCardRenderer.tsx
    AgentTableRenderer.tsx
    AgentChartRenderer.tsx
    AgentApprovalPanel.tsx
    AgentAutomationCenter.tsx
    AgentMemoryPanel.tsx
    AgentRunTimeline.tsx
  hooks/
  types/

src/api/real/agent.ts
src/types/agent.ts
```

---

## 3. 数据模型计划

### 3.1 已有模型继续使用

| 模型 | 用途 |
| --- | --- |
| `AgentDefinition` | Agent 定义基础 |
| `AgentRun` | 一次 Agent 会话或任务运行 |
| `AgentMessage` | 对话消息 |
| `AgentStep` | 规划、工具、渲染、审批等执行步骤 |
| `AgentToolCall` | 工具调用记录 |
| `AgentApproval` | 审批与确认 |
| `AgentEvalCase` / `AgentEvalRun` | 评测集和评测结果 |

### 3.2 需要新增或扩展的模型

| 模型 | 目的 | 关键字段 |
| --- | --- | --- |
| `AgentPersona` | 六大角色 Agent 配置 | code、name、description、targetRoles、toolGroups、defaultStyle、riskPolicy |
| `AgentToolDefinition` | 工具目录持久化 | name、group、schemaJson、outputSchemaJson、riskLevel、permissions、enabled |
| `AgentMemory` | 用户偏好与长期记忆 | userId、storeId、scope、key、valueJson、sourceRunId、expiresAt |
| `AgentDailyArchive` | 按天归档聊天与任务 | userId、storeId、archiveDate、summary、runIds |
| `AgentAutomationDefinition` | 新自动化任务定义 | name、personaCode、triggerJson、conditionJson、actionsJson、riskLevel、status |
| `AgentAutomationRun` | 自动化运行记录 | automationId、status、inputJson、outputJson、errorMessage、startedAt、endedAt |
| `AgentAutomationEffect` | 自动化效果归因 | automationId、runId、followupCount、reservationCount、orderCount、revenueAmount |
| `AgentRenderedBlock` | 任务画布结构化输出 | runId、blockType、title、payloadJson、actionsJson |
| `AgentFeedback` | 用户反馈与采纳 | runId、userId、rating、adopted、comment、businessActionJson |

### 3.3 数据模型阶段策略

- 阶段 1 只补 `AgentPersona`、`AgentRenderedBlock`、`AgentFeedback`，支撑角色 Agent 和任务画布。
- 阶段 2 补 `AgentMemory`、`AgentDailyArchive`。
- 阶段 3 补全自动化相关模型。
- 每次 Prisma schema 改动后必须运行：

```powershell
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run build
```

---

## 4. API 计划

### 4.1 Agent 运行 API

| API | 方法 | 说明 |
| --- | --- | --- |
| `/agent/personas` | GET | 获取可用角色 Agent 列表 |
| `/agent/personas/:code` | GET | 获取角色 Agent 能力、工具、权限和推荐问题 |
| `/agent/runs` | POST | 创建 AgentRun，支持 `personaCode` |
| `/agent/runs/:id/messages` | POST | 多轮追加消息 |
| `/agent/runs/:id/rendered-blocks` | GET | 获取任务画布结构化结果 |
| `/agent/runs/:id/feedback` | POST | 提交采纳、评分和反馈 |
| `/agent/tools` | GET | 获取工具目录 |
| `/agent/tools/:name/preview` | POST | 工具执行前预览 |

### 4.2 审批与审计 API

| API | 方法 | 说明 |
| --- | --- | --- |
| `/agent/approvals` | GET | 审批列表 |
| `/agent/approvals/:id/approve` | POST | 同意执行 |
| `/agent/approvals/:id/reject` | POST | 拒绝执行 |
| `/agent/runs/:id/detail` | GET | 查看运行详情、工具调用、证据和结果 |
| `/agent/audit/export` | POST | 导出审计记录 |

### 4.3 记忆与归档 API

| API | 方法 | 说明 |
| --- | --- | --- |
| `/agent/memories` | GET | 查看用户和门店记忆 |
| `/agent/memories` | POST | 新增或更新记忆 |
| `/agent/memories/:id` | DELETE | 删除记忆 |
| `/agent/archives/daily` | GET | 按天查看聊天归档 |
| `/agent/archives/:date/summary` | POST | 生成当天摘要 |

### 4.4 新自动化 API

| API | 方法 | 说明 |
| --- | --- | --- |
| `/agent/automations` | GET | 自动化任务列表 |
| `/agent/automations/draft` | POST | 从自然语言生成自动化草稿 |
| `/agent/automations` | POST | 创建自动化任务 |
| `/agent/automations/:id/enable` | POST | 启用 |
| `/agent/automations/:id/pause` | POST | 暂停 |
| `/agent/automations/:id/runs` | GET | 查看运行记录 |
| `/agent/automations/:id/effects` | GET | 查看效果归因 |

---

## 5. 六大角色 Agent 开发范围

## 5.1 店长经营 Agent

### 5.1.1 产品目标

店长经营 Agent 是门店每日经营总入口，帮助店长快速了解今天要关注什么、哪些客户要跟进、预约和排班是否有风险、员工表现是否异常、库存和营销是否需要动作。

### 5.1.2 核心问题

- 今天门店经营重点是什么？
- 哪些客户最值得跟进？
- 今天预约里有哪些高价值或风险客户？
- 哪些美容师今天需要关注？
- 本周收入、客流、客单、复购有什么异常？
- 库存、活动、排班有没有风险？

### 5.1.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 经营概览 | `dashboard`、`operation-profit`、`orders` |
| 客户风险 | `customers`、`customer-profile`、`marketing` |
| 预约与排班 | `terminal`、`scheduling` |
| 员工表现 | `beauticians`、`operation-profit` |
| 库存风险 | `inventory` |
| 活动表现 | `marketing`、`promotions`、`marketing-pages` |

### 5.1.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `manager.daily.briefing` | 查询/分析 | 低 | 生成今日经营简报 |
| `customer.priority.rank` | 查询/分析 | 低 | 推荐优先跟进客户 |
| `schedule.diagnose` | 查询/分析 | 低 | 诊断预约、排班和空档 |
| `beautician.performance.diagnose` | 查询/分析 | 低 | 美容师业绩、复购、服务异常 |
| `revenue.diagnose` | 查询/分析 | 低 | 收入、订单、客单和趋势诊断 |
| `inventory.risk.rank` | 查询/分析 | 低 | 库存缺货、临期、补货优先级 |
| `manager.followup.plan.draft` | 草稿 | 中 | 生成店长待办和派发草稿 |

### 5.1.5 前端输出

- 今日经营重点卡
- 风险提醒卡
- 客户跟进表
- 美容师表现对比表
- 预约/排班时间轴
- 店长待办草稿
- 关联追问：看客户、看员工、看库存、生成日报

### 5.1.6 验收标准

- 店长打开 Ami_Agent 后可在 5 秒内看到今日经营简报骨架。
- 用户问“今天我应该重点关注什么”能返回客户、预约、员工、库存、营销至少 4 类证据。
- 所有建议必须能追溯到具体数据来源。
- 可生成店长待办草稿，但不自动派发高风险任务。

## 5.2 营销增长 Agent

### 5.2.1 产品目标

营销增长 Agent 负责发现增长机会、识别客群、匹配权益、生成活动草稿、生成触达话术，并追踪活动效果。

### 5.2.2 核心问题

- 哪些客户适合召回？
- 哪些项目或商品适合做活动？
- 这次活动应该给什么权益？
- 60 天未到店客户怎么触达？
- 上次活动为什么转化低？
- 哪些客户领券未核销？

### 5.2.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 客户画像 | `customer-marketing-profile`、`CustomerPredictionSnapshot` |
| 推荐卡 | `marketing`、`MarketingRecommendationSnapshot` |
| 权益资产 | `promotions` |
| 活动与触达 | `MarketingActivity`、`MarketingAutomationTouch` |
| H5 转化 | `marketing-pages` |
| 核销与订单 | `orders`、`customer-app` |

### 5.2.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `marketing.customer.segment.discover` | 查询/分析 | 低 | 发现可运营客群 |
| `marketing.opportunity.discover` | 查询/分析 | 低 | 发现商品、项目、客户机会 |
| `promotion.offer.match` | 查询/分析 | 低 | 匹配最低必要权益 |
| `marketing.activity.draft` | 草稿 | 中 | 生成活动草稿 |
| `marketing.copy.generate` | 内容 | 低 | 生成私域、短信、朋友圈话术 |
| `marketing.effect.diagnose` | 查询/分析 | 低 | 活动效果复盘 |
| `customer.followup.task.draft` | 草稿 | 中 | 生成顾问跟进任务草稿 |

### 5.2.5 前端输出

- 客群卡
- 权益推荐卡
- 活动草稿卡
- 触达话术卡
- 活动漏斗图
- 权益成本与毛利保护提示
- 高风险二次确认

### 5.2.6 验收标准

- 用户问“给 60 天没来的顾客做个召回”时，系统能追问或默认确认沉睡天数、权益、渠道。
- 能输出客群数量、样例客户、推荐权益、预计成本、风险提示和活动草稿。
- 活动草稿进入确认/审批，不直接发送触达。
- 活动复盘能关联触达、点击、领取、预约、核销、订单和收入。

## 5.3 前台接待 Agent

### 5.3.1 产品目标

前台接待 Agent 负责高频门店操作：查客户、查预约、解释权益、建跟进、收银/核销跳转、异常提醒，让前台少找页面、少重复输入。

### 5.3.2 核心问题

- 帮我查一下某个客户。
- 这个客户今天预约了什么？
- 她还有什么卡和权益？
- 帮我记录一个跟进。
- 这个客户适合推荐什么项目？
- 收银/核销入口在哪里？

### 5.3.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 客户基础信息 | `customers` |
| 客户画像 | `customer-profile` |
| 预约 | `terminal`、`customer-app` |
| 卡项与余额 | `orders`、`CustomerCard`、`CustomerBalanceAccount` |
| 权益 | `promotions`、`CustomerAppEvent` |
| 服务记录 | `terminal`、`ServiceTask` |

### 5.3.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `reception.customer.lookup` | 查询 | 低 | 查客户和基础画像 |
| `reception.reservation.today` | 查询 | 低 | 查今日预约和到店提醒 |
| `reception.card.benefit.summary` | 查询 | 低 | 查卡项、余额、权益 |
| `reception.followup.note.draft` | 草稿 | 中 | 生成跟进记录草稿 |
| `reception.checkout.link` | 跳转 | 中 | 生成收银入口链接，不自动收银 |
| `reception.verify.link` | 跳转 | 中 | 生成核销入口链接，不自动核销 |

### 5.3.5 前端输出

- 客户摘要卡
- 今日预约卡
- 卡项/权益表
- 推荐下一步动作
- 收银/核销跳转按钮
- 跟进草稿确认卡

### 5.3.6 验收标准

- 前台能通过姓名、手机号后四位、会员号等方式查客户。
- 敏感字段按权限脱敏。
- 收银、核销只提供上下文跳转或草稿，不直接完成交易。
- 跟进记录必须确认后写入。

## 5.4 美容师服务 Agent

### 5.4.1 产品目标

美容师服务 Agent 负责美容师本人当天服务准备、客户护理建议、服务记录草稿、复购机会和个人业绩进度。

### 5.4.2 核心问题

- 我今天有哪些客户？
- 下一个客户要注意什么？
- 这个客户上次做了什么项目？
- 这次护理后怎么记录？
- 我这个月业绩差多少？
- 哪些客户适合复购或续卡？

### 5.4.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 本人预约 | `terminal`、`scheduling` |
| 服务记录 | `ServiceTask`、`terminal` |
| 客户护理建议 | `CustomerHealthProfile`、`customer-profile` |
| 项目技能 | `BeauticianProjectSkill` |
| 业绩与提成 | `operation-profit`、`orders`、`finance` |
| 复购机会 | `marketing`、`customer-marketing-profile` |

### 5.4.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `beautician.today.service.list` | 查询 | 低 | 本人今日服务列表 |
| `beautician.customer.care.brief` | 查询/分析 | 低 | 客户护理摘要和注意事项 |
| `service.record.draft` | 草稿 | 中 | 生成服务记录草稿 |
| `beautician.performance.progress` | 查询 | 低 | 本月业绩、服务数、目标进度 |
| `beautician.repurchase.opportunity` | 查询/分析 | 低 | 本人客户复购机会 |
| `beautician.followup.task.draft` | 草稿 | 中 | 生成本人客户跟进草稿 |

### 5.4.5 前端输出

- 今日服务时间线
- 客户护理摘要卡
- 服务记录草稿
- 复购机会卡
- 个人业绩进度条
- 跟进提醒

### 5.4.6 权限要求

- 美容师默认只能看本人服务客户、本人预约、本人业绩。
- 不可查看全店财务、其他美容师客户明细、全店客户隐私字段。
- 店长可切换查看美容师服务 Agent 的管理视图。

### 5.4.7 验收标准

- 美容师登录后只能看到本人相关数据。
- “下一个客户要注意什么”能返回客户护理、历史服务、卡项消耗和推荐话术。
- 服务记录草稿必须确认后写入。
- 不能生成医疗化诊断或夸大疗效建议。

## 5.5 库存采购 Agent

### 5.5.1 产品目标

库存采购 Agent 负责库存风险、补货建议、临期处理、消耗趋势、供应链动作，帮助门店降低缺货、积压和临期损耗。

### 5.5.2 核心问题

- 现在库存有什么风险？
- 哪些商品快缺货？
- 哪些商品临期或周转慢？
- 结合最近销量应该补多少？
- 哪些项目消耗了哪些耗材？
- 是否需要生成补货单？

### 5.5.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 商品库存 | `Product`、`StockBatch` |
| 库存流水 | `StockMovement` |
| 商品销售 | `orders`、`OrderItem` |
| 项目耗材 | BOM / 项目耗材配置 |
| 供应商 | `ProductSupplier`、`supply-chain` |
| 补货规则 | `inventory` |

### 5.5.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `inventory.risk.rank` | 查询/分析 | 低 | 库存缺货、临期、低周转排行 |
| `inventory.consumption.trend` | 查询/分析 | 低 | 消耗趋势和预计可用天数 |
| `inventory.project.bom.risk` | 查询/分析 | 低 | 项目耗材毛利和缺料风险 |
| `inventory.replenishment.draft` | 草稿 | 中 | 生成补货建议单 |
| `inventory.expiring.clearance.draft` | 草稿 | 中 | 生成临期消化活动建议 |
| `supplier.purchase.link` | 跳转/草稿 | 中 | 生成采购入口或供应商询价草稿 |

### 5.5.5 前端输出

- 库存风险排行
- 补货建议表
- 临期商品处理卡
- 消耗趋势图
- 项目耗材风险卡
- 采购草稿确认卡

### 5.5.6 验收标准

- 用户问“库存有什么风险”能返回缺货、临期、周转慢三类风险。
- 补货建议必须给出依据：当前库存、安全线、近 30 天消耗、预计可用天数。
- 不自动创建正式采购单，必须生成草稿并确认。
- 临期消化建议可联动营销增长 Agent 生成活动草稿。

## 5.6 财务风控 Agent

### 5.6.1 产品目标

财务风控 Agent 负责收入、退款、成本、毛利、经营利润、异常流水和财务口径解释，帮助老板、财务和店长快速识别经营利润风险。

### 5.6.2 核心问题

- 今天/本月实收是多少？
- 为什么利润下降？
- 哪些项目或商品毛利异常？
- 哪些退款、折扣、成本异常？
- 哪些美容师业绩和提成需要关注？
- 经营利润数据来源是什么？

### 5.6.3 数据来源

| 数据 | 来源模块 |
| --- | --- |
| 收入与订单 | `orders`、`ProductOrder`、`OrderItem` |
| 经营利润 | `operation-profit` |
| 成本配置 | `operation-costs` |
| 商品/项目毛利 | `operation-profit`、库存成本、订单明细 |
| 美容师业绩 | `beauticians`、`operation-profit` |
| 退款与折扣 | `orders`、支付流水 |
| 财务页面 | `src/app/pages/finance/*` |

### 5.6.4 工具清单

| 工具 | 类型 | 风险 | 说明 |
| --- | --- | --- | --- |
| `finance.revenue.summary` | 查询/分析 | 低 | 实收、应收、退款、订单数 |
| `finance.profit.diagnose` | 查询/分析 | 低 | 经营利润变化原因 |
| `finance.margin.risk.rank` | 查询/分析 | 中 | 项目/商品毛利风险排行 |
| `finance.refund.discount.audit` | 查询/分析 | 中 | 退款、折扣、异常流水 |
| `finance.beautician.performance.audit` | 查询/分析 | 中 | 美容师业绩、提成、成本异常 |
| `finance.report.draft` | 文档草稿 | 中 | 生成日报、周报、月报草稿 |

### 5.6.5 前端输出

- 财务指标卡
- 利润变化瀑布图
- 异常流水表
- 毛利风险排行
- 美容师业绩/提成对比
- 财务复盘文档草稿

### 5.6.6 权限要求

- 财务 Agent 默认只对老板、财务、店长开放。
- 毛利、成本、提成、利润字段必须按字段级权限控制。
- 前台和美容师不可查看全店利润、成本和提成规则。
- 涉及财务规则修改只允许生成建议，不允许 Agent 直接修改。

### 5.6.7 验收标准

- 用户问“为什么本月利润下降”能拆解收入、客流、折扣、成本、毛利、退款等因素。
- 回答必须给出口径、时间范围、数据来源和限制。
- 财务异常只能生成复核任务或报告草稿，不自动调整财务数据。
- 字段脱敏和权限拦截有测试覆盖。

---

## 6. 前端产品开发计划

### 6.1 独立入口

新增 Ami_Agent 一级入口，避免混入现有 web app 后台页面或 Ami_Aura 终端形态。

建议路由：

```text
/ami-agent
/ami-agent/runs/:id
/ami-agent/automations
/ami-agent/approvals
/ami-agent/memory
/ami-agent/audit
```

### 6.2 页面结构

| 区域 | 功能 |
| --- | --- |
| 左侧 Agent 列表 | 6 个角色 Agent、常用问题、最近会话 |
| 中间智能会话 | 输入、多轮问答、追问、推荐问题 |
| 右侧任务画布 | 卡片、表格、图表、文档、审批、草稿 |
| 底部状态栏 | 工具调用、权限状态、证据来源、耗时 |
| 自动化中心 | 触发器、任务、运行日志、效果归因 |

### 6.3 渲染组件

| 组件 | 用途 |
| --- | --- |
| `AgentSummaryCard` | 经营简报、客户摘要、财务摘要 |
| `AgentRiskCard` | 风险提示 |
| `AgentDataTable` | 客户、库存、流水、活动明细 |
| `AgentTrendChart` | 收入、客流、库存、活动趋势 |
| `AgentActionCard` | 草稿、审批、跳转、确认 |
| `AgentDocumentPreview` | 日报、复盘、财务报告 |
| `AgentEvidencePanel` | 数据来源、口径、限制 |
| `AgentFollowupQuestions` | 1-3 个高价值关联问题 |

### 6.4 设计要求

- 极简、科技、艺术。
- 不做传统管理后台菜单式页面。
- 不做 Ami_Aura 终端式工作台。
- 任务画布优先，不把聊天文本作为唯一结果。
- 所有按钮必须显示状态：草稿、待确认、待审批、执行中、成功、失败。

---

## 7. 自动化执行引擎计划

### 7.1 开发阶段

| 阶段 | 内容 |
| --- | --- |
| A0 | 只生成自动化草稿，不运行 |
| A1 | 支持手动触发运行和日志 |
| A2 | 支持定时触发、事件触发、阈值触发 |
| A3 | 支持审批中断、失败重试、暂停熔断 |
| A4 | 支持效果归因和自动化复盘 |

### 7.2 内置触发器首批

| 触发器 | 所属 Agent | 首期动作 |
| --- | --- | --- |
| 沉睡客户 | 营销增长 Agent | 生成召回名单和跟进草稿 |
| 高价值客户到店 | 店长经营 Agent / 美容师服务 Agent | 推送重点服务提醒 |
| 疗程消耗 | 美容师服务 Agent / 营销增长 Agent | 生成续卡/复购建议 |
| 库存缺货 | 库存采购 Agent | 生成补货草稿 |
| 临期库存 | 库存采购 Agent / 营销增长 Agent | 生成临期消化活动草稿 |
| 活动低转化 | 营销增长 Agent | 生成优化建议和复盘 |
| 财务异常 | 财务风控 Agent | 生成复核任务 |
| 投诉差评 | 店长经营 Agent / 前台接待 Agent | 生成风险处理任务 |

### 7.3 验收标准

- 自动化任务必须有创建人、授权人、运行日志、失败原因。
- 任何批量触达、财务、权限动作必须审批。
- 自动化运行结果必须能回到对应 Agent 会话和任务画布。
- 效果归因至少支持跟进数、预约数、核销数、订单数、收入。

---

## 8. 权限与审批计划

### 8.1 角色权限矩阵

| Agent | 默认可用角色 | 敏感边界 |
| --- | --- | --- |
| 店长经营 Agent | 店长、老板、管理员 | 可看本店经营，不默认看跨店明细 |
| 营销增长 Agent | 店长、营销运营、老板 | 批量触达、发券必须审批 |
| 前台接待 Agent | 前台、店长 | 财务、成本、提成不可见 |
| 美容师服务 Agent | 美容师、店长 | 美容师只能看本人客户和本人业绩 |
| 库存采购 Agent | 店长、库存、采购、老板 | 正式采购单必须确认 |
| 财务风控 Agent | 财务、老板、管理员 | 成本、毛利、提成字段严格授权 |

### 8.2 审批策略

| 动作 | 策略 |
| --- | --- |
| 查询、分析 | 权限通过后直接执行 |
| 生成草稿 | 可直接生成 |
| 单条跟进任务 | 用户确认后写入 |
| 批量客户名单 | 可生成，执行前审批 |
| 批量触达 / 发券 | 必须审批 |
| 收银、核销、退款 | 只跳转或草稿，不自动完成 |
| 财务规则、权限配置 | 只建议，不直接修改 |
| 删除数据 | 不允许 Agent 直接执行 |

---

## 9. 阶段实施计划

## 阶段 0：基线冻结与开发准备

周期：2-3 天

目标：

- 确认 Ami_Agent 不复用旧 AI Gateway 和旧自动化任务系统。
- 盘点现有 Agent 代码骨架、业务服务、权限码和页面入口。
- 输出六大 Agent 的工具目录和权限矩阵。

任务：

- 后端：盘点 `packages/server-v2/src/agent`、`business-query`、`marketing`、`inventory`、`orders`、`operation-profit`、`terminal`。
- 前端：盘点 `src/api/real/agent.ts`、`src/types/agent.ts`、现有路由和权限。
- 产品：冻结六大 Agent 的 MVP 问题集和输出组件。

验收：

- 六大 Agent 工具目录完成。
- 权限矩阵完成。
- 数据模型改动清单完成。
- 不碰现有未提交业务代码，避免分支污染。

## 阶段 1：新 Agent Runtime 产品化

周期：5-7 天

目标：

- 把现有 Agent 骨架升级为支持 `personaCode` 的 Ami_Agent Runtime。
- 支持角色 Agent、工具包、任务画布结构化输出。

后端任务：

- 扩展 `AgentRole` 与 `AgentPersona` 概念。
- `AgentRun` 增加 `personaCode`、`source`、`renderMode` 等字段。
- 将 Tool Registry 从单一注册表拆为工具分组。
- 增加 `AgentRenderedBlock` 或等价结构化输出。
- 统一返回 `answer + renderedBlocks + evidence + actions + followupQuestions`。

前端任务：

- 扩展 `src/types/agent.ts`。
- 扩展 `src/api/real/agent.ts`。
- 搭建 `/ami-agent` 页面骨架。
- 实现角色 Agent 切换、会话输入、任务画布基础渲染。

验收：

- 可选择 6 个 Agent 之一发起会话。
- 任一 Agent Run 可记录消息、计划、工具调用、证据和结构化结果。
- 原有 Agent eval 测试继续通过或迁移到新 eval。

## 阶段 2：店长经营 Agent + 前台接待 Agent

周期：7-10 天

目标：

- 先打通高频经营与前台操作场景，验证新 Runtime、工具、权限、任务画布。

后端任务：

- 实现 `manager.daily.briefing`。
- 强化 `customer.priority.rank`。
- 实现 `reception.customer.lookup`。
- 实现 `reception.reservation.today`。
- 实现 `reception.card.benefit.summary`。
- 实现 `reception.checkout.link`、`reception.verify.link`。

前端任务：

- 今日经营重点卡。
- 客户摘要卡。
- 今日预约卡。
- 卡项/权益表。
- 收银/核销跳转按钮。
- 证据面板。

测试：

```powershell
npx.cmd vitest run src/test/api.test.ts
npm.cmd --prefix packages/server-v2 run test -- --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

验收：

- 店长问“今天重点关注什么”能返回经营、客户、预约、员工或库存证据。
- 前台问“查一下某客户”能返回客户摘要、预约、卡项、权益，并按权限脱敏。
- 收银/核销不自动执行，只提供上下文跳转。

## 阶段 3：营销增长 Agent

周期：7-10 天

目标：

- 打通客群、权益、活动草稿、话术、复盘闭环。

后端任务：

- 实现 `marketing.customer.segment.discover`。
- 强化 `marketing.opportunity.discover`。
- 接入 `promotions` 权益匹配。
- 强化 `marketing.activity.draft`。
- 实现 `marketing.copy.generate`。
- 实现 `marketing.effect.diagnose`。

前端任务：

- 客群卡。
- 权益推荐卡。
- 活动草稿卡。
- 触达话术卡。
- 活动漏斗图。
- 高风险确认卡。

验收：

- “给 60 天没来的顾客做个召回”能生成客群、权益、文案、活动草稿。
- 高风险权益需要二次确认。
- 活动效果复盘能说明触达、领取、预约、核销、收入。

## 阶段 4：美容师服务 Agent + 库存采购 Agent

周期：8-12 天

目标：

- 覆盖员工服务与库存采购两个门店高价值闭环。

后端任务：

- 实现 `beautician.today.service.list`。
- 实现 `beautician.customer.care.brief`。
- 强化 `service.record.draft`。
- 实现 `beautician.performance.progress`。
- 实现 `beautician.repurchase.opportunity`。
- 实现 `inventory.consumption.trend`。
- 实现 `inventory.project.bom.risk`。
- 强化 `inventory.replenishment.draft`。
- 实现 `inventory.expiring.clearance.draft`。

前端任务：

- 美容师今日服务时间线。
- 护理摘要卡。
- 服务记录草稿。
- 复购机会卡。
- 库存风险排行。
- 补货建议表。
- 临期处理卡。

验收：

- 美容师只能看到本人客户、本人预约、本人业绩。
- “下一个客户要注意什么”能给出护理建议和历史服务证据。
- “库存有什么风险”能返回缺货、临期、周转慢风险。
- 补货单和服务记录均为草稿，确认后写入。

## 阶段 5：财务风控 Agent

周期：7-10 天

目标：

- 打通收入、成本、毛利、利润、退款、折扣、异常流水和经营利润解释。

后端任务：

- 实现 `finance.revenue.summary`。
- 实现 `finance.profit.diagnose`。
- 实现 `finance.margin.risk.rank`。
- 实现 `finance.refund.discount.audit`。
- 实现 `finance.beautician.performance.audit`。
- 实现 `finance.report.draft`。

前端任务：

- 财务指标卡。
- 利润变化瀑布图。
- 异常流水表。
- 毛利风险排行。
- 财务复盘文档草稿。

验收：

- “为什么本月利润下降”能拆解收入、客流、折扣、成本、毛利、退款。
- 成本、毛利、提成按字段权限控制。
- 财务规则修改只输出建议，不直接执行。

## 阶段 6：记忆、归档、观测评估

周期：5-7 天

目标：

- 让 Ami_Agent 可持续使用、可复盘、可优化。

任务：

- 新增用户偏好记忆。
- 新增聊天按天归档。
- 新增 Agent 反馈和采纳记录。
- 扩展 Agent eval cases，覆盖六大 Agent。
- 建立工具调用成功率、采纳率、人工接管率、业务动作率指标。

验收：

- 用户可查看、删除、修改记忆。
- 聊天记录按日期归档。
- 每个 Agent 的核心问题有 eval 覆盖。
- 管理员能查看 Agent 使用质量。

## 阶段 7：全新自动化执行引擎

周期：10-15 天

目标：

- 交付不依赖旧自动化系统的新执行引擎。

任务：

- 新增自动化定义、运行、效果归因模型。
- 实现自动化草稿生成。
- 实现手动触发、定时触发、事件触发。
- 实现审批中断、失败重试、暂停熔断。
- 实现沉睡客户、高价值客户到店、库存缺货、临期库存、活动低转化、财务异常首批触发器。

验收：

- 自动化任务可创建、启用、暂停、查看日志。
- 运行失败可重试或人工接管。
- 高风险动作必须审批。
- 效果归因可查看跟进、预约、核销、订单、收入。

---

## 10. 测试与验收门禁

### 10.1 后端测试

必须覆盖：

- Agent Persona 权限。
- Tool Registry schema 和权限。
- 每个 Agent 至少 3 个核心问题 eval。
- 字段脱敏。
- 审批确认。
- 自动化触发和幂等。

命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- --runInBand
npm.cmd --prefix packages/server-v2 run build
```

### 10.2 前端测试

必须覆盖：

- API facade 类型。
- Agent Workspace 渲染。
- 任务画布卡片。
- 审批状态。
- 权限下按钮隐藏/禁用。

命令：

```powershell
npx.cmd vitest run src/test/api.test.ts
npm.cmd run build
```

### 10.3 业务验收

每个 Agent 至少验收 5 个真实问题：

| Agent | 必测问题 |
| --- | --- |
| 店长经营 | 今天重点关注什么、本周收入异常、哪些客户要跟进、员工表现、库存风险 |
| 营销增长 | 60 天召回、项目活动、权益匹配、文案生成、活动复盘 |
| 前台接待 | 查客户、查预约、查卡项、建跟进、收银/核销跳转 |
| 美容师服务 | 今日客户、护理建议、服务记录、业绩进度、复购机会 |
| 库存采购 | 库存风险、缺货、临期、消耗趋势、补货草稿 |
| 财务风控 | 实收、利润下降、毛利异常、退款折扣、财务报告 |

---

## 11. 风险与控制

| 风险 | 影响 | 控制方式 |
| --- | --- | --- |
| 继续沿用旧 AI Gateway | 新产品继承旧问题 | 新 Runtime 独立接口、独立类型、独立验收 |
| 旧自动化系统混入 | 自动化不可执行或不可复盘 | 新自动化模型、运行日志、效果归因 |
| 工具过多失控 | Agent 输出不稳定 | 工具分组、schema、eval、权限 |
| 写操作误执行 | 客户、财务、营销风险 | 草稿优先、审批中断、幂等 |
| 字段越权 | 财务和客户隐私泄露 | 字段级权限和脱敏测试 |
| 前端退化成聊天框 | 不能承接业务动作 | 任务画布和结构化渲染为验收项 |
| 六大 Agent 同时铺开过大 | 周期不可控 | 阶段 2-5 分批交付，阶段门禁通过再继续 |

---

## 12. 推荐交付顺序

建议按以下顺序推进：

1. 阶段 0：基线冻结与工具目录。
2. 阶段 1：新 Runtime + Ami_Agent 前端骨架。
3. 阶段 2：店长经营 Agent + 前台接待 Agent。
4. 阶段 3：营销增长 Agent。
5. 阶段 4：美容师服务 Agent + 库存采购 Agent。
6. 阶段 5：财务风控 Agent。
7. 阶段 6：记忆、归档、观测评估。
8. 阶段 7：全新自动化执行引擎。

这样排序的原因：

- 店长和前台最能验证日常使用价值。
- 营销最容易证明增收价值。
- 美容师和库存需要更多权限与数据边界。
- 财务风控敏感度最高，放在工具、权限、任务画布成熟之后。
- 自动化执行引擎风险最高，必须在工具、审批、审计、归因成熟后再上线。

---

## 13. 本计划完成定义

完成不是“文档写完”或“聊天能回复”，而是达到以下标准：

1. 六大角色 Agent 都有明确入口、权限、工具包和验收问题。
2. Agent 回复能输出卡片、表格、图表、文档、链接和审批动作。
3. 每个经营事实都有证据、口径和来源。
4. 所有写操作都走草稿、确认、审批和审计。
5. 旧 AI Gateway 和旧自动化任务系统不承担 Ami_Agent 核心链路。
6. 至少通过后端 build、关键单测、前端 build 和 API facade 测试。
7. 能用真实业务数据完成六大 Agent 的核心问题验收。
