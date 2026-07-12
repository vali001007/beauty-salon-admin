# Ami Brain PRD 目标收口详细开发计划

> **For agentic workers:** 实施时使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐任务推进，并按复选框更新状态。
>
> **执行要求：** 每个阶段必须完成代码、接口、页面、真实数据、自动化测试、真实评测和验收记录，不能用“类已创建”“单测通过”替代产品闭环。

**Goal：** 将 Ami Brain 从六域问答与建议能力，收口为具备真实会话、上下文记忆、Supervisor 协同、受控执行、主动巡检、预测解释和版本治理的可交付经营智能体。

**Architecture：** `BrainChatService` 作为请求主链路，统一完成安全检查、上下文、路由、权限、Adapter/Supervisor 调用和落库；单域任务走 Domain Adapter，复合任务走 Supervisor DAG，写操作统一经过 Capability Gateway 与人在环确认。治理资源采用版本化发布，评测、Trace、反馈和回滚构成发布门禁。

**Tech Stack：** React 18、TypeScript、Vite、NestJS、Prisma、PostgreSQL、Vitest/Jest、Playwright、SSE。

生成日期：2026-07-11

需求基线：`docs/02-产品设计/01-AI智能体与问数能力/新一代美业门店经营智能体-独立版-产品需求文档-2026-07-10.md`

最终完整 650 题结果：`450/650 = 69.2%`，假阳性 0，时间误退化全量 0，跨门店读取 0，roleHint 绕权 0，异常 0。结果来自一次性完整运行，不使用分角色报告拼接。

## 0. 当前执行状态（2026-07-11）

| 阶段 | 状态 | 已有证据 | 仍需完成 |
| --- | --- | --- | --- |
| P5 管理端真实闭环 | 已完成 | 真实会话、历史消息、引用、Trace、动作预览、反馈、SSE 与刷新恢复已接线；真实登录态 Playwright 通过 | 无发布阻断 |
| P6 上下文与长期记忆 | 已完成 | `contextSnapshot/contextVersion`、`BrainMemoryRevision` 已迁移；100 条多轮专项通过 | 在完整 650 题中复核边界/多轮分组 |
| P7 Supervisor 与客服 Agent | 已完成 | DAG、并行依赖、超时降级、客服 Adapter、复合任务和 100 条客服专项测试已落地 | 深层跨域归因继续按评测失败簇迭代 |
| P8 全域数据深度 | 已完成阶段门禁 | 完整 650 题 `450/650 = 69.2%`；店长 70、前台 56、营销 78、美容师 74、库存 62、财务 75、边界/多轮 35；假阳性 0 | 193 条未覆盖意图进入 P11，不阻断本阶段发布 |
| P9 操作、巡检、预测 | 已完成首批产品化 | 预约/跟进/采购草稿/营销草稿/服务记录真实执行；幂等回执；六域巡检落库去重；客户预测快照解释 | 真实业务写入的浏览器验收仍受生产数据写入授权门禁控制；巡检标注真阳性率进入试点 |
| P10 治理、发布、多端、性能 | 已完成阶段门禁 | 资源版本、异步评测、灰度发布、回滚、反馈看板、Kiosk/App 复用；发布回滚真实演练通过；SSE 首字 P95 2.547 秒 | 完整请求 P95 受远程数据库波动为 5.272 秒，继续作为基础设施优化项 |

当前产品结论：Ami Brain 已完成“真实入口、记忆、Supervisor、六域 Adapter、受控执行、主动巡检、预测解释、版本治理和多端复用”的阶段闭环，并通过 65% 发布门禁。产品仍有 193 条未覆盖意图，不等于 PRD 全量能力 100% 完成；后续重点转为客户精确查询、采购建议、权益 ROI、员工复购排行和否定纠正。

## 1. 计划目标

本计划用于把当前 Ami Brain 从“后端六域薄覆盖问答服务”推进为 PRD 定义的可用经营智能体产品，按以下顺序收口：

1. 修复 `/brain` 管理端真实会话与交互闭环。
2. 接入会话上下文、跨会话记忆、指代消解和主动澄清。
3. 实现 Supervisor、多角色任务编排和客服 Domain Adapter。
4. 扩充全域真实数据口径，降低统一拒答比例。
5. 接入真实操作、主动巡检和预测能力。
6. 完成治理台、评测门禁、版本灰度、回滚和多端复用。

本计划替代旧任务文档中“代码、产品和 M4 已全部完成”的状态描述。旧文档保留为历史记录，后续完成度只以本计划验收记录、真实请求验证和发布结果为准。

## 2. 当前基线与缺口

### 2.1 已完成基础

- `brain_*` 独立命名空间已建立，数据库 readiness 已达到 14 指标、8 维度、13 技能、7 角色、6 巡检规则、40 个启用评测样本。
- `BrainChatService` 已完成会话、消息、Run、RunStep 的真实落库。
- 角色意图路由、六个 Domain Adapter、时间解析、权限校验、门店隔离、字段脱敏和安全拒答已接入请求主链路。
- 最近一次后端 Brain 全套验证为 45 suites、521 tests 通过；此后 P8 增量改动已通过定向测试，仍需在 A-05 重跑全套门禁。
- 650 题真实可用率为 46.9%，但仍有 345 题未覆盖。

