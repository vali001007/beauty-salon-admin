# Ami Brain R234 隔离数据库 Migration 全链路验收报告

## 结论

当前冻结链共 `104` 条 migration，PostgreSQL 16 空库重放、历史基线增量升级、迁移历史对齐、关键结构、历史数据保留和唯一约束全部通过。生产数据库写入为 `0`。

本报告取代 R232 的 `103` 条 migration 结论。最新 migration 为：

`20260718223000_follow_up_task_creation_idempotency`

## 验收范围

| 场景 | 结果 |
| --- | --- |
| 空库从零重放 | `104/104`，缺失、失败、意外 migration 和 checksum 差异均为 `0` |
| 历史增量升级 | 第 `95` 条基线升级到 `104`，历史数据无丢失 |
| 结构合同 | 关键表、字段和索引缺失均为 `0` |
| 历史事实 | 预约、核销、采购单和跟进任务各保留 `1` 条旧记录 |
| 新幂等字段兼容 | 旧记录的幂等键和创建指纹保持为空，不强制回填伪键 |
| 关键唯一约束 | 核销、预约、采购单、跟进任务重复键均被数据库拒绝 |
| 权限合并 | 店长供应链权限和美容师 Brain 本人范围权限保留 |
| 数据约束 | 客户反馈评分、等待记录结束状态约束通过 |

## 关键证据

- migration 链摘要：`4a89a373ffe50da0e05db8cb349d0272c9ab3d68d4c8f3736666f46e68fca355`
- 空库 history：`appliedCount=104`
- 增量库 history：`appliedCount=104`
- `missingTables=[]`
- `missingColumns=[]`
- `missingIndexes=[]`
- `historicalRowsPreserved=true`
- `keyDataContracts=true`

机器可读证据：

`ami-brain-isolated-migration-acceptance-summary.json`

## 发布判断

当前代码可以进入真实环境的 `preflight -> migrate deploy -> verify` 审批流程，但本报告不等于 migration 已应用到共享库或生产库。新增 migration、修改 `schema.prisma` 或改写既有 `migration.sql` 后，本结论立即失效，必须重新执行全链路验收。
