# Ami Brain P0 隔离库 Migration 全链路验收报告 R232

## 一、结论

第 103 条 `20260718214500_purchase_order_creation_idempotency` 加入后，R231 的 102 条冻结结论已失效。本轮已从全新隔离环境重新执行完整验收，结果通过。

- PostgreSQL 16 空库从零重放 `103/103`。
- 第 95 条历史基线增量升级到第 103 条成功。
- 空库和增量库的 migration 名称、状态、数量与 checksum 差异全部为 `0`。
- 历史预约、次卡核销和手动采购单数据均保留，新幂等字段保持 `NULL`。
- 预约、核销和采购单三个唯一幂等索引均通过重复键拒绝验证。
- 生产数据库写入为 `0`，一次性容器验收后已销毁。

## 二、Migration 冻结基线

| 项目 | 结果 |
| --- | --- |
| migration 总数 | `103` |
| 首条 | `20260530030751_init` |
| 最新 | `20260718214500_purchase_order_creation_idempotency` |
| SQL 总大小 | `432211` bytes |
| 链摘要 | `5c88bab534565547b1215e56c194f0ffb379d03374914a63d9569cd5018d4a5a` |
| 增量基线 | 第 95 条 `20260715095000_store_manager_brain_read_permissions` |
| 增量范围 | `95 -> 103`，共 8 条 |

## 三、历史数据升级

增量库在第 95 条基线预置门店、角色、经营目标、预约、次卡核销和手动采购单数据，再执行第 96 至 103 条 migration。

| 验证项 | 结果 |
| --- | --- |
| 历史预约 | `1 -> 1`，幂等键和创建指纹为 `NULL` |
| 历史次卡核销 | `1 -> 1`，幂等键为 `NULL` |
| 历史手动采购单 | `1 -> 1`，幂等键和创建指纹为 `NULL`，状态仍为“草稿” |
| 月度经营目标 | 回填为 `123456.78` |
| 店长和美容师原权限 | 保留 |
| 新增权限 | 正确合并且无重复 |

## 四、结构与约束

新增采购 migration 已验证：

- `PurchaseOrder.idempotencyKey` 可空且唯一。
- `PurchaseOrder.creationFingerprint` 为 `VARCHAR(64)`。
- `PurchaseOrder_idempotencyKey_key` 存在。
- 历史记录不会被伪造幂等值或创建指纹。
- 重复非空幂等键被数据库唯一约束拒绝。

同时复验客户反馈、客户等待、预约和次卡核销的关键结构与约束，全部通过。

## 五、发布边界

当前 103 条 migration 可以进入真实环境的 `preflight -> deploy -> verify` 审批流程。本报告不授权连接或修改共享开发库、测试库及生产库。

新增第 104 条 migration、修改 `schema.prisma` 或修改任一既有 `migration.sql` 后，R232 结论立即失效。

原始证据：`ami-brain-isolated-migration-acceptance-summary.json`。
