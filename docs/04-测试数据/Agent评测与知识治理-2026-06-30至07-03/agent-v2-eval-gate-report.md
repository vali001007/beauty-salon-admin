# Agent V2 Eval 门禁报告

生成时间：2026-07-06 08:03:42 Asia/Shanghai

## 摘要

- 总题数：650
- P0 题数：103
- P0 未映射：0
- P0 权限需复核：0
- P0 契约未通过：0
- P0 能力缺失/语义错路由：0
- 高风险自动发布样例：0
- 推断权限样例：50
- 门禁结论：通过

## 结构化指标

- P0 正确率：100.0%
- P0 运行时正确率：100.0%（103 / 103）
- P0 同题稳定性：100.0%（103 / 103）
- P0 降级覆盖：100.0%（降级 0 / 允许 2）
- 互斥正确率：100.0%（风险 0）
- 规划延迟 P99：8.25ms（样本 515）
- 意图缓存命中率：80.0%（412 / 515）
- KG-only / legacy_regex 选路差异率：20.4%（21 / 103）
- kg_llm_preferred 回退旧链路率：0.0%（0 / 515）
- 越权证据：0

## 门禁项

| 门禁 | 期望 | 实际 | 结果 |
|---|---|---|---|
| P0 正确率 | >= 98% | 100.0%（103 / 103） | 通过 |
| P0 运行时正确率 | >= 98% | 100.0%（103 / 103） | 通过 |
| P0 同题稳定性 | >= 99% | 100.0%（103 / 103，每题 5 次） | 通过 |
| P0 降级数量 | 最多 2 题 | 0 / 2 | 通过 |
| LLM 降级覆盖 P0 | >= 85% | 100.0%（103 / 103） | 通过 |
| 互斥正确率 | 100% | 100.0%（风险 0） | 通过 |
| P0 问题错路由率 | 0 个能力缺失或语义错路由 | 0 / 103 | 通过 |
| P0 支持问题契约 | 全部 pass | 0 个未通过 | 通过 |
| P0 权限确认 | 全部 allow | 0 个需要复核 | 通过 |
| 高风险自动发布 | 0 个 | 0 个样例 | 通过 |
| 延迟 P99 | <= 800ms | 8.25ms（样本 515） | 通过 |
| 缓存命中率 | >= 50% | 80.0%（412 / 515） | 通过 |
| 越权证据 | 0 个 | 0 个 | 通过 |
| 候选草稿权限绑定 | 自动生成草稿进入治理待办，不阻断已发布能力门禁 | 50 个候选草稿需补权限 | 通过 |

## P0 未映射样例

无

## P0 权限需复核样例

无

## P0 契约未通过样例

无

## P0 运行时错路由样例

无

## P0 同题不稳定样例

无

## KG-only 与旧链路差异样例

| ID | 问题 | 期望能力 | 实际能力 | KG 能力 | 旧链路能力 | 最终引擎 |
|---|---|---|---|---|---|---|
| q061 | 现在哪些产品库存不够了 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q067 | 现在库存金额大概多少 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q079 | 库存的周转率怎么样 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q060 | 这个客人要退款，原因是项目没做完，怎么处理 | finance.refund.metric | - | finance.refund.metric | - | - |
| q002 | 帮我看一下库存整体情况 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q005 | 精华液现在库存还有多少 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q006 | 帮我看一下所有低于安全库存的产品 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q011 | 这个月库存消耗和上个月比有没有异常 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q012 | 帮我看一下补水系列产品的库存 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q015 | 哪些产品的安全库存线设得不合理 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q019 | 现在门店和仓库的库存加起来有多少 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q024 | 最贵的那几样耗材现在库存怎么样 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q040 | 帮我查一下我们的库存损耗率高不高 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q068 | 我们的库存周转目标是多少天，达到了吗 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q070 | 帮我设置一个当某产品低于安全库存就提醒我的规则 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q080 | 如果接待量增加20%，库存够用吗 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
| q053 | 最近退款原因主要是什么 | finance.refund.metric | - | finance.refund.metric | - | - |
| q054 | 哪个美容师的退款率最高 | finance.refund.metric | - | finance.refund.metric | - | - |
| q060 | 退款走了什么审批流程，合规吗 | finance.refund.metric | - | finance.refund.metric | - | - |
| q013 | 库存低的产品有哪些？（然后）帮我生成补货清单 | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list | - | - |
