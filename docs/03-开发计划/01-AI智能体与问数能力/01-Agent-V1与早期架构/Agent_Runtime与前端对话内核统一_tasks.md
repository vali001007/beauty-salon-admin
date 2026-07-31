# Agent Runtime 与前端对话内核统一详细开发计划 tasks

版本：v1.0
日期：2026-06-27
来源方案：`docs/03-开发计划/Agent_Runtime与前端对话内核统一最优方案.md`
目标：让 Ami Aura Lite 智能终端与管理端 `/ami-agent` 统一到同一套 Agent Runtime，并通过 `packages/agent-core` 共享前端对话内核。

---

## 任务状态说明

- `[ ]` 未开始
- `[~]` 开发中
- `[x]` 已完成
- `[!]` 阻塞或需决策

---

## 总体交付目标

- [x] Kiosk 智能问答不再默认依赖旧 `/ai/chat/messages`，经营问答统一进入 `/agent/runs`。
- [x] Kiosk 和 `/ami-agent` 共享同一套 Agent Runtime、Skills、Tool Registry、Evidence、Answer Contract、AgentRun 审计和 Feedback。
- [x] Kiosk 保留一线终端体验：语音、快捷操作、FlowCard、收银、核销、预约、库存卡片。
- [x] `/ami-agent` 调整为 Agent 治理后台：调试、审计、审批、Persona 配置、评测和质量大盘。
- [x] 两端前端统一使用 `packages/agent-core` 管理类型、Hooks、Persona、Block 工具和 API 封装。
- [x] 核心问答在 Kiosk 和管理端结果一致、可追踪、可审计。

---

## 阶段 0：运行链路审计与迁移边界

目标：先冻结现状，明确哪些终端命令走 Agent，哪些继续走 FlowCard，避免把强流程操作误切到问答链路。

### T0.1 工作区与风险预检

- [x] 执行 `git status --short --branch`，确认当前分支和未提交改动。
- [x] 标记本次会触碰的高风险文件：
  - `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
  - `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`
  - `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
  - `src/api/real/agent.ts`
  - `packages/server-v2/src/agent/*`
  - `packages/server-v2/src/terminal/*`
- [x] 如存在用户未提交改动，先只读核对，不覆盖。

验收：

- [x] 当前工作区风险已说明。
- [x] 明确本轮不会删除或回滚用户改动。

### T0.2 梳理 Kiosk 旧智能问答链路

- [x] 梳理 `AppContent.tsx` 中命令提交、流式回复、消息追加逻辑。
- [x] 梳理 `auraCoreService.ts` 中：
  - `getTerminalBusinessAnswer`
  - `getTerminalBusinessAnswerStream`
  - `buildTerminalBusinessContext`
  - `buildTerminalBusinessMessages`
- [x] 梳理 `runMicroApp.ts` 中 `manager.inventory`、`business.query`、`customer.growth` 等路径。
- [x] 梳理 intent parser 中自然语言到 action 的映射规则。
- [x] 输出旧链路调用表：
  - 用户输入
  - intent/action
  - loader
  - 是否调用 AI
  - 是否有业务明细
  - UI 渲染组件

验收：

- [x] 形成 Kiosk 旧链路表。
- [x] 找出仍走 `/ai/chat/messages` 的入口。
- [x] 找出只传 summary、不传明细的入口。

### T0.3 梳理管理端 AgentRun 链路

- [x] 梳理 `AmiAgentWorkspace.tsx` 中 `createAgentRun`、`appendAgentMessage` 调用。
- [x] 梳理 `src/api/real/agent.ts` 中 `/agent/runs` API。
- [x] 梳理 `AgentController` 的 run、message、approval、feedback、detail 端点。
- [x] 梳理 `AgentOrchestratorService` 中：
  - plan
  - tool execution
  - renderedBlocks
  - evidence
  - actions
  - feedback
- [x] 梳理已有 Skills：
  - `business.query.ask`
  - `inventory.risk.rank`
  - `inventory.expiring.clearance.draft`
  - `customer.priority.rank`
  - `marketing.activity.draft`
  - `staff.performance.rank`

验收：

- [x] 形成管理端 AgentRun 链路表。
- [x] 明确 Kiosk 可复用的 Agent 能力清单。

### T0.4 定义 FlowCard 与 Agent 分流矩阵

- [x] 建立强流程操作清单，继续走 FlowCard：
  - 收银
  - 核销
  - 预约确认
  - 客户建档
  - 打印
  - 扫码
  - 设备检查
  - 班次/交接班
- [x] 建立经营问答清单，切到 Agent Runtime：
  - 今日经营风险
  - 昨日消费客户清单
  - 客户流失和复购
  - 临期库存清单
  - 补货建议
  - 员工业绩
  - 营销机会
  - 财务异常
  - 卡项到期
- [x] 定义冲突处理规则：
  - 用户意图是“查询/分析/建议”时走 Agent。
  - 用户意图是“执行/创建/核销/收款/打印”时走 FlowCard 或 Agent Approval。
  - 高风险动作必须人工确认。

验收：

- [x] 输出分流矩阵。
- [x] 后续实现能按矩阵写测试。

---

## 阶段 1：Kiosk 接入统一 Agent Runtime

目标：终端经营问答进入 `/agent/runs`，不再与管理端智能体能力割裂。

### T1.1 新增 Kiosk Agent API 封装

建议文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`

任务：

- [x] 封装 `createTerminalAgentRun`。
- [x] 封装 `appendTerminalAgentMessage`。
- [x] 封装 `submitTerminalAgentFeedback`。
- [x] 统一传入：
  - `message`
  - `role`
  - `entrypoint: "terminal:kiosk"`
  - `operatorId`
  - `deviceId`
  - `context`
  - `personaCode`
- [x] 支持超时、错误归一化和 fallback 标记。

验收：

- [x] Kiosk 可调用 `/agent/runs`。
- [x] 请求带上 `entrypoint=terminal:kiosk`。
- [x] API 错误不会导致页面白屏。

### T1.2 终端角色到 Agent Persona 映射

建议文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentPersonaMapping.ts`

任务：

- [x] 定义角色类型：
  - `manager`
  - `reception`
  - `beautician`
- [x] 定义默认 Persona：
  - 店长 -> `manager`
  - 前台 -> `reception`
  - 美容师 -> `beautician`
- [x] 定义可切换 Persona：
  - 店长：`manager`、`marketing`、`reception`、`inventory`、`finance`
  - 前台：`reception`、`marketing`
  - 美容师：`beautician`
- [x] 增加无权限 Persona 的兜底逻辑。

验收：

- [x] 不同终端角色进入默认 Persona 正确。
- [x] 前台不能切到财务风控。
- [x] 美容师不能切到库存采购。

### T1.3 增加 Terminal Agent Adapter

建议文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`

任务：

- [x] 接收原始命令、当前角色、门店、操作员、设备状态。
- [x] 读取最近对话上下文。
- [x] 判断是否新建 run 或追加到 active run。
- [x] 将 Agent 返回结果转换为 Kiosk 消息模型。
- [x] 支持 renderedBlocks、answer、actions、evidence、followUpSuggestions。
- [x] 失败时返回结构化错误消息，并记录 fallback reason。

验收：

- [x] 终端经营问答可以产生 Agent 消息。
- [x] 多轮追问复用同一个 runId。
- [x] 返回结果能被 Kiosk 渲染。

### T1.4 改造 Kiosk 命令分流

修改文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`

任务：

- [x] 在 `handleCommand` 中引入分流矩阵。
- [x] FlowCard action 保持旧链路。
- [x] 经营问答 action 改走 `terminalAgentAdapter`。
- [x] 原 `appendAiHint` 不再作为经营问答主路径，只作为 fallback。
- [x] 保留旧链路 fallback，但必须在消息 meta 中标记。

验收：

- [x] 输入“昨天有哪些消费客户”走 `/agent/runs`。
- [x] 输入“核销”仍走核销 FlowCard。
- [x] 输入“收银”仍走收银 FlowCard。
- [x] Agent Runtime 失败时可降级旧链路并显示温和提示。

### T1.5 后端确认 AgentRun 支持终端来源

修改文件：

- `packages/server-v2/src/agent/dto/create-agent-run.dto.ts`
- `packages/server-v2/src/agent/agent.controller.ts`
- `packages/server-v2/src/agent/agent-orchestrator.service.ts`
- 如需要，更新 Prisma 字段或 JSON context 使用方式。

任务：

- [x] 确认 `entrypoint` 支持 `terminal:kiosk`。
- [x] 确认 `deviceId`、`userId`、`storeId` 记录完整。
- [x] 确认 `context` 能保存终端上下文。
- [x] 确认审计列表可按 entrypoint 筛选。

验收：

- [x] 管理端审计能看到终端发起的 AgentRun。
- [x] AgentRun detail 能看到终端上下文。

---

## 阶段 2：业务事实注入与 Answer Contract 补齐

目标：避免 AI 只拿 summary 回答，确保有明细、有来源、有结构。

### T2.1 定义终端事实上下文结构

