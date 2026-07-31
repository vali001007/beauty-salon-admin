# Agent 管理模块 V1/V2 治理开发计划 Tasks

> 日期：2026-07-04
> 目标：基于当前 Agent V1 与 Agent V2 双引擎现状，新增统一的 Agent 管理模块，实现 V1/V2 能力对比、运行审计、能力治理、评测回归、知识图谱治理、灰度切换和后续 V1 退役评估。
> 关联文档：
>
> - `docs/03-开发计划/Agent管理模块V1V2能力对比与信息架构建议-2026-07-04.md`
> - `docs/03-开发计划/Agent_V1与V2架构对比分析-2026-07-04.md`
> - `docs/03-开发计划/Agent V1与V2独立拆分详细开发计划-2026-07-04.md`

---

## 0. 总体原则

- [ ] 普通业务用户只面对一个“智能体工作台”，不直接理解 V1/V2。
- [ ] V1/V2 是 Agent 引擎版本，不是两个独立产品。
- [ ] V1 保留为兼容层和历史基线；V2 作为后续能力治理、评测、灰度和发布主线。
- [ ] Agent 管理模块要解决三件事：看得见、比得出、管得住。
- [ ] 新能力优先进入 V2 Capability Manifest 和 Agent 能力中心。
- [ ] V1 能答但 V2 不能答的问题，必须能沉淀为 V2 能力草案或 Eval case。
- [ ] V2 不应被 V1 隐式兜底污染；允许回退时必须显式记录策略。
- [ ] 所有运行记录必须可按 `agent_v1 / agent_v2` 筛选、对比和审计。

---

## 1. 目标菜单结构

```text
Agent 管理
├─ 总览
├─ 智能体工作台
├─ V1/V2 对比中心
├─ Agent 运行审计
├─ Agent 能力中心
├─ Agent 评测中心
├─ 知识图谱治理
├─ 自动化与审批
├─ AI 调用审计
└─ 数字员工账单
```

---

## 2. 阶段 0：开工保护与现状冻结

目标：当前工作区已有大量未提交和删除项，先建立可追踪基线，避免 Agent 管理模块开发混入其他业务改动。

### 2.1 只读基线

- [ ] 输出当前 `git status --short --branch`。
- [ ] 记录当前分支名、未提交文件数量、未跟踪文件数量、删除文件数量。
- [ ] 标记本次开发涉及的高风险区域：
  - [ ] `src/app/routes.tsx`
  - [ ] `src/app/components/Layout.tsx`
  - [ ] `src/app/pages/ami-agent/AmiAgentWorkspace.tsx`
  - [ ] `src/app/pages/system/AgentCapabilityCenter.tsx`
  - [ ] `packages/server-v2/src/agent`
  - [ ] `packages/server-v2/src/agent-v2`
  - [ ] `packages/server-v2/prisma/schema.prisma`
  - [ ] `packages/Ami-Aura-Lite-Kiosk/src/app/services/*`

### 2.2 基线确认

- [ ] 确认 V1 入口：`/api/agent/*`。
- [ ] 确认 V2 入口：`/api/agent-v2/*`。
- [ ] 确认 V2 能力中心入口：`/api/agent-v2/capability-center/*`。
- [ ] 确认管理端当前 `AI 智能体` 路由与菜单位置。
- [ ] 确认当前 `Agent 审计`、`AI 审计`、`Agent 能力中心`、`数字员工账单` 所在菜单。
- [ ] 确认 Kiosk 当前使用 V1/V2 的切换方式：
  - [ ] `agentRuntimeService.ts`
  - [ ] `terminalAgentAdapter.ts`
  - [ ] `auraCoreService.ts`

### 2.3 验收

- [ ] 形成一份开发前基线记录。
- [ ] 明确本次开发不处理的既有脏文件。
- [ ] 若涉及 Prisma migration、路由重排或 Kiosk 主入口，开发前再次确认范围。

---

## 3. 阶段 1：Agent 管理一级菜单与信息架构

