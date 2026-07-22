# Ami Brain Supervisor 失败状态与重规划预算修复报告

日期：2026-07-18

评测 release：`318`

评测门店：`storeId=6`

性质：evaluation-only，不激活生产

## 一、问题结论

R243 有 6 条问题的能力节点实际执行失败，但 Brain 最终仍返回 `completed`。Trace 中原始数据库或能力错误又被第二次重规划后的 `brain_execution_budget_exhausted:0` 覆盖，形成两个产品风险：

1. 用户看到“已完成”，但没有任何成功 Observation。
2. 开发和治理侧看不到首个真实错误，无法准确判断是数据库、能力合同还是编排问题。

本轮已修复上述问题。Supervisor 在执行预算耗尽后不再调用模型重规划；零成功且存在失败 Observation 的结果统一返回 `failed + grounding=none + MODEL_EXECUTION_FAILED`；Trace 保留每个 Observation 的 `errorCode`。

## 二、代码修复

1. `BrainExecutionBudgetService` 新增统一剩余预算计算，预算小于等于 0 时不再进入重规划。
2. `BrainBoundedExecutorService` 在重规划前后分别检查剩余预算，避免模型调用完成后再生成预算归零的假失败。
3. `BrainReplannerService` 接收并向 Supervisor 传递原执行绝对截止时间，重规划不能获得第二份完整预算。
4. `BrainChatService` 将“零成功 Observation + 至少一个 failed Observation”标记为真实失败。
5. `bounded_dag_execution` Trace 增加 Observation `errorCode`，不再只记录 `status=failed`。
6. 无成功结果时 grounding 改为 `none`，不再错误标记为 `db_skill`。

## 三、R244 真实链路结果

| 问题 | R243 状态 | R244 状态 | 重规划 | R244 原始诊断 |
| --- | --- | --- | ---: | --- |
| 下次采购需要补什么货 | completed | failed | 0 | `ProcurementOrder.idempotencyKey` 不存在 |
| 现在库存金额大概多少 | completed | failed | 0 | `ProcurementOrder.idempotencyKey` 不存在 |
| 现在仓库里护肤品还有多少 | completed | failed | 1 | `brain_capability_execution_timeout` |
| 今天有没有超过接待能力的情况 | completed | failed | 0 | `Reservation.idempotencyKey` 不存在 |

另外两条问题在本次 R244 中因模型供应商不可用停在认知阶段，没有进入能力执行，因此按 `provider_unavailable` 单独统计，不能用于判断执行修复。

4 条进入执行的样本全部满足：

- BrainRun 状态：`failed`
- failureCode：`MODEL_EXECUTION_FAILED`
- grounding：`none`
- `brain_execution_budget_exhausted:0`：`0`
- 错误诊断保留：`4/4`

## 四、性能影响

| 指标 | R243 | R244 |
| --- | ---: | ---: |
| 4 条执行样本平均耗时 | 47.6 秒 | 32.7 秒 |
| 平均耗时下降 | - | 31.3% |
| 无效二次重规划达到 2 次 | 4 | 0 |

本轮没有通过缩短能力查询超时掩盖数据库问题。耗时下降来自停止没有剩余预算的重规划。

## 五、验证门禁

| 验证项 | 结果 |
| --- | --- |
| 定向测试 | 3 suites / 135 tests 通过 |
| 后端全量 Jest | 329 suites 通过、3 suites 跳过；3614 tests 通过、10 tests 跳过 |
| 后端 build | 通过 |
| release 318 catalog | 23/23，`valid=true` |
| release 318 source freshness | `valid=true` |
| 共享/生产数据库迁移 | 未执行 |

## 六、发布边界

本轮修复的是失败状态真实性、诊断可观测性和预算治理，不是数据库结构修复。共享开发库仍缺少 `ProcurementOrder.idempotencyKey`、`Reservation.idempotencyKey` 等 9 条 pending migration 对应结构，因此相关能力仍不能成功执行。

下一步仍需获得共享开发库迁移授权，执行精确 `preflight -> deploy -> verify`，随后重建正式全量 release 并运行 120 题门禁。

按 37 个一级交付任务统计，仍为 `32 项完成、2 项进行中、3 项未开始`，工程任务完成度保持 `86.5%`。
