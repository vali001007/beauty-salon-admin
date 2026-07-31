# 洞悉美业 Agent 阶段 0 基线报告

日期：2026-06-27
关联计划：`docs/03-开发计划/洞悉美业_Agent详细开发计划.md`
阶段目标：建立当前 Agent 链路、问题基线和 P0 高频问答评测集，不改变业务运行逻辑。

---

## 1. 当前链路基线

### 1.1 前端入口

| 对象 | 文件 | 当前职责 |
|---|---|---|
| `/ami-agent` 工作台 | `src/app/pages/ami-agent/AmiAgentWorkspace.tsx` | 发起 Agent Run、展示对话、接收 `renderedBlocks` |
| Block 渲染 | `src/app/pages/ami-agent/components/AgentBlockRenderer.tsx` | 渲染 text、table、chart、kpi、action、evidence 等结构化块 |
| API facade | `src/api/real/agent.ts` | 调用后端 Agent API |
| 前端类型 | `src/types/agent.ts` | 定义 `AuraResponseBlock`、`AgentRunResult` 等结构 |

### 1.2 后端入口

| 对象 | 文件 | 当前职责 |
|---|---|---|
| Agent Controller | `packages/server-v2/src/agent/agent.controller.ts` | 暴露 run、tools、eval、business-task compile 等接口 |
| Agent Orchestrator | `packages/server-v2/src/agent/agent-orchestrator.service.ts` | 创建/追加 Run、调用 Planner、执行工具、生成 `renderedBlocks` |
| Agent Planner | `packages/server-v2/src/agent/agent-planner.service.ts` | 根据自然语言、BusinessTask、角色和工具列表生成 toolPlan |
| Tool Registry | `packages/server-v2/src/agent/agent-tool-registry.service.ts` | 注册并执行 Agent 工具，例如 `business.query.ask` |

### 1.3 业务任务与经营问数

| 对象 | 文件 | 当前职责 |
|---|---|---|
| BusinessTask PreParser | `packages/server-v2/src/agent/business-task/business-task-preparser.service.ts` | 用确定性规则识别领域、时间、指标、任务类型 |
| BusinessTask Compiler | `packages/server-v2/src/agent/business-task/business-task-compiler.service.ts` | 组合 LLM/PreParser/CapabilityRegistry 的业务任务编译结果 |
| Capability Registry | `packages/server-v2/src/agent/capabilities/capability-registry.service.ts` | 将 BusinessTask 映射到 Agent 工具计划 |
| Business Query Service | `packages/server-v2/src/business-query/business-query.service.ts` | 执行受控经营问数，当前包含营收、库存、预约、客户增长等能力 |
| Business Query Capabilities | `packages/server-v2/src/business-query/business-query.capabilities.ts` | 经营问数能力清单 |

---

## 2. 当前问题基线

### 2.1 复现问题

用户问题：

> 昨天有哪些消费的客户，列出清单

阶段 0 原始链路倾向：

```text
用户自然语言
→ BusinessTaskPreParser
→ domain=customer 或 fallback business_query
→ BusinessQueryService legacyResolve
→ customer_growth_opportunity
→ 返回客户增长机会摘要
→ 前端只展示摘要/非清单
```

阶段 0 实际影响：

- 用户要“消费客户清单”，系统容易答成“高价值客户/复购承接建议”。
- 事实清单没有作为第一优先级输出。
- 当前没有独立的 `order.customer.consumption.list` Skill 或能力。
- 阶段 0 原始问题发生时，尚未有 Answer Contract 强制校验“清单类问题必须有表格”。

阶段 1 已修复：

- 已新增 `order_customer_consumption_list` 能力。
- 已将消费/成交/流水客户清单识别为订单域查询。
- 已实现基于有效订单的消费客户清单查询。
- 已让 Orchestrator 从 `card.kpis/card.items` 生成 KPI block 和 table block。
- 已接入 Answer Contract Validator 初版，清单类问题需具备 table/list 输出，数值类问题需具备 KPI 或明确数值。

### 2.2 根因拆解

| 根因 | 说明 | 后续修复阶段 |
|---|---|---|
| 业务对象识别偏差 | 同时出现“消费/客户”时，当前规则容易优先识别为客户域，而不是订单消费事件 | 阶段 1/3 |
| 缺少专用能力 | 原链路没有 `order_customer_consumption_list`，容易把消费客户清单误判为客户增长建议 | 阶段 1 已修复 |
| 输出契约缺失 | 用户要求“清单”时，原链路没有强制表格或列表 | 阶段 1 已修复初版 |
| eval 未覆盖 | 原默认 eval 没有把“消费客户清单”列为 P0 高频基线 | 阶段 0/1 已补齐 |

