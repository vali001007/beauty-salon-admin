# Ami Brain P0 隔离库 Migration 全链路验收与目标库就绪审计报告

日期：2026-07-18

验收代码版本：`c25a0628b1eeda6a395a938980bf8fe1db30987d`

## 一、结论

本轮形成两个独立结论：

1. **Migration 代码链通过。** 当前 105 条 Prisma migration 已完成 PostgreSQL 16 空库重放和 `95 -> 105` 历史基线增量升级，migration 历史、checksum、关键结构、历史数据、权限合并、经营目标回填和关键约束全部通过。
2. **共享开发库发布状态为 `blocked`。** 共享开发库当前只应用 `96/105`，存在 9 条待迁移、4 条历史 checksum 不一致，以及由待迁移导致的关键表、列和索引缺失。未获数据库写入授权，本轮没有执行 deploy、resolve、DDL 或 DML。

因此，本轮已经消除“代码链未经验证就进入发布”的风险，并建立了可重复的目标库只读门禁；共享开发库本身仍未就绪，禁止发布依赖后 9 条 migration 的 Ami Brain 动作和数据能力。

## 二、隔离库全链路结果

| 验收项 | 结果 |
| --- | --- |
| PostgreSQL | `postgres:16-alpine` |
| migration 总数 | `105` |
| 空库重放 | `105/105` |
| 增量升级 | `95 -> 105` |
| 空库历史缺失/意外记录 | `0/0` |
| 增量库历史缺失/意外记录 | `0/0` |
| checksum mismatch | `0` |
| failed/rolled back | `0` |
| 关键表、列、索引缺失 | `0` |
| 历史业务样本丢失 | `0` |
| 经营目标回填 | `123456.78` 精确一致 |
| 权限追加 | 原权限保留，新权限追加 |
| 关键数据合同 | 7 类断言全部通过 |
| 隔离容器 | 已自动删除 |
| 共享/生产库写入 | `0` |

隔离链指纹：

- 原始工作树字节链：`c51678f6c6aff16e8b41185fe82f0c0aa5989f4956dda627907135b5f10e41f2`
- 统一 LF 链：`79af533298126ef1c87bd48e5382910c532fed2306793289614506acd8c873b5`

Windows CRLF 与 Linux LF 产生的 checksum 差异在目标库审计中被识别为可解释的换行变体，不计入历史篡改。

## 三、共享开发库只读审计

| 检查项 | 结果 |
| --- | --- |
| 数据库 | PostgreSQL 17.6 / Supabase pooler |
| 本地 migration | `105` |
| 已应用 | `96` |
| 待应用 | `9` |
| 历史 checksum 不一致 | `4` |
| failed/rolled back | `0` |
| unexpected migration | `0` |
| 重复历史记录 | `2` 组 |
| 缺关键表 | `2` |
| 缺关键列 | `11` |
| 缺关键索引 | `6` |
| 审计事务 | `BEGIN READ ONLY` |
| 数据库写入 | `0` |
| 发布结论 | `blocked` |

### 3.1 待应用 migration

1. `20260717130000_store_manager_supply_manage_permission`
2. `20260717220000_customer_service_feedback_core`
3. `20260717233000_customer_waiting_episode_core`
4. `20260718153000_beautician_brain_self_permissions`
5. `20260718190000_card_usage_action_idempotency`
6. `20260718203000_reservation_creation_idempotency`
7. `20260718214500_purchase_order_creation_idempotency`
8. `20260718223000_follow_up_task_creation_idempotency`
9. `20260718234500_supply_platform_idempotency`

### 3.2 历史 checksum 不一致

1. `20260602195000_marketing_recommendation_card_upgrade`
2. `20260619121500_member_card_operator`
3. `20260620152000_project_display_fields`
4. `20260707120000_agent_v3_text_to_sql`

四条 migration 对应的关键结构当前真实存在：营销推荐字段完整、会员余额流水包含 `operatorId`、项目展示字段完整、Text-to-SQL 三张表和 40 个语义视图存在。结论是“结构已存在但来源版本不可追溯”，仍属于发布治理阻断，不能直接修改旧 migration 或用 `migrate resolve` 掩盖。

### 3.3 当前关键结构缺口

- 缺表：`customer_service_feedback`、`customer_waiting_episode`。
- 缺列：预约、次卡核销、手动采购、跟进任务、供应链采购与收货的幂等键和创建指纹共 11 列。
- 缺索引：上述真实动作链路的 6 个唯一幂等索引。

这意味着代码中的客户反馈、等待分析和真实动作幂等保护在共享开发库上尚未具备完整数据库合同。

## 四、发布门禁

### 4.1 已完成

- [x] 空库全量重放。
- [x] 历史基线增量升级。
- [x] 关键历史数据与约束验收。
- [x] 新增 `brain:migration:target-audit` 只读目标库门禁。
- [x] 目标库门禁在全量隔离库返回 `ready`。
- [x] 目标库门禁在共享开发库返回 `blocked`。
- [x] 验收和审计均未写入共享开发库或生产库。

### 4.2 当前 No-Go

共享开发库在以下条件全部完成前不得进入 Ami Brain 正式发布：

1. 对 4 条历史 checksum 差异完成来源核对，形成恢复原文件或签署历史基线例外的明确结论。
2. 获得目标库迁移授权并完成备份/恢复检查。
3. 精确应用 9 条 pending migration，不执行无边界的历史 `resolve`。
4. 重新执行 `brain:migration:target-audit -- --strict`，必须返回 `ready`。
5. 部署后复核 `_prisma_migrations`、关键表/列/索引、权限、经营目标和真实动作幂等约束。

## 五、复现命令

```powershell
npm.cmd --prefix packages/server-v2 run brain:migration:acceptance -- --apply --yes --container=ami-brain-migration-r254 --port=55440 --output-dir="../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-migration-acceptance-2026-07-18-r254"

npm.cmd --prefix packages/server-v2 run brain:migration:target-audit -- --label=shared-development --out="../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-migration-acceptance-2026-07-18-r254/shared-development-migration-readiness.json"
```

机器可读证据：

- `ami-brain-isolated-migration-acceptance-summary.json`
- `shared-development-migration-readiness.json`
