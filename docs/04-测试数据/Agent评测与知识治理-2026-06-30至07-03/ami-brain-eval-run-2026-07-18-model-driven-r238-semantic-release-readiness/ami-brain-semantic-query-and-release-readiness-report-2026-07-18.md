# Ami Brain 语义查询与候选发布就绪报告

## 一、结论

本轮已修复“明确查询一个指标时，模板中的可选指标被强制带入”的语义查询问题。商品销售排行、员工业绩等问题现在只要求用户真正询问的指标，不再因模板内可选毛利、服务次数等口径未发布而整题拒答。

候选能力已按当前代码重新冻结：

- Scanner 显式能力：`29`
- 源码指纹过期且已刷新持久化：`20`
- 首次生成并持久化：`card_usage_action_preview`
- 复用新鲜能力版本：`6`
- 被统一语义治理门禁拒绝：`2`
- 新 evaluation-only release：`315`，包含 `27` 个能力版本
- 生产激活：`0`

release `315` 当前不可用于正式评测或激活。其源码新鲜度已通过，但共享开发库尚有 `9` 条 migration 未应用，`core:brain:beautician-view` 和 `core:supply:manage` 未进入数据库权限目录，因此 `4` 张能力卡被目录门禁拒绝。

## 二、语义查询修复

### 2.1 根因

`QueryPlannerService` 原先把查询模板列出的全部指标当成必选指标。用户只问商品销售排行时，系统仍强制要求商品毛利率和低于成本销售次数；用户只问员工业绩时，系统仍强制要求服务次数。任一可选指标未发布就会整题拒答。

同时存在两个语义合同不一致：

- 用户说“实收”时被映射到 `net_revenue`，而统一业务口径应为 `paid_amount`。
- 支付方式维度的统一键为 `dimension.paymentMethod`，旧注册表仍使用 `payMethod`。

### 2.2 修复内容

- 查询规划优先使用问句明确命中的指标。
- 仅当问句没有命中任何指标时，才使用模板默认指标。
- 模板可通过 `requiredMetricKeys` 显式声明真正必选的联合指标。
- `reservation_schedule` 保留“预约数 + 到店率”必选合同。
- `实收/收款 -> paid_amount`，`净收入/净额 -> net_revenue`。
- 支付方式维度统一为 `paymentMethod`，底层仍参数化读取现有 `ProductOrder.payMethod` 和 `PaymentRecord.method`。

## 三、候选能力审计

### 3.1 当前目录分布

| 状态 | 数量 | 处理 |
| --- | ---: | --- |
| 源码指纹过期 | 20 | 确定性刷新并持久化为资源版本 `517-536` |
| 首次持久化 | 1 | `card_usage_action_preview` -> 资源版本 `537` |
| 仍然新鲜 | 6 | 复用 `338,344,349,510,351,353` |
| 缺失语义合同 | 2 | 不进入 release，列入后续统一后台能力任务 |

### 3.2 被拒绝的两项能力

`customer_feedback_overview` 缺失：

- `customer_feedback_overview` 统一语义视图
- 客户平均满意度、投诉数、反馈采集覆盖率、未解决投诉数、员工客诉数等统一指标

`customer_waiting_loss_overview` 缺失：

- `customer_waiting_loss_overview` 统一语义视图
- 长等待离店数、等待数据采集覆盖率等统一指标

这两项缺口属于管理端/后端统一业务事实与指标发布问题，按当前边界暂不在 Ami Brain 中建第二套口径。

## 四、release 315 门禁

| 项目 | 结果 |
| --- | --- |
| release key | `ami-brain-model-driven-r238-semantic-release-readiness-20260718-shadow` |
| release id | `315` |
| 状态 | `draft` / `evaluationOnly=true` |
| 能力版本 | `27` |
| source freshness | `valid=true` / issues=0 |
| 目录合同 | `valid=false` |
| 未注册权限 | `core:brain:beautician-view`、`core:supply:manage` |
| 被拒绝能力卡 | 美容师 3 张、采购单 1 张 |
| 生产激活 | `0` |

共享开发库当前 `105` 条本地 migration 中有 `9` 条未应用。本轮没有对共享开发库执行 `migrate deploy`。只有在迁移审批、应用和真实权限目录复验后，release `315` 才能重跑目录门禁。

## 五、验证

| 验证项 | 结果 |
| --- | --- |
| 语义查询定向回归 | 8 suites / 85 tests 通过 |
| 后端全量回归 | 329 suites 通过、3 suites 跳过；3609 tests 通过、10 tests 跳过 |
| `server-v2` build | 通过 |
| 管理端 typecheck/build | 通过 |
| Scanner | 29 个显式能力，blocked=0 |
| 确定性刷新 | 20/20，blocked=0 |
| Terra 候选生成 | 次卡核销 1/1 通过；反馈/等待 2 项被语义门禁正确拒绝 |
| 候选数据库写入 | 仅写入开发候选资源和 evaluation-only release |
| 共享库 migration | 未执行，9 条 pending |
| 生产数据库/生产发布 | 写入 0，激活 0 |

## 六、下一步

1. 完成当前 `105` 条 migration 的隔离库全链路复验，固化共享库发布前证据。
2. 另行审批后，对共享开发库执行精确 `preflight -> deploy -> verify`，不使用无范围的盲目发布。
3. 权限目录对齐后重跑 release `315` 目录门禁。
4. 门禁全绿后才启动 120 题稳定性评测。
