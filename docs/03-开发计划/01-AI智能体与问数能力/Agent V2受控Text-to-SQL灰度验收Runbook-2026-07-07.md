# Agent V2 受控 Text-to-SQL 灰度验收 Runbook

日期：2026-07-07

## 1. 目标

本 Runbook 用于把 Agent V2 受控 Text-to-SQL 从本地 dry-run 推进到指定门店管理员灰度。它只覆盖只读问数兜底，不覆盖写操作、不覆盖自由 SQL、不覆盖旧 Semantic SQL / BusinessQuery 复用。

产品边界：

- 已发布能力 / QueryPlan DSL 仍是主路径。
- Text-to-SQL 只在已发布能力未命中、问题属于低风险只读分析、当前用户具备权限时作为兜底。
- 默认只开放管理员或管理角色，普通用户不默认进入兜底。
- 高频成功问题只能沉淀为能力中心草稿，不自动发布。

## 2. 环境开关

本地 dry-run 默认：

```env
AGENT_V2_TEXT_TO_SQL_ENABLED=false
AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY=true
AGENT_V2_TEXT_TO_SQL_MAX_LIMIT=100
AGENT_V2_TEXT_TO_SQL_TIMEOUT_MS=5000
AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS=365
AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST=100000
AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL=
```

灰度执行前必须补齐：

```env
AGENT_V2_TEXT_TO_SQL_ENABLED=true
AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY=true
AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL=postgresql://readonly_user:***@host:5432/db
```

只读库要求：

- 必须是独立只读账号，不使用主业务写库账号。
- 只授予 40 个 `agent_v2_*_view` 的 `SELECT` 权限。
- 不授予源业务表直接查询权限。
- 不授予 `INSERT`、`UPDATE`、`DELETE`、`CREATE`、`DROP`、`ALTER`、`TRUNCATE`。
- 可由 DBA 使用 `packages/server-v2/prisma/agent-v2-text-to-sql-readonly-grants.template.sql` 作为授权模板；执行前必须替换角色名和强密码。
- 模板会检查只读角色是否仍通过自身或 `PUBLIC` 拥有 `public` schema 的 `CREATE` 权限；若检查失败，DBA 需先收敛 schema 权限再配置只读 URL。

## 3. 本地门禁

执行：

```powershell
npm.cmd run check:agent-v2-text-to-sql
```

展开命令：

```powershell
rg -n "semantic-sql|semantic-query|business-query|business-task" packages/server-v2/src/agent-v2/text-to-sql
npm.cmd --prefix packages/server-v2 run db:generate
npm.cmd --prefix packages/server-v2 run agent-v2:text-to-sql-readiness -- --allow-missing-readonly
npm.cmd --prefix packages/server-v2 test -- agent-v2-text-to-sql.config.spec.ts agent-v2-text-to-sql-planner.service.spec.ts agent-v2-sql-ast-parser.service.spec.ts agent-v2-sql-cost-guard.service.spec.ts agent-v2-readonly-sql-executor.service.spec.ts agent-v2-text-to-sql-answer-composer.service.spec.ts agent-v2-text-to-sql-security.spec.ts agent-v2-text-to-sql-candidate.service.spec.ts agent-v2-orchestrator.service.spec.ts agent-v2-text-to-sql-migration.spec.ts agent-v2-text-to-sql-audit.service.spec.ts agent-v2-controlled-text-to-sql.service.spec.ts agent-v2-sql-guard.service.spec.ts agent-v2-semantic-view-registry.service.spec.ts agent-v2-text-to-sql-isolation.spec.ts agent-v2-capability-center.dto.spec.ts agent-v2-capability-center.service.spec.ts agent-v2-text-to-sql.controller.spec.ts --runInBand
npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
git diff --check
```

通过口径：

- `rg` 无匹配，说明新模块没有运行时 import 旧问数链路。
- readiness 本地 gate 显示 40 个 SELECT-only 视图、40 条 seed、13 个 enabled runtime views、3 张审计/配置表和只读授权模板均通过。
- 后端 Text-to-SQL 定向测试通过。
- 治理中心 `受控SQL` 标签测试通过。
- 后端和管理端 build 通过。