### 2.2 已关闭的原 P0 阻断

- 管理端已删除 `Date.now()` 本地假会话 ID，创建、列表、消息历史和刷新恢复均走真实接口。
- 引用、Trace、动作预览、确认/拒绝、反馈已进入真实页面链路。
- 会话上下文和长期记忆已接入 `BrainChatService`，并完成数据库迁移。
- Supervisor DAG 和客服 Domain Adapter 已进入主流程及专项测试。

### 2.3 当前发布阻断与 PRD 缺口

| 能力域 | 当前状态 | 发布前必须达到 |
| --- | --- | --- |
| 前端真实闭环 | 主流程已接通，缺真实登录态 E2E 和生产性能数据 | 浏览器全流程通过；常规问数 P95 首字延迟 <=3 秒 |
| 记忆与追问 | 上下文、长期记忆、纠正/删除已完成 | 完整评测中多轮 >=35/50，跨店/跨用户读取为 0 |
| 语义与问数 | 六域均有真实查询，但前台、库存、财务未过目标，仍有 3 条已知假阳性 | 完整 650 题真实可用率 >=65%，假阳性 0 |
| 多 Agent 协同 | Supervisor DAG、并发、依赖、超时降级已完成 | 复合任务纳入完整回归，失败结果可解释 |
| 技能与执行 | 查询、模板、预览可用，真实写操作未产品化 | Capability Gateway 真实执行、幂等、事务、确认和业务回执 |
| 主动价值 | Inspection 只有类和测试骨架 | 六域巡检真实执行、发现落库、去重、关闭和处置复盘 |
| 预测能力 | Prediction 只有格式化骨架 | 查询真实预测快照，展示版本、置信度、依据和适用边界 |
| 治理迭代 | Trace 可查询；治理 CRUD、评测运行、发布回滚仍为占位 | 资源版本化、异步评测、灰度、回滚和反馈闭环 |

## 3. 总体交付路线

| 阶段 | 核心交付 | PRD 对应 | 当前状态 | 剩余基准工期 |
| --- | --- | --- | --- | ---: |
| P5 | `/brain` 前端真实闭环 | L1、GOV-1、PRM-3 | 主流程完成 | 0.5 周 E2E/性能验收并入 P10 |
| P6 | 会话上下文与长期记忆 | MEM-1~MEM-6 | 完成 | 0 周 |
| P7 | Supervisor 与客服 Agent | ORC-1~ORC-6 | 完成代码与专项测试 | 0.5 周完整回归并入 P8 |
| P8 | 全域数据与建议深度 | SEM-1~SEM-6、SKL-1/4/6 | 收口中 | 1.5 周 |
| P9 | 真实操作、巡检、预测 | SKL-2/3/7、PRM-3 | 骨架 | 3 周 |
| P10 | 治理发布、多端与性能 | GOV-1~GOV-5、NFR | 骨架 | 2.5 周 |

从当前代码状态计算，2 名后端、1 名前端、1 名测试并行执行的剩余基准工期为 7 周；单人串行执行为 11 周。排期不包含等待外部模型、短信、审批或生产账号开通的时间。

## 4. P5：管理端真实会话与交互闭环

### P5-01 真实会话生命周期

- [ ] 修改 `src/app/pages/brain/BrainWorkspace.tsx`，删除 `Date.now()` 会话 ID。
- [ ] 点击“新建会话”调用 `createBrainConversation()`，以后端返回 ID 为唯一会话标识。
- [ ] 页面进入时调用 `listBrainConversations()`，展示最近会话、更新时间和标题。
- [ ] 切换会话时调用 `listBrainMessages()` 恢复消息历史。
- [ ] 支持会话创建失败、会话不存在和权限不足状态。
- [ ] 首次进入无会话时显示空状态，不自动制造本地假会话。

涉及文件：

- `src/app/pages/brain/BrainWorkspace.tsx`
- `src/app/pages/brain/components/BrainConversationSidebar.tsx`（新增）
- `src/api/real/brain.ts`
- `src/types/brain.ts`

验收标准：

- 新用户可在页面创建会话并成功发送第一条消息。
- 刷新浏览器后会话和消息完整恢复。
- 页面不得向不存在的 conversationId 发送请求。

### P5-02 消息时间线与回答状态

- [ ] 新增 `BrainMessageTimeline`，渲染 user/assistant 消息和发送时间。
- [ ] 支持 `queued/running/completed/failed/needs_confirmation` 状态。
- [ ] 发送期间禁用重复提交，防止重复 Run 和重复消息。
- [ ] 失败时保留用户输入并提供重试。
- [ ] 长回答、列表、排行、对比和结构化 blocks 均可阅读。
- [ ] 会话标题在首条消息后按主题自动更新，失败时保留默认标题。

### P5-03 依据、Trace 与动作预览