建议文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalFactContext.ts`

任务：

- [x] 定义 `TerminalFactContext`：
  - `store`
  - `operator`
  - `recentEntities`
  - `inventory`
  - `customers`
  - `orders`
  - `appointments`
  - `cards`
  - `device`
- [x] 每类事实必须有：
  - `source`
  - `updatedAt`
  - `items`
  - `limitations`
- [x] 控制上下文大小，默认每类最多 20 条。

验收：

- [x] 事实上下文可序列化。
- [x] 不包含敏感字段或超大对象。

### T2.2 临期库存事实补齐

修改文件：

- `packages/server-v2/src/terminal/terminal.service.ts`
- `src/types/terminal.ts` 或相关类型文件
- `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`

任务：

- [x] 后端 `getInventoryAlerts` 的 `expiring` 增加：
  - `expiryDate`
  - `unit`
  - `retailPrice`
  - `costPrice`
  - `supplier`
  - `categoryName`
  - `riskLevel`
  - `suggestedAction`
- [x] Kiosk `CoreSnapshot.expiringProducts` 保留完整明细。
- [x] `buildTerminalBusinessContext` 注入 `expiringProducts`。
- [x] 旧 fallback 文案支持临期库存清单。

验收：

- [x] 问“近期有哪些临期库存产品”能通过 Agent Tool 输出临期商品、最近到期日、剩余天数、库存。
- [x] 有临期数据时不再被低库存排行抢答，也不再回答“当前数据未提供临期库存信息”。
- [x] 无临期数据时明确说明未来 90 天暂无仍有库存的临期批次，并保留数据来源。

### T2.3 昨日消费客户事实补齐

修改文件：

- `packages/server-v2/src/agent/agent-tool-registry.service.ts`
- `packages/server-v2/src/business-query/*`
- 必要时补充 `packages/server-v2/src/terminal/terminal.service.ts`

任务：

- [x] 确认订单消费客户清单能力使用 `ProductOrder` + `OrderItem` + `Customer`。
- [x] 输出字段包括：
  - 客户姓名
  - 手机脱敏
  - 会员等级
  - 消费金额
  - 消费项目/商品
  - 最近服务记录
  - 复购建议
- [x] 增加“昨天/昨日”时间范围解析测试。
- [x] 区分“客户消费清单”和“客户流失建议”。

验收：

- [x] 问“昨天有哪些消费的客户，列出清单”不再答成客户流失建议。
- [x] 输出真实消费客户列表。
- [x] 回答带数据来源和统计周期。

### T2.4 Answer Contract 统一

修改文件：

- `packages/server-v2/src/agent/agent.types.ts`
- `src/types/agent.ts`
- 后续迁入 `packages/agent-core/types/result.ts`

任务：

- [x] 明确 Agent 返回字段：
  - `answer`
  - `status`
  - `responseMode`
  - `renderedBlocks`
  - `actions`
  - `evidence`
  - `followUpSuggestions`
  - `confidence`
  - `limitations`
- [x] 对 no_data、unsupported、failed 统一前端展示。
- [x] 对高风险 actions 挂审批信息。

验收：

- [x] Kiosk 和管理端能消费同一响应结构。
- [x] no_data 不显示成普通失败。
- [x] failed 有明确错误提示和 fallback。

---

## 阶段 3：建设 packages/agent-core 共享包

目标：把两端重复的类型、Hooks、Persona、Block 工具和 API 封装集中到 monorepo 共享包。

### T3.1 初始化共享包结构

新增目录：

- `packages/agent-core/`

任务：

- [x] 新增 `package.json`。
- [x] 新增 `tsconfig.json`。
- [x] 新增 `index.ts`。
- [x] 新增目录：
  - `types/`
  - `logic/`
  - `api/`
- [x] 新增目录：
  - `hooks/`

验收：

- [x] `@ami/agent-core` 包可被 IDE 解析。
- [x] 不发布 npm，只在 monorepo 内引用。

### T3.2 配置 alias 与 TypeScript paths

修改文件：

- `vite.config.ts`
- `tsconfig.json`
- `packages/Ami-Aura-Lite-Kiosk/vite.config.ts`
- `packages/Ami-Aura-Lite-Kiosk/tsconfig.json`
- 测试配置，如 `vitest.config.ts`

任务：

- [x] 添加 `@ami/agent-core` alias。
- [x] 添加 TypeScript paths。
- [x] 确保测试环境也能解析。

验收：

- [x] 管理端 import `@ami/agent-core` 不报错。
- [x] Kiosk import `@ami/agent-core` 不报错。

### T3.3 迁移共享类型

新增文件：

- `packages/agent-core/types/blocks.ts`
- `packages/agent-core/types/conversation.ts`
- `packages/agent-core/types/persona.ts`
- `packages/agent-core/types/result.ts`

任务：

- [x] 迁移 `AuraResponseBlock`。
- [x] 迁移 `AuraBlockAction`。
- [x] 定义 `AgentConversationMessage`。
- [x] 定义 `ConversationContext`。
- [x] 定义 `AgentPersonaCode`、`AgentRole`、`AgentPersonaSummary`。
- [x] 定义 `AgentRunResultV2`。
- [x] 管理端 `src/types/agent.ts` 改为 re-export。
- [x] Kiosk `types.ts` 改为 re-export。

验收：

- [x] 两端不再重复定义 `AuraResponseBlock`。
- [x] 类型编译通过。

### T3.4 迁移共享逻辑

新增文件：

- `packages/agent-core/logic/conversationContext.ts`
- `packages/agent-core/logic/personaAccess.ts`
- `packages/agent-core/logic/blockUtils.ts`

任务：

- [x] 迁移对话上下文创建、更新、重置逻辑。
- [x] 迁移指代消解与 active entities 逻辑。
- [x] 实现 Persona 权限过滤。
- [x] 实现 block 排序和 KPI 分组。

验收：

- [x] Kiosk 原本的 `conversationContext.ts` 可改为 re-export。
- [x] 管理端和 Kiosk 使用同一套 block 工具。

### T3.5 封装 Agent API 工厂

新增文件：

- `packages/agent-core/api/agentApi.ts`

任务：

- [x] 实现 `createAgentApi(httpClient)`。
- [x] 支持：
  - `createRun`
  - `appendMessage`
  - `getPersonas`
  - `getPersonaByCode`
  - `submitFeedback`
  - `getRunDetail`
- [x] 不直接依赖管理端 `apiClient`。
- [x] Kiosk 和管理端分别传入自己的 client。

验收：

- [x] 两端能通过同一 API 工厂调用 `/agent/runs`。

### T3.6 封装 useAgentConversation

新增文件：

- `packages/agent-core/hooks/useAgentConversation.ts`

任务：

- [x] 管理消息列表。
- [x] 管理 loading/error。
- [x] 管理 activeRunId。
- [x] 支持新建 run。
- [x] 支持 append message。
- [x] 支持 reset。
- [x] 支持 feedback。
- [x] 支持 follow-up suggestion 点击后继续发送。

验收：

- [x] 管理端调试对话可使用该 hook。
- [x] Kiosk Agent 对话可使用该 hook 或其轻量 adapter。

### T3.7 封装 usePersona

新增文件：

- `packages/agent-core/hooks/usePersona.ts`

任务：

- [x] 拉取 Persona 列表。
- [x] 按当前角色过滤可用 Persona。
- [x] 支持切换 Persona。
- [x] 支持默认 Persona。
- [x] 支持接口失败时 fallback 到内置 Persona。

验收：

- [x] Kiosk 可按角色展示 Persona。
- [x] 管理端可选择任意 Persona 调试。

---

## 阶段 4：Kiosk 智能终端体验升级

目标：Kiosk 成为门店一线智能体主入口，保留现场操作效率。

### T4.1 拆分 Agent 消息与 FlowCard 消息

修改文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`

任务：

- [x] 新增 Agent conversation state。
- [x] 保留原 FlowCard messages state。
- [x] 渲染时分区：
  - Agent 对话流
  - FlowCard 操作区
- [x] 防止 Agent loading 与 FlowCard loading 混用。

验收：

- [x] 经营问答不会挤占核销/收银流程。
- [x] FlowCard 操作不会丢失 Agent 对话上下文。

### T4.2 新增 PersonaSwitcher

新增文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/components/PersonaSwitcher.tsx`

任务：

- [x] 展示当前角色可用 Persona。
- [x] 支持横向 chip 切换。
- [x] 切换后更新推荐问题。
- [x] 切换后新问题进入对应 Persona。

验收：

- [x] 店长可看到多个 Persona。
- [x] 前台只看到前台/营销。
- [x] 美容师只看到美容师服务。

### T4.3 新增 AgentFeedback

新增文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentFeedback.tsx`

任务：

- [x] 增加“有用/无用”按钮。
- [x] 提交到 Agent feedback API。
- [x] 防重复提交。
- [x] 提交失败不阻塞用户继续操作。

验收：

- [x] 管理端质量大盘后续可汇总终端反馈。

### T4.4 新增 AgentMessageItem

新增文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.tsx`

任务：

- [x] 渲染用户消息。
- [x] 渲染 Agent 文本。
- [x] 渲染 renderedBlocks。
- [x] 渲染 evidence 摘要。
- [x] 渲染 actions。
- [x] 渲染 follow-up chips。
- [x] 集成 feedback。
- [x] 去重展示：已有文本 block 时不再重复渲染 `answer`，已有 evidence_panel 时不再重复渲染顶层 evidence，已展示 action 时不再作为 follow-up 重复出现。

验收：

- [x] Kiosk Agent 回复支持富展示。
- [x] 纯文本、表格、卡片都能正常显示。
- [x] 临期库存真实页面复验中，答案、数据来源和动作按钮不重复。

### T4.5 升级 Kiosk BlockRenderer

修改或新增文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/OpportunityCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/ActivityDraftCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/InventoryItemCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/SupplierPurchaseCard.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/CopyVariantsBlock.tsx`

任务：

- [x] 支持 `summary_text`。
- [x] 支持 `kpi_card`。
- [x] 支持 `table`。
- [x] 支持 `chart`。
- [x] 支持 `customer_card`。
- [x] 支持 `inventory_item_card`。
- [x] 支持 `opportunity_card`。
- [x] 支持 `activity_draft_card`。
- [x] 支持 `confirm_action`。
- [x] 支持 `action_card`。
- [x] 支持 `evidence`。
- [x] 支持 `follow_up_chips`。
- [x] 支持 `copy_variants`。
- [x] 支持 `supplier_purchase_card`。

验收：

- [x] Agent 返回 12 类核心 block 均可渲染。
- [x] 小屏不溢出。
- [x] 操作按钮状态清晰。

### T4.6 动态推荐问题

修改文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/components/SmartCommandBar.tsx`
- 或当前快捷操作所在组件。

任务：

- [x] 快捷问题来自当前 Persona。
- [x] 支持 Agent 返回 follow-up suggestions。
- [x] 点击 follow-up 直接继续对话。
- [x] 最多展示 3 个高价值追问。

验收：

- [x] 店长 Persona 展示经营/客户/库存问题。
- [x] 营销 Persona 展示召回/活动/转化问题。
- [x] 美容师 Persona 展示服务/护理/复购问题。

---

## 阶段 5：管理端 /ami-agent 治理化

目标：把 `/ami-agent` 从主对话入口升级为智能体管理后台。

### T5.1 改造 AmiAgentWorkspace 为 Tab 布局

修改文件：

- `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`

任务：

- [x] 新增 Tab：
  - 对话调试
  - 运行审计
  - 审批管理
  - Persona 配置
  - 评测集
  - 质量大盘
- [x] 保留轻量对话调试能力。
- [x] 不影响现有路由 `/ami-agent`。

验收：

- [x] `/ami-agent` 打开后进入治理工作台。
- [x] 对话调试仍可发起 AgentRun。

### T5.2 运行审计 Tab

任务：

- [x] 复用 `getAgentRunsPaginated`。
- [x] 支持按 status、role、personaCode、entrypoint、keyword 筛选。
- [x] 支持查看 detail：
  - messages
  - steps
  - toolCalls
  - approvals
  - evidence
- [x] 重点支持 `entrypoint=terminal:kiosk`。

验收：

- [x] 能查到 Kiosk 产生的 AgentRun。
- [x] 能定位某次回答使用了哪些工具和数据。

### T5.3 审批管理 Tab

任务：

- [x] 展示待审批动作。
- [x] 支持批准。
- [x] 支持拒绝并填写原因。
- [x] 展示风险等级和影响对象。

验收：

- [x] 高风险动作不会绕过审批。
- [x] 终端触发的审批能在管理端处理。

### T5.4 Persona 配置 Tab

任务：

- [x] 展示 6 类 Persona：
  - 店长经营
  - 营销增长
  - 前台接待
  - 美容师服务
  - 库存采购
  - 财务风控
- [x] 展示每个 Persona 的：
  - 可用角色
  - 工具分组
  - 推荐问题
  - 能力说明
- [x] 支持推荐问题编辑。
- [x] 支持工具组开关。
- [x] 后端 `AgentPersonaService` 接入 `agent_personas` 表，支持内置配置兜底与运行时覆盖。
- [x] Kiosk `AppContent` 增加 Persona 配置运行态刷新，每 60 秒重新读取 `getAgentPersonas()`，刷新后 `SmartCommandBar` 使用当前 `activeTerminalPersona.suggestedQuestions`。

验收：

- [x] Kiosk 快捷问题可从后端 Persona 配置动态读取。
- [x] 修改管理端 Persona 推荐问题后，Kiosk 运行态可同步看到新问题。

### T5.5 质量大盘 Tab

任务：

- [x] 汇总 AgentFeedback：
  - 有用率
  - 无用率
  - Persona 维度
  - [x] entrypoint 维度
- [x] 汇总失败问题：
  - failed
  - no_data
  - unsupported
  - low confidence
- [x] 展示能力缺口候选。

验收：

- [x] 能看到终端负反馈。
- [x] 能沉淀后续 Skills 开发候选。

---

## 阶段 6：测试、评测与灰度

目标：保证统一改造不会破坏终端现场操作。

### T6.1 单元测试补齐

任务：

- [x] Kiosk 分流矩阵测试。
- [x] Terminal Agent Adapter 测试。
- [x] Persona 权限测试。
- [x] 临期库存事实注入测试。
- [x] 昨日消费客户问答测试。
- [x] Agent API 工厂测试。
- [x] `useAgentConversation` hook 测试。
- [x] `usePersona` hook 测试。

建议命令：

```powershell
npm.cmd run test
npm.cmd --prefix packages/server-v2 run test -- --runInBand
```

验收：

- [x] 新增逻辑有定向测试覆盖。

### T6.2 Agent Eval 用例补齐

修改文件：

- `packages/server-v2/src/agent/agent-eval.cases.ts`

任务：

- [x] 增加昨日消费客户清单用例。
- [x] 增加临期库存清单用例。
- [x] 增加临期库存处理草稿用例。
- [x] 增加库存补货建议用例。
- [x] 增加客户复购承接用例。
- [x] 增加 FlowCard 不应进入 Agent 的负例。
- [x] 增加 T6.5 终端验收问题基线：昨日消费客户、临期库存、临期处理草稿、今日经营风险、优先回访、补货商品、员工业绩排行。

验收：

- [x] `agent:eval` 通过。
- [x] 核心问答命中预期工具。

### T6.3 灰度开关

任务：

- [x] 增加前端开关：
  - `VITE_KIOSK_AGENT_RUNTIME_ENABLED`
- [x] 增加后端开关：
  - `AGENT_TERMINAL_RUNTIME_ENABLED`
- [x] 开关关闭时回到旧链路。
- [x] 开关开启时经营问答进入 AgentRun。

验收：

- [x] 可一键回退旧链路。
- [x] 灰度期间能对比新旧回答质量。

### T6.4 构建与类型验证

建议命令：

```powershell
npm.cmd run build
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

验收：

- [x] 管理端 build 通过。
- [x] server-v2 build 通过。
- [x] Kiosk build 通过。

### T6.5 手动验收脚本

Kiosk 验收问题：

- [x] “昨天有哪些消费的客户，列出清单”（Agent Eval + Kiosk 分流基线）
- [x] “近期有哪些临期库存产品”（Agent Eval + Kiosk 分流基线）
- [x] “临期库存怎么处理，生成草稿建议”（Agent Eval + Kiosk 分流基线）
- [x] “今天经营有什么风险”（Agent Eval + Kiosk 分流基线）
- [x] “哪些客户最值得优先回访”（Agent Eval + Kiosk 分流基线）
- [x] “哪些商品需要补货”（Agent Eval + Kiosk 分流基线）
- [x] “本月员工业绩排行”（Agent Eval + Kiosk 分流基线）
- [x] “核销”（FlowCard quick action 负例）
- [x] “收银”（FlowCard quick action 负例）

预期：

- [x] 经营问答进入 AgentRun。
- [x] FlowCard 操作保持旧体验。
- [x] 管理端审计可查到问答记录。
- [x] 回答有数据来源。
- [x] 有 1 到 3 个 follow-up。
- [x] 高风险动作需要审批。

---

## 文件变更清单

### 新增文件

- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentPersonaMapping.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalFactContext.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/PersonaSwitcher.tsx`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentFeedback.tsx`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.tsx`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/OpportunityCard.tsx`（已由 `BlockRenderer` 的 `kpi_card` / `customer_card` / `action_card` 通用渲染承接，避免新增未复用卡片文件）
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/ActivityDraftCard.tsx`（已由 `confirm_action` / `action_card` 通用渲染承接）
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/InventoryItemCard.tsx`（已由 `table` / `alert` / `action_card` 通用渲染承接）
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/SupplierPurchaseCard.tsx`（已由 `confirm_action` / `table` 通用渲染承接）
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/CopyVariantsBlock.tsx`（已由结构化 block 与 follow-up/action 渲染承接）
- [x] `packages/agent-core/package.json`
- [x] `packages/agent-core/tsconfig.json`
- [x] `packages/agent-core/index.ts`
- [x] `packages/agent-core/types/blocks.ts`
- [x] `packages/agent-core/types/conversation.ts`
- [x] `packages/agent-core/types/persona.ts`
- [x] `packages/agent-core/types/result.ts`
- [x] `packages/agent-core/logic/conversationContext.ts`
- [x] `packages/agent-core/logic/personaAccess.ts`
- [x] `packages/agent-core/logic/blockUtils.ts`
- [x] `packages/agent-core/api/agentApi.ts`
- [x] `packages/agent-core/hooks/useAgentConversation.ts`
- [x] `packages/agent-core/hooks/usePersona.ts`
- [x] `packages/agent-core/hooks/useAgentConversation.test.tsx`
- [x] `packages/agent-core/hooks/usePersona.test.tsx`

### 修改文件

- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.tsx`
- [x] `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/vite.config.ts`
- [x] `packages/Ami-Aura-Lite-Kiosk/tsconfig.json`
- [x] `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
- [x] `src/api/real/agent.ts`
- [x] `src/types/agent.ts`
- [x] `vite.config.ts`
- [x] `tsconfig.json`
- [x] `vitest.config.ts`
- [x] `packages/server-v2/src/agent/dto/create-agent-run.dto.ts`
- [x] `packages/server-v2/src/agent/agent.controller.ts`
- [x] `packages/server-v2/src/agent/agent-orchestrator.service.ts`
- [x] `packages/server-v2/src/terminal/terminal.service.ts`
- [x] `packages/server-v2/src/agent/agent-eval.cases.ts`

---

## 里程碑

### M1：终端经营问答进入 AgentRun

- [x] 完成 T1.1 到 T1.5。
- [x] 终端问经营问题可在管理端审计看到 AgentRun。

### M2：关键业务问答准确

- [x] 完成 T2.1 到 T2.4。
- [x] 昨日消费客户、临期库存、补货建议不再答非所问。

### M3：两端共享 agent-core

- [x] 完成 T3.1 到 T3.7。
- [x] Kiosk 和管理端共享类型、Hooks、Persona 和 API 封装。

### M4：Kiosk 体验完成

- [x] 完成 T4.1 到 T4.6。
- [x] 终端支持 Persona、结构化卡片、反馈和追问。

### M5：管理端治理后台完成

- [x] 完成 T5.1 到 T5.5。
- [x] 管理端可调试、审计、审批、配置和看质量。

### M6：灰度上线准备

- [x] 完成 T6.1 到 T6.5。
- [x] 测试、Eval、构建和手动验收通过。

---

## 开发顺序建议

1. 先做阶段 0，不直接动大文件。
2. 先让 Kiosk 经营问答进入 `/agent/runs`，不要先抽 `packages/agent-core`。
3. 先修“临期库存”和“昨日消费客户”两个真实失败场景。
4. 再抽共享前端内核，降低重复建设。
5. 最后治理化 `/ami-agent`，避免管理端和终端定位冲突。

---

## 暂不做事项

- [x] 不重写 Kiosk 全部 UI。
- [x] 不移除 FlowCard。
- [x] 不让 AI 直接执行高风险动作。
- [x] 不让终端绕过审批创建营销活动、采购单或批量触达。
- [x] 不删除旧 `/ai/chat/messages`，先作为 fallback 保留。
- [x] 不在第一阶段做完整记忆系统重构。

---

## 本轮开发记录

### 2026-06-27 阶段 1/2 首批落地

已完成：

- [x] 新增 `agentPersonaMapping.ts`，定义终端角色到 Persona 的默认映射和访问控制。
- [x] 新增 `agentRuntimeService.ts`，封装 `createTerminalAgentRun`、`appendTerminalAgentMessage`、`submitTerminalAgentFeedback`。
- [x] 新增 `terminalAgentAdapter.ts`，提供经营问答是否走 Agent Runtime 的分流判断。
- [x] `runMicroAppIntent` 增加分流：text/voice 的经营问答走 AgentRun，quick action 的库存/经营卡片保留旧卡片流。
- [x] `runBusinessAgent` 的入口从 `aura_lite` 调整为 `terminal:kiosk`，并把终端 action/source/command 写入 `context.terminal`。
- [x] `AppContent` 不再只给 `business.query` 传上一轮上下文，所有命令都可传入最近 Agent/BusinessQuery 上下文。
- [x] `getInventoryAlerts` 的临期批次返回字段补充 `expiryDate`、`unit`、`retailPrice`、`costPrice`、`supplier`、`categoryName`、`riskLevel`、`suggestedAction`。
- [x] `buildTerminalBusinessContext` 注入 `expiringProducts`，旧 AI fallback 也能基于临期批次输出清单。
- [x] 新增 Kiosk 分流测试：文字库存问题走 AgentRun，库存快捷按钮仍走库存卡片。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd --prefix packages/server-v2 test -- terminal.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

待继续：

- [x] 让终端多轮追问复用 activeRunId，而不是每次新建 run。
- [x] 增加 Agent Runtime 失败后的显式 fallback meta。
- [x] 补充管理端 AgentRun 审计筛选 `entrypoint=terminal:kiosk` 的手动或自动验证。
- [x] 针对“昨天有哪些消费客户”补端到端 Eval 和 Kiosk 分流验证。
- [x] 开始阶段 3：抽 `packages/agent-core`。

### 2026-06-27 阶段 3 首批落地：agent-core 共享包

已完成：

- [x] 新增 `packages/agent-core`，沉淀共享类型、Persona 权限、Block 工具和 Agent API 工厂。
- [x] 根管理端和 Kiosk 均配置 `@ami/agent-core` 的 Vite alias 与 TypeScript paths。
- [x] `agentPersonaMapping.ts` 改为复用 `@ami/agent-core` 的 Persona 权限与默认 Persona 逻辑。
- [x] `src/api/real/agent.ts` 的 create/append/persona/detail/feedback 基础调用改为复用 `createAgentApi(httpClient)`。
- [x] 对齐共享包与现有前端契约，收窄 `personaCode`、`status`、`AgentPlan`、`AgentToolResult`、`AgentEvidence` 等类型。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd vitest run src/test/api.test.ts
npm.cmd run build
```

待继续：

- [x] 把 `src/types/agent.ts` 和 Kiosk 侧重复类型逐步改为 re-export 或显式复用 `@ami/agent-core`。
- [x] 新增 `useAgentConversation`、`usePersona`，并迁移 `/ami-agent` 调试对话状态。
- [x] 管理端调试对话收敛到 `@ami/agent-core/useAgentConversation`；Kiosk 保留 `useKioskAgentConversation` 终端壳，复用 agent-core 上下文提取，避免 FlowCard 与 AgentRun 消息状态串线。

### 2026-06-27 阶段 3 追加：共享 hooks 与管理端调试对话迁移

已完成：

- [x] 新增 `useAgentConversation`，统一管理消息列表、loading/error、activeRunId、新建 run、追加消息、reset、feedback。
- [x] 新增 `usePersona`，支持 Persona 拉取、角色过滤、默认 Persona、切换 Persona 和接口失败内置兜底。
- [x] 新增 `BUILTIN_AGENT_PERSONAS`，避免 Persona 接口失败时管理端和终端没有可用入口。
- [x] `/ami-agent` 调试对话改为使用 `useAgentConversation`，Persona 列表改为使用 `usePersona`。
- [x] 管理端 follow-up suggestion 点击后直接继续发送，不再只是填入输入框。
- [x] `vitest.config.ts` 纳入 `packages/agent-core` 测试，并配置 `@ami/agent-core` alias。
- [x] Kiosk `tsconfig.json` 排除共享包测试文件，避免生产 typecheck 编译测试代码。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
npx.cmd vitest run src/test/api.test.ts
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 将 Kiosk Agent 对话状态从轻量 adapter 继续迁移到 `useAgentConversation` 或封装 Kiosk 专用 hook。
- [x] 把 `src/types/agent.ts` 和 Kiosk 侧重复类型逐步改为 re-export 或显式复用 `@ami/agent-core`。

### 2026-06-27 阶段 4 首批落地：Kiosk Agent 富消息与 Persona 控件

已完成：

- [x] 新增 `AgentMessageItem`，让 Kiosk 的 `agentRun` 消息支持文本、结构化 block、evidence 摘要、actions、approval、follow-up chips 和 feedback。
- [x] 新增 `AgentFeedback`，终端可提交有用/无用反馈到 Agent feedback API，且防重复提交。
- [x] 新增 `PersonaSwitcher`，按终端角色展示可用 Persona：店长多 Persona、前台前台/营销、美容师仅美容师。
- [x] `AppContent` 的 `agentRun` 分支切到 `AgentMessageItem`，保留 FlowCard 和原 dashboard 卡片分支。
- [x] 终端问答会把当前 Persona 写入 `agentContext.terminal.personaCode`，进入 AgentRun 上下文。
- [x] `BlockRenderer` 切到共享 `@ami/agent-core` block 类型，并补齐 `opportunity_card`、`copy_variants`、`activity_draft_card`、`inventory_item_card`、`supplier_purchase_card`、`action_card` 等渲染。
- [x] `BlockRenderer` 改为在 `AgentMessageItem` 内懒加载，避免 Recharts 进入 Kiosk 首屏主包；构建后主包约 865KB，结构化 block 独立 chunk 约 438KB。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npx.cmd vitest run packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
```

待继续：

- [x] 让 Persona 切换直接影响 Kiosk Agent create/append 的一等字段，而不只是上下文字段。
- [x] 让 Persona 切换后同步更新 Kiosk 推荐问题。
- [x] 用 Playwright 或运行态截图验证 Kiosk 小屏富消息不溢出。
- [x] 继续把 Kiosk Agent 对话状态迁移到共享 hook 或封装 Kiosk 专用 hook。

### 2026-06-27 阶段 1/4 追加：PersonaCode 一等字段闭环

已完成：

- [x] `CreateAgentRunDto` 和 `AppendAgentMessageDto` 增加 `personaCode`，append 同步支持 `entrypoint`。
- [x] `AgentController` 将 `personaCode` 传入 `AgentActor`，并保留终端 append 的 `entrypoint=terminal:kiosk`。
- [x] `AgentWorkflowRuntimeService.createRun` 写入 `agent_runs.personaCode`，并可从 `context.terminal.personaCode` 兜底解析。
- [x] `AgentOrchestratorService.appendMessage` 在追问时可更新当前 AgentRun 的 `personaCode`，用户消息 metadata 也记录 `entrypoint/personaCode`。
- [x] `AgentRunResult` 返回 `personaCode`，前端可用于消息展示、审计和质量归因。
- [x] `packages/agent-core` 的 create/append 请求类型和 `useAgentConversation` 已支持 `personaCode`。
- [x] `/ami-agent` 调试对话和 Kiosk `runBusinessAgent/appendBusinessAgentMessage` 均会把当前 Persona 作为 create/append 一等字段传入。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent.controller.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] Persona 切换后同步刷新终端推荐问题。
- [x] 管理端审计列表 UI 增加 `personaCode` 筛选和展示。
- [x] 用运行态 AgentRun 记录复验终端问答的 `personaCode` 持久化结果。

### 2026-06-27 阶段 2 追加：临期库存真实 Agent 问答闭环

已完成：

- [x] `inventory.risk.rank` 增加临期问法模式：当问题包含“临期/效期/过期/快到期/批次”时，只返回 90 天内仍有库存的临期批次对应商品。
- [x] 临期问法下工具标题改为“临期库存清单”，按最近到期日和临期库存量排序。
- [x] 临期清单输出 `mode=expiring_inventory`、`expiringStock`、`daysToExpiry`、`nearestExpiryDate`，Evidence 说明临期库存口径。
- [x] `AgentOrchestratorService` 的 `inventory_item_card` 已支持“临期库存清单”，卡片展示临期库存、最近到期日和风险分。
- [x] `agent-eval.cases.ts` 增加“近期有哪些临期库存产品”核心用例，并扩展 P0 库存预警同义问法。
- [x] `agent-tool-registry.service.spec.ts` 增加工具级验证：低库存与临期同时存在时，临期问法优先返回临期商品。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-tool-registry.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 test -- agent-planner.service.spec.ts agent-eval.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent:eval
npm.cmd --prefix packages/server-v2 run build
```

待继续：

- [x] 用真实 Kiosk 登录态复验“近期有哪些临期库存产品”，默认 `8080 + 5179` 返回 `runId=153`。
- [x] 如真实数据为空，补测试数据或明确展示“未来 90 天暂无临期批次”的空态口径。

### 2026-06-27 阶段 4 追加：Persona 推荐问题驱动 Kiosk 快捷入口

已完成：

- [x] `SmartCommandBar` 增加 `suggestedQuestions` 入参。
- [x] 当前 Persona 有推荐问题时，底部快捷入口优先展示 Persona 推荐问题；无推荐问题时回退角色默认 quick actions。
- [x] 点击 Persona 推荐问题按 `text` 来源发送，进入 Agent 语义链路，不走旧 quick action 强流程。
- [x] 推荐问题按钮支持两行换行，降低长中文问题在终端底栏溢出的风险。
- [x] Persona 推荐问题最多展示 3 个，避免底部入口过载。
- [x] `AppContent` 根据 `activePersonaCode` 找到当前 Persona，并把 `suggestedQuestions` 传入 `SmartCommandBar`。
- [x] 增加组件测试覆盖推荐问题替换默认快捷入口和文本命令发送。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/SmartCommandBar.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 支持 Agent 返回的 follow-up suggestions 在终端消息尾部承接。
- [x] 区分“固定快捷入口”和“回答后追问”的展示位置。

### 2026-06-27 阶段 1 追加：多轮追问与 fallback

已完成：

- [x] 新增 `appendBusinessAgentMessage`，通过 `/agent/runs/:id/messages` 追加终端多轮追问。
- [x] `terminalAgentAdapter` 会从上一轮 `previousRun.runId` 中识别可复用的 AgentRun。
- [x] Agent Runtime 不可用时返回 `source=agent-runtime` 的结构化错误，并触发旧 `Ami 智能问答` 流式 fallback。
- [x] 增加测试覆盖：
  - 有上一轮 AgentRun 时调用 append 而不是 create。
  - Agent Runtime 失败时返回 fallback stream。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 补充管理端 AgentRun 审计筛选 `entrypoint=terminal:kiosk` 的自动化或手动运行态验证。
- [x] 针对“昨天有哪些消费客户”补端到端 Eval 和 Kiosk 分流验证。
- [x] 开始阶段 3：抽 `packages/agent-core`。

### 2026-06-27 阶段 1 追加：后端 entrypoint 审计验证

已完成：

- [x] `AgentController.createRun` 保留 `entrypoint=terminal:kiosk` 并传入 `AgentOrchestratorService`。
- [x] 终端上下文 `context.terminal` 可透传到 AgentRun 创建参数。
- [x] `AgentWorkflowRuntimeService.findRuns` 已支持按 `entrypoint` 筛选审计列表。
- [x] 增加 controller 测试覆盖 Kiosk AgentRun 创建透传。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent.controller.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

待继续：

- [x] 针对“昨天有哪些消费客户”补端到端 Eval 和 Kiosk 分流验证。
- [x] 开始阶段 3：抽 `packages/agent-core`。

### 2026-06-27 阶段 2 验证：昨日消费客户清单

已完成：

- [x] 确认消费客户清单走 `order_customer_consumption_list` 能力，不再被客户流失/增长意图抢走。
- [x] 确认后端已有 BusinessQuery、Semantic Query、Agent Orchestrator、Planner 覆盖。
- [x] 新增 Kiosk 分流测试，确保“昨天有哪些消费的客户，列出清单”从终端入口进入 AgentRun。
- [x] 运行现有 Agent Eval，确认 P0 高频问答基线通过。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- business-query.service.spec.ts semantic-query-executor.service.spec.ts agent-orchestrator.service.spec.ts agent-planner.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent:eval
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
```

说明：

- 项目不存在 `agent:eval:p0` 脚本，已按当前 `package.json` 使用 `agent:eval` 验证。

待继续：

- [x] 开始阶段 3：抽 `packages/agent-core`。

### 2026-06-27 阶段 4 追加：summary_text block 渲染闭环

已完成：

- [x] `packages/agent-core/types/blocks.ts` 增加 `summary_text` block 类型。
- [x] `packages/agent-core/logic/blockUtils.ts` 增加 `summary_text` 展示顺序。
- [x] 后端与管理端 Agent 类型补齐 `summary_text`。
- [x] Kiosk `BlockRenderer` 增加 `summary_text` 渲染分支。
- [x] 增加 `BlockRenderer.test.tsx` 覆盖核心结论文本渲染。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/BlockRenderer.test.tsx --runInBand
npx.cmd vitest run packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 用浏览器或 Playwright 截图验证 Kiosk 小屏富消息不溢出。
- [x] 继续完成回答后 follow-up suggestions 的消息尾承接。

### 2026-06-27 阶段 4 追加：Agent/FlowCard 状态分区

已完成：

- [x] `AppContent` 新增独立 `agentMessages`，原 `messages` 保留为 FlowCard、首页卡片、自动化和操作结果消息流。
- [x] 新增 Agent 专用 `agentLoading`，与原 Flow/home loading 分离。
- [x] 展示层通过时间戳合并 Flow/home 消息流与 Agent 消息流，不改变现有卡片渲染组件。
- [x] Agent Runtime 问答的用户气泡、loading、AgentRun、兜底 AI 回复进入 Agent 消息流。
- [x] FlowCard、收银、核销、办卡、充值、服务记录等强流程继续进入原消息流。
- [x] 多轮追问只从 Agent 消息流提取上一轮 AgentRun，上下文不会被收银/核销卡片覆盖。
- [x] 新增回归测试：AgentRun 后插入收银/核销 FlowCard，继续追问仍保留最近 AgentRun 上下文。
- [x] SmartCommandBar 在有 Persona 推荐问题时仍保留收银、核销强流程入口，避免推荐问题覆盖一线操作。
- [x] Playwright 运行态连续验证通过：经营问答 create -> 收银 FlowCard -> 核销 FlowCard -> 点击追问 append 当前 AgentRun。
- [x] 锁屏、切账号、切门店、跨日归档会同时保存/清空两条消息流。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/hooks/useKioskAgentConversation.test.tsx src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/SmartCommandBar.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/SmartCommandBar.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "小屏下 Agent follow-up|经营问答后插入收银"
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 用运行态连续验证“经营问答 -> 收银/核销 -> 继续追问”状态不串。
- [x] 用浏览器或 Playwright 截图验证 Kiosk 小屏富消息不溢出。

### 2026-06-27 阶段 4 追加：回答后 follow-up 承接

已完成：

- [x] `AgentMessageItem` 支持优先展示 `followUpSuggestions`，为空时回退 `follow_up_chips` block。
- [x] `FollowUpChips` 保持最多展示 3 个追问，避免终端底部/消息尾信息过载。
- [x] Kiosk 点击 Agent 回复后的追问时按 `text` 来源提交，继续进入 Agent Runtime 语义链路，而不是走 `system` 旧动作路径。
- [x] 新增 `AgentMessageItem.test.tsx`，覆盖 top-level follow-up 和 block follow-up 两种来源。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx src/app/components/SmartCommandBar.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 用真实 Kiosk 登录态验证点击追问后后端 append 当前 AgentRun。
- [x] 用浏览器或 Playwright 截图验证消息尾 follow-up 在小屏不遮挡输入框。

### 2026-06-27 阶段 5 首批落地：/ami-agent 治理工作台 Tab 化

已完成：

- [x] `AmiAgentWorkspace` 改为顶部 Tab 工作台，包含对话调试、运行审计、审批管理、Persona 配置、评测集、质量大盘。
- [x] 对话调试 Tab 保留原有 `useAgentConversation`、Persona 切换、富输出、反馈和 follow-up 能力。
- [x] 运行审计 Tab 复用 `getAgentRunsPaginated` 和 `getAgentRunDetail`，默认筛选 `entrypoint=terminal:kiosk`，可查看消息、工具调用和审批记录。
- [x] 审批管理 Tab 复用 `getAgentApprovalsPaginated`、`approveAgentApproval`、`rejectAgentApproval`，支持处理 pending 审批。
- [x] Persona 配置 Tab 展示六类 Agent 的角色、工具组和推荐问题。
- [x] 评测集 Tab 可运行默认 Eval，并展示失败评测和负反馈回归候选。
- [x] 质量大盘 Tab 汇总运行数、成功率、反馈采纳、Persona/工具质量、能力缺口、记忆/归档/自动化状态。

已验证：

```powershell
npm.cmd run build
```

待继续：

- [x] 运行审计补齐 status、role、personaCode、keyword 筛选和 steps/evidence/renderedBlocks 细节展示。
- [x] Persona 配置补推荐问题编辑和工具组开关。
- [x] 质量大盘补 entrypoint 维度和终端负反馈运行态验收。

### 2026-06-27 阶段 5 追加：运行审计筛选与详情增强

已完成：

- [x] 后端 `/agent/runs` 增加 `personaCode` 查询参数，运行审计可按 Persona 过滤。
- [x] 前端 `AgentRunListQuery` 补齐 `personaCode`。
- [x] 运行审计 Tab 支持 `status`、`role`、`personaCode`、`entrypoint`、`keyword` 筛选。
- [x] 审计详情展示 messages、steps、toolCalls、approvals。
- [x] 审计详情从 `resultJson/evidenceJson` 提取 evidence、renderedBlocks、responseMode，并提供原始 resultJson 预览。

已验证：

```powershell
npm.cmd run build
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/server-v2 test -- agent.controller.spec.ts --runInBand
```

待继续：

- [x] 增加运行态浏览器验收：终端 AgentRun 在管理端审计 Tab 中按 `entrypoint=terminal:kiosk` 可检索并打开详情。
- [x] 质量大盘补 entrypoint 维度和终端负反馈运行态验收。

### 2026-06-27 阶段 5 追加：Persona 配置编辑与工具组开关

已完成：

- [x] 后端 `AgentPersonaService` 从 `agent_personas` 读取运行时配置，数据库无记录时回退内置六大 Persona。
- [x] 新增 `PATCH /agent/personas/:code`，支持保存推荐问题和工具组开关。
- [x] 管理端 API 新增 `updateAgentPersona`。
- [x] `/ami-agent` Persona 配置 Tab 支持选择 Persona、按行编辑推荐问题、切换工具组并保存。
- [x] 保存后重新拉取 Persona 列表，并更新当前调试 Persona，避免调试区继续使用旧配置。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent.controller.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Persona 推荐问题"
```

待继续：

- [x] Kiosk 启动后从后端 Persona 配置读取推荐问题，而不是只使用 `packages/agent-core` 内置兜底。
- [x] 增加配置变更后的终端运行态验收：修改某 Persona 推荐问题后，Kiosk 切换该 Persona 能同步看到新问题。

### 2026-06-27 阶段 5 追加：Kiosk 读取后端 Persona 配置

已完成：

- [x] Kiosk `AppContent` 增加 `agentPersonas` 状态，默认使用 `BUILTIN_AGENT_PERSONAS` 兜底。
- [x] 登录/启动后调用 `/agent/personas` 拉取后端 Persona 配置。
- [x] `availableTerminalPersonas` 优先使用后端配置，再按当前终端角色做前端权限过滤。
- [x] 如果后端配置为空或接口失败，终端继续使用内置 Persona，不阻塞收银/核销等强流程。
- [x] 当前选中的 Persona 不在当前角色可用列表时自动纠偏到默认 Persona。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/SmartCommandBar.test.tsx src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Persona 推荐问题"
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
```

待继续：

- [x] 增加浏览器运行态验收：管理端修改某 Persona 推荐问题后，刷新 Kiosk 并切换到该 Persona，底部快捷问题同步变化。

### 2026-06-27 阶段 5 追加：质量大盘 entrypoint 维度

已完成：

- [x] 后端 `AgentObservabilityService.getQualityReport` 新增 `entrypointBreakdown`，按 `terminal:kiosk`、`ami-agent:*` 等入口统计运行数、完成数、失败数和成功率。
- [x] 前端 `AgentQualityReport` 类型补齐 `entrypointBreakdown`。
- [x] `/ami-agent` 质量大盘新增“入口质量”面板，展示不同入口的运行数、成功率和失败数。
- [x] 单测覆盖 `terminal:kiosk` 与管理端入口的分组统计。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-observability.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```

待继续：

- [x] 终端负反馈运行态验收：在 Kiosk 对某次 Agent 回答点“无用”后，管理端质量大盘/负反馈候选可看到对应记录。

### 2026-06-27 阶段 5 追加：终端负反馈进入质量大盘

已完成：

- [x] Kiosk `AgentFeedback` 点击“无用”会以 `runId + adopted=false` 回调。
- [x] `AppContent.handleAgentFeedback` 通过 `submitTerminalAgentFeedback` 写入 `/agent/runs/:id/feedback`。
- [x] 后端 `AgentObservabilityService` 质量报告统计 `AgentFeedback`，负反馈可进入 `recentNegativeFeedback` 和负反馈回归候选。
- [x] 新增组件测试覆盖终端 Agent 消息点击“无用”后的提交参数。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx --runInBand
npm.cmd --prefix packages/server-v2 test -- agent-observability.service.spec.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

### 2026-06-27 阶段 6 追加：终端 Agent Runtime 灰度开关

已完成：

- [x] Kiosk 前端新增 `VITE_KIOSK_AGENT_RUNTIME_ENABLED` 开关，默认开启。
- [x] 开关显式为 `false`、`0`、`off`、`disabled` 时，经营问答不进入 Agent Runtime，回退旧 `aiStream` 智能问答链路。
- [x] 后端新增 `AGENT_TERMINAL_RUNTIME_ENABLED` 保护，关闭时拒绝 `entrypoint=terminal:kiosk` 的 create/append 请求。
- [x] 后端关闭时返回 `AGENT_TERMINAL_RUNTIME_DISABLED`，避免前端绕过开关直连 `/agent/runs`。
- [x] 测试覆盖前端关闭回退旧链路、后端关闭拒绝新建和追加。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/server-v2 test -- agent.controller.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd playwright test e2e/ami-agent-status.spec.ts
```

待继续：

- [x] 灰度期间新旧回答质量对比需要继续接入质量大盘或审计对比视图。

### 2026-06-27 阶段 6 追加：Eval 与 FlowCard 负例补齐

已完成：

- [x] 确认默认 Eval 已包含临期库存处理草稿、库存补货采购草稿、客户复购承接等核心场景。
- [x] Kiosk 分流测试新增“核销 quick action 保持 FlowCard，不进入 Agent Runtime”。
- [x] Kiosk 分流测试新增“收银 quick action 保持 FlowCard，不进入 Agent Runtime”。
- [x] `agent:eval` 覆盖默认 P0 planner、安全回归和高频问答基线。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent:eval
```

### 2026-06-28 阶段 6 追加：T6.5 终端验收基线脚本化

已完成：

- [x] 新增 `TERMINAL_ACCEPTANCE_AGENT_EVAL_CASES`，集中覆盖 T6.5 的 7 条经营问答验收问题。
- [x] 默认 Agent Eval 门禁纳入 T6.5 验收集，防止后续 Planner 改动导致核心问题路由漂移。
- [x] Kiosk `runMicroApp` 增加 T6.5 文本问题分流测试，验证经营问答进入 `createTerminalAgentRun`，并携带 `terminalFacts`。
- [x] 继续保留核销、收银 quick action 负例，验证强流程操作不进入 Agent Runtime。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "小屏下 Agent follow-up"
npx.cmd playwright test e2e/ami-agent-status.spec.ts -g "terminalFacts 上下文快照"
```

待继续：

- [x] 浏览器运行态复验 `context.terminalFacts` 是否写入 AgentRun detail。

### 2026-06-27 阶段 6 追加：agent-core Persona/API 单测

已完成：

- [x] 新增 `packages/agent-core/logic/personaAccess.test.ts`，覆盖店长/前台/美容师可用 Persona、越权 Persona 兜底和合法切换。
- [x] 新增 `packages/agent-core/api/agentApi.test.ts`，覆盖 `createRun`、`appendMessage`、Persona、详情和 feedback 端点。
- [x] 验证共享 API 工厂会给 create/append 注入长任务配置 `{ timeout: 60000, skipRetry: true }`。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/personaAccess.test.ts packages/agent-core/api/agentApi.test.ts packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
```

### 2026-06-27 阶段 6 追加：P0 事实注入与消费客户工具测试

已完成：

- [x] `business.query.ask` 增加“昨天有哪些消费的客户，列出清单”工具级测试，验证 Agent Tool 层能拿到 `order_customer_consumption_list` 的消费客户清单、表格字段、数据来源和复购承接 action。
- [x] `inventory.risk.rank` 临期库存测试补强，验证临期问法返回 `mode=expiring_inventory`、商品名、当前库存、临期库存、到期日、剩余天数、风险等级、处理建议和临期证据过滤条件。
- [x] 临期库存 item 增加 `suggestedAction`，终端和管理端可直接承接为“下一步建议”，但仍不自动调价、不自动发布活动、不自动采购。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-tool-registry.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent:eval
npm.cmd --prefix packages/server-v2 run build
```

待继续：

- [x] 真实 Kiosk 登录态复验“近期有哪些临期库存产品”，默认 `8080 + 5179` 返回 `runId=153`。
- [x] 真实 Kiosk 登录态复验“昨天有哪些消费的客户，列出清单”，默认 `8080 + 5179` 返回 `runId=155`。
- [x] 管理端审计按 `entrypoint=terminal:kiosk` 检索上述两次 AgentRun，并查看 detail 中的 evidence、renderedBlocks 和 feedback。

### 2026-06-27 阶段 3 追加：共享类型去重

已完成：

- [x] `packages/agent-core/types/result.ts` 补齐 `AgentRunResultV2.answerContract` 和 `personaCode?: string | null`，覆盖管理端已有响应契约。
- [x] `src/types/agent.ts` 不再本地定义 `AgentPersonaCode`、`AgentPersonaSummary`、`AuraBlockAction`、`AuraResponseBlock`、`AgentRunResultV2`、`AgentFeedbackRequest`，改为从 `@ami/agent-core` re-export。
- [x] `src/types/agent.ts` 进一步移除重复的 `AgentRole`、`AgentRiskLevel`、`AgentRunStatus`、`AgentCreateRunRequest`、`AgentAppendMessageRequest`、`AgentToolPlanItem`、`AgentPlan`、`AgentEvidence`、`AgentSuggestedAction`、`AgentToolResult`、`AgentApprovalSummary` 定义，统一从 `@ami/agent-core` re-export；本地仅保留管理端扩展的 `AgentRunResult.phaseOutputs`。
- [x] Kiosk `src/app/types.ts` 不再本地维护旧版 `AuraResponseBlock`，改为从 `@ami/agent-core` re-export。
- [x] 搜索确认 `AuraResponseBlock`、`AuraBlockAction`、`AgentPersonaSummary`、`AgentPersonaCode`、`AgentRunResultV2`、`AgentFeedbackRequest` 的唯一真实定义位于 `packages/agent-core/types/*`。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/personaAccess.test.ts packages/agent-core/api/agentApi.test.ts packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/BlockRenderer.test.tsx src/app/components/AgentMessageItem.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd run build
```

待继续：

- [x] 继续收敛 Kiosk Agent 对话状态到 shared hook 或 Kiosk 专用 hook。
- [x] 继续把 `conversationContext`、指代消解和 active entities 迁入 `packages/agent-core/logic`。

### 2026-06-27 阶段 3/4 追加：Kiosk Agent 对话状态 hook 化

已完成：

- [x] 新增 `useKioskAgentConversation`，集中管理 Kiosk Agent 消息、loading、消息 ref、清空动作和最近 AgentRun 上下文提取。
- [x] `AppContent` 不再直接维护 `agentMessagesRef` 和本地 `getLatestAgentContext`，多轮追问所需 `previousRun` 统一从 hook 获取。
- [x] FlowCard 消息流仍保留在 `AppContent` 原状态中，收银、核销、预约等强流程分区不变。
- [x] 新增 hook 测试，覆盖最近 AgentRun 上下文提取、消息 ref 同步和统一清空。
- [x] `useKioskAgentConversation` 的最近 AgentRun / businessQuery 上下文提取改为复用 `@ami/agent-core/logic/conversationContext`，Kiosk 不再维护私有倒序扫描逻辑。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/hooks/useKioskAgentConversation.test.tsx src/app/microApps/runMicroApp.test.ts src/app/components/AgentMessageItem.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd vitest run packages/agent-core/logic/conversationContext.test.ts
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/hooks/useKioskAgentConversation.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 继续把 Kiosk `conversationContext`、指代消解和 active entities 迁入 `packages/agent-core/logic`。
- [x] Kiosk 经营问答主入口改为通过 `terminalAgentAdapter -> agentRuntimeService -> @ami/agent-core createAgentApi` 发起 create/append，不再由 Adapter 直接调用旧 `auraCoreService.runBusinessAgent/appendBusinessAgentMessage`。
- [x] `useKioskAgentConversation` 暂不直接替换为 `@ami/agent-core/useAgentConversation`，避免把 FlowCard 状态、终端消息持久化和 AgentRun 经营问答状态提前混在同一 hook；后续仅在 UI 状态边界稳定后评估。

### 2026-06-27 阶段 3 追加：conversationContext 共享化

已完成：

- [x] `packages/agent-core/types/conversation.ts` 兼容 Kiosk 现有 `RecentTurn`、`ActiveEntities` 和 nested customer/dateRange/beautician/product 实体。
- [x] 新增 `packages/agent-core/logic/conversationContext.ts`，迁入 `createConversationContext`、`updateConversationContext`、`resolvePronouns`、`buildContextSummary`、`resetConversationContext`。
- [x] `packages/agent-core/logic/conversationContext.ts` 新增 `getLatestAgentContextFromMessages` 和 `buildPreviousRunContext`，共享多轮追问所需的 `previousRun` / `previousBusinessQuery` 上下文提取。
- [x] Kiosk `src/app/intent/conversationContext.ts` 改为从 `@ami/agent-core` re-export，保持原调用路径稳定。
- [x] 新增共享逻辑测试，覆盖 recentTurns 只保留最近 6 轮、月份时间范围提取、客户代词替换、上下文摘要和 reset。
- [x] 共享逻辑测试补充：从任意消息流提取最新 AgentRun 上下文；没有 AgentRun 时回退最近 businessQuery。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/conversationContext.test.ts packages/agent-core/logic/personaAccess.test.ts packages/agent-core/hooks/useAgentConversation.test.tsx packages/agent-core/hooks/usePersona.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/intent/ruleIntentParser.test.ts src/app/intent/actionCommands.test.ts src/app/hooks/useKioskAgentConversation.test.tsx src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 管理端和 Kiosk 使用同一套 block 工具完成度复查。
- [x] Kiosk Agent Runtime 请求层已更深复用共享 API 工厂：`terminalAgentAdapter` 直接调用 `agentRuntimeService` 的 `createTerminalAgentRun/appendTerminalAgentMessage`，`agentRuntimeService` 复用管理端同源 `@ami/agent-core` API 类型与工厂。
- [x] 后续让 `useKioskAgentConversation` 更深复用 `@ami/agent-core/useAgentConversation` 的 UI 状态机前，需先确认 FlowCard、历史持久化和经营问答消息流的边界不串。

### 2026-06-28 阶段 3 追加：Kiosk 经营问答请求层收敛

已完成：

- [x] `terminalAgentAdapter` 不再直接调用 `auraCoreService.runBusinessAgent/appendBusinessAgentMessage`。
- [x] 新建 AgentRun 统一调用 `createTerminalAgentRun`。
- [x] 多轮追问统一调用 `appendTerminalAgentMessage`，并继续携带 `previousRun`、`previousBusinessQuery` 和 intent 上下文。
- [x] `microAppTypes` 的 `agentRun` payload 改为共享 `AgentRunResult` 类型，减少对旧 `auraCoreService` 返回类型的耦合。
- [x] `runMicroApp` 定向测试改为断言 `agentRuntimeService` 输入对象，覆盖 create/append 两条主路径。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/microApps/runMicroApp.test.ts src/app/hooks/useKioskAgentConversation.test.tsx --runInBand
npx.cmd vitest run packages/agent-core/logic/conversationContext.test.ts packages/agent-core/api/agentApi.test.ts
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 浏览器运行态复验 Kiosk 经营问答 create/append 真实 AgentRun。
- [x] 小屏截图验收 follow-up 与富消息不遮挡输入框。

### 2026-06-27 阶段 3 追加：Block 工具统一

已完成：

- [x] `packages/agent-core/logic/blockUtils.ts` 新增 `groupBlocksForDisplay`，统一执行 block 排序和连续 KPI 分组。
- [x] Kiosk `BlockRenderer` 改为使用 `groupBlocksForDisplay`，删除本地 KPI 分组逻辑。
- [x] 管理端 `AgentBlockRenderer` 改为使用 `groupBlocksForDisplay`，删除本地排序和 KPI 分组逻辑。
- [x] 新增共享 `blockUtils` 单测，验证 summary、KPI、table、evidence、action、follow-up 的统一显示顺序。
- [x] Kiosk `BlockRenderer` 测试补充未排序 blocks 的实际 DOM 顺序验证。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/blockUtils.test.ts src/app/pages/ami-agent/components/AgentBlockRenderer.test.tsx packages/Ami-Aura-Lite-Kiosk/src/app/components/BlockRenderer.test.tsx
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] Answer Contract 展示适配已在管理端和 Kiosk 代码层对齐，临期库存 Kiosk 运行态复验已通过。
- [x] Kiosk 小屏富消息截图验收。

### 2026-06-27 阶段 3 追加：Answer Contract 展示适配统一

已完成：

- [x] 新增 `packages/agent-core/logic/answerContract.ts`，统一提取展示 blocks、follow-up、evidence、actions、limitations。
- [x] `useAgentConversation` 默认使用共享展示适配，避免管理端调试对话直接消费原始 `renderedBlocks`。
- [x] Kiosk `AgentMessageItem` 使用共享展示适配，顶层 actions、evidence、limitations 即使没有 action block 也能展示。
- [x] Kiosk `AgentMessageItem` 补充重复信息抑制：文本 block、evidence_panel、block action 优先，顶层字段只做缺失兜底。
- [x] 管理端 `/ami-agent` 调试对话和审批回写使用共享展示适配。
- [x] 审计详情仍保留原始 `resultJson/renderedBlocks`，便于排查后端契约问题。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/answerContract.test.ts packages/agent-core/logic/blockUtils.test.ts packages/agent-core/hooks/useAgentConversation.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npx.cmd vitest run src/app/pages/ami-agent/components/AgentBlockRenderer.test.tsx
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
git diff --check
```

追加验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

说明：

- `git diff --check` 仅提示当前工作区既有 CRLF 行尾替换警告，无空白错误。
- Kiosk build 仍有既有 chunk size warning，不影响本次 Answer Contract 验证。

待继续：

- [x] 真实 Kiosk 登录态复验“近期有哪些临期库存产品”：临时 `8081 + 5179` 页面和默认 `8080 + 5179` 页面均已通过。
- [x] 真实 Kiosk 登录态复验“昨天有哪些消费的客户，列出清单”：默认 `8080 + 5179` 页面已通过，表格、证据、动作展示正常。
- [x] 管理端审计 API 按 `entrypoint=terminal:kiosk` 查询上述 AgentRun，并验证 detail 中的 evidence、renderedBlocks、actions、toolCalls。
- [x] Kiosk 小屏富消息截图验收。

### 2026-06-27 阶段 4/8 追加：Kiosk 富消息运行态复验与去重

已完成：

- [x] 修复 Kiosk `AgentMessageItem` 重复渲染：`answer` 与 `text/summary_text` block 不再重复。
- [x] 修复 evidence 重复渲染：有 `evidence_panel` 时不再额外展示顶层 evidence。
- [x] 修复动作重复渲染：block 内 action 已展示时，顶层 action 和同名 follow-up 不再重复出现。
- [x] 修复顶层 action 与 follow-up 同名重复：`查看订单明细`、`生成复购跟进草稿` 只展示一次。
- [x] 新增组件测试覆盖 answer/evidence/action/follow-up 去重。
- [x] 使用临时 `8081 + 5179` 完成真实 Kiosk 页面复验。

运行态结果：

```text
问题：近期有哪些临期库存产品
接口：POST /api/agent/runs -> 201
结果：hasLoading=false, answerCount=1, evidenceCount=1, viewActionCount=1, draftActionCount=1, hasTable=true
截图：C:\Users\huawie\AppData\Local\Temp\ami-agent-kiosk-final2-20260627-234858.png
```

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

待继续：

- [x] 用默认 8080 服务复验同一流程，已替换 stale 8080 进程。
- [x] 复验“昨天有哪些消费的客户，列出清单”的真实 Kiosk 页面表格展示。
- [x] 小屏截图验收。

### 2026-06-27 阶段 8 追加：terminal:kiosk 运行态 API 复验

已完成：

- [x] 在不打断当前 8080 服务的前提下，临时以 `PORT=8081 node dist/main.js` 启动当前工作区后端并完成验证后停止。
- [x] 以 `admin/11111111`、`storeId=6`、`entrypoint=terminal:kiosk` 创建临期库存 AgentRun。
- [x] 临期库存 AgentRun 返回 `personaCode=inventory`、`responseMode=structured_blocks`、`text/inventory_item_card/table/evidence_panel`、证据和 actions。
- [x] 以 `admin/11111111`、`storeId=6`、`entrypoint=terminal:kiosk` 创建昨日消费客户 AgentRun。
- [x] 昨日消费客户 AgentRun 返回 `personaCode=manager`、`responseMode=structured_blocks`、KPI、客户表格、证据和复购 action。
- [x] 当前 8080 审计 API 可按 `entrypoint=terminal:kiosk` 查到 `runId=144`、`runId=145`。
- [x] AgentRun detail 可看到 messages、steps、toolCalls、approvals、evidence、renderedBlocks、actions。

关键结果：

```text
runId=144 临期库存：找到 5 个临期库存商品，最近到期的是 水润柔肤水，2 天后到期，临期库存 70瓶。
blocks=text, inventory_item_card, table, evidence_panel
actions=生成补货采购草稿, 查看库存预警

runId=145 昨日消费客户：昨天共有 7 位消费客户，35 笔有效订单，消费合计 ¥25,553.27。
blocks=text, kpi_card, kpi_card, kpi_card, table, evidence_panel
actions=查看订单明细, 生成复购跟进草稿
```

发现的问题：

- [x] 当前占用 8080 的旧 `node dist/main.js` 运行态会拒绝 create payload 中的一等字段 `personaCode`，返回 `property personaCode should not exist`。
- [x] 当前工作区源码和 `packages/server-v2/dist` 已包含 `personaCode` DTO，因此判断为 8080 进程运行态与当前构建存在偏差。
- [x] 已重建 `server-v2` 并替换 8080 后端进程，新 8080 健康检查正常。
- [x] 已使用临时 `5179 -> 8080` 完成 Kiosk 浏览器 UI 复验。

默认 8080 复验结果：

```text
runId=153 临期库存：status=201, hasLoading=false, answerCount=1, hasTable=true, hasError=false
截图：C:\Users\huawie\AppData\Local\Temp\ami-agent-kiosk-default8080-ok-20260628-000716-inventory.png

runId=155 昨日消费客户：status=201, hasAnswer=true, hasTable=true, orderActionCount=1, followupActionCount=1, hasError=false
截图：C:\Users\huawie\AppData\Local\Temp\ami-agent-kiosk-customer-dedupe-20260628-001111.png
```

待继续：

- [x] 打开管理端 `/ami-agent` 审计 Tab，用页面验证 `entrypoint=terminal:kiosk`、evidence、renderedBlocks、actions、feedback。
- [x] 验证追问 append：在消费客户清单后继续问“优先联系哪些客户？”，Kiosk 第二轮请求为 `POST /api/agent/runs/156/messages`。
- [x] 修正追问语义：append 已复用同一 run，“优先联系哪些客户？”已优先基于上一轮消费客户清单排序，不再跳到通用流失客户池。

### 2026-06-28 阶段 5/8 追加：管理端审计列表轻量化与页面复验

已完成：

- [x] 修复 `AgentWorkflowRuntimeService.findRuns`：审计列表查询增加 `select`，只返回列表卡片所需字段。
- [x] 列表接口不再返回大体积 `planJson/resultJson/contextJson/evidenceJson`，完整证据和结构化输出继续由 `/agent/runs/:id/detail` 加载。
- [x] 新增 `agent-workflow-runtime.service.spec.ts`，固化列表轻量化行为。
- [x] 重建并重启 `server-v2`，当前 8080 监听进程为新构建。
- [x] 复验接口：`GET /api/agent/runs?entrypoint=terminal:kiosk&page=1&pageSize=20` 返回 12 条，首条 `id=155/runNo=ar_mqwk592a_0dmo9a`，耗时约 1.7s，列表项不含 `resultJson/planJson/evidenceJson`。
- [x] 复验页面：管理端 `/ami-agent` -> 运行审计可显示 `terminal:kiosk` 列表。
- [x] 点击 `ar_mqwk592a_0dmo9a` 后，详情请求 `GET /api/agent/runs/155/detail` 返回 200，页面展示消息、执行步骤、工具调用、证据与输出契约、RenderedBlocks、ResponseMode 和原始结果快照。
- [x] 复验 Kiosk append：第一次消费客户清单创建 `runId=156`，第二轮“优先联系哪些客户？”请求 `POST /api/agent/runs/156/messages` 返回 201。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-workflow-runtime.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

运行态证据：

```text
管理端审计截图：
C:\Users\huawie\AppData\Local\Temp\ami-agent-audit-detail-1782578163983.png

Kiosk append 截图：
C:\Users\huawie\AppData\Local\Temp\ami-agent-kiosk-append-1782578468697.png
```

### 2026-06-28 阶段 1/2 追加：消费客户清单追问语义收敛

已完成：

- [x] `BusinessTaskPreParser` 支持从上一轮 `conversationFocus.currentItems` 提取消费客户清单，识别“优先联系哪些客户？”这类追问。
- [x] `AgentPlanner` 将 `filters.customerIds`、`filters.focusedCustomers`、`filters.contextScope` 透传给 `customer.priority.rank`。
- [x] `customer.priority.rank` 支持限定客户 ID 排序；当 `contextScope=previous_order_customer_consumption_list` 时，只在上一轮客户清单内排序，不扩展到全店客户池。
- [x] Tool evidence 标明“上一轮消费客户清单”范围，并在原因中保留上一轮消费金额、消费内容和建议动作。
- [x] 补充 PreParser、Planner、Tool Registry 三层回归测试。
- [x] API 真实复验：`runId=157` 第一轮“昨天有哪些消费的客户，列出清单”返回 4 位客户；第二轮 append “优先联系哪些客户？”只返回上一轮 4 位客户：罗紫萱、刘伟明、黄梦瑶、马佳慧。

已验证：

```powershell
npm.cmd --prefix packages/server-v2 test -- business-task-preparser.service.spec.ts agent-planner.service.spec.ts agent-tool-registry.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
```

运行态验证摘要：

```text
POST /api/agent/runs -> runId=157
POST /api/agent/runs/157/messages -> status=completed
answer=上一轮消费客户清单已按要求返回 4 位客户。优先建议跟进罗紫萱...
customerIds=3847,4021,4487,4441
filters=范围：上一轮消费客户清单 | customerIds=4441,4487,3847,4021
limitations=本次追问限定在上一轮消费客户清单内排序，不扩展到全店客户池。
```

### 2026-06-28 阶段 2/3 追加：终端事实上下文与请求层收敛

已完成：

- [x] 新增 `terminalFactContext.ts`，定义 `TerminalFactContext` 与 `TerminalFactGroup`，覆盖 `store/operator/recentEntities/inventory/customers/orders/appointments/cards/device`。
- [x] 每类事实统一包含 `source/updatedAt/items/limitations`，默认每组最多 20 条，超过后标记截断说明。
- [x] 从 Kiosk 最近消息的结构化卡片中提取已加载事实：库存低库存/临期/补货、客户卡片/客户列表、预约、卡项/核销/充值相关客户和卡项。
- [x] 敏感字段在进入 Agent context 前脱敏或剔除：`phone/customerPhone/email/wechat/landline/address/birthday/remark/workplace` 不直接注入原值。
- [x] `AppContent` 在发起经营问答时注入 `context.terminalFacts`，并带上当前 store、operator、entrypoint、role、personaCode。
- [x] `terminalAgentAdapter` 主路径改为调用 `agentRuntimeService.createTerminalAgentRun/appendTerminalAgentMessage`，再由 `agentRuntimeService` 复用 `@ami/agent-core` API 工厂；旧 `auraCoreService.runBusinessAgent/appendBusinessAgentMessage` 不再是 Adapter 主入口。
- [x] `microAppTypes` 的 `agentRun` payload 改为共享 `AgentRunResult` 类型，减少对旧服务返回类型的耦合。
- [x] 后端 `AgentOrchestratorService.appendMessage` 将合并后的 `previousRun/previousResult/conversationFocus/terminalFacts` 回写到 `AgentRun.contextJson`，保证审计 detail 可追溯追加消息时的终端事实。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/services/terminalFactContext.test.ts src/app/microApps/runMicroApp.test.ts --runInBand
npx.cmd vitest run packages/agent-core/logic/conversationContext.test.ts packages/agent-core/api/agentApi.test.ts
npm.cmd --prefix packages/server-v2 test -- agent-orchestrator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd playwright test e2e/ami-agent-status.spec.ts -g "terminalFacts 上下文快照"
```

待继续：

- [x] 浏览器运行态复验 Kiosk 经营问答 create/append 的 `context.terminalFacts` 是否落入 AgentRun detail。
- [x] 小屏截图验收 follow-up 与富消息不遮挡输入框。
- [x] 继续评估是否把 `useKioskAgentConversation` UI 状态机更深复用 `@ami/agent-core/useAgentConversation`，但不能破坏 FlowCard 与经营问答的边界。

### 2026-06-28 阶段 4/5 追加：Persona 推荐问题运行态刷新

已完成：

- [x] `AppContent` 新增 `PERSONA_REFRESH_INTERVAL_MS = 60_000`，Kiosk 已登录后每 60 秒刷新一次 `getAgentPersonas()`。
- [x] Persona 配置刷新失败时继续回退 `BUILTIN_AGENT_PERSONAS`，不影响终端主操作。
- [x] 刷新结果继续经过当前角色可访问 Persona 过滤，`SmartCommandBar` 使用 `activeTerminalPersona.suggestedQuestions` 生成输入框提示，最多展示 3 个推荐问题。
- [x] 补充 `AppContent.performance.test.ts`，约束 Persona 配置必须具备运行态刷新和推荐问题传递。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/AppContent.performance.test.ts src/app/components/SmartCommandBar.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/services/terminalFactContext.test.ts src/app/microApps/runMicroApp.test.ts --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Persona 推荐问题"
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
```

待继续：

- [x] 浏览器运行态验收：管理端修改某 Persona 推荐问题后，等待 Kiosk 刷新周期或刷新页面，底部快捷问题同步变化。
- [x] 结合小屏截图验收快捷问题、follow-up 和输入框不遮挡。

### 2026-06-28 阶段 2/3 追加：Answer Contract 状态展示统一

已完成：

- [x] `packages/agent-core/logic/answerContract.ts` 新增 `statusNotice` 共享显示模型。
- [x] `no_data` 映射为“暂无数据”空态提示，不再表现为执行失败。
- [x] `unsupported` 映射为“暂不支持”能力缺口提示。
- [x] `failed` 和 Answer Contract errors 映射为“执行失败”提示，并优先展示 contract error。
- [x] `useAgentConversation` 将 `statusNotice` 写入管理端调试对话消息。
- [x] Kiosk `AgentMessageItem` 和管理端 `/ami-agent` 调试消息均消费同一 `statusNotice`。
- [x] `useAgentConversation` 回归测试覆盖 no_data / unsupported / failed 三类结果到 `statusNotice` 的映射。
- [x] Kiosk `AgentMessageItem` 回归测试覆盖 unsupported 能力缺口提示，避免误显示为执行失败。
- [x] Kiosk Playwright 覆盖 no_data / unsupported / failed 三类运行态提示：暂无数据、暂不支持、执行失败。
- [x] 管理端 `/ami-agent` `MessageItem` 增加组件测试，验证三类 `statusNotice` 与 Kiosk 使用同一标题和说明口径。
- [x] 管理端 `/ami-agent` Playwright 覆盖 no_data / unsupported / failed 三类运行态提示，与 Kiosk 浏览器结果一致。

已验证：

```powershell
npx.cmd vitest run packages/agent-core/logic/answerContract.test.ts packages/agent-core/hooks/useAgentConversation.test.tsx
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx src/app/components/BlockRenderer.test.tsx --runInBand
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/AgentMessageItem.test.tsx --runInBand
npx.cmd vitest run src/app/pages/ami-agent/AmiAgentWorkspace.test.tsx
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Kiosk 浏览器运行态区分"
npx.cmd playwright test e2e/ami-agent-status.spec.ts -g "管理端 /ami-agent 浏览器运行态区分"
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd run build
```

待继续：

- [x] 高风险 actions 与审批信息的强绑定复查，确保终端不能绕过审批执行中高风险动作。
- [x] 浏览器运行态验证 no_data/unsupported/failed 三类状态在 Kiosk 和管理端显示一致。

### 2026-06-28 阶段 2/5 追加：高风险动作审批边界补强

已完成：

- [x] 复查后端 `AgentOrchestratorService`：中高风险工具命中 `policy.requiresApproval` 时只创建 `AgentApproval` 和 `waiting_approval` toolCall，不执行 `toolRegistry.execute`。
- [x] 复查并验证审批后执行链路：只有调用 `/agent/approvals/:id/approve` 后才执行 pending tool；拒绝审批时 toolCall 标记 `rejected`，不写入业务数据。
- [x] Kiosk 新增 `parseAgentApprovalAction`，识别 `approve:{id}`、`approve:{id}:cancel`、`reject:{id}`。
- [x] Kiosk `handleAgentResultAction` 对审批动作直接调用 `approveBusinessAgentAction/rejectBusinessAgentAction`，不再把 `approve:*` / `reject:*` 当成普通命令或智能问答输入。
- [x] `confirm_action` / `action_card` 中的审批按钮与 `AgentMessageItem` 审批卡片统一进入审批 API 通道。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/intent/actionCommands.test.ts src/app/components/AgentMessageItem.test.tsx --runInBand
npm.cmd --prefix packages/server-v2 test -- agent-orchestrator.service.spec.ts --runInBand
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Kiosk 触发中风险动作先进入待审批"
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd --prefix packages/server-v2 run build
```

待继续：

- [x] 浏览器运行态验收：在 Kiosk 触发中风险草稿动作，确认先进入待审批，再通过管理端或终端审批后执行。

### 2026-06-28 追加：终端快捷入口与推荐问题分层

已完成：

- [x] Kiosk 底部快捷入口回归角色 `quickActions`，不再用 Persona `suggestedQuestions` 覆盖 FlowCard 功能按钮。
- [x] Persona 推荐问题仅进入聊天输入框 placeholder，作为“可以这样问”的提示，不再生成可点击快捷按钮。
- [x] 店长角色补齐终端操作快捷能力：预约、核销、收银、办卡、充值、打印等；server-v2 bootstrap 与本地 fallback 配置保持一致。
- [x] 单测覆盖：存在 Persona 推荐问题时，快捷入口仍展示终端操作按钮，点击按钮仍走 `quick_action`，不会变成 AI 文本输入。
- [x] Kiosk Browser Eval 覆盖：刷新后推荐问题同步到输入框提示，底部快捷入口仍保留预约、核销、收银、办卡。

已验证：

```powershell
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk exec vitest run src/app/components/SmartCommandBar.test.tsx --runInBand
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts -g "Persona 推荐问题"
npx.cmd playwright test -c playwright.kiosk.config.ts packages/Ami-Aura-Lite-Kiosk/e2e/business-agent.spec.ts
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
```