目标：把分散的 Agent 相关入口统一归到“Agent 管理”下，同时保留原入口兼容跳转。

### 3.1 前端菜单与路由

- [ ] 新增一级菜单：`Agent 管理`。
- [ ] 新增路由分组：
  - [ ] `/agent-management`
  - [ ] `/agent-management/overview`
  - [ ] `/agent-management/workbench`
  - [ ] `/agent-management/compare`
  - [ ] `/agent-management/runs`
  - [ ] `/agent-management/capabilities`
  - [ ] `/agent-management/evals`
  - [ ] `/agent-management/knowledge`
  - [ ] `/agent-management/automation`
  - [ ] `/agent-management/ai-audit`
  - [ ] `/agent-management/billing`
- [ ] 将现有 `/ami-agent` 作为智能体工作台主入口或兼容重定向。
- [ ] 将现有 `AgentCapabilityCenter` 纳入 `/agent-management/capabilities`。
- [ ] 保留旧菜单入口，但点击后跳转到新模块对应页面。

### 3.2 权限

- [ ] 新增权限码建议：
  - [ ] `core:agent-management:view`
  - [ ] `core:agent-management:debug`
  - [ ] `core:agent-management:compare`
  - [ ] `core:agent-management:capability-review`
  - [ ] `core:agent-management:capability-publish`
  - [ ] `core:agent-management:eval`
  - [ ] `core:agent-management:knowledge`
  - [ ] `core:agent-management:audit`
  - [ ] `core:agent-management:billing`
- [ ] `super_admin` 默认全量可见。
- [ ] 店长默认只可见智能体工作台、自动化与审批、数字员工账单摘要。
- [ ] 研发/系统管理员可见 V1/V2 对比、能力中心、评测中心、知识图谱治理。

### 3.3 验收

- [ ] 左侧菜单出现 `Agent 管理`。
- [ ] Agent 相关入口归并后没有重复一级菜单。
- [ ] 旧链接仍可访问或正确跳转。
- [ ] 权限不足角色不显示治理类页面。

---

## 4. 阶段 2：Agent 管理总览页

目标：进入 Agent 管理后先看到整体健康度，而不是直接进入某个列表。

### 4.1 总览数据

- [ ] 新增或复用后端聚合接口：`GET /agent-management/overview`。
- [ ] 聚合指标：
  - [ ] 今日问答量。
  - [ ] V1 问答量。
  - [ ] V2 问答量。
  - [ ] V2 占比。
  - [ ] 成功率。
  - [ ] 用户有用率。
  - [ ] 平均耗时。
  - [ ] 失败数。
  - [ ] Token / 模型费用。
  - [ ] 待审核 V2 能力数。
  - [ ] Eval P0 通过率。
  - [ ] 知识图谱阻断项。

### 4.2 总览页面组件

- [ ] KPI 卡片区。
- [ ] V1/V2 趋势图。
- [ ] 最近失败问题列表。
- [ ] 待治理能力列表。
- [ ] 评测趋势卡片。
- [ ] 知识图谱治理状态卡片。
- [ ] 快捷入口：
  - [ ] 跑 V1/V2 对比。
  - [ ] 查看失败问题。
  - [ ] 导入 V2 能力草案。
  - [ ] 运行 Eval Gate。

### 4.3 验收

- [ ] 能按最近 1 天、7 天、30 天切换。
- [ ] V1/V2 指标分开展示。
- [ ] 点击失败问题可进入运行审计详情。
- [ ] 点击待治理能力可进入能力中心详情。

---

## 5. 阶段 3：统一运行记录与引擎版本字段

目标：所有 Agent run 都能明确区分 V1/V2，为审计和对比提供基础。

### 5.1 数据模型

- [ ] 检查当前 `AgentRun` 是否已有足够字段区分引擎。
- [ ] 若已有 `agentCode`，统一约定：
  - [ ] V1：`agent_v1` 或空值兼容为 `agent_v1`。
  - [ ] V2：`agent_v2`。