- [ ] 将 `BrainEvidencePanel` 从静态占位改为当前回答关联面板。
- [ ] 展示 citation 的指标名、定义、数据来源和时间范围。
- [ ] 通过 `getBrainRunEvents()` 展示认知、路由、adapter、查询、权限步骤。
- [ ] 渲染 `suggestedActions` 和 `BrainActionPreview`。
- [ ] 接入 `confirmBrainAction()` 和 `rejectBrainAction()`。
- [ ] 确认结果明确显示“已确认预览”或“已执行”，不得混淆。

### P5-04 角色、反馈和可用性状态

- [ ] 增加角色选择器，默认自动路由，手动 roleHint 只影响能力分工，不改变权限。
- [ ] 增加点赞、点踩、纠正入口并调用 `createBrainFeedback()`。
- [ ] 增加空数据、口径未接入、权限不足、安全拦截等专用 UI。
- [ ] 增加移动宽度适配，保证 1280px、1440px、1920px 和 390px 均无重叠。

### P5-05 流式响应与性能

- [ ] 后端新增 `/brain/conversations/:id/messages/stream` SSE 接口。
- [ ] 流事件至少包括 `run_started`、`step`、`answer_delta`、`action_preview`、`completed`、`failed`。
- [ ] 前端支持断线、取消、重连和最终消息落库校验。
- [ ] 常规问数 P95 首字延迟压到 3 秒以内。

P5 测试门禁：

```powershell
npx.cmd vitest run src/app/pages/brain src/api/real/brain.test.ts
npm.cmd --prefix packages/server-v2 run test -- brain.controller brain-chat --runInBand
npm.cmd run build
```

P5 端到端验收：创建会话 -> 发送问题 -> 展示回答/引用 -> 刷新恢复 -> 触发动作预览 -> 确认/拒绝 -> 提交反馈。

## 5. P6：会话上下文与长期记忆

### P6-01 会话上下文解析

- [ ] 新增 `BrainConversationContextService`，从最近消息和 Run 输出构建上下文。
- [ ] 保存最近角色、时间范围、客户、员工、项目、指标、排序和过滤条件。
- [ ] 支持“这个客户”“那个美容师”“再看上个月”“换成毛利率”等指代和省略。
- [ ] 新问题明确覆盖旧条件时，以新条件为准并记录纠正步骤。
- [ ] 上下文冲突时主动澄清，不静默猜测。

建议数据调整：

- 在 `BrainConversation` 增加 `contextSnapshot Json?` 和 `contextVersion Int`。
- 每轮完成后原子更新上下文快照，消息和 Run 仍作为完整审计来源。

### P6-02 记忆读取接入主链路

- [ ] 在 `BrainChatService` 注入 `BrainMemoryService`。
- [ ] 认知解析后按 storeId、userId、subjectKey、实体和权限检索有效记忆。
- [ ] 记忆只辅助判断、偏好和历史决策；实时经营数值强制回源查询引擎。
- [ ] memory citation 标注记忆类型、更新时间、置信度和来源 Run。
- [ ] 跨门店记忆默认拒绝，跨用户记忆按角色和权限过滤。

### P6-03 记忆写入与巩固

- [ ] 将固定短语抽取升级为结构化候选提取器。
- [ ] 只写入偏好、决策、事件、稳定画像，不写入易变流水数值。
- [ ] 增加重复合并、冲突检测、置信度衰减和过期失效。
- [ ] 巩固任务从固定“周末爆满”规则升级为可配置策略。
- [ ] 巩固结果、证据和覆盖旧记忆过程写入 Trace。

### P6-04 记忆治理

- [ ] 治理台新增记忆列表、来源、置信度、有效期和可见范围。
- [ ] 支持用户纠正、删除和恢复。
- [ ] 纠正后旧记忆失效，新记忆保留 revision 关系。
- [ ] 敏感客户记忆禁止展示完整手机号、证件号和健康隐私原文。

P6 验收指标：

- 100 条多轮测试中，上下文继承正确率 >= 90%。
- 需要澄清的样本主动澄清率 >= 90%。
- 数值问题使用历史记忆直接回答的次数为 0。
- 跨门店和跨用户记忆读取为 0。
- 650 题边界/多轮从 18/50 提升到 >=35/50。

## 6. P7：Supervisor、多角色协同与客服 Agent

### P7-01 Supervisor 计划模型

- [ ] 重构 `BrainOrchestratorService`，删除固定 `if/else` 任务表。
- [ ] 定义 `BrainTaskPlan`、`BrainTaskNode`、`BrainTaskDependency`、`BrainTaskResult`。
- [ ] 根据意图、实体、角色能力卡和权限生成任务 DAG。
- [ ] 单域问题继续走直接 adapter 路径，复合任务才进入 Supervisor。
- [ ] 计划生成后执行权限预检，禁止生成用户无权执行的任务。

### P7-02 DAG 执行器

- [ ] 新增 `BrainTaskExecutorService`。
- [ ] 支持串行、并行、汇总、超时、重试和失败降级。
- [ ] 每个节点记录角色、技能、输入、输出、耗时、权限和错误。
- [ ] 子任务失败时保留已成功事实，并明确说明缺失部分。
- [ ] 汇总回答使用“结论 -> 归因 -> 建议 -> 行动”结构。

### P7-03 角色配置化

