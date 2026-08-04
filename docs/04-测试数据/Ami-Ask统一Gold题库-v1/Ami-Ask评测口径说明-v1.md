# Ami Ask 统一评测口径说明 v1

- 查询 Gold：429 题
- 边界题：585 题
- 开发集/保留集：347/82
- 保留集比例：19.11%
- 题库 checksum：`14a9dbbf44b5f55f3553323556a3a9a1f65328d308d5a31253ae6cbac5a84e15`

## 判定原则

1. 以 expectedMetricKeys、requiredDimensions 和 requiredAnswerFacts 判定业务语义，不再只用唯一 expectedView。
2. acceptableViews 表示可接受的治理口径；requiredViews 表示必须同时覆盖的视图。
3. mustClarify 只允许 year、threshold、entity_identity、comparison_relation、comparison_baseline 和 time_point 六类治理槽位。
4. development 用于规则开发，holdout 不参与规则调优，只用于泛化验收。
5. 边界题不进入 SQL 准确率分母，单独计算分流正确率。

## 指标

- boundary accuracy：支持边界与分流是否正确。
- semantic plan accuracy：指标、维度、时间、筛选和答案形态是否正确。
- route recall@1/recall@4：允许视图是否进入候选。
- SQL execution rate：Guard 和数据库执行是否成功。
- answer completeness：requiredAnswerFacts 是否全部覆盖。
- factual grounding：数字和事实是否来自查询证据。

## 禁止事项

- 不把开发集 100% 当作泛化结论。
- 不重复分配同一问题给多个视图凑覆盖。
- 不把数据库执行成功当作最终回答正确。
- 不把 Brain、写操作、敏感字段和后台不支持题放入 Ask SQL 分母。
