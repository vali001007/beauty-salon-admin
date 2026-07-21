# Ami Brain 标量问数与多轮澄清专项验收报告

## 验收范围

- 工作区：2026-07-17 当前 Ami Brain
- 候选发布：`286 / ami-brain-model-driven-r123-clarification-multiturn-20260717-shadow`
- 发布状态：`draft / shadow / evaluationOnly`
- 门店：6
- 模型：`gpt-5.6-terra`
- 生产发布：仍为 `3 / ami-brain-rules-baseline-20260714`

## 单轮评测

同一次 R126 运行共 6 题，结果全部为 `usable_exact`：

| 问题 ID | 目标 | 结果 |
| --- | --- | --- |
| `paraphrase-query-03` | 本月截至现在实收标量 | `usable_exact` |
| `paraphrase-clarify-01` | 无明确目标 | `usable_exact` |
| `paraphrase-clarify-02` | 无绑定情况指代 | `usable_exact` |
| `paraphrase-clarify-03` | 无明确动作目标 | `usable_exact` |
| `paraphrase-clarify-04` | 无绑定“这个数据”指代 | `usable_exact` |
| `paraphrase-clarify-05` | 无上一轮时引用“之前那个” | `usable_exact` |

关键结论：

- 标量题只回答本月截至现在实收，不用全店多指标总览替代。
- 澄清题不调用业务能力、不生成 citation、不伪造数据。
- “这个数据有问题吗”在新会话中不会再默认执行全店财务风险诊断。

## 同会话补槽

会话：`23224`

### 第一轮

- run：`23142`
- 用户：`把本月实收跟另一个周期比较`
- 结果：`completed`
- 回答：`为了准确处理，请一次确认：请补充对比周期或对象？`
- 保留槽位：intent=`comparison`、metric=`metric.paid_amount`、timeRange=`本月`
- 缺失槽位：`comparisonTarget`

### 第二轮

- run：`23143`
- 用户：`上个月`
- 结果：`completed`
- 能力：`finance_payment_breakdown v17`
- 合并结果：主周期仍为本月，对比周期为 `2026-06-01..2026-06-30`
- 回答：本月 `28756.30` 元，上月 `127761.01` 元，差额 `-99004.71` 元（`-77.5%`）

该链路证明第二轮不是独立关键词问数，而是从会话快照恢复原目标并合并新槽位。

## 候选目录

| 项目 | 结果 |
| --- | --- |
| capability count | 19 |
| card count | 19 |
| catalog issues | 0 |
| source freshness issues | 0 |
| release fingerprint | `869ffa31f2f101198e90eb771830b39deb95800b43aab7863a29c4f9ad7ff405` |

## 工程验证

- Brain 全量测试：129 个 suite 通过，`1638/1639` 通过，1 条按设计跳过。
- `packages/server-v2` build：通过。
- 管理端 typecheck + Vite build：通过。
- 未执行生产激活、push、tag 或部署。