- [ ] `BrainAgentProfileService` 加载角色提示、技能授权、数据范围和知识包。
- [ ] `BrainDomainAdapterRegistry` 支持从配置启用/禁用 adapter。
- [ ] 角色配置发布前执行权限码注册和技能存在性校验。
- [ ] 角色版本变更写入 release item，不直接覆盖稳定版本。

### P7-04 客服 Domain Adapter

- [ ] 新增 `customer_service` adapterKey 和 `BrainCustomerServiceDomainAdapter`。
- [ ] 接入服务后回访、生日关怀、疗程周期提醒、投诉安抚和满意度跟进。
- [ ] 查询客户历史时复用 `BrainCustomerFactResolverService`。
- [ ] 群发、建任务和发券只生成受控动作，不直接写库。
- [ ] 新增客服角色 100 题评测集。

### P7-05 复合任务验收场景

- [ ] “为什么本周利润下降”并行调用财务、店长、库存和营销。
- [ ] “找出高流失客户并生成召回方案”调用预测、营销和客服。
- [ ] “明天下午有空档，找合适客户并准备提醒”调用前台、客户和营销。
- [ ] “临期库存如何促销”调用库存、营销和财务。

P7 验收指标：

- 20 个复合任务全部生成可追踪 DAG。
- 并行节点实际并发执行，单节点超时不拖垮完整任务。
- roleHint 权限绕过为 0。
- 客服角色真实可用率 >= 50%。

## 7. P8：全域真实数据与建议深度

### P8-01 店长经营

- [ ] 增加经营目标表或对接现有目标配置，支持目标完成率和差额。
- [ ] 接入员工、项目、客户、支付方式和门店趋势排行。
- [ ] 增加同比、环比、趋势和异常贡献分析。
- [ ] 输出晨报、晚报和经营诊断结构化 blocks。

### P8-02 前台接待

- [ ] 接入客户精确查询、会员等级、卡余额、消费记录和备注。
- [ ] 接入预约确认、爽约、改期、空档和床位/人员资源联合查询。
- [ ] 接入收银金额预览、优惠券、次卡核销和储值资产查询。
- [ ] 所有敏感客户信息走字段级脱敏和最小必要展示。

### P8-03 营销与客服

- [ ] 建立活动成本、触达、核销、归因收入统一口径。
- [ ] 实现营销 ROI、渠道质量、客群转化和活动复盘。
- [ ] 接入自动化规则查询和规则预览，不把模板文案算成自动化完成。
- [ ] 客群名单必须返回真实客户集合和筛选依据。

### P8-04 美容师服务

- [ ] 接入个人业绩、升单、复购、服务时长和客户满意度。
- [ ] 接入客户护理历史、过敏与健康注意事项权限口径。
- [ ] 接入项目/产品推荐依据和护理周期建议。
- [ ] 写服务记录和跟进任务继续走 P9 能力网关。

### P8-05 库存采购

- [ ] 支持 SKU 明细、安全库存、门店/仓库合计、批次和有效期。
- [ ] 接入耗材 BOM、项目消耗、损耗率和库存周转。
- [ ] 输出采购数量建议、供应商候选和预计覆盖天数。
- [ ] 调拨、退货和采购进入动作预览。

### P8-06 财务风控

- [ ] 接入支付方式拆分、退款明细、折扣明细和收银对账。
- [ ] 区分实收、确认收入、储值负债和履约收入。
- [ ] 接入成本、提成、日结异常和大额资金风险。
- [ ] 支持财务排行、名单和时间对比。

P8 评测目标：

| 角色 | 当前 | P8 目标 |
| --- | ---: | ---: |
| 店长 | 48/100 | >=65/100 |
| 前台 | 31/100 | >=55/100 |
| 营销 | 61/100 | >=72/100 |
| 美容师 | 53/100 | >=68/100 |
| 库存 | 40/100 | >=60/100 |
| 财务 | 54/100 | >=68/100 |
| 边界/多轮 | 18/50 | >=35/50 |

总体 650 题真实可用率目标：>=65%，假阳性继续为 0。

## 8. P9：真实操作、主动巡检与预测

### P9-01 Capability Gateway 真实执行

- [ ] 将 `BrainCapabilityGatewayService` 从映射表升级为统一执行网关。
- [ ] 优先调用 NestJS 内部 application service，禁止通过裸数据库写入绕过业务规则。
- [ ] 每个 capability 声明 DTO schema、权限、风险、幂等键、事务边界和回执类型。
- [ ] 执行前重新校验用户、门店、对象状态和确认记录。
- [ ] 重复确认使用同一幂等键，不重复产生业务副作用。

首批真实动作：

- [ ] 创建/改期/取消预约。
- [ ] 创建客户跟进任务。
- [ ] 创建采购单草稿并提交审批。
- [ ] 创建营销触达任务草稿。
- [ ] 保存服务记录。

暂不开放：直接退款、直接核销、直接结算提成、批量群发、删除业务数据。

### P9-02 人在环确认

- [ ] preview 返回变更前后、影响对象、金额、风险和所需权限。
- [ ] confirm 后进入真实执行状态，不再返回 `confirmed_preview_only`。
- [ ] 增加 `executing/succeeded/failed/expired/rejected` 状态。
- [ ] 所有高风险动作记录操作者、确认时间、执行回执和失败原因。