- [ ] 若字段不足，补充字段：
  - [ ] `engineVersion`
  - [ ] `entrypoint`
  - [ ] `manifestVersionId`
  - [ ] `capabilityId`
  - [ ] `toolNames`
  - [ ] `fallbackPolicy`
  - [ ] `fallbackReason`
  - [ ] `contractStatus`
  - [ ] `latencyMs`
  - [ ] `costAmount`

### 5.2 后端序列化

- [ ] V1 run 创建时写入引擎标记。
- [ ] V2 run 创建时强制写入 `agent_v2`。
- [ ] V2 命中能力时记录：
  - [ ] `capabilityId`
  - [ ] `manifestVersion`
  - [ ] `toolNames`
  - [ ] `answerContract`
  - [ ] `policyDecision`
- [ ] V1 保留旧字段，但审计响应中补齐兼容字段。

### 5.3 验收

- [ ] Agent 运行列表能筛选 V1/V2。
- [ ] V2 run 不会显示成 V1。
- [ ] 旧历史数据不会查询报错。
- [ ] V2 未覆盖问题显示 `unsupported_capability`，不伪装成失败或 V1 兜底。

---

## 6. 阶段 4：V1/V2 对比中心

目标：让产品、研发、测试能回答“V2 是否真的比 V1 好，哪些能力可以切换”。

### 6.1 后端对比接口

- [ ] 新增 `POST /agent-management/compare/run`。
- [ ] 输入：
  - [ ] `message`
  - [ ] `storeId`
  - [ ] `role`
  - [ ] `personaCode?`
  - [ ] `entrypoint = compare`
  - [ ] `mode = single`
- [ ] 同题调用：
  - [ ] V1 `/agent/runs`
  - [ ] V2 `/agent-v2/runs`
- [ ] 输出：
  - [ ] V1 result。
  - [ ] V2 result。
  - [ ] 对比结论。
  - [ ] 差异项。
  - [ ] 迁移建议。

### 6.2 批量对比接口

- [ ] 新增 `POST /agent-management/compare/eval-batch`。
- [ ] 支持按以下条件筛选：
  - [ ] P0/P1/P2。
  - [ ] persona。
  - [ ] domain。
  - [ ] capabilityId。
  - [ ] system_supported_testable。
- [ ] 支持后台任务或分批执行。
- [ ] 输出报告：
  - [ ] V1 pass rate。
  - [ ] V2 pass rate。
  - [ ] V2 coverage。
  - [ ] V2 contract pass rate。
  - [ ] V1 better。
  - [ ] V2 better。
  - [ ] both failed。
  - [ ] v2_missing_capability。

### 6.3 前端页面

- [ ] 新建 `AgentVersionComparePage`。
- [ ] 单问题输入框。
- [ ] 左右双栏：
  - [ ] 左：V1 结果。
  - [ ] 右：V2 结果。
- [ ] 对比摘要条：
  - [ ] `v2_better`
  - [ ] `v1_better`
  - [ ] `same_quality`
  - [ ] `v2_missing_capability`
  - [ ] `v2_contract_failed`
  - [ ] `permission_gap`
  - [ ] `both_failed`
- [ ] 展示差异：
  - [ ] 命中能力。
  - [ ] 工具调用。
  - [ ] 数据来源。
  - [ ] 输出 blocks。
  - [ ] 权限与脱敏。
  - [ ] 耗时。
  - [ ] 费用。
- [ ] 操作按钮：
  - [ ] 生成 V2 能力草案。
  - [ ] 生成 Eval case。
  - [ ] 标记可灰度。
  - [ ] 标记暂不迁移。

### 6.4 验收

- [ ] 输入同一问题能同时得到 V1/V2 结果。
- [ ] V2 未命中能力时显示缺能力，不回退 V1。
- [ ] 对比结果可保存到报告。
- [ ] 可从对比结果跳转到 V1/V2 run 详情。

---

## 7. 阶段 5：Agent 运行审计升级

目标：把当前运行审计升级为 V1/V2 统一审计台。

### 7.1 列表升级

