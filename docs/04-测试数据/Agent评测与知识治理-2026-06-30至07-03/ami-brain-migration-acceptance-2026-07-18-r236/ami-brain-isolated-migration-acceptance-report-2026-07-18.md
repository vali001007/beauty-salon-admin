# Ami Brain R236 隔离数据库 Migration 全链路验收报告

## 结论

当前冻结链共 `105` 条 migration。PostgreSQL 16 空库重放、迁移历史与 checksum 对齐、第 95 条历史基线增量升级、关键结构、历史数据保留和唯一约束全部通过。共享库和生产数据库写入为 `0`。

本报告取代 R234 的 `104` 条 migration 结论。最新 migration 为：

`20260718234500_supply_platform_idempotency`

## 验收范围

| 场景 | 结果 |
| --- | --- |
| migration 静态清点 | `105` 条，SQL 缺失、空文件和重复时间戳均为 `0` |
| 空库从零重放 | `105/105`，缺失、失败、意外 migration 和 checksum 差异均为 `0` |
| 历史增量升级 | 第 `95` 条基线升级到 `105`，历史数据无丢失 |
| 结构合同 | 关键表、字段和索引缺失均为 `0` |
| 历史事实 | 预约、核销、手动采购单、跟进任务和供应链采购单旧记录全部保留 |
| 新字段兼容 | 历史 `ProcurementOrder` 的幂等键、创建指纹和批次键保持为空 |
| 关键唯一约束 | 原有四类动作及供应链采购单、采购收货重复键均被数据库拒绝 |
| 权限与数据约束 | 店长/美容师权限合并、经营目标回填、客户反馈与等待约束全部通过 |

## 关键证据

- migration 链摘要：`c51678f6c6aff16e8b41185fe82f0c0aa5989f4956dda627907135b5f10e41f2`
- 空库 history：`appliedCount=105`
- 增量库 history：`appliedCount=105`
- 增量基线：`95 -> 105`
- `missingTables=[]`
- `missingColumns=[]`
- `missingIndexes=[]`
- `historicalRowsPreserved=true`
- `keyDataContracts=true`

机器可读证据：

`ami-brain-isolated-migration-acceptance-summary.json`

## 验收脚本修复

本轮首次执行暴露 PostgreSQL 官方镜像初始化阶段会短暂启动临时服务，旧脚本在第一次 `pg_isready` 成功后立即建库，可能与临时服务关闭发生竞争。门禁已改为连续两次健康检查通过后再创建数据库，随后完整重跑通过。

## 发布判断

当前 105 条 migration 可以进入真实环境的 `preflight -> migrate deploy -> verify` 审批流程。本报告不等于 migration 已应用到共享库或生产库。新增 migration、修改 `schema.prisma` 或改写既有 `migration.sql` 后，本结论立即失效，必须重新执行全链路验收。
