# Agent V2 旧正则依赖边界审计

生成时间：2026-07-06 07:51:32 Asia/Shanghai

## 结论

- 通过：是
- 阻塞项：0
- 旧 isXxx 谓词数量：33
- 生产引用文件数：3
- 建议：旧正则依赖边界已完成本地审计：保留为 legacy/shadow/kg_llm_preferred 回退和退役前对照，不作为 kg_llm_only 或 legacy_retired 正式选择路径。旧正则仍不可删除，需等待生产证据。

## 检查文件

- runtime: `packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts`
- runtimeSpec: `packages/server-v2/src/agent-v2/agent-v2-runtime.service.spec.ts`
- module: `packages/server-v2/src/agent-v2/agent-v2.module.ts`
- legacyDecision: `packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts`
- evalGateReport: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json`
- diffAttributionReport: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-diff-attribution.json`
- retirementPreflight: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-preflight.json`

## 门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| 旧 CapabilityDecisionService 只在允许的生产边界被引用 | 通过 | 生产代码引用仅限 runtime、module 和 service 自身；测试引用不计入生产边界 | packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts, packages/server-v2/src/agent-v2/agent-v2.module.ts, packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts | 避免旧正则被新的正式能力选择链路、工具或治理 API 重新直接依赖。 |
| 旧 isXxx 正则谓词不再继续扩张 | 通过 | 谓词数量 <= 33 | 33 predicates: isCardFreeVsPaidBehaviorQuestion, isCardInactiveCustomerQuestion, isCardPackageOrderQuestion, isCardPackageSalesMetricQuestion, isCardPackageStatusQuestion, isCardUsageQuestion, isCashierPaymentQuestion, isCommissionCostOptimizationQuestion, ... | 旧规则未删除前允许保留审计对象，但不能再把新能力继续写进旧正则。 |
| `kg_llm_only` / `legacy_retired` 正式路径不返回旧正则决策 | 通过 | preferred 分支之后的默认返回使用 KG decision，finalEngine=kg_llm | kg decision finalEngine present | 最终接管模式下，能力选择来自 KG/LLM + Manifest，不从旧 `isXxx` 正则取正式结果。 |
| `kg_llm_preferred` 的旧链路回退有显式原因和架构标签 | 通过 | 回退原因包含 legacy_high_confidence_disagreement / kgFallbackReason，架构标记 agent_v2_legacy_fallback | disagreement_reason=present, kg_fallback_reason=present, architecture=present | 回退不是隐形正式路径，运行审计和治理中心能识别这是旧链路兜底。 |
| shadow 模式返回旧链路但记录 KG 对照 | 通过 | shadow 分支有 fallbackReason=shadow_mode_returns_legacy_decision，并记录 kg/legacy capabilityId | shadow trace present | shadow 仍是对照观察，不代表新架构正式接管。 |
| 运行时测试覆盖 KG 正式路径、旧链路回退和 shadow 对照 | 通过 | spec 覆盖 KG preferred、legacy fallback、shadow returning legacy | kg_preferred=present, fallback=present, shadow=present | 后续改 runtime 时，测试能捕捉旧链路边界被误改的问题。 |
| 离线 strict gate 中 kg_llm_preferred 回退旧链路率为 0 | 通过 | `preferredLegacyFallbackRate.value === 0` | value=0, numerator=0, denominator=515 | 本地评测口径下，新架构优先路径没有依赖旧正则完成 P0/P1 能力选择。 |
| KG-only 与 legacy 差异归因没有 KG 待修项 | 通过 | `safeToRetireByAttribution=true` 且 `needsKgFix=0` | safe=true, needsKgFix=0, diffTotal=21 | 差异主要体现旧链路缺口，不是新链路需要回退旧正则才能正确。 |
| 旧正则仍被生产证据门禁阻止删除 | 通过 | localPreflightPass=true，retirementReady=false，productionEvidenceBlockers>0 | local=true, ready=false, productionBlockers=5 | 本地审计通过不等于可删除旧正则；生产 7 天 shadow/有用率/回滚证据仍是硬门槛。 |

## 旧 isXxx 谓词清单

- `isCardFreeVsPaidBehaviorQuestion`
- `isCardInactiveCustomerQuestion`
- `isCardPackageOrderQuestion`
- `isCardPackageSalesMetricQuestion`
- `isCardPackageStatusQuestion`
- `isCardUsageQuestion`
- `isCashierPaymentQuestion`
- `isCommissionCostOptimizationQuestion`
- `isCouponRedemptionMetricQuestion`
- `isCustomerConsumptionQuestion`
- `isCustomerCouponStatusQuestion`
- `isDailySettlementQuestion`
- `isDiscountPermissionRiskQuestion`
- `isExpiringRiskQuestion`
- `isFinanceRiskDiagnosticsQuestion`
- `isInventoryOperationDraft`
- `isMemberCardOrderQuestion`
- `isMultiDomainSummaryQuestion`
- `isNavigationCardUsageQuestion`
- `isNavigationCashierQuestion`
- `isOrderDetailLookupQuestion`
- `isOverallGrossMarginMetricQuestion`
- `isPaymentChannelFeeMetricQuestion`
- `isPaymentMethodMetricQuestion`
- `isProductGrossProfitMetricQuestion`
- `isProductOrderQuestion`
- `isProjectGrossProfitMetricQuestion`
- `isProjectOrderQuestion`
- `isRefundMetricQuestion`
- `isRevenueTrendQuestion`
- `isScrapRecordQuestion`
- `isStaffCommissionMetricQuestion`
- `isStaffCommissionRecordQuestion`

## 生产引用边界

- `packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts`: 3, 42, 132, 156, 163, 247, 254, 403, 427
- `packages/server-v2/src/agent-v2/agent-v2.module.ts`: 14, 61, 86
- `packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts`: 13

## 边界

- 本审计只读取本地源码和报告，不连接生产数据库，不调用生产 API。
- 通过只证明旧正则依赖边界清晰；不代表旧正则已经可以删除。