- [ ] 增加筛选项：
  - [ ] 引擎版本：全部 / V1 / V2。
  - [ ] 入口：admin / kiosk / api / eval / shadow / compare。
  - [ ] capabilityId。
  - [ ] manifestVersion。
  - [ ] contractStatus。
  - [ ] fallbackPolicy。
  - [ ] feedback。
- [ ] 列表字段：
  - [ ] 时间。
  - [ ] 用户问题。
  - [ ] 引擎版本。
  - [ ] Persona。
  - [ ] Capability。
  - [ ] Tool。
  - [ ] 状态。
  - [ ] 耗时。
  - [ ] 费用。
  - [ ] 用户反馈。

### 7.2 详情升级

- [ ] 分区展示：
  - [ ] 用户问题与最终回答。
  - [ ] 引擎版本与入口。
  - [ ] 路由 / 能力决策。
  - [ ] 工具调用链路。
  - [ ] 数据证据。
  - [ ] 输出契约 / 渲染 Blocks。
  - [ ] 权限与字段脱敏。
  - [ ] 错误与 fallback。
  - [ ] 用户反馈。
- [ ] 新增操作：
  - [ ] 生成 Eval case。
  - [ ] 生成 V2 capability draft。
  - [ ] 复制 run debug snapshot。
  - [ ] 加入回归关注。

### 7.3 验收

- [ ] V1/V2 run 都能在一个列表中查看。
- [ ] V2 run 详情能看到 Manifest、Tool、Contract、Policy。
- [ ] V1 run 详情能看到 Router、Planner、Skill/Tool。
- [ ] 从失败 run 能直接创建待办或草案。

---

## 8. 阶段 6：Agent 能力中心升级

目标：能力中心明确定位为 V2 能力发布与治理中心，V1 只作为只读对照。

### 8.1 页面结构

- [ ] 保留现有 `AgentCapabilityCenter`。
- [ ] 调整为以下 Tab：
  - [ ] V2 能力草案。
  - [ ] 已发布能力。
  - [ ] Manifest 版本。
  - [ ] Tool QueryKey。
  - [ ] 字段策略。
  - [ ] 权限与风险。
  - [ ] V1 对照能力。

### 8.2 V2 草案治理

- [ ] 草案列表支持筛选：
  - [ ] status。
  - [ ] domain。
  - [ ] riskLevel。
  - [ ] releaseStrategy。
  - [ ] permissionSource。
  - [ ] evalStatus。
- [ ] 草案详情展示：
  - [ ] capabilityId。
  - [ ] displayName。
  - [ ] domain。
  - [ ] businessObject。
  - [ ] executor / tool / queryKey。
  - [ ] examples / negativeExamples。
  - [ ] permissionCodes。
  - [ ] fieldPolicies。
  - [ ] outputKinds。
  - [ ] evidenceSources。
  - [ ] riskLevel。
  - [ ] releaseStrategy。
- [ ] 支持操作：
  - [ ] validate。
  - [ ] dry-run。
  - [ ] eval gate。
  - [ ] review。
  - [ ] publish。
  - [ ] post-publish smoke test。

### 8.3 V1 对照能力

- [ ] 只读展示 V1 capability / skill / tool。
- [ ] 展示对应 V2 capabilityId。
- [ ] 展示迁移状态：
  - [ ] 未映射。
  - [ ] 已映射。
  - [ ] shadow。
  - [ ] V2 优先。
  - [ ] V1 已退役。
- [ ] 不提供 V1 编辑入口。

### 8.4 验收

- [ ] V2 能力能从草案到发布形成闭环。
- [ ] V1 能力只能做对照，不继续扩大配置面。
- [ ] 发布前必须经过 validate、dry-run、eval gate。
- [ ] 高风险能力不能自动发布。

---

## 9. 阶段 7：Agent 评测中心

目标：把 Eval 从脚本和报告升级为产品能力回归中心。

### 9.1 后端评测接口

- [ ] 新增或聚合接口：
  - [ ] `GET /agent-management/evals/summary`
  - [ ] `GET /agent-management/evals/cases`
  - [ ] `POST /agent-management/evals/run`
  - [ ] `POST /agent-management/evals/compare`
  - [ ] `GET /agent-management/evals/reports`
