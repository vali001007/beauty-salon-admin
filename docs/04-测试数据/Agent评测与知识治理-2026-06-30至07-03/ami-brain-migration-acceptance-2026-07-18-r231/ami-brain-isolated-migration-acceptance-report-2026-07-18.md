# Ami Brain P0 隔离库 Migration 全链路验收报告 R231

## 一、结论

本轮 P0 验收通过，当前发布候选的 **102 条 migration 已完成全链路验证**。

- PostgreSQL 16 空库从零重放 `102/102` 成功。
- 从第 95 条历史基线增量升级到第 102 条成功。
- 空库和增量库的 migration 名称、数量、状态与 checksum 全部和仓库一致，差异为 `0`。
- 历史预约、次卡核销、角色权限和经营目标数据均保留；新增字段与回填结果正确。
- 关键业务表、字段、索引和数据约束全部通过。
- 全程只使用脚本创建的 `127.0.0.1` 一次性 PostgreSQL 容器，生产数据库写入为 `0`。

当前可以消除“代码已经提交，但数据库 migration 链尚未证明可部署”的发布风险。该结论只覆盖当前冻结的 102 条 migration；新增 migration 后必须重新执行本门禁。

## 二、验收范围

| 项目 | 结果 |
| --- | --- |
| 首条 migration | `20260530030751_init` |
| 最新 migration | `20260718203000_reservation_creation_idempotency` |
| migration 总数 | `102` |
| SQL 总大小 | `432005` bytes |
| migration 链摘要 | `ea876c1b5d851cca622caaa5da252360b5c519ef1271c5711bde8125c4a62b2f` |
| 历史增量基线 | 第 95 条 `20260715095000_store_manager_brain_read_permissions` |
| 增量范围 | `95 -> 102`，共 7 条 |
| PostgreSQL | `postgres:16-alpine` |
| 生产数据库写入 | `0` |

增量范围覆盖：

1. 门店通用指标事实与预约状态关联。
2. 店长供应链管理权限。
3. 客户反馈事实表。
4. 客户等待记录事实表。
5. 美容师本人范围 Brain 权限。
6. 次卡核销业务幂等。
7. 预约创建业务幂等。

## 三、迁移历史对齐

| 检查项 | 空库 | 增量库 |
| --- | --- | --- |
| 已应用 migration | `102` | `102` |
| 缺失 migration | `0` | `0` |
| 非仓库 migration | `0` | `0` |
| checksum 差异 | `0` | `0` |
| 未完成或已回滚记录 | `0` | `0` |
| `prisma migrate status` | up to date | up to date |

仓库仍有两组历史重复时间前缀：

- `20260712210000_*`
- `20260713120000_*`

Prisma 按完整目录名稳定排序，数据库记录和 checksum 已一致。不得重命名这些已应用 migration；后续新 migration 必须使用唯一时间前缀。

## 四、空库重放

空库 `ami_migration_empty` 从零应用全部 102 条 migration，结果如下：

- `prisma validate` 通过。
- `prisma migrate deploy` 完整成功。
- `prisma migrate status` 返回 `Database schema is up to date!`。
- `_prisma_migrations` 无失败、回滚、缺失或 checksum 漂移。
- 不依赖人工建表、`resolve --applied`、手工补数据或复用历史数据库。

这证明当前 migration 链可以构建一套新的完整业务数据库。

## 五、历史基线增量升级

增量库先应用前 95 条 migration，再写入代表性历史数据：

- 门店和两类角色原权限。
- 月度经营目标 `123456.78`。
- 1 条历史预约。
- 1 条历史次卡核销记录。
- 对应客户和项目。

随后应用第 96 至 102 条 migration，结果如下：

| 验证项 | 结果 |
| --- | --- |
| 历史预约 | `1 -> 1`，无丢失 |
| 预约旧数据新字段 | `idempotencyKey`、`creationFingerprint` 为 `NULL`；`bookingSource = manual` |
| 历史次卡核销 | `1 -> 1`，无丢失 |
| 核销旧数据幂等字段 | `idempotencyKey = NULL` |
| 月度经营目标回填 | `store.operating_revenue.month = 123456.78` |
| `store_manager` 原权限 | 保留 `existing:store-manager` |
| `store_manager` 新权限 | 新增 `core:supply:manage` |
| `beautician` 原权限 | 保留 `existing:beautician` |
| `beautician` 新权限 | 新增 3 条本人范围权限 |

## 六、关键表与数据合同

已验证以下关键对象存在：

- Brain 会话、消息、运行、动作执行、Ontology 与能力再生成表。
- 业务定义、语义证据、门店指标目标和指标快照表。
- 客户反馈与客户等待记录表。
- `CardUsageRecord` 和 `Reservation` 幂等字段与唯一索引。

真实数据合同结果：

| 合同 | 结果 |
| --- | --- |
| 客户反馈合法记录写入 | 通过 |
| 客户等待合法记录写入 | 通过 |
| 反馈评分 `6` | 被约束拒绝 |
| 等待中同时标记已服务 | 被状态一致性约束拒绝 |
| 预约重复幂等键 | 被唯一索引拒绝 |
| 次卡核销重复幂等键 | 被唯一索引拒绝 |

## 七、自动化门禁

新增命令：

```powershell
npm.cmd --prefix packages/server-v2 run brain:migration:acceptance -- --apply --yes --output-dir=<证据目录>
```

脚本自动完成：

1. migration 目录、SQL 文件和链摘要检查。
2. 一次性本地 PostgreSQL 容器创建。
3. 空库完整重放。
4. 第 95 条历史基线构造与代表性数据写入。
5. `95 -> 当前` 增量升级。
6. checksum、结构、数据、权限、回填和约束验收。
7. JSON 原始证据落盘。
8. 容器和临时基线目录自动销毁。

安全门禁：

- 必须显式传入 `--apply --yes`。
- 容器名必须以 `ami-brain-migration-` 开头。
- 数据库只绑定 `127.0.0.1`。
- 已存在同名容器时拒绝复用或删除。
- 任一 migration 失败后销毁隔离环境，从全新数据库重跑。
- 当前冻结 migration 数量为 `102`；数量漂移时脚本直接失败，要求重新审查并更新门禁。

交付验证：

| 验证项 | 结果 |
| --- | --- |
| 门禁脚本语法检查 | `node --check` 通过 |
| 最终隔离库完整复跑 | 7 项断言全部通过 |
| `packages/server-v2` 正式构建 | `nest build` 通过 |
| 隔离容器清理 | 验收后容器不存在 |

## 八、发布判断

### Go

- 当前 102 条 migration 可以进入后续真实环境的 `preflight -> deploy -> verify` 审批流程。
- 当前发布候选不需要 `resolve --applied`，不需要人工删数据，不需要修改历史 migration。

### 仍需审批

- 本报告不授权对共享开发库、测试库或生产库执行 migration。
- 真实环境执行前仍需只读 preflight、备份/恢复点、连接信息复核和用户审批。
- 新增第 103 条 migration 后，本报告自动失效，必须重新运行全链路验收。

## 九、证据

- `ami-brain-isolated-migration-acceptance-summary.json`
- 本报告对应分支：`codex/ami-brain-wip`
- 隔离容器：`ami-brain-migration-r231`，验收后已自动销毁。