建议数据模型：新增 `brain_action_execution`，保留 action confirmation 与业务回执关联。

### P9-03 主动巡检

- [ ] `BrainInspectionService` 从返回规则名升级为规则加载、数据执行、命中判定和结果落库。
- [ ] 新增 `brain_inspection_run`、`brain_inspection_finding`。
- [ ] 支持定时触发和业务事件触发。
- [ ] 同一风险在冷却期内去重，风险解除后自动关闭。
- [ ] 预警卡包含结论、依据、严重度、建议动作和处理入口。
- [ ] 记录采纳、忽略、误报和最终处置结果。

首批六域巡检：高价值客户沉睡、预约爽约、毛利下降、库存临期/缺货、活动低 ROI、员工产能空档。

### P9-04 预测能力

- [ ] 查询 `CustomerPredictionSnapshot` 和生命周期预测资产。
- [ ] 支持流失、复购、响应和客户价值预测解释。
- [ ] 库存预测接入历史消耗与 BOM，不从零训练模型。
- [ ] 所有预测展示模型版本、生成时间、置信度和主要依据。
- [ ] 预测只生成建议或动作预览，不作为确定事实直接执行。

P9 安全门禁：

- 未确认真实写入数为 0。
- 重复确认导致重复业务记录数为 0。
- 越权执行、跨店执行、过期确认执行均为 0。
- 巡检真阳性率在试点标注集达到 >=80%。

## 9. P10：治理发布、多端复用与性能收口

### P10-01 治理后台真实 CRUD

- [ ] 将语义、角色、技能、巡检创建/更新接口改为真实数据库写入。
- [ ] 治理资源支持 draft/active/disabled/archived 状态。
- [ ] 每次修改生成版本，不覆盖已发布稳定版本。
- [ ] 治理页面使用真实 tabs，只渲染当前功能区。
- [ ] 表单增加校验、冲突检测、权限码存在性和发布前预检。

### P10-02 Trace 与评测中心

- [ ] Trace 展示上下文、记忆、路由、DAG、技能、查询、权限、成本和延迟。
- [ ] 评测中心可选择用例集、版本、门店和角色发起异步运行。
- [ ] 保存逐题结果、grader 结果、失败簇和基线差异。
- [ ] 确定性评分与 LLM Judge 分开显示，不互相覆盖。
- [ ] 发布门禁读取真实评测结果，禁止空结果 `canRelease=true`。

### P10-03 灰度、发布与回滚

- [ ] `BrainReleaseService` 持久化 release、resource version 和 scope。
- [ ] 支持按门店、角色、用户比例灰度。
- [ ] 发布前校验迁移、权限、技能、评测和依赖。
- [ ] 回滚恢复上一版本配置并记录审计日志。
- [ ] 发布失败不得影响当前稳定版本。

### P10-04 反馈闭环与指标看板

- [ ] 点踩与纠正自动进入待治理队列。
- [ ] 纠正可生成评测候选和记忆修正任务。
- [ ] 看板展示意图准确率、真实可用率、澄清率、失败率、采纳率、预警真阳性率、P95、成本和角色调用量。

### P10-05 多端复用

- [ ] Ami Aura Lite Kiosk 通过 `/api/brain/*` 复用同一 Brain 能力，不复制路由和技能逻辑。
- [ ] `packages/app` 接入 Brain Gateway 和会话协议。
- [ ] 多端共享会话数据时仍按用户、终端身份和门店权限隔离。
- [ ] 语音只作为输入适配层，转写后进入同一安全与认知链路。

## 10. 数据模型变更计划

以下变更涉及 Prisma migration，实施前必须再次核对当前 schema，并取得真实迁移授权：

| 模型/字段 | 用途 | 阶段 |
| --- | --- | --- |
| `BrainConversation.contextSnapshot/contextVersion` | 多轮上下文快照 | P6 |
| `BrainMemoryRevision` | 记忆纠正与版本追踪 | P6 |
| `BrainActionExecution` | 真实动作状态和业务回执 | P9 |
| `BrainInspectionRun` | 巡检批次与执行状态 | P9 |
| `BrainInspectionFinding` | 风险发现、处置和反馈 | P9 |
| `BrainResourceVersion` | 语义/角色/技能/巡检版本 | P10 |
| `BrainReleaseItem` | 发布包含的资源版本 | P10 |
| `BrainEvalResult` | 逐题评测结果 | P10 |

## 11. 测试与验收矩阵

### 11.1 自动化测试

- [ ] 前端组件与 API 合约测试。
- [ ] Playwright `/brain` 全流程测试。
- [ ] Brain 后端单元测试和集成测试。
- [ ] 多轮上下文与记忆测试。
- [ ] Supervisor DAG、并行、超时和降级测试。
- [ ] 操作幂等、事务和确认测试。
- [ ] 巡检去重、关闭和反馈测试。
- [ ] 发布灰度和回滚测试。
- [ ] 安全对抗集和跨门店隔离测试。
- [ ] 650 题及新增客服/多轮/操作评测。