- [ ] 支持读取：
  - [ ] V1 knowledge-map report。
  - [ ] V1 remaining-supported report。
  - [ ] V2 eval-gate report。
  - [ ] V2 capability governance report。

### 9.2 前端页面

- [ ] 总览：
  - [ ] V1 pass rate。
  - [ ] V2 pass rate。
  - [ ] P0 pass rate。
  - [ ] 失败趋势。
- [ ] 题库：
  - [ ] 650 题。
  - [ ] P0/P1/P2。
  - [ ] system_unsupported。
  - [ ] system_supported_agent_gap。
  - [ ] system_supported_testable。
- [ ] 失败分类：
  - [ ] route_error。
  - [ ] skill_missing。
  - [ ] tool_missing。
  - [ ] wrong_intent。
  - [ ] missing_output_kind。
  - [ ] missing_evidence。
  - [ ] permission_error。
  - [ ] runtime_error。
  - [ ] contract_failed。
- [ ] 操作：
  - [ ] 运行单条。
  - [ ] 批量运行。
  - [ ] 生成能力草案。
  - [ ] 生成回归 case。

### 9.3 验收

- [ ] 能在页面上看到 V1/V2 评测差异。
- [ ] P0 失败可阻断 V2 能力发布。
- [ ] 失败问题能闭环到能力草案或 Eval case。

---

## 10. 阶段 8：知识图谱治理页面

目标：让 SchemaGraph、数据字典、业务对象字典、能力关联和治理扫描可视化。

### 10.1 页面结构

```text
知识图谱治理
├─ 数据图谱
├─ 业务对象字典
├─ 字段字典
├─ 能力关联
└─ 治理扫描
```

### 10.2 数据图谱

- [ ] 展示 Prisma model 数量。
- [ ] 展示模型关系。
- [ ] 支持按模型搜索。
- [ ] 支持查看字段、关系、来源。
- [ ] 标记 Agent 必查对象、证据对象、内部对象。

### 10.3 业务对象字典

- [ ] 展示 BusinessObjectCatalog。
- [ ] 每个业务对象展示：
  - [ ] displayName。
  - [ ] sourceModels。
  - [ ] evidenceSourceModels。
  - [ ] queryableFields。
  - [ ] displayFields。
  - [ ] supportedActions。
  - [ ] governanceNote。

### 10.4 字段字典

- [ ] 字段中文名。
- [ ] 字段类型。
- [ ] 敏感级别。
- [ ] 脱敏策略。
- [ ] 枚举中文名。
- [ ] 指标口径。

### 10.5 能力关联

- [ ] 展示每个 Capability 依赖哪些业务对象。
- [ ] 展示每个业务对象被哪些 V1/V2 能力使用。
- [ ] 标记孤立对象：
  - [ ] 有数据对象但无能力。
  - [ ] 有能力但无 Eval。
  - [ ] 有 API 但无 Agent 工具。

### 10.6 治理扫描

- [ ] 展示最新 scan 结果：
  - [ ] missingBusinessObjectMappings。
  - [ ] missingDisplayNames。
  - [ ] missingSkillMappings。
  - [ ] missingToolRegistryMappings。
  - [ ] missingEvalCases。
  - [ ] highRiskApprovalGaps。
- [ ] 支持生成草案：
  - [ ] capability draft。
  - [ ] eval draft。
  - [ ] field display draft。

### 10.7 验收

- [ ] 新增 Prisma model 后能在治理页面提示缺映射。
- [ ] 新增字段缺中文名能提示。
- [ ] 能看出某个 V2 capability 依赖哪些表和字段。
- [ ] 能从治理缺口跳转到能力中心草案。

---

## 11. 阶段 9：智能体工作台与灰度策略

目标：普通用户只用一个入口，后台按策略选择 V1/V2。

### 11.1 工作台改造

