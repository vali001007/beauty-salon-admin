# Ami Brain R233 手动采购单强幂等与安全重放验收报告

## 一、结论

本轮通过。Ami Brain 的 `create_purchase_order` 已从“创建草稿后再修改状态、失败需人工核对”升级为“单次事务创建最终状态、业务表级强幂等、回执失败可安全重放”。

用户确认后只创建一张管理端手动采购单。即使采购单已提交而 Brain 成功回执落库失败、网络响应不确定或两个请求并发执行，使用原幂等键重试都返回同一张采购单，不会生成第二张单。

## 二、事实源边界

当前采购业务有两套明确用途不同的订单：

| 事实表 | 用途 | 本轮处理 |
| --- | --- | --- |
| `PurchaseOrder` | 管理端历史手动采购单和 Ami Brain 当前采购动作 | 已完成强幂等收口 |
| `ProcurementOrder` | 供应链平台供应商、报价、发货和结算订单 | 保持现状，未混入本轮 |

本轮没有把两套订单表伪装成已经统一，也没有修改供应链平台下单、发货、收货和结算合同。

## 三、统一创建合同

- `PurchaseOrder` 新增可空唯一 `idempotencyKey` 和不可变 `creationFingerprint`。
- 原始幂等键按 `storeId + source + rawKey` 生成 SHA-256 后入库，不保存明文键。
- 创建指纹覆盖门店、来源、供应商、预计到货日期、创建目标状态和采购明细。
- 采购明细顺序不影响指纹，同一业务清单换序仍视为同一请求。
- 同键同指纹返回原采购单；同键不同数量、状态或供应商明确冲突。
- PostgreSQL advisory lock 保证并发同键请求串行收口。
- 管理端来源强制为 `admin`，Ami Brain 来源固定为 `ami_brain`，不能通过请求体冒充来源。

## 四、Brain 执行改进

原链路为：

`创建草稿 -> 更新为待审核 -> 写 Brain 成功回执`

如果第二步或回执写入失败，系统无法判断是否需要重建采购单。

当前链路为：

`确认权限与门店商品 -> 单次事务创建最终状态 -> 写 Brain 成功回执`

- `submitForApproval=true` 时直接创建“待审核”采购单，不再执行第二次状态写入。
- `create_purchase_order.failureRecovery` 从 `manual_reconcile` 升级为 `safe_replay`。
- 目标复验发现同幂等键采购单已提交时，优先恢复原回执，不受商品后续状态变化影响。
- 采购单后续变为“已下单”后，原创建请求重放仍返回该采购单当前状态。

## 五、隔离库真实动作验收

验收库为本机一次性 PostgreSQL 16，生产数据库写入为 `0`。

| 验证项 | 结果 |
| --- | --- |
| 用户首次确认 | 成功创建 1 张采购单 |
| 最终创建状态 | 直接进入“待审核” |
| 总金额 | `200 元` |
| 重复确认 | Brain execution 层短路 |
| 业务层顺序重放 | 返回同一采购单 |
| 创建后状态变化 | 返回原采购单，当前状态“已下单” |
| 同键参数变化 | 明确拒绝 |
| 业务提交后回执失败 | 标记为可安全重试 |
| 回执恢复 | 成功，采购单总数仍为 1 |
| 并发同键 | 采购单 1 张，返回同一业务对象 |
| 同原始键跨来源 | `admin` 与 `ami_brain` 分离 |
| 创建采购单时库存流水 | `0`，未提前修改库存 |

## 六、Migration 验收

- 当前 migration 总数：`103`。
- 空库重放：`103/103` 成功。
- 历史增量升级：`95 -> 103` 成功。
- 历史手动采购单：`1 -> 1`，无丢失。
- 历史采购单新字段：均为 `NULL`。
- migration checksum 差异：`0`。

详细证据见 R232 migration 报告。

## 七、测试与构建

| 验证项 | 结果 |
| --- | --- |
| 定向回归 | 5 suites / 59 tests 通过 |
| Brain 全量回归 | 136 suites 通过、1 suite 跳过；`1796/1797` tests 通过 |
| Prisma validate / generate | 通过 |
| `server-v2` build | 通过 |
| 管理端 typecheck + build | 通过 |
| 隔离库真实动作脚本 | 通过 |

## 八、能力治理

- `purchase_order_draft` Scanner 指纹从 `36fa7ea6dfd1...` 更新为 `6111121abf97...`。
- explicit-only Scanner：`29` 个候选、`0` blocked。
- 仅对 `purchase_order_draft` 生成 synthetic candidate：`1/1`。
- compile、contract、security、test 四项门禁全部通过。
- 本轮没有持久化 draft，没有创建 release，没有激活生产能力。

## 九、剩余边界

1. 供应链平台 `ProcurementOrder` 的批量拆单幂等尚未收口，后续应在供应链平台任务中单独处理。
2. 管理端采购详情尚未展示来源、幂等标识和回执恢复状态，按既定决策作为后续管理端任务。
3. 采购单收货入库已有状态和库存流水合同，但收货动作本身的业务幂等仍应单独验收。
4. `create_customer_followup`、`create_marketing_touch_draft` 仍未完成业务表级强幂等。

## 十、证据

- `ami-brain-purchase-order-action-acceptance-evidence.json`
- `ami-brain-capability-scan-r233-summary.json` / `.md`
- `candidate-bundle/`
- `../ami-brain-migration-acceptance-2026-07-18-r232/ami-brain-isolated-migration-acceptance-summary.json`
