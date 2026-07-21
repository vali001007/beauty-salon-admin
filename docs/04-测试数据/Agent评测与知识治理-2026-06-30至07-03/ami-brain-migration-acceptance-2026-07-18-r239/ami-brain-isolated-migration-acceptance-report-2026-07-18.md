# Ami Brain 105 条 Migration 隔离库全链路验收报告

## 一、验收结论

当前代码库 `105` 条 Prisma migration 已通过本机 PostgreSQL 16 隔离环境的双场景全链路验收：

- 空库从零重放：`105/105`
- 历史基线增量升级：`95 -> 105`
- 迁移历史缺失：`0`
- checksum 不一致：`0`
- 失败/回滚 migration：`0`
- 关键表、列、索引缺失：`0`
- 历史业务样本丢失：`0`
- 隔离库以外的数据库写入：`0`

这证明当前 migration 链本身可以进入受控的 `preflight -> deploy -> verify` 发布流程，消除了“本地代码和 schema 已就绪，但 migration 无法从零重放或无法升级历史数据”的风险。

共享开发库当前仍有 `9` 条 migration 未应用，因此仍不能宣称“开发库已就绪”。本报告是共享库执行审批的前置证据，不是远程数据库已迁移的证明。

## 二、验收边界

| 项目 | 值 |
| --- | --- |
| PostgreSQL | `postgres:16-alpine` |
| 主机 | `127.0.0.1:55436` |
| 临时容器 | `ami-brain-migration-r239` |
| 空库 | `ami_migration_empty` |
| 增量库 | `ami_migration_incremental` |
| 基线 migration | 前 `95` 条 |
| 当前 migration | `105` 条 |
| 临时容器清理 | 已完成 |
| 共享开发库写入 | `0` |
| 生产库写入 | `0` |

## 三、Migration 历史与重放

### 3.1 静态链审计

| 项目 | 结果 |
| --- | --- |
| migration 数 | `105` |
| 首条 | `20260530030751_init` |
| 最新 | `20260718234500_supply_platform_idempotency` |
| SQL 总字节 | `434208` |
| 链指纹 | `c51678f6c6aff16e8b41185fe82f0c0aa5989f4956dda627907135b5f10e41f2` |
| 缺失 `migration.sql` | `0` |
| 空 SQL | `0` |

存在两组相同时间前缀，但目录名完整唯一，Prisma 按完整 migration 名称稳定重放，本轮空库和增量库均通过：

- `20260712210000_ami_brain_model_driven_capability_catalog`
- `20260712210000_marketing_core_loop`
- `20260713120000_ami_brain_capability_discovery_metadata`
- `20260713120000_ami_core_business_definition_projection_v2`

### 3.2 空库重放

| 检查 | 结果 |
| --- | --- |
| 应用数 | `105` |
| 缺失 | `0` |
| 意外 migration | `0` |
| checksum 差异 | `0` |
| 失败/回滚 | `0` |

### 3.3 历史基线增量升级

增量库先只应用前 `95` 条 migration，写入角色、客户、项目、预约、次卡核销、手动采购单、客户跟进、供应链采购单和门店经营目标样本，再升级最后 `10` 条 migration。

| 检查 | 结果 |
| --- | --- |
| 升级范围 | `95 -> 105` |
| 最终应用数 | `105` |
| 缺失 | `0` |
| 意外 migration | `0` |
| checksum 差异 | `0` |
| 失败/回滚 | `0` |

## 四、关键结构验收

验收脚本对 Ami Brain、统一业务定义、门店指标、客户反馈、等待记录和真实动作幂等表执行真实 metadata 检查。

| 检查 | 结果 |
| --- | --- |
| 关键表缺失 | `0` |
| 关键列缺失 | `0` |
| 幂等唯一索引缺失 | `0` |
| 供应链批次索引缺失 | `0` |
| 采购收货回执结构缺失 | `0` |

覆盖的关键幂等对象包括：

- `CardUsageRecord`
- `Reservation`
- `PurchaseOrder`
- `TerminalFollowUpTask`
- `ProcurementOrder`
- `ProcurementReceipt`

## 五、历史数据与回填

### 5.1 历史数据保留

增量升级后，下列历史样本均保留 `1` 条，并保持原状态：

- 预约：`bookingSource=manual`
- 次卡核销：原记录保留
- 手动采购单：`草稿`
- 客户跟进：`pending`
- 供应链采购单：`pending_supplier_confirm`

新增幂等键和创建指纹对历史行保持可空，没有伪造历史幂等事实，也没有因强制回填导致数据丢失。

### 5.2 经营目标回填

| 指标 | 结果 |
| --- | --- |
| 原目标 | `123456.78` |
| 统一指标键 | `store.operating_revenue.month` |
| 周期 | `month` |
| 回填后值 | `123456.78` |

### 5.3 权限合并

| 角色 | 原权限保留 | 新权限 |
| --- | --- | --- |
| `store_manager` | `existing:store-manager` | `core:supply:manage` |
| `beautician` | `existing:beautician` | `core:brain:use`、`core:brain:beautician-view`、`core:store:reservations` |

权限 migration 执行追加而不覆盖，原权限均保留。

## 六、关键数据合同

| 合同 | 结果 |
| --- | --- |
| 客户反馈合法数据写入 | 通过 |
| 评分超界拒绝 | 通过 |
| 客户等待合法数据写入 | 通过 |
| 等待未结束却标记已服务拒绝 | 通过 |
| 预约幂等键重复拒绝 | 通过 |
| 次卡核销幂等键重复拒绝 | 通过 |
| 手动采购单幂等键重复拒绝 | 通过 |
| 客户跟进幂等键重复拒绝 | 通过 |
| 供应链采购单幂等键重复拒绝 | 通过 |
| 采购收货回执幂等键重复拒绝 | 通过 |

## 七、共享开发库状态

只读 `prisma migrate status` 显示，共享开发库仍有以下 `9` 条 migration 未应用：

1. `20260717130000_store_manager_supply_manage_permission`
2. `20260717220000_customer_service_feedback_core`
3. `20260717233000_customer_waiting_episode_core`
4. `20260718153000_beautician_brain_self_permissions`
5. `20260718190000_card_usage_action_idempotency`
6. `20260718203000_reservation_creation_idempotency`
7. `20260718214500_purchase_order_creation_idempotency`
8. `20260718223000_follow_up_task_creation_idempotency`
9. `20260718234500_supply_platform_idempotency`

`brain:migration:preflight` 对前 4 条 Ami Brain/业务事实 migration 返回 `ready`，未发现历史失败、目标表冲突或依赖缺失。本轮仅做只读预检，没有执行远程 deploy。

## 八、发布建议

1. 当前 105 条 migration 链通过隔离库发布门禁。
2. 共享开发库仍未就绪，不得把 release `315` 标记为可用。
3. 下一数据库原子任务应在独立审批下执行精确的 `preflight -> migrate deploy -> _prisma_migrations/information_schema/业务样本 verify`。
4. 共享库验收通过后，重跑 release `315` capability catalog 门禁，再启动 120 题评测。

## 九、证据

- 原始验收摘要：`ami-brain-isolated-migration-acceptance-summary.json`
- 可重复命令：`npm.cmd --prefix packages/server-v2 run brain:migration:acceptance -- --apply --yes`
- 验收脚本：`packages/server-v2/scripts/ami-brain-isolated-migration-acceptance.mjs`