- [ ] 页面标题统一为“洞悉美业智能体”或“智能体工作台”。
- [ ] 默认不显示 V1/V2 选择。
- [ ] 回答卡片保留“由 X Agent 处理”。
- [ ] 管理员 debug 模式显示：
  - [ ] 引擎选择：自动 / V1 / V2 / V1+V2 对比。
  - [ ] capabilityId。
  - [ ] toolNames。
  - [ ] contractStatus。
  - [ ] runId。
  - [ ] 跳转审计详情。

### 11.2 灰度策略

- [ ] 新增策略配置：
  - [ ] `v1_only`
  - [ ] `shadow`
  - [ ] `v2_preferred`
  - [ ] `v2_only`
  - [ ] `legacy_retired`
- [ ] 支持按维度配置：
  - [ ] capabilityId。
  - [ ] personaCode。
  - [ ] storeId。
  - [ ] entrypoint。
  - [ ] riskLevel。
- [ ] V2 未覆盖时策略：
  - [ ] `v2_only`：返回缺能力。
  - [ ] `v2_preferred`：可按配置显式回退 V1。
  - [ ] `shadow`：用户拿 V1，后台跑 V2。

### 11.3 验收

- [ ] 普通用户看不到 V1/V2 技术选择。
- [ ] 管理员可以强制 V1、V2、V1+V2 对比。
- [ ] 每次选择结果写入审计。
- [ ] shadow 模式不会影响用户答案。

---

## 12. 阶段 10：自动化与审批归并

目标：把 Agent 自动化任务、草稿、审批、执行结果纳入 Agent 管理。

### 12.1 页面内容

- [ ] 自动化任务列表。
- [ ] 待审批动作。
- [ ] 高风险动作草稿。
- [ ] 执行历史。
- [ ] 自动化效果。
- [ ] 关联 run。

### 12.2 V1/V2 关系

- [ ] V1 自动化继续兼容。
- [ ] V2 高风险能力必须进入审批。
- [ ] 审批详情展示：
  - [ ] 引擎版本。
  - [ ] capabilityId。
  - [ ] riskLevel。
  - [ ] action preview。
  - [ ] evidence。
  - [ ] policy decision。

### 12.3 验收

- [ ] 高风险 V2 action draft 不会绕过审批。
- [ ] 审批动作能追溯到 Agent run。
- [ ] 审批通过/拒绝能写入审计。

---

## 13. 阶段 11：AI 调用审计与数字员工账单

目标：区分 Agent 业务质量审计和底层模型调用审计，同时支持费用归因。

### 13.1 AI 调用审计

- [ ] 统计模型调用。
- [ ] 统计 Token。
- [ ] 统计耗时。
- [ ] 统计错误。
- [ ] 按引擎版本、入口、模型、门店筛选。
- [ ] 支持关联 AgentRun。

### 13.2 数字员工账单

- [ ] 展示门店维度费用。
- [ ] 展示 V1/V2 费用拆分。
- [ ] 展示能力维度费用。
- [ ] 展示用量趋势。
- [ ] 支持导出账单。

### 13.3 验收

- [ ] 能回答“这个月 V2 花了多少钱”。
- [ ] 能回答“哪个能力调用成本最高”。
- [ ] 能从账单跳转到相关 Agent run。

---

## 14. 阶段 12：后端 API 汇总

建议新增聚合模块：`agent-management`。

### 14.1 Controller

- [ ] `AgentManagementController`
- [ ] `GET /agent-management/overview`
- [ ] `POST /agent-management/compare/run`
- [ ] `POST /agent-management/compare/eval-batch`
- [ ] `GET /agent-management/runs`
- [ ] `GET /agent-management/runs/:id`
- [ ] `GET /agent-management/evals/summary`
- [ ] `POST /agent-management/evals/run`
- [ ] `GET /agent-management/knowledge/summary`
- [ ] `GET /agent-management/knowledge/business-objects`
- [ ] `GET /agent-management/knowledge/fields`
- [ ] `GET /agent-management/knowledge/capability-links`
- [ ] `GET /agent-management/billing/summary`