### 11.2 核心命令

```powershell
npm.cmd --prefix packages/server-v2 run test -- brain --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run src/app/pages/brain src/api/real/brain.test.ts
npm.cmd run build
npm.cmd run check:api
node --loader ts-node/esm packages/server-v2/prisma/ami-brain-eval.ts --store-id=6 --output-dir=<阶段输出目录>
```

### 11.3 最终产品验收

- `/brain` 页面真实创建会话、发送、刷新恢复、动作确认和反馈全部可用。
- 单域问题走 adapter，复合问题走 Supervisor，执行路径可解释。
- 650 题真实可用率 >=65%，覆盖范围内答案正确率 >=95%。
- 多轮上下文正确率 >=90%，主动澄清率 >=90%。
- 假阳性、时间误退化全量、跨门店读取、roleHint 绕权、未确认写入均为 0。
- 常规问数 P95 首字延迟 <=3 秒，复合诊断 <=15 秒。
- 主动巡检六域均有真实数据来源，试点真阳性率 >=80%。
- 治理资源可配置、可评测、可灰度、可回滚。

## 12. 实施顺序与依赖

```text
P5 前端真实闭环
  -> P6 会话上下文与记忆
    -> P7 Supervisor + 客服 Adapter
      -> P8 全域数据深度
        -> P9 真实操作 + 巡检 + 预测
          -> P10 治理发布 + 多端 + 性能
```

硬依赖：

- P6 依赖 P5 的真实会话和消息时间线。
- P7 依赖 P6 提供稳定上下文，避免复合任务丢实体和时间条件。
- P9 真实执行依赖 P7 的任务计划、权限预检和 Trace。
- P10 发布门禁依赖 P8/P9 的真实评测与执行结果。

## 13. 提交与交付建议

建议每阶段独立提交，不把六个阶段压成一个大提交：

1. `feat(brain-ui): complete real conversation workspace`
2. `feat(brain-memory): wire context and long-term memory`
3. `feat(brain-orchestration): add supervisor and customer service adapter`
4. `feat(brain-domains): deepen governed domain queries`
5. `feat(brain-actions): add confirmed execution inspections and predictions`
6. `feat(brain-governance): add versioned evaluation release and rollback`

每阶段提交前必须输出：代码改动、接口状态、页面状态、真实数据状态、自动化测试、真实验证、未覆盖风险七项验收摘要。

## 14. 下一步详细执行任务

### 批次 A：P8 评测门禁收口

目标：先把“会回答但答非所问”的残余问题清零，再进入真实写操作。P8 未通过时不得启动生产写能力灰度。

#### A-01 店长假阳性清零

涉及文件：

- `packages/server-v2/src/brain/domain/adapters/brain-store-manager-domain.adapter.ts`
- `packages/server-v2/src/brain/domain/adapters/brain-front-desk-domain.adapter.ts`
- `packages/server-v2/src/brain/skills/brain-manager-skills.service.ts`
- `packages/server-v2/src/brain/eval/brain-answer-grader.service.ts`
- `packages/server-v2/src/brain/brain-manager-staff-skills.service.spec.ts`

任务：

- [ ] 对“爽约率”返回分母、分子和比例，不再用预约总数替代。
- [ ] 对“超时服务影响”查询服务任务计划时长、实际时长及关联收入；数据不足时返回明确缺口。
- [ ] 增加 2 条回归测试，确保相关回答不再被评为粒度不匹配。
- [ ] 重跑店长 100 题，要求 `>=65/100` 且假阳性 `0`。

#### A-02 前台从 53 提升到 55 以上

涉及文件：

- `packages/server-v2/src/brain/domain/adapters/brain-front-desk-domain.adapter.ts`
- `packages/server-v2/src/brain/skills/brain-reception-skills.service.ts`
- `packages/server-v2/src/brain/domain/brain-customer-fact-resolver.service.ts`
- `packages/server-v2/src/brain/cognition/brain-question-intent.service.ts`
- `packages/server-v2/src/brain/eval/brain-answer-grader.service.ts`
- `packages/server-v2/src/brain/brain-reception-operations-skills.service.spec.ts`
- `packages/server-v2/src/brain/brain-reception-catalog-skills.service.spec.ts`

任务：

- [ ] 将美容师排班、预约密度、面部/身体项目准备、到店率/爽约率识别为名单、排行或诊断意图。
- [ ] 对“临时到店能否安排”联合查询人员忙闲、床位/资源和项目时长，输出可安排时段或明确冲突。
- [ ] 对核销、收银、改期等请求只生成具体业务预览，不使用通用预约话术冒充执行。
- [ ] 增加至少 8 条前台粒度测试，覆盖名单、排行、诊断、建议和预览。
- [ ] 重跑前台 100 题，要求 `>=55/100` 且假阳性 `0`。

#### A-03 营销假阳性清零

涉及文件：

- `packages/server-v2/src/brain/domain/adapters/brain-marketing-domain.adapter.ts`
- `packages/server-v2/src/brain/skills/brain-marketing-skills.service.ts`
- `packages/server-v2/src/brain/eval/brain-answer-grader.service.ts`
- `packages/server-v2/src/brain/domain/brain-domain-adapters.service.spec.ts`

