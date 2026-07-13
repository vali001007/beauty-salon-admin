# Agent V5 美业全业务 Ontology 经营 Agent 开发记录

> 日期：2026-07-08
> 对应需求：`docs/02-产品设计/01-AI智能体与问数能力/Agent V5美业全业务Ontology经营Agent需求文档-2026-07-08.md`
> 对应计划：`docs/03-开发计划/01-AI智能体与问数能力/Agent V5美业全业务Ontology经营Agent独立开发计划-2026-07-08.md`

## 1. 本轮交付结论

已完成 Agent V5 P0 独立版本开发。

交付口径：

- 后端新增独立 `agent-v5` 模块。
- API 独立为 `/agent-v5/*`。
- 运行审计独立写入 `AgentRun.agentCode = agent_v5`。
- 管理端 Ami Agent 支持选择 Agent V5。
- Ami Aura Lite 终端支持选择 Agent V5。
- V5 可复用 V3 只读问数、V4 生命周期服务和现有业务表，但只通过 V5 adapter 调用底层 service。
- V5 不递归调用 `/agent-v2/*`、`/agent-v3/*`、`/agent-v4/*`，不调用旧版本 orchestrator。

## 2. 后端实现

新增目录：

```text
packages/server-v2/src/agent-v5/
```

核心文件：

- `agent-v5.module.ts`
- `agent-v5.controller.ts`
- `agent-v5-orchestrator.service.ts`
- `agent-v5.types.ts`
- `ontology/business-ontology.registry.ts`
- `ontology/agent-v5-semantic-router.service.ts`
- `ontology/agent-v5-context-builder.service.ts`
- `ontology/agent-v5-evidence-pack.service.ts`
- `ontology/agent-v5-constraint-guard.service.ts`
- `adapters/agent-v5-readonly-query.adapter.ts`
- `adapters/agent-v5-lifecycle.adapter.ts`
- `adapters/agent-v5-business-tool.adapter.ts`
- `adapters/agent-v5-governance.adapter.ts`
- `adapters/agent-v5-legacy-tool.adapter.ts`
- `eval/agent-v5-failure-diagnosis.service.ts`

新增接口：

- `POST /agent-v5/runs`
- `POST /agent-v5/runs/:id/messages`
- `GET /agent-v5/runs`
- `GET /agent-v5/runs/:id`
- `GET /agent-v5/runs/:id/detail`

已注册：

- `AgentV5Module` 已接入 `packages/server-v2/src/app.module.ts`。

## 3. V5 Ontology Router

当前 P0 支持的意图：

- `business_overview`：门店经营概览。
- `readonly_query`：事实问数，复用 V3 受控 Text-to-SQL 服务。
- `lifecycle_diagnosis`：客户生命周期机会诊断。
- `business_plan`：经营计划草稿。
- `submit_business_plan`：经营计划提交审批。
- `attribution_review`：生命周期归因复盘。
- `quality_review`：本体质量和规则治理解释。
- `inventory_risk`：库存风险诊断。
- `finance_margin`：收入和毛利轻量诊断。
- `reservation_coordination`：预约和排班协同。
- `failure_diagnosis`：答不上、无数据、能力缺口诊断。

## 4. Adapter 边界

V5 adapter 复用底层能力，但不复用旧 Agent 入口。

| Adapter | 复用对象 | 边界 |
| --- | --- | --- |
| `AgentV5ReadonlyQueryAdapter` | `AgentV3ControlledTextToSqlService` | 只复用 V3 问数服务，不创建 `agent_v3` run |
| `AgentV5LifecycleAdapter` | `MarketingService` lifecycle methods | 复用生命周期本体服务，不调用 V4 orchestrator |
| `AgentV5BusinessToolAdapter` | Prisma 业务表 | 做轻量经营、库存、预约、财务事实汇总 |
| `AgentV5GovernanceAdapter` | V5 failure diagnosis | 解释缺数据、缺能力、缺权限、工具失败 |
| `AgentV5LegacyToolAdapter` | 无 | 显式阻断直接调用旧版本入口 |

## 5. 风险控制

`AgentV5ConstraintGuardService` 已阻断以下动作：

- 自动发券。
- 自动群发。
- 直接改客户资产。
- 直接扣库存。
- 直接创建订单。
- 直接改排班。
- 直接确认退款。

经营计划和动作提交仅进入草稿或审批链路。

## 6. 管理端实现

新增：

- `src/api/real/agentV5.ts`
- `src/api/agentV5.ts`

更新：

- `src/api/index.ts` 导出 V5 API。
- `src/app/pages/ami-agent/AmiAgentWorkspace.tsx` 增加 Agent V5 runtime。

管理端行为：

- V5 运行走 `createAgentV5Run`、`appendAgentV5Message`。
- V5 审计列表和详情走 `/agent-v5/runs`。
- V5 模式下展示“生成 V5 经营计划”入口。
- V1/V2/V3/V4 入口保持原行为。

## 7. 终端实现

更新：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/TopStatusBar.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/components/AgentMessageItem.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`

终端行为：

- 顶部版本选择增加 V5。
- 终端 V5 上下文带 `architecture = agent_v5_business_ontology_agent`。
- 终端 V5 创建和追加消息走 Agent V5 API。
- 终端 V5 仍只允许诊断、建议、草稿和审批，不绕过风险控制。

## 8. 测试与验证

已运行并通过：

```powershell
npm.cmd --prefix packages/server-v2 run test -- agent-v5-orchestrator.service.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run build
npx.cmd vitest run src/test/api.test.ts
npx.cmd vitest run packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.auth.test.ts
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

验证覆盖：

- V5 创建独立 `agent_v5` run。
- 生命周期问题走 V5 lifecycle adapter。
- 事实问数复用 V3 受控 Text-to-SQL 服务，但不创建 `agent_v3` run。
- 经营计划创建和提交审批均携带 `sourceAgentCode = agent_v5`。
- 全业务经营概览走 V5 business tool adapter，不触发 V4 生命周期入口。
- 管理端 API facade 正确导出和路由 `/agent-v5/*`。
- 终端选择 `agent_v5` 后走 V5 API，并带 V5 architecture context。

## 9. 未纳入本轮

以下留到 V5 后续阶段：

- 650 题全量评测重新跑分。
- V5 专属治理中心页面。
- V5 ontology 可视化编辑器。
- 更细的财务毛利成本拆解。
- 员工业绩、供应链、客资增长等更多业务域专用 adapter。
- V2 能力治理数据的深度复用和发布门禁联动。
- 真实 LLM 语义路由，目前 P0 先采用规则化 ontology router。

## 10. 验收建议

建议按以下业务问题做人工验收：

1. 在管理端 Agent V5 问：`今天店里情况怎么样`。
2. 在管理端 Agent V5 问：`本月销量最高的商品排行`。
3. 在管理端 Agent V5 问：`本周哪些客户该触达，为什么`。
4. 在管理端 Agent V5 点击或提问：`生成本周经营计划`。
5. 在管理端 Agent V5 问：`提交经营计划 61 审批`，将 `61` 替换为实际计划 ID。
6. 在终端选择 V5 后问：`今天店里情况怎么样`。

验收重点：

- 审计中的 `agentCode` 必须是 `agent_v5`。
- 结果证据中必须能看到 V5 architecture。
- 问数结果允许标记 `readOnlyVia = agent_v3_text_to_sql_service`，但不能生成 `agent_v3` run。
- 经营动作只能生成草稿或审批，不能直接执行高风险业务写入。
