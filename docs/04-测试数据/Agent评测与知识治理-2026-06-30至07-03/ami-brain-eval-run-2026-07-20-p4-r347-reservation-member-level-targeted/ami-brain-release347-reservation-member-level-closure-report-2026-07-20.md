# Ami Brain Release 347 预约客户会员等级闭环报告

## 一、结论

已关闭问题：“今天有预约的客人里有没有 VIP 需要特别准备”不再进入多工具 Supervisor，也不再因共享模型预算耗尽返回模型供应商不可用。

真实请求结果为 `usable_partial`，六层合同全部通过。系统只调用 `reservation_list`，执行路径为 `exact_contract_fast_path`；门店 6 当天没有预约客户，因此返回有依据的空数据，并明确说明系统只有原始会员等级，管理端尚未发布统一 VIP 等级映射。

## 二、修复边界

- 没有新增关键词路由或固定业务回答。
- 预约能力合同增加会员等级和特别接待语义。
- 结构化能力匹配加入实体定义覆盖度，`entity.reservation + entity.customer` 会优先选择预约能力。
- “预约客户”按客户集合处理，不再被具体客户事实快速路径抢占。
- 业务定义口径和等级映射歧义由能力披露；权限、跨门店和真实客户身份歧义继续拦截。
- Ami Core 单一语义合同新增 `dimension.customerLevel -> Customer.memberLevel`。
- 未定义“钻石会员、金卡会员”等级是否等于 VIP。
- 语义定义版本 `143` 仅校验为 evaluation candidate，未发布为 active 定义。
- `release 347` 仅用于开发评测，未激活生产。

## 三、治理证据

| 对象 | 结果 |
| --- | --- |
| 业务定义候选 | `dimension.customerLevel`，versionId `143`，validated candidate |
| 预约能力候选 | `reservation_list`，resourceVersionId `809`，version `49` |
| 共享能力刷新 | resourceVersionId `810-824`，15 张卡 |
| Evaluation release | `347`，37 张卡 |
| Release fingerprint | `e596138d4434c481b89ca9bfb0786938721f8063effbf2d66236b7cefba4384d` |
| Catalog | `valid=true`，issues `0` |
| Source freshness | `valid=true`，issues `0` |

## 四、真实请求结果

| 字段 | 结果 |
| --- | --- |
| questionId | `qb-reception-reservation-management-039` |
| 状态 | `usable_partial` |
| Brain 状态 | `completed` |
| 延迟 | `4488 ms` |
| Capability | `reservation_list` |
| 执行路径 | `exact_contract_fast_path` |
| Grounding | `db_skill` |
| Provider unavailable | `0` |
| 六层合同 | intent/tool/plan/execution/completion/answer 全部通过 |

回答事实：今天没有预约客户。系统披露当前只有预约客户原始会员等级，统一 VIP 等级映射尚未发布，因此没有把任意会员等级自动判定为 VIP。

## 五、非原句稳定性

使用 3 条非原句改写连续执行两轮真实请求：

1. 今天预约的顾客中哪些会员等级需要特别接待。
2. 今天预约名单里有高等级会员吗，需要准备什么。
3. 查看今天预约客户的原始会员等级和接待准备。

两轮结果合计 `6/6` 为 `usable_partial`，模型供应商不可用 `0`；6 次均选择 `reservation_list`，执行路径均为 `model_primary`。这证明修复依赖结构化实体与能力合同，不依赖精确原句命中。

证据目录：

- `ami-brain-eval-run-2026-07-20-p4-r347-reservation-member-level-paraphrases-v3`
- `ami-brain-eval-run-2026-07-20-p4-r347-reservation-member-level-paraphrases-v4`

## 六、代码门禁

| 门禁 | 结果 |
| --- | --- |
| 定向测试 | 3 suites / 82 tests passed |
| 全量 Brain 测试 | 142 suites / 1919 tests passed / 1 skipped |
| Server 构建 | `nest build` passed |

## 七、后续门禁

本报告只证明上一轮已知问题关闭，不代表 `release 347` 已完整通过 650 题。下一次生产发布前必须冻结唯一候选并完整执行 650 题，再进入发布审计、管理端端到端验收、生产 canary 和回滚演练。