任务：

- [ ] 定位营销第 65 题的意图、回答形态与引用来源，修正错误路由或错误评分。
- [ ] 自动化规则请求必须生成可审计的规则预览，不能把模板文案标成自动化已完成。
- [ ] 重跑营销 100 题，要求 `>=72/100` 且假阳性 `0`。

#### A-04 库存与财务补足真实口径

涉及文件：

- `packages/server-v2/src/brain/skills/brain-inventory-skills.service.ts`
- `packages/server-v2/src/brain/domain/adapters/brain-inventory-domain.adapter.ts`
- `packages/server-v2/src/brain/skills/brain-finance-skills.service.ts`
- `packages/server-v2/src/brain/domain/adapters/brain-finance-domain.adapter.ts`
- `packages/server-v2/src/brain/brain-inventory-procurement-skills.service.spec.ts`
- `packages/server-v2/src/brain/brain-finance-cost-skills.service.spec.ts`

任务：

- [ ] 库存补齐安全库存、预计覆盖天数、供应商候选、MOQ、采购价、交期和最近采购记录。
- [ ] 财务补齐支付笔数/金额拆分、折扣明细、成本、提成、卡负债和日结异常。
- [ ] 对没有数据模型支撑的 BOM、仓库汇总和履约收入返回具体数据缺口，列入 P11 数据建模清单。
- [ ] 重跑库存和财务各 100 题，库存要求 `>=60/100`，财务要求 `>=68/100`，假阳性均为 `0`。

#### A-05 P8 完整回归

- [x] 重跑边界/多轮 50 题，结果 `35/50`。
- [x] 运行 Brain 全量测试与前后端构建。
- [x] 运行完整 650 题，不使用分角色报告拼接替代。
- [x] 验收总体真实可用率 `69.2%`、假阳性 `0`、安全门禁计数全部为 `0`。
- [x] 输出 `Ami-Brain-P7-P8协同与全域能力验收记录-2026-07-11.md`。

批次 A 验证命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- brain --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
node --loader ts-node/esm packages/server-v2/prisma/ami-brain-eval.ts --store-id=6 --output-dir=docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-eval-run-2026-07-11-p8-final
```

### 批次 B：P9 真实操作闭环

#### B-01 建立动作执行数据模型

涉及文件：

- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/prisma/migrations/<timestamp>_ami_brain_action_execution/migration.sql`
- `packages/server-v2/src/brain/skills/brain-action-confirmation.service.ts`
- `packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts`

任务：

- [ ] 新增 `BrainActionExecution`，字段至少包含 confirmationId、capabilityKey、storeId、userId、idempotencyKey、riskLevel、status、requestPayload、previewPayload、receiptPayload、errorCode、errorMessage、startedAt、completedAt。
- [ ] 对 `(storeId, capabilityKey, idempotencyKey)` 建唯一约束。
- [ ] 将确认记录与执行记录建立一对一或一对多审计关系。
- [ ] 迁移后核对真实表、索引和 Prisma Client，不以 migration 文件存在作为完成。

#### B-02 Capability Gateway 统一合同

- [ ] 定义 capability descriptor：DTO schema、权限、风险、幂等策略、事务边界、执行器和回执类型。
- [ ] 执行前重新加载 confirmation，校验未过期、未拒绝、门店一致、用户一致和对象状态未变化。
- [ ] 执行时调用现有 NestJS application service，禁止直接 `$executeRawUnsafe` 或绕过领域规则写表。
- [ ] 执行结果统一返回 `executing/succeeded/failed/expired/rejected`。
- [ ] 重复确认返回同一业务回执，不创建第二条业务记录。

#### B-03 首批五个真实动作

每个动作都按“预览 -> 确认 -> 执行 -> 回执 -> Trace”验收：

- [ ] 创建、改期、取消预约。
- [ ] 创建客户跟进任务。
- [ ] 创建采购单草稿并提交审批。
- [ ] 创建营销触达任务草稿。
- [ ] 保存服务记录。

明确不开放：直接退款、直接核销、直接结算提成、批量群发和删除业务数据。

#### B-04 操作安全测试

- [ ] 未确认执行、重复确认、过期确认、跨门店确认、roleHint 冒充全部返回拒绝。
- [ ] 事务中途失败时业务记录和执行状态保持一致。
- [ ] 每个真实动作至少包含成功、权限不足、状态冲突、重复确认和回滚 5 类测试。
- [ ] 新增 Playwright 动作闭环：页面预览 -> 确认 -> 状态轮询 -> 回执展示。

### 批次 C：P9 主动巡检与预测

#### C-01 巡检运行与发现模型

- [ ] 新增 `BrainInspectionRun` 和 `BrainInspectionFinding` 及迁移。
- [ ] Finding 包含规则版本、门店、对象、严重度、证据、建议、去重键、状态、处置和反馈。
- [ ] 同一风险在冷却期内更新原 Finding，风险解除后自动关闭。

#### C-02 六域首批巡检

