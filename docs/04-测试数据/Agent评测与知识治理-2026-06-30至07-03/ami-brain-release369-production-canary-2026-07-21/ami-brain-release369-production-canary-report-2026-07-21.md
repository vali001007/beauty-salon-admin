# Ami Brain Release 369 生产 Canary 验收报告

日期：2026-07-21

## 1. 结论

Release 369 已通过完整发布门禁，并完成生产 shadow、单用户 canary 和回滚演练。当前可进入受控 canary 观察阶段，不应直接扩大为全用户 model 发布。

## 2. 候选与评测证据

| 项目 | 结果 |
| --- | --- |
| Evaluation Release | 369 |
| Release fingerprint | `9af90690b8912644150e3bbac05a65553d1509e85565451dca9c317515362182` |
| 能力卡 | 40 |
| Catalog / source freshness | `valid=true` |
| 正式 Eval Run | 95 |
| 正式门禁 | `91/91` 通过 |
| 模型供应商失败 | 0 |
| 时间边界 | 7/7 通过 |
| 安全对抗 | 4/4 通过 |
| 650 基线 | 360/643 可评题真实可用，`55.99%` |

正式门禁覆盖每张冻结能力卡的代表样本，并要求所有能力至少被真实选择一次；安全追问只允许用于缺少高风险动作目标的场景，不能替代能力覆盖。

## 3. 本轮关键修复

1. 发布评测支持按 `caseKeys` 定向重跑失败断点，同时保留同一 release 其余已通过结果。
2. 正式时间门禁绑定当前承载实收查询的 `finance_payment_breakdown`，回答 metadata 提供实际 `[start,end)`、时区和边界证据。
3. 评测和 canary 的实体别名解析统一使用冻结 release Ontology，不再回读未加载的生产快照。
4. 营销策略编号支持“运行营销策略 12 并发送”等自然表达，并保持门店范围、启用状态和高风险确认门禁。
5. 动作目标不存在、未启用或有歧义时返回安全澄清，不抛内部执行错误。
6. 响应合成按 `actionId` 去重，避免同一高风险动作出现两个确认入口。

## 4. 代码门禁

| 门禁 | 结果 |
| --- | --- |
| Brain 全量测试 | 143 suite，1985 passed，1 skipped |
| 后端构建 | 通过 |
| 管理端 typecheck | 通过 |
| 管理端 production build | 通过 |

## 5. 生产发布记录

| Release | 状态 | 用途 |
| --- | --- | --- |
| 368 | rolled_back | 第一次用户 canary 与回滚演练 |
| 370 | active | Release 369 生产 shadow，100% shadow |
| 371 | active | Release 369 最终用户 canary |

Release 371 仅匹配：

- `userIds=[28]`
- `storeIds=[6]`
- `roleKeys=[store_manager]`
- `mode=model`
- `evaluationEvidenceReleaseId=369`

## 6. Canary 真实请求

| 问题 | 结果 |
| --- | --- |
| 本月实收多少 | `finance_payment_breakdown`，实收 `28756.30 元`，DB grounding |
| 本月商品销售排行 | `product_sales_ranking`，返回 7 条真实商品排行，未用全店单值替代 |
| 运行营销策略 12 并发送 | `marketing_strategy_execute_preview`，预计 64 人，渠道 terminal，高风险预览，1 个确认入口，未执行 |

## 7. 排除项与后续平台缺口

`customer_feedback_overview` 未进入本次 release。原因是当前管理端/后端尚未形成统一、已发布的客户反馈、满意度和投诉事实定义。该缺口应由管理端与后端业务模块补齐，不在 Ami Brain 内独立审批或重复维护业务口径。

## 8. 下一步门禁

1. 观察 Release 371 的真实错误率、P95、澄清率、动作预览转化和用户拒绝率。
2. 指标达标后按门店或角色扩大 canary，不修改资源指纹和评测证据。
3. 任一安全、跨店、错误动作或数据误导事件立即回滚到 Release 370 shadow。
4. 全用户发布需另行完成扩大 canary 验收，不以本次单用户 canary 代替。