## 4. 只读库严格门禁

### 4.1 真实库完成度只读审计

在执行 DBA 授权或配置只读 URL 前，先确认目标主库是否已经应用 Text-to-SQL migration：

```powershell
npm.cmd run check:agent-v2-text-to-sql:completion-audit
```

该命令只读执行，不会创建视图、不会执行 migration、不会写数据。

通过口径：

- `primary_migration_status`：`20260707013000_agent_v2_text_to_sql` 已在 `DATABASE_URL` 对应数据库完成。
- `readonly_database_url`：已配置独立 `AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL`。
- `nextActions`：如果任一 gate 未通过，按 JSON 中列出的动作继续处理；该字段会把缺 migration、缺只读 URL、只读账号未隔离、真实只读连接失败、写入探针未被阻断等问题翻译成下一步 DBA/部署动作。
- 如果 `primary_migration_status` 显示 `not applied`，先按发布窗口执行 migration，再继续 DBA 只读授权。
- 如果 `readonly_database_url` 显示 `missing`，先创建只读账号并配置环境变量，再执行 strict readiness。

当前本地审计证据：`migration_file` 和 `readonly_grants_template` 已通过；`primary_migration_status=20260707013000_agent_v2_text_to_sql not applied`，`readonly_database_url=missing`，因此还不能进入真实 execute 验收。

### 4.2 DBA / 部署平台交接清单

交接目标：

- 先把 `20260707013000_agent_v2_text_to_sql` 安全应用到目标主库。
- 再创建独立只读账号，只授权 40 个白名单语义视图。
- 最后配置 `AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL` 并跑 strict readiness。

执行顺序：

| 步骤 | 操作 | 是否写库 | 执行人 | 通过证据 |
| --- | --- | --- | --- | --- |
| 1 | `npm.cmd run check:agent-v2-text-to-sql` | 否 | 开发/发布负责人 | 本地完整 gate 通过 |
| 2 | `npm.cmd run check:agent-v2-text-to-sql:completion-audit` | 否 | 开发/发布负责人 | 当前只读审计明确显示 migration 是否已应用、只读 URL 是否配置 |
| 3 | `npm.cmd --prefix packages/server-v2 run db:migrate:prod` | 是 | 发布负责人/DBA，需生产窗口授权 | `20260707013000_agent_v2_text_to_sql` 出现在 `_prisma_migrations` |
| 4 | 使用 `packages/server-v2/prisma/agent-v2-text-to-sql-readonly-grants.template.sql` 创建/更新只读账号 | 是 | DBA | 只读角色存在，只授予 40 个 `agent_v2_*_view` 的 `SELECT` |
| 5 | 在后端部署环境配置 `AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL` | 否，配置变更 | 部署负责人 | URL 使用独立只读用户名，且不等于 `DATABASE_URL` |
| 6 | `npm.cmd --prefix packages/server-v2 run agent-v2:text-to-sql-readiness:strict -- --store-id=1` | 否，含只读查询和写入负向探针 | 发布负责人/DBA | `database_views`、`semantic_view_seed_rows`、`explain_smoke`、`readonly_select_smoke`、`readonly_write_block` 全部通过 |
| 7 | `npm.cmd run check:agent-v2-text-to-sql:release` | 否 | 发布负责人 | 本地 gate + completion audit 全部通过 |

写库操作边界：

- 步骤 3 会对目标库执行 Prisma migration，创建 3 张审计/配置表、40 个只读语义视图和 seed 元数据；必须有明确目标库和维护窗口。
- 步骤 4 会创建/修改只读角色和授权；必须由 DBA 或具备数据库权限的负责人执行。
- 步骤 1、2、6、7 不应创建业务数据；strict readiness 的写入负向探针必须被只读权限阻断，若写入成功即验收失败。

回执证据：