### 14.2 Service

- [ ] `AgentManagementOverviewService`
- [ ] `AgentVersionCompareService`
- [ ] `AgentUnifiedAuditService`
- [ ] `AgentEvalDashboardService`
- [ ] `AgentKnowledgeGovernanceDashboardService`
- [ ] `AgentBillingSummaryService`

### 14.3 DTO / Types

- [ ] `AgentEngineVersion = agent_v1 | agent_v2`
- [ ] `AgentCompareRequest`
- [ ] `AgentCompareResult`
- [ ] `AgentCompareConclusion`
- [ ] `AgentManagementOverview`
- [ ] `AgentRunAuditListItem`
- [ ] `AgentKnowledgeGovernanceSummary`
- [ ] `AgentEvalDashboardSummary`
- [ ] `AgentBillingSummary`

---

## 15. 阶段 13：前端文件建议

### 15.1 API

- [ ] `src/api/agentManagement.ts`
- [ ] `src/api/real/agentManagement.ts`
- [ ] `src/types/agentManagement.ts`

### 15.2 页面

- [ ] `src/app/pages/agent-management/AgentManagementLayout.tsx`
- [ ] `src/app/pages/agent-management/AgentManagementOverview.tsx`
- [ ] `src/app/pages/agent-management/AgentWorkbench.tsx`
- [ ] `src/app/pages/agent-management/AgentVersionCompare.tsx`
- [ ] `src/app/pages/agent-management/AgentRunAudit.tsx`
- [ ] `src/app/pages/agent-management/AgentEvalCenter.tsx`
- [ ] `src/app/pages/agent-management/AgentKnowledgeGovernance.tsx`
- [ ] `src/app/pages/agent-management/AgentAutomationApproval.tsx`
- [ ] `src/app/pages/agent-management/AgentAiAudit.tsx`
- [ ] `src/app/pages/agent-management/AgentBilling.tsx`

### 15.3 组件

- [ ] `AgentEngineBadge`
- [ ] `AgentRunStatusBadge`
- [ ] `AgentCapabilityBadge`
- [ ] `AgentCompareSplitView`
- [ ] `AgentEvidencePanel`
- [ ] `AgentToolTrace`
- [ ] `AgentContractStatus`
- [ ] `AgentEvalFailureTag`
- [ ] `AgentMigrationStatusTag`
- [ ] `AgentCostSummaryCard`

---

## 16. 阶段 14：测试计划

### 16.1 后端单测

- [ ] `agent-management-overview.service.spec.ts`
- [ ] `agent-version-compare.service.spec.ts`
- [ ] `agent-unified-audit.service.spec.ts`
- [ ] `agent-eval-dashboard.service.spec.ts`
- [ ] `agent-knowledge-governance-dashboard.service.spec.ts`
- [ ] `agent-billing-summary.service.spec.ts`

### 16.2 后端重点用例

- [ ] V1 run 可被审计列表查询。
- [ ] V2 run 可被审计列表查询。
- [ ] V1/V2 同题对比能返回双结果。
- [ ] V2 未命中能力时不隐式回退 V1。
- [ ] shadow 模式只记录 V2 对比，不影响用户答案。
- [ ] 高风险 V2 能力必须进入审批。
- [ ] P0 eval 失败阻断 V2 发布。

### 16.3 前端单测

- [ ] Agent 管理菜单显示。
- [ ] 权限不足隐藏治理页面。
- [ ] 总览 KPI 正常渲染。
- [ ] V1/V2 对比双栏渲染。
- [ ] 审计列表按引擎筛选。
- [ ] 能力中心 Tab 正常切换。
- [ ] 知识图谱治理缺口列表正常渲染。

### 16.4 E2E

- [ ] 管理员进入 Agent 管理总览。
- [ ] 输入问题跑 V1/V2 对比。
- [ ] 从对比结果进入 V2 run 详情。
- [ ] 从失败结果生成能力草案。
- [ ] 运行 V2 dry-run 和 eval gate。
- [ ] 普通店长进入智能体工作台，看不到 V1/V2 调试控件。