---

## 3. P0 评测基线

本阶段新增独立 P0 高频问答评测集：

- 文件：`packages/server-v2/src/agent/agent-eval.cases.ts`
- 导出：`P0_AGENT_EVAL_CASES`
- 运行服务：`AgentEvalService.runP0Cases()`
- 后端接口：`GET /api/agent/evals/p0`

### 3.1 P0 用例范围

| 场景 | 样例 | 当前基线预期 |
|---|---|---|
| 消费客户清单 | 昨天有哪些消费的客户，列出清单 | 已升级为 `order_customer_consumption_list` |
| 消费客户清单 | 昨日成交会员有哪些 | 已升级为 `order_customer_consumption_list` |
| 消费客户清单 | 上周流水客户名单 | 已升级为 `order_customer_consumption_list`，并支持 `last_week` 时间预设 |
| 营收问数 | 今天营收多少 | `business.query.ask` + `order_revenue_analysis`，输出 KPI + evidence |
| 预约清单 | 今天有哪些预约 | `reception.reservation.today` |
| 库存预警 | 哪些商品库存不足 | `inventory.risk.rank` |
| 客户生命周期 | 哪些客户今天最该回访 | 当前会命中 `beautician.repurchase.opportunity`，后续应统一收敛到客户生命周期 Skill |

### 3.2 P0 eval 当前门禁状态

阶段 0 已保留独立 P0 高频问答基线，并在阶段 1-3 后把关键未来预期升级为当前门禁。当前口径是：独立 P0 eval 必须 0 失败；默认 Eval 中保留代表性样本，避免大矩阵和高频专项重复膨胀。

阶段 1-3 已完成调整：

- [x] `p0-consumption-customer-list-*` 的 `expectedCapabilityId` 已改为 `order_customer_consumption_list`。
- [x] `expectedDomain` 已改为 `order`。
- [x] 增加输出契约断言：消费客户清单必须有 table + evidence。
- [x] `p0-revenue-kpi-*` 已改为 `order_revenue_analysis`，营收“多少/情况/表现”走 KPI 问数；“下降原因/异常/诊断”继续走收入诊断。
- [x] `agent-eval.service.spec.ts` 的测试编译器已接入 `AgentSkillsRegistryService`，确保 Eval 和真实 Skill-first 链路一致。
- [ ] `p0-customer-lifecycle-*` 后续继续从美容师复购机会收敛到店长视角的客户生命周期 Skill。

---

## 4. 阶段 0 交付清单

- [x] 梳理前端 `/ami-agent` 到后端 Agent Run 的调用链。
- [x] 梳理 Agent Planner、BusinessTask、BusinessQuery、Tool Registry 的边界。
- [x] 明确“消费客户清单答偏”的当前链路原因。
- [x] 新增 P0 独立评测集 `P0_AGENT_EVAL_CASES`。
- [x] 新增 P0 评测运行入口 `GET /api/agent/evals/p0`。
- [x] 跑通阶段 0 相关测试并记录结果。

验证结果：

- `npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts --runInBand`：通过，6 tests passed；默认 Eval 及 50 条 P0 高频问答基线均为 0 失败。
- `npm.cmd --prefix packages/server-v2 test -- agent-eval.service.spec.ts agent-skills.registry.spec.ts business-task-compiler.service.spec.ts agent-planner.service.spec.ts --runInBand`：通过，4 个测试套件、74 tests passed。
- `npm.cmd --prefix packages/server-v2 run build`：通过。
- `npm.cmd --prefix packages/server-v2 test -- agent-orchestrator.service.spec.ts --runInBand`：阶段 0 通过 21 tests；阶段 1 后通过 22 tests。
- `git diff --check`：通过；仅提示 Windows 下 LF/CRLF 换行转换 warning。

---

## 5. 下一阶段入口

阶段 1 当前状态：

1. [x] 新增 `order_customer_consumption_list` 能力。
2. [x] 实现订单消费客户清单查询。
3. [x] 增加独立 Answer Contract：清单类问题必须输出 table/list。
4. [x] 后端已支持对 `data.card.items` 的表格兜底渲染。
5. [x] 把 P0 消费客户清单 eval 从“当前基线预期”升级为“目标能力预期”。
6. [x] 前端页面真实问答与性能验证：消费客户清单约 1642ms 渲染表格，无 `Internal server error`。
