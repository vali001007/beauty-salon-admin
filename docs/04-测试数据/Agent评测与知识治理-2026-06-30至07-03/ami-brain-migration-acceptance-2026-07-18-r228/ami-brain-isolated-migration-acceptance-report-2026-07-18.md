# Ami Brain 隔离库 Migration 全链路验收报告

## 1. 验收结论

本轮 P0 验收通过。

- 100 条 migration 可在 PostgreSQL 16 空库从零完整重放。
- 从第 95 条 migration 的历史基线升级到第 100 条成功，原有门店目标与角色权限数据未丢失、未被覆盖。
- 空库与增量库的 `_prisma_migrations` 均为 `100/100` 成功，失败或回滚记录为 `0`，本地 SQL 与数据库 checksum 差异为 `0`。
- 供应链权限、客户反馈、客户等待、美容师本人范围权限均通过现有 `brain:migration:preflight` 真实数据库检查。
- 门店指标回填、反馈/等待数据写入和数据库约束均通过。
- 本轮修复了 Prisma schema 遗漏和 PostgreSQL 长标识符误判两个发布阻断问题。
- 全程只使用 `127.0.0.1:55432` 的一次性隔离 PostgreSQL 容器，未连接、未修改远端 Supabase 业务库。

## 2. 验收环境

| 项目 | 值 |
| --- | --- |
| 日期 | 2026-07-18 |
| 分支 | `codex/ami-brain-wip` |
| PostgreSQL | `postgres:16-alpine` |
| 容器 | `ami-brain-migration-r228` |
| 监听地址 | `127.0.0.1:55432` |
| 空库 | `ami_migration_empty` |
| 增量库 | `ami_migration_incremental` |
| 远端数据库写入 | `0` |

## 3. Migration 历史完整性

| 检查项 | 结果 |
| --- | --- |
| migration 目录数 | `100` |
| 首条 migration | `20260530030751_init` |
| 最新 migration | `20260718153000_beautician_brain_self_permissions` |
| 缺少 `migration.sql` | `0` |
| 空 SQL 文件 | `0` |
| SQL 总大小 | `431309` bytes |
| migration 链摘要 | `5c4be56cb566400a4d96da96859ffdb129f94e7ee7aefb3047799351fd6991cf` |
| 空库 checksum 差异 | `0` |
| 增量库 checksum 差异 | `0` |

发现两组重复时间前缀：

- `20260712210000_ami_brain_model_driven_capability_catalog`
- `20260712210000_marketing_core_loop`
- `20260713120000_ami_brain_capability_discovery_metadata`
- `20260713120000_ami_core_business_definition_projection_v2`

Prisma 当前按完整目录名稳定排序，已应用历史和 checksum 均一致，因此不得重命名已应用 migration。后续新增 migration 必须使用唯一时间前缀。

## 4. 空库重放

执行结果：

- `prisma validate` 通过。
- `prisma migrate deploy` 成功应用 `100/100` migration。
- `prisma migrate status` 返回 `Database schema is up to date!`。
- 最终生成 `212` 张 public 业务表，其中 `28` 张为 `brain_*` 表。
- `_prisma_migrations` 失败或回滚记录为 `0`。

空库重放证明当前 migration 链不依赖已有业务数据或人工补表，可以从零构建完整数据库结构。

## 5. 增量升级

增量库先只应用前 95 条 migration，历史基线截至：

`20260715095000_store_manager_brain_read_permissions`

基线预置：

- 门店 `900001`。
- `store_manager` 原权限：`core:brain:use`、`existing:store-manager`。
- `beautician` 原权限：`existing:beautician`。
- 月度经营目标：`revenueTarget = 123456.78`。

随后应用第 96-100 条 migration：

1. `20260715150000_store_metrics_core`
2. `20260717130000_store_manager_supply_manage_permission`
3. `20260717220000_customer_service_feedback_core`
4. `20260717233000_customer_waiting_episode_core`
5. `20260718153000_beautician_brain_self_permissions`

升级结果：

| 验证项 | 结果 |
| --- | --- |
| 原门店记录 | 保留 |
| 原经营目标 | 保留 |
| 通用指标目标回填 | `store.operating_revenue.month = 123456.78` |
| `store_manager` 原权限 | 保留 |
| `store_manager` 新权限 | 新增 `core:supply:manage` |
| `beautician` 原权限 | 保留 |
| `beautician` 新权限 | 新增 3 条本人范围 Brain 权限 |
| 权限重复项 | `0` |
| migration 状态 | `100/100` 成功 |