---

## 17. 阶段 15：验收命令

按实际改动选择执行，完整验收建议：

```powershell
npm.cmd --prefix packages/server-v2 test -- agent-v2-capability-decision.service.spec.ts agent-v2-runtime.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run build
npm.cmd run test -- AgentCapabilityCenter
npm.cmd run test -- AgentManagement
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

如新增 Playwright：

```powershell
npx.cmd playwright test -c playwright.config.ts e2e/agent-management.spec.ts
```

---

## 18. 发布与灰度验收

### 18.1 发布前

- [ ] V1 旧入口可用。
- [ ] V2 新入口可用。
- [ ] 管理端 Agent 管理菜单可见。
- [ ] 普通用户不暴露 V1/V2 复杂度。
- [ ] 管理员可进行 V1/V2 对比。
- [ ] V2 能力中心发布链路可用。
- [ ] Eval gate 可执行。

### 18.2 灰度中

- [ ] 按门店开启 shadow。
- [ ] 观察 7 天 V2 覆盖率。
- [ ] 观察 V2 用户有用率。
- [ ] 观察 V2 平均耗时。
- [ ] 观察 V2 失败分类。
- [ ] 将 `v2_better` 能力切到 `v2_preferred`。

### 18.3 退役评估

- [ ] 某领域 V2 连续 2-4 周通过率高于 V1。
- [ ] 用户有用率不低于 V1。
- [ ] 平均耗时不显著高于 V1。
- [ ] 高风险能力审批完整。
- [ ] 该领域 V1 标记 `legacy_retired`。
- [ ] 保留回滚开关。

---

## 19. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 当前工作区脏文件过多 | 容易混入无关改动 | 阶段 0 必须冻结基线 |
| V1/V2 运行记录字段不统一 | 审计和对比困难 | 先统一 run audit DTO |
| V2 覆盖不足 | 用户认为 V2 更差 | 使用 shadow 和 v2_preferred，不直接全量切换 |
| 能力中心过于研发化 | 产品经理难以治理 | 草案详情增加业务解释、风险、示例问题 |
| 普通用户看到技术复杂度 | 使用困惑 | 工作台默认隐藏引擎选择 |
| Eval 与真实用户问题脱节 | 回归价值下降 | 从反馈和失败 run 生成 Eval case |
| 高风险动作绕过审批 | 业务风险 | V2 Policy Gateway + 发布门禁强制拦截 |

---

## 20. 建议优先级

### P0：必须先做

- [ ] 阶段 0：开工保护与现状冻结。
- [ ] 阶段 1：Agent 管理一级菜单。
- [ ] 阶段 3：运行记录引擎版本统一。
- [ ] 阶段 4：V1/V2 单问题对比。
- [ ] 阶段 5：运行审计按引擎筛选。

### P1：尽快做

- [ ] 阶段 2：Agent 管理总览。
- [ ] 阶段 6：能力中心升级。
- [ ] 阶段 7：评测中心。
- [ ] 阶段 9：工作台灰度策略。

### P2：持续治理

- [ ] 阶段 8：知识图谱治理页面。
- [ ] 阶段 10：自动化与审批归并。
- [ ] 阶段 11：AI 调用审计与数字员工账单。
- [ ] 阶段 18：退役评估。

---

## 21. 最终交付口径

本计划完成后，Agent 管理模块应能回答以下问题：

- [ ] 今天 Agent 运行整体是否健康？
- [ ] 现在用户问题到底由 V1 还是 V2 回答？
- [ ] 同一个问题 V1 和 V2 谁答得更好？
- [ ] V2 哪些能力已经可以灰度切换？
- [ ] V1 哪些能力应该保留、迁移或退役？
- [ ] V2 哪些能力缺工具、缺权限、缺字段策略、缺 Eval？
- [ ] Agent 答错后如何进入能力治理闭环？
- [ ] 新增业务对象或 API 后，Agent 是否自动发现治理缺口？
- [ ] 每个门店的 Agent 使用费用是多少？
