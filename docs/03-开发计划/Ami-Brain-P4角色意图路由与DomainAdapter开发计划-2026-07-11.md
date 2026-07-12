# Ami Brain P4 角色意图路由与 Domain Adapter 开发计划

生成日期：2026-07-11

## 1. 目标

P4 目标是把 Ami Brain 从“指标问答 MVP”推进到“六角色都有真实回答边界的经营助手”。本阶段采用六域薄覆盖，不做单角色深闭环，不扩散关键词命中，而是先建立统一角色意图路由和 Domain Adapter 合同。

验收基线来自 P3 评测：真实可用 195/650，真实可用率 30.0%。P4 验收目标为真实可用率不低于 42.0%，即不少于 273/650；假阳性、时间退化全量、文案/动作误命中指标、跨门店读取、roleHint 绕权、假动作确认均为 0。

## 2. 实施范围

### 2.1 角色意图路由

- 新增 `BrainRoleIntentRouterService`。
- 输入用户问题、`roleHint` 和 runtime intent。
- 输出 `BrainRoleIntentPlan`，包含角色、业务域、意图、回答形态、adapterKey、最小权限、grounding 和置信度。
- 标准顺序为：先判断意图，再判断业务域；文案、活动、动作问题不得被“预约/流水”等关键词抢路由。
- scalar metric 问数保留语义问数 fallback，不被 adapter 抢占。

### 2.2 Domain Adapter 合同

- 新增 `BrainDomainAdapter`、`BrainDomainAnswer`、`BrainDomainAdapterRegistryService`。
- `BrainChatService` 主链路调整为：安全检查 -> 认知解析 -> runtime intent -> role intent route -> domain adapter -> 语义指标 fallback。
- adapter 元数据写入 `brainRun.output` 和 assistant message metadata，外部接口保持兼容。

### 2.3 六域薄覆盖

- 店长经营：经营概览、异常摘要、目标完成缺口识别。
- 前台接待：预约清单、员工忙闲看板、预约动作预览。
- 营销增长：预约提醒/召回文案、活动方案、客群摘要。
- 美容师服务：今日服务安排、客户注意事项、护理跟进建议。
- 库存采购：低库存、临期/过期、采购建议清单、处置建议。
- 财务风控：退款、优惠、毛利率和财务风险摘要。

共享层新增 `BrainCustomerFactResolverService`，为营销、前台、美容师、财务后续共用客户分层、沉睡客户、卡项余额等事实口径。

## 3. 安全与治理

- 每个 adapter 声明最小权限，由主链路统一校验。
- 所有新增数据读取使用 Prisma，不拼接用户输入到 raw SQL。
- P4 不新增真实写库动作；预约、采购、核销、群发等写操作只返回 preview action。
- 新增对抗样本覆盖英文 prompt injection、敏感字段导出、roleHint 越权、采购下单预览。
- 650 题报告新增 Adapter 分布，定位每个角色实际命中的 adapter。

## 4. 验证计划

必跑命令：

```powershell
npm.cmd --prefix packages/server-v2 run test -- brain-role-intent-router.service.spec.ts brain-domain-adapter-registry.service.spec.ts brain-domain-adapters.service.spec.ts brain-chat.service.spec.ts brain-security-eval-cases.spec.ts --runInBand
npm.cmd --prefix packages/server-v2 run test -- brain --runInBand
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
node --loader ts-node/esm packages/server-v2/prisma/ami-brain-eval.ts --store-id=6 --output-dir=docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-eval-run-2026-07-11-p4
```

评测报告必须包含：

- 总体真实可用率。
- 分角色真实可用率。
- Grounding 分布。
- Adapter 分布。
- 假阳性、时间退化全量、文案/动作误命中指标、安全绕过计数。

## 5. 实施结果

完成时间：2026-07-11

### 5.1 交付内容

- 已接入 `BrainRoleIntentRouterService`，主链路先判断角色、业务域、意图和回答形态，再进入 adapter 或 semantic metric fallback。
- 已接入 `BrainDomainAdapter` 合同、`BrainDomainAdapterRegistryService` 和六个 P4 domain adapter。
- 已接入共享 `BrainCustomerFactResolverService`，支持营销、前台、美容师、财务复用客户事实。
- `BrainChatService` 已改为安全检查 -> 认知解析 -> 角色意图路由 -> 权限校验 -> adapter 执行 -> 语义指标 fallback -> 落库。
- P4 不执行真实写库动作，写操作统一返回 preview action 或明确缺口。
- 评测 JSON 和报告已输出 role、domain、adapter、grounding 分布。

### 5.2 650 题验收结果

报告路径：

`D:\AI coding\beauty-salon-admin\docs\04-测试数据\Agent评测与知识治理-2026-06-30至07-03\ami-brain-eval-run-2026-07-11-p4\ami-brain-eval-report-2026-07-11.md`

| 验收项 | 目标 | 实际 | 结论 |
| --- | ---: | ---: | --- |
| 总体真实可用 | >=273/650, >=42.0% | 305/650, 46.9% | 通过 |
| 店长经营 | >=42/100 | 48/100 | 通过 |
| 前台接待 | >=30/100 | 31/100 | 通过 |
| 营销增长 | >=50/100 | 61/100 | 通过 |
| 美容师服务 | >=52/100 | 53/100 | 通过 |
| 库存采购 | >=38/100 | 40/100 | 通过 |
| 财务风控 | >=48/100 | 54/100 | 通过 |
| 边界/多轮 | >=13/50 | 18/50 | 通过 |
| 假阳性 | 0 | 0 | 通过 |
| 时间误退化全量 | 0 | 0 | 通过 |
| 文案/动作误命中指标 | 0 | 0 | 通过 |
| 跨门店读取 | 0 | 0 | 通过 |
| roleHint 绕权 | 0 | 0 | 通过 |
| 假动作确认 | 0 | 0 | 通过 |

Grounding 分布：

| Grounding | 数量 |
| --- | ---: |
| Metric Query | 10 |
| DB Skill | 204 |
| Template Skill | 88 |
| Preview Action | 3 |
| None | 345 |

Adapter 分布：

| Adapter | 数量 |
| --- | ---: |
| none | 357 |
| marketing_growth | 97 |
| finance_risk | 68 |
| beautician_service | 53 |
| inventory_procurement | 45 |
| front_desk | 26 |
| store_manager | 4 |

### 5.3 代码门禁

```powershell
npm.cmd --prefix packages/server-v2 run test -- brain --runInBand
# 32 test suites passed, 216 tests passed

npm.cmd --prefix packages/server-v2 run build
# passed

npm.cmd run build
# passed
```

## 6. P5 数据建模清单

P4 明确不伪造答案，以下口径识别后输出 domain 级缺口：

- 门店目标完成率：缺目标配置表、周期目标和责任人字段。
- 完整排班/床位空档：缺排班发布状态、床位占用、实时到店状态联合口径。
- 支付方式拆分：需要 PaymentRecord 聚合 adapter。
- 项目排行和项目趋势：需要 OrderItem itemType/itemId 口径治理。
- 营销 ROI：需要活动成本、触达、核销、归因收入统一口径。
- 采购单真实创建：需要写操作确认、审批、库存供应商链路闭环。
