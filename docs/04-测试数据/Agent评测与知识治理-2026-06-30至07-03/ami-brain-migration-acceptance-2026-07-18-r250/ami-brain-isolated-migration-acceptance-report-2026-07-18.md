# Ami Brain P0 隔离库 Migration 全链路验收报告

日期：2026-07-18

验收代码版本：`a5421cc3`

## 一、验收结论

当前代码库 105 条 Prisma migration 已在全新 PostgreSQL 16 隔离环境完成全链路验收，结果为通过：

- 空库从零重放：`105/105`
- 历史基线增量升级：`95 -> 105`
- 迁移历史缺失、意外记录、checksum 不一致、失败或回滚：全部为 `0`
- 关键表、列、唯一索引缺失：全部为 `0`
- 历史业务样本丢失：`0`
- 经营目标、角色权限和关键数据约束：全部通过
- 隔离容器和端口：验收后自动释放
- 共享开发库、生产库写入：`0`

本轮证明当前 migration 代码链可以进入受控的远程 `preflight -> deploy -> verify` 流程。它不代表共享开发库已经应用这些 migration；远程数据库发布仍需独立授权和验收。

## 二、隔离环境

| 项目 | 值 |
| --- | --- |
| PostgreSQL | `postgres:16-alpine` |
| 容器 | `ami-brain-migration-r250` |
| 端口 | `127.0.0.1:55437` |
| 空库 | `ami_migration_empty` |
| 增量库 | `ami_migration_incremental` |
| 历史基线 | 前 95 条 migration |
| 容器清理 | `true` |
| 端口释放 | `true` |
| 隔离库以外写入 | `0` |

## 三、Migration 历史对齐

| 检查项 | 结果 |
| --- | --- |
| migration 总数 | `105` |
| 首条 | `20260530030751_init` |
| 最新一条 | `20260718234500_supply_platform_idempotency` |
| SQL 总字节 | `434208` |
| 链指纹 | `c51678f6c6aff16e8b41185fe82f0c0aa5989f4956dda627907135b5f10e41f2` |
| 空库 applied | `105` |
| 增量库 applied | `105` |
| missing | `0` |
| unexpected | `0` |
| checksum mismatch | `0` |
| failed/rolled back | `0` |

存在两组相同时间前缀，但 migration 完整目录名唯一，且空库与增量升级均稳定通过：

1. `20260712210000_ami_brain_model_driven_capability_catalog`
2. `20260712210000_marketing_core_loop`
3. `20260713120000_ami_brain_capability_discovery_metadata`
4. `20260713120000_ami_core_business_definition_projection_v2`

## 四、空库重放

全新数据库执行 Prisma schema validate 和 migrate deploy 后：

1. schema validate 通过。
2. 105 条 migration 全部成功应用。
3. `prisma migrate status` 返回数据库结构已是最新。
4. `_prisma_migrations` 与本地目录逐条对齐。
5. 无缺失表、列和关键索引。

## 五、增量升级

增量库先部署前 95 条 migration，写入历史业务样本，再部署后 10 条：

1. `20260715150000_store_metrics_core`
2. `20260717130000_store_manager_supply_manage_permission`
3. `20260717220000_customer_service_feedback_core`
4. `20260717233000_customer_waiting_episode_core`
5. `20260718153000_beautician_brain_self_permissions`
6. `20260718190000_card_usage_action_idempotency`
7. `20260718203000_reservation_creation_idempotency`
8. `20260718214500_purchase_order_creation_idempotency`
9. `20260718223000_follow_up_task_creation_idempotency`
10. `20260718234500_supply_platform_idempotency`

升级完成后，105 条 migration 历史、checksum 和结构全部对齐。

## 六、关键业务数据验收

| 验收对象 | 结果 |
| --- | --- |
| 预约历史样本 | 1 条保留，`bookingSource=manual` |
| 次卡核销历史样本 | 1 条保留 |
| 手动采购单历史样本 | 1 条保留，状态 `草稿` |
| 客户跟进历史样本 | 1 条保留，状态 `pending` |
| 供应链采购单历史样本 | 1 条保留，状态 `pending_supplier_confirm` |
| 旧数据幂等键 | 保持空值，未伪造历史幂等事实 |
| 门店月度经营目标 | `123456.78` 精确回填 |
| 店长原权限 | 保留 `existing:store-manager` |
| 店长新权限 | 追加 `core:supply:manage` |
| 美容师原权限 | 保留 `existing:beautician` |
| 美容师新权限 | 追加 Brain 和预约权限 |

## 七、关键数据合同

以下约束均通过真实数据库写入与拒绝验证：

- 客户反馈合法记录可写入，评分超界被拒绝。
- 客户等待合法记录可写入，状态与时间不一致被拒绝。
- 预约、次卡核销、手动采购单、客户跟进任务重复幂等键被拒绝。
- 供应链采购单和采购收货回执重复幂等键被拒绝。

原始断言结果：

| 断言 | 结果 |
| --- | --- |
| emptyHistoryAligned | `true` |
| incrementalHistoryAligned | `true` |
| structureAligned | `true` |
| historicalRowsPreserved | `true` |
| metricBackfilled | `true` |
| permissionsMerged | `true` |
| keyDataContracts | `true` |

## 八、发布边界与下一步

1. 当前 migration 代码链发布前置门禁已通过。
2. 共享开发库和生产库本轮均未执行 migration。
3. “代码就绪但数据库未就绪”的代码链风险已经消除；远程环境是否就绪仍由远程 migration 状态决定。
4. 下一数据库任务必须在独立授权下对目标库执行只读 preflight，确认 pending 清单、历史失败、checksum 和结构冲突后，再决定是否 deploy。
5. 远程 deploy 后必须复核 `_prisma_migrations`、关键结构、权限、经营目标和真实动作幂等约束，不能只看命令退出码。

## 九、可复现证据

- 原始摘要：`ami-brain-isolated-migration-acceptance-summary.json`
- 执行脚本：`packages/server-v2/scripts/ami-brain-isolated-migration-acceptance.mjs`
- 执行命令：

```powershell
npm.cmd --prefix packages/server-v2 run brain:migration:acceptance -- --apply --yes --container=ami-brain-migration-r250 --port=55437 --output-dir="../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-migration-acceptance-2026-07-18-r250"
```