## 6. 关键表与数据合同

已验证存在：

- `brain_conversation`
- `brain_message`
- `brain_run`
- `brain_action_execution`
- `brain_ontology_entity`
- `business_definition`
- `store_metric_target`
- `store_metric_snapshot`
- `customer_service_feedback`
- `customer_waiting_episode`
- `CardUsageRecord`
- `ReservationStatusEvent`

已验证新增字段和外键：

- `Reservation.sourceReservationId`、`bookingSource`
- `OrderItem.reservationId`、`serviceTaskId`
- `CardUsageRecord.reservationId`、`serviceTaskId`
- `ServiceTask.reservationId`
- `CustomerCard.renewedFromCustomerCardId`、`saleType`

数据合同验证：

- 客户满意度记录可成功写入并读取。
- 客户等待记录可成功写入并读取。
- `rating = 6` 被评分约束拒绝。
- `status = waiting` 且同时设置已服务结果被状态一致性约束拒绝。
- 门店指标目标可通过修复后的 Prisma Client 读取，值为 `123456.78`。

## 7. 本轮发现并修复的问题

### 7.1 Prisma schema 落后于 migration

问题：`20260715150000_store_metrics_core` 已创建门店指标表、预约状态事件和多组业务关联字段，但 `schema.prisma` 未同步。结果是数据库已经就绪，Prisma Client 仍看不见这些能力。

修复：

- 补齐 `StoreMetricTarget`、`StoreMetricSnapshot`、`ReservationStatusEvent`。
- 补齐 Reservation、OrderItem、CardUsageRecord、ServiceTask、CustomerCard 的新增字段、关系和索引。
- 将当前 schema 与已存在数据库事实对齐，不新增重复 migration。
- 修复后 Prisma Client 已暴露 `storeMetricTarget`、`storeMetricSnapshot`、`reservationStatusEvent` delegate。

### 7.2 Migration 预检误判长索引名

问题：PostgreSQL 将标识符限制为 63 bytes，等待记录长索引名在建库时被自动截断；预检按原始长名称比较，导致刚完成空库重放仍被错误判为 `blocked`。

修复：

- 预检按 PostgreSQL 63-byte 规则归一化约束和索引名。
- 新增长标识符截断回归测试。
- 已应用权限的检查状态由误导性 `warn` 修正为 `pass`。
- 真实增量库复验结果为四条目标 migration 全部 `already_applied`。

## 8. 残余历史漂移

`prisma migrate diff` 已不再报告当前业务模型缺表、缺字段、缺外键或缺索引。剩余差异分为：

1. 五张供应链旧版兼容表仍保留在数据库，但不进入当前 Prisma Client：`Supplier`、`ProductSupplier`、`SupplierOrder`、`SupplierOrderItem`、`SupplierSettlement`。现有 legacy migration audit/verify 脚本仍依赖这些表，本轮不删除。
2. 历史手写 SQL 的 `updatedAt`/数组默认值与 Prisma 表达差异。
3. PostgreSQL 63-byte 自动截断造成的索引和外键名称表示差异。

这些残余项不阻断本轮 Ami Brain migration 发布门禁，但必须作为独立 schema 收敛任务处理，禁止通过改写已应用 migration 或直接删除 legacy 表消除 diff。

## 9. 验证命令

- `npx.cmd prisma validate --schema prisma/schema.prisma`
- `npx.cmd prisma generate --schema prisma/schema.prisma`
- `npx.cmd prisma migrate deploy --schema prisma/schema.prisma`
- `npx.cmd prisma migrate status --schema prisma/schema.prisma`
- `npm.cmd run brain:migration:preflight`
- `npm.cmd run test -- brain-pending-migration-preflight.spec.ts brain-pending-migration-preflight-script.spec.ts --runInBand`
- `npm.cmd run test -- prisma-business-definition-data-model.spec.ts --runInBand`
- `npm.cmd run test -- brain --runInBand`：136 suite 通过、1 suite 跳过；`1792/1793` tests 通过。
- `npm.cmd run build`

## 10. 下一步

Migration 发布风险已从“代码存在但数据库链路未验证”收口为“隔离库完整通过，等待真实环境按同一 preflight -> deploy -> verify 流程执行”。下一单元继续进行隔离库真实动作写入验收，重点验证次卡核销后的卡余次、耗材、收入、提成、动作回执和幂等恢复。