- migration 回执：`_prisma_migrations` 中存在 `20260707013000_agent_v2_text_to_sql`。
- 授权回执：只读账号无源表直连权限，无 schema `CREATE` 权限，仅 40 个语义视图 `SELECT`。
- 环境回执：`AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL` 已配置，用户名与 `DATABASE_URL` 不同。
- 验收回执：strict readiness JSON 全部 pass，completion audit 全部 pass。

### 4.3 独立只读连接严格门禁

配置 `AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL` 后执行：

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:text-to-sql-readiness:strict -- --store-id=1
```

通过口径：

- `database_views`：40 个白名单语义视图存在。
- `database_tables`：3 张审计/配置表存在。
- `semantic_view_seed_rows`：40 条 metadata row 和 13 个 enabled runtime views 一致；每行必须有非空 `requiredPermissionsJson`、结构化 `fieldPoliciesJson`，非管理员视图必须有 `storeScopeField`，大部分业务视图必须有 `defaultTimeField`。
- `readonly_url_isolation`：`DATABASE_URL` 必须存在以完成隔离对比；`AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL` 必须与主 `DATABASE_URL` 不同，且不能复用主库连接的数据库用户名；不满足则直接失败且不连接数据库。
- `explain_smoke`：`agent_v2_order_item_sales_view` 可执行 `EXPLAIN (FORMAT JSON)`。
- `readonly_select_smoke`：只读事务内可执行 SELECT。
- `readonly_write_block`：只读连接不能创建持久表；如果写入探针成功，strict readiness 必须失败。
- DBA 或数据库控制台可额外复核只读账号权限，但不能替代 strict readiness。

## 5. 灰度步骤

### D0 准备

- 确认 migration 已执行到目标灰度库。
- 使用 `packages/server-v2/prisma/agent-v2-text-to-sql-readonly-grants.template.sql` 创建/更新独立只读账号，并配置 `AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL`。
- 执行 strict readiness。
- 管理端进入 `系统设置 / AI 治理中心 / 受控SQL`，确认状态为启用且可执行。

### D1 小流量管理员灰度

- 只给 1 个测试门店管理员开放。
- 保持 `AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY=true`。
- 只验证 P0 高频问题：
  - 本月销量最好的商品
  - 最近30天报废的产品有哪些
  - 上个月营业额
  - 6月份员工绩效排名
  - 高消费客户最近复购是否下降

验收：

- 已发布能力命中时不进入 Text-to-SQL。
- 未命中已发布能力时，管理员可进入受控 Text-to-SQL。
- 普通用户不会进入 Text-to-SQL。
- 用户端不展示 raw SQL、AST、表结构和堆栈。
- no_data、blocked、failed 都有可理解反馈。

### D2-D7 扩大灰度

- 扩到 3-5 个门店管理员。
- 每天检查 `受控SQL` 标签：
  - blocked 数量和 Top reason
  - no_data 数量
  - failed 数量
  - 高频候选能力
  - 是否有敏感字段或越权意图
- 高频成功候选只进入能力中心草稿，仍需 dry-run、权限、评测门禁和人工发布。

## 6. 回滚策略

立即回滚：

```env
AGENT_V2_TEXT_TO_SQL_ENABLED=false
```

降级回滚：

```env
AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY=true
AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL=
```

回滚后预期：

- 已发布能力 / QueryPlan DSL 继续可用。
- Text-to-SQL 兜底不再执行。
- 历史审计 run 保留，用于分析 blocked/no_data/failed。
- 已沉淀的能力草稿不自动发布，不影响线上问答。

## 7. 生产前必须补齐的证据

生产开放前必须同时满足：

- `npm.cmd run check:agent-v2-text-to-sql:release` 通过；该命令会先执行本地完整 gate，再执行真实库 completion audit。
- 只读 DB 账号和视图权限完成。
- strict readiness 通过。
- 7 天灰度样本中无高危越权、敏感字段泄露、写操作执行。
- P0 问题有用率达到产品验收线。
- blocked/no_data/failed 有明确处理路径。
- 管理端审计页可查看运行证据和阻断原因。
- 生产回滚开关已演练。

不满足上述条件时，只能保持本地或灰度状态，不进入生产默认兜底。
