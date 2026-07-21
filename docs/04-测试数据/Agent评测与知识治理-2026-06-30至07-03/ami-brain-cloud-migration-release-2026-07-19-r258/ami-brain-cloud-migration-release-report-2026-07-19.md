# Ami Brain 云端数据库 9 条 Migration 发布验收报告

日期：2026-07-19

发布分支：`codex/ami-brain-wip`

发布前代码：`973279f2`

## 一、结论

用户授权的 9 条 migration 已完成备份、云端应用和发布后复验：

- 云端 migration：`105/105`，`prisma migrate status` 为 up to date。
- 9 条目标 migration：全部 finished，无 rolled back。
- 严格目标库门禁：`ready`。
- 关键表、列和唯一索引缺失：`0`。
- 店长和美容师权限：新增权限已合并，原权限未覆盖。
- 预约、核销、手动采购、跟进任务和供应链采购历史行：全部保留。
- 旧历史行未伪造幂等键或创建指纹。
- 客户反馈、客户等待和采购收货新表：发布后均为 0 条记录。

数据库 migration 发布完成。客户反馈和客户等待不是“平台不存在”：代码扫描确认管理端页面、后端模块、API 和预约等待流程均已存在；当前缺的是业务采集记录，不继续新增平行业务或第二套页面。

## 二、发布前备份

Supabase session pooler 无法稳定完成约 390MB public schema 的完整数据逻辑备份：一次 full custom dump 超时并在恢复时报告 EOF；一次四并发 directory dump 在复制 `brain_run_step` 时被 pooler 关闭 SSL。两份失败产物未被用作发布依据。

最终采用与本批 migration 回滚范围一致的两段备份：

| 备份 | 结果 |
| --- | --- |
| 完整 public schema | custom-format，1,021,953 bytes，2257 个目录项 |
| 受影响 7 表数据 | custom-format，182,995 bytes，13 个目录项 |
| schema SHA256 | `9284C4CD9F814E8B5E9B6D78B505DF9F521E41F524E4DE4A91D3E4CBA4E06FF9` |
| data SHA256 | `4365BBFABDFD37BD4D07FE15634847724B25E9094D9362591CC4C271DE5A0259` |
| PostgreSQL 17 本地恢复 | schema 和数据均通过 |
| 云端/恢复库行数 | 7 张表逐表一致 |

数据备份范围：`_prisma_migrations`、`Role`、`CardUsageRecord`、`Reservation`、`PurchaseOrder`、`TerminalFollowUpTask`、`ProcurementOrder`。

本批 migration 未修改的高容量运行日志不属于本次回滚包。备份详细路径、哈希和恢复计数见 `cloud-backup-restore-evidence.json`。

## 三、Checksum 历史治理

4 条已应用 migration 的数据库登记 checksum 与当前文件不同。来源审计覆盖当前仓库、全部分支/标签/reflog 和 3 个兄弟 checkout，均未找到登记版本；对应字段、表和 40 个 Agent V3 语义视图真实存在。

本轮没有修改 `_prisma_migrations`，也没有伪造旧 migration 文件。新增目标库专属精确例外清单：

`packages/server-v2/prisma/migration-checksum-exceptions.json`

门禁仅放行该数据库、该 migration 名和该 recorded checksum 的四个组合。任何新增 checksum 差异仍返回 `blocked`。

## 四、已发布 Migration

1. `20260717130000_store_manager_supply_manage_permission`
2. `20260717220000_customer_service_feedback_core`
3. `20260717233000_customer_waiting_episode_core`
4. `20260718153000_beautician_brain_self_permissions`
5. `20260718190000_card_usage_action_idempotency`
6. `20260718203000_reservation_creation_idempotency`
7. `20260718214500_purchase_order_creation_idempotency`
8. `20260718223000_follow_up_task_creation_idempotency`
9. `20260718234500_supply_platform_idempotency`

执行耗时约 29 秒，全部由单次 `prisma migrate deploy` 按历史顺序应用。

## 五、发布后业务合同

| 检查项 | 结果 |
| --- | --- |
| store_manager | 保留原权限并新增 `core:supply:manage` |
| beautician | 保留原权限并新增 Brain 本人范围权限 |
| CardUsageRecord | 254 条保留，旧幂等键非空 0 |
| Reservation | 384 条保留，全部 `bookingSource=manual`，旧幂等键非空 0 |
| PurchaseOrder | 21 条保留，旧幂等键和指纹非空 0 |
| TerminalFollowUpTask | 2065 条保留，旧幂等键和指纹非空 0 |
| ProcurementOrder | 3 条保留，旧单键/批次键非空 0 |
| ProcurementReceipt | 0 条 |
| customer_service_feedback | 0 条 |
| customer_waiting_episode | 0 条 |
| 6 个唯一幂等索引 | 全部存在 |

## 六、产品边界

### 已有管理端/后端，不冻结

- 客户反馈：管理端 `/customers/feedback`、`CustomerFeedbackModule`、查询/录入/处理 API 已存在。
- 客户等待：`CustomerWaitingController/Service` 已存在，并接入预约签到、开始等待和结束等待流程。

这两项本轮不继续新增功能。下一阶段只允许真实业务采集、数据质量和 Ami Brain 评测，不另建表、页面或第二套业务服务。

### 无现有平台合同，继续冻结

- 短信和企微/微信正式渠道。
- 退订、黑名单、模板审核和渠道账单。
- 设备巡检、消防检查、服务事故、员工离职带客风险。
- 优惠授权审批和储值提现审计。

上述能力单独进入管理端/后端缺口报告，不由 Ami Brain 推断或模拟。

## 七、验证

- `prisma migrate status`：up to date。
- `brain:migration:target-audit -- --strict`：`ready`。
- `brain:migration:cloud:verify -- --strict`：全部 6 类检查通过。
- Brain 定向测试：2 suites / 174 tests 通过。
- Brain 全量回归：136 suites / 1815 tests 通过，1 suite / 1 test 跳过。
- 管理端客户反馈 API：1 file / 2 tests 通过。
- `server-v2` build：通过。
- 管理端 typecheck + Vite build：通过。

## 八、进度影响

该任务关闭数据库发布阻断，不新增产品能力任务数。整体仍为 **33/37 项完成，完成度 89.2%**。

“Capability Candidate、权限迁移和正式发布版本收口”中的权限与数据库部分已完成；剩余是候选目录刷新、正式 release 门禁和模型在线评测。