- [ ] 高价值客户沉睡。
- [ ] 预约爽约异常。
- [ ] 毛利下降。
- [ ] 库存临期/缺货。
- [ ] 活动低 ROI。
- [ ] 员工产能空档。

每条规则必须明确事实表、时间窗口、阈值、去重键、严重度和建议动作；不得只返回规则名。

#### C-03 预测快照解释

- [ ] 查询 `CustomerPredictionSnapshot` 和生命周期预测资产。
- [ ] 输出模型版本、生成时间、置信度、主要特征和适用边界。
- [ ] 流失、复购、响应、客户价值预测只形成建议或动作预览。
- [ ] 预测快照过期或缺失时明确拒答，不用规则分数冒充模型结果。

### 批次 D：P10 治理、发布和回滚

#### D-01 治理资源版本化 CRUD

涉及文件：

- `packages/server-v2/prisma/schema.prisma`
- `packages/server-v2/src/brain/brain.controller.ts`
- `packages/server-v2/src/brain/governance/brain-eval.service.ts`
- `packages/server-v2/src/brain/governance/brain-release.service.ts`
- `src/app/pages/brain/BrainGovernanceCenter.tsx`

任务：

- [ ] 删除 controller 中 `draft_created/draft_updated` 回显占位，改为真实写入。
- [ ] 新增 `BrainResourceVersion`、`BrainReleaseItem`、`BrainEvalResult`。
- [ ] 语义、角色、技能、巡检资源支持 draft/active/disabled/archived。
- [ ] 发布资源不可原地覆盖；修改必须创建新版本。
- [ ] 发布前校验权限码、技能、依赖、迁移和评测结果。

#### D-02 异步评测与 Trace 中心

- [ ] 评测运行落库，保存逐题输入、回答、引用、grader、耗时、版本和失败原因。
- [ ] Trace 展示上下文、记忆、路由、DAG、技能、查询、权限、动作和成本。
- [ ] 确定性评分与 LLM Judge 分栏展示。
- [ ] 没有有效评测结果时 `canRelease` 必须为 false。

#### D-03 灰度与回滚

- [ ] 支持按门店、角色和用户比例选择 release。
- [ ] 灰度失败不覆盖稳定版本。
- [ ] 回滚恢复上一稳定资源集合，并写入操作者、原因和影响范围。
- [ ] 增加发布冲突、依赖缺失、评测不达标和回滚恢复测试。

### 批次 E：多端与性能验收

- [x] Ami Aura Lite Kiosk 默认改用 `/api/brain/*` 会话协议，历史引擎仅保留显式兼容模式。
- [x] `packages/app` 接入同一 Brain Gateway 和会话协议。
- [x] 验证管理端、Kiosk、App 的用户身份和 storeId 隔离；Kiosk 保留 operator 身份上下文。
- [x] 增加真实登录态 Playwright `/brain` 全流程和 390px 宽度检查。
- [x] 压测常规问数 SSE P95 首字延迟 `2.547 秒`；复合诊断专项测试具备超时降级。
- [x] 看板接入真实运行、动作、巡检、评测和 P95 数据；成本维度在无供应商成本记录时显示数据缺口。
- [x] 输出 P9-P10 最终验收记录和发布/回滚演练记录。

## 17. 最终执行结果（2026-07-12）

- 最终评测：`450/650 = 69.2%`，异常 0，假阳性 0；报告位于 `ami-brain-eval-run-2026-07-11-p10-final-650-rerun`。
- 性能：20 次真实 SSE 请求平均首字 1.715 秒，P95 2.547 秒，最大 2.553 秒；完整请求落库 P95 5.272 秒。
- 自动化：Brain 49 suites / 589 tests 通过；真实登录态 Playwright 3/3 通过。
- 发布演练：资源 v1 发布成功，v2 发布成功，随后回滚恢复 v1；releaseId `1 -> 2 -> 1`。
- 未覆盖清单：客户查询、采购建议、权益 ROI、员工复购排行、否定纠正和部分供应链协同进入 P11。

## 15. 阶段完成定义

任一阶段只有同时满足以下七项，才能标记为完成：

1. **代码：** 主路径已实现，不存在返回固定状态的占位实现。
2. **接口：** 请求、响应、错误、权限和幂等合同稳定。
3. **页面：** 用户能完成该阶段核心流程，状态和失败原因可见。
4. **数据：** 查询来自真实业务表，写入经过业务 Service；迁移已在目标数据库核验。
5. **测试：** 定向测试、Brain 全套、前后端构建和安全对抗集通过。
6. **评测：** 达到阶段数值门禁，且假阳性和安全违规为 0。
7. **交付：** 验收记录、未覆盖清单、回滚方式和下一阶段入口已落盘。

## 16. 计划自检结论

- PRD 六大能力均有对应阶段和验收门禁。
- 前端入口、上下文记忆、Supervisor、六域 Adapter、真实操作、巡检预测、治理发布和多端复用之间的依赖顺序已固定。
- P8 当前分角色结果与完整 650 题基线已区分，避免把局部评测误报为总体完成。
- P9/P10 已明确真实数据模型、核心文件、禁止动作和安全门禁。
- 文档不存在 TBD、TODO 或以“后续补充”替代实现责任的条目。
