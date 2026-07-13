# Agent 知识治理周报

生成时间：2026-07-02T09:11:52.914Z

## 总览

- 门禁状态：通过
- 阻断项：0
- 提醒项：4
- P0 通过率：100%
- P0 失败数：0
- BusinessObjectCatalog 缺口：99
- 字段中文名缺口：66
- SkillRegistry 暴露缺口：29
- Eval 覆盖缺口：8
- legacy fallback 命中：0

## Agent 能力缺口

- [P1] skill_exposure_missing: automation_execution_summary，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: business_anomaly_alert，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: business_overview，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: card_expiry_risk，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: card_usage_analysis，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: customer_card_benefit_summary，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: customer_churn_risk，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: customer_growth_opportunity，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: customer_profile_lookup，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: customer_reservation_today，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: finance_cashflow_summary，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: finance_order_lookup，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: finance_today_transaction_list，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: inventory_alert，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: marketing_activity_link_lookup，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: marketing_activity_list，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: marketing_conversion，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: member_balance_analysis，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: member_card_lookup，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: multi_store_comparison，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: product_customer_distribution，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: product_replenishment_opportunity，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: product_sales_trend，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: project_material_margin，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: project_service_trend，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: reservation_today，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: schedule_utilization，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: staff_performance，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] skill_exposure_missing: supplier_purchase_advice，CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。
- [P1] eval_case_missing: automation_execution_summary，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: business_anomaly_alert，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: business_overview，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: member_balance_analysis，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: multi_store_comparison，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: product_customer_distribution，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: product_sales_trend，已实现能力缺少 Eval 覆盖，后续改动容易回归。
- [P1] eval_case_missing: project_material_margin，已实现能力缺少 Eval 覆盖，后续改动容易回归。

## 业务字典候选

- [P2] business_object_mapping: AgentApproval，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentAutomationEffect，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentDailyArchive，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentDefinition，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentEvalCase，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentEvalRun，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentFeedback，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentMemory，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentMessage，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentPersona，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentRenderedBlock，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentStep，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AgentToolCall，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AiAuditLog，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AmiGlowDisplayConfig，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AmiMonthlyBill，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AmiPerformanceRecord，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AppointmentGapCandidate，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AppointmentGapOpportunity，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: AppointmentGapOpportunityEvent，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: BeauticianAvailability，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: BeauticianLevel，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: BeauticianProjectSkill，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: BeauticianTimeOff，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: Card，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: CashierShift，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: Category，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CommissionRecord，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CommissionRule，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CommissionRuleAssignment，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CommissionSettlement，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CommissionSettlementRecord，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: ConsumptionRecord，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerAppEvent，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerAppIdentity，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerBalanceAccount，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerBalanceTransaction，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerBehaviorEvent，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerHealthProfile，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: CustomerPredictionSnapshot，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P1] business_object_mapping: DailySettlement，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryAdoptionRecord，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryDataSource，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryEvidence，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryKnowledgeItem，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryProductTemplate，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryProjectBomItemTemplate，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryProjectBomTemplate，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustrySalaryBenchmark，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。
- [P2] business_object_mapping: IndustryServiceTemplate，Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。

## Eval 失败 Top

- 无

## Legacy Fallback

- 运行态统计：可用
- 扫描运行数：191
- fallback 运行数：0

### Top Reason

- 无

### 废弃候选

- business_query_capability_missing: latest=0, previous=0, action=move_to_deprecated_candidate
- business_query_capability_not_implemented: latest=0, previous=0, action=move_to_deprecated_candidate
- business_query_role_not_allowed: latest=0, previous=0, action=move_to_deprecated_candidate
- business_task_preparser_no_executable_plan: latest=0, previous=0, action=move_to_deprecated_candidate
- business_task_preparser_unavailable: latest=0, previous=0, action=move_to_deprecated_candidate
- capability_confidence_below_threshold: latest=0, previous=0, action=move_to_deprecated_candidate
- capability_not_found: latest=0, previous=0, action=move_to_deprecated_candidate
- legacy_fallback: latest=0, previous=0, action=move_to_deprecated_candidate
- legacy_rule_fallback: latest=0, previous=0, action=move_to_deprecated_candidate
- required_entity_not_resolved: latest=0, previous=0, action=move_to_deprecated_candidate

## Review Checklist

- 确认 P0 阻断项为 0；如不为 0，先修复再发布。
- 按 P1 优先级确认 BusinessObjectCatalog 与字段中文名候选。
- 补齐 SkillRegistry 暴露缺口和 Eval 覆盖缺口。
- 复核前端页面候选是否需要 Agent 能力入口。
- 复核 legacy fallback 废弃候选，确认无保留价值后进入清理计划。
