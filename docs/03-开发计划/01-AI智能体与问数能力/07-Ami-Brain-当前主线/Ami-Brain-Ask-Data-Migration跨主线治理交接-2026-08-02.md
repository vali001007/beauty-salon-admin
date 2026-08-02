# Ami Brain / Ask Data Migration 跨主线治理交接

> 日期：2026-08-02
> 目标：明确共享开发库的 Ask Data migration 归属，并保持 Ami Brain 与 Ask Data 两条主线独立。
> 操作边界：已完成 Ask Data 本地归属 commit；未将该 commit 纳入 Ami Brain，未 push、未执行新的 migration 写入或数据库修改。

## 1. 结论

`20260802123000_ask_data_supplier_transfer_quality_contract` 是一条技术内容有效、数据库应用记录完整，且已经由 Ask Data 分支独立提交的 migration。

它不是 Ami Brain 自有功能，也不是可以忽略的“多余 migration”。正确处理方式是：

1. 该 migration 只归属 Ask Data 分支，不纳入 Ami Brain 分支。
2. 共享开发库同时承载多条开发主线，因此不能作为 Ami Brain 正式候选的严格 migration 身份证据。
3. Ami Brain 正式 `target_database` receipt 必须使用与 Ami Brain migration inventory 一致的独立目标库。

禁止在 Ami Brain 主线手工重写、改名、复制或 cherry-pick 该 migration，也禁止增加通用 unexpected/checksum 例外掩盖共享库历史。

## 2. 文件与数据库身份

Migration：

```text
20260802123000_ask_data_supplier_transfer_quality_contract
```

当前唯一源文件：

```text
/Users/ju/Documents/ami/beauty-salon-admin-ask/packages/server-v2/prisma/migrations/20260802123000_ask_data_supplier_transfer_quality_contract/migration.sql
```

Ask Data worktree：

- 分支：`codex/ami-ask-business-expansion-20260802`
- 归属 commit：`3fe4ce41dd3a0caf93d5c9cf6393d24cc3d767ca`
- 文件状态：已在 Ask Data 分支本地提交，未 push
- 文件 SHA-256：`daf64bf498eb938f85deabe7ffcf3b1d6e98e60f377b13d776a2efc8b3a30c22`

共享 Supabase 开发库 `_prisma_migrations` 记录：

- checksum：`daf64bf498eb938f85deabe7ffcf3b1d6e98e60f377b13d776a2efc8b3a30c22`
- 与文件 checksum：完全一致
- startedAt：`2026-08-02T10:42:42.929Z`
- finishedAt：`2026-08-02T10:42:43.891Z`
- rolledBackAt：`null`
- migration logs：无错误日志

判断：数据库并非被未知 SQL 手工修改；实际应用的就是 sibling worktree 中这份 migration 字节。

## 3. Migration 的业务作用

### 3.1 供应商交付天数

原 View 直接计算：

```sql
received_or_updated_at - created_at
```

当来源时间戳抖动或测试数据倒序时，会得到负交付天数。新 migration 在语义 View 边界使用 `GREATEST(..., 0)`，将无效负值归零。

产品影响：避免“平均交付天数为负数”进入供应商排行和经营回答；它修正查询口径，不修改采购单原始数据。

### 3.2 自门店调拨重复

原 `ask_data_transfer_status_view` 会同时产生 outbound 和 inbound 两个门店视角。如果历史/demo 数据的 `fromStoreId=toStoreId`，同一门店、同一调拨单会出现两行。

新 migration 保留 outbound 视角，只对 inbound 增加：

```sql
WHERE transfer."fromStoreId" <> transfer."toStoreId"
```

产品影响：列表、计数和排行不再把自门店异常调拨重复计算；正常跨店调拨仍保留双门店视角。

### 3.3 只读角色权限

如果 `ask_data_free_sql_readonly` 角色存在，migration 为两张 View 授予 SELECT，不授予 INSERT、UPDATE 或 DELETE。

## 4. 数据库实际结果

只读审计结果：

| 项目 | 结果 |
| --- | ---: |
| `agent_v3_supplier_performance_view` 行数 | 2 |
| 负 `avg_delivery_days` 行数 | 0 |
| `ask_data_transfer_status_view` 行数 | 5 |
| 同门店同调拨单重复组数 | 0 |
| `ask_data_free_sql_readonly` 角色 | 存在 |
| supplier View SELECT | 已授权 |
| transfer View SELECT | 已授权 |

两张 View 的数据库定义分别包含 `GREATEST` 和自门店 inbound 去重条件，符合 migration SQL。

## 5. 兼容性与风险

- 使用 `CREATE OR REPLACE VIEW`，列名、列顺序和类型与原 View 合同一致，没有删除表、列或业务数据。
- 依赖的原始 View 已分别由 `20260707120000_agent_v3_text_to_sql` 和 `20260802090000_ask_data_free_sql_business_expansion` 创建；这两条 migration 已存在于 Ami Brain 当前基线。
- 时间戳 `20260802123000` 位于 Ask Data 的 `121500` 与 `124500` 之间；该排序只属于 Ask Data 主线。
- sibling worktree 还存在后续 `20260802124500_ask_data_customer_behavior_profile`，但它尚未出现在共享库 applied history，不属于本次 unexpected migration 修复范围，不能捆绑带入。
- migration 已经应用，不能通过删除文件或修改旧 SQL 回滚。若未来需恢复旧 View 口径，应新增 forward migration 重新 `CREATE OR REPLACE VIEW`，并另行验收。

## 6. 代码与测试证据

Ask Data 定向验证：

- `ask-data-free-sql.migration.spec.ts` 与 `ask-data-semantic-router.spec.ts`：45/45 passed。
- `ask-data:free-sql:gold-governance:test`：1/1 passed；34 张 View 每张均有至少 10 道稳定且唯一的 Gold 题。
- 供应商和调拨语义路由已有对应 metric/view 合同；migration 不是孤立无调用方的数据库对象。

边界：上述测试证明 migration 与当前 Ask Data 工作区代码一致，不等于整个 Ask Data 主线已可发布，也不能替代 dedicated readonly 生产验收。

## 7. 已完成的最小归属提交

Ask Data 分支已经形成一个窄提交：

```text
packages/server-v2/prisma/migrations/20260802123000_ask_data_supplier_transfer_quality_contract/migration.sql
```

提交说明：

```text
fix(ask-data): preserve supplier and transfer view quality contract
```

实际 commit：

```text
3fe4ce41dd3a0caf93d5c9cf6393d24cc3d767ca
```

该 commit 只包含 1 个 migration 文件，没有吸收 sibling worktree 的其他 Ask Data 改动。

## 8. Ami Brain 目标数据库隔离顺序

1. 保持 `3fe4ce4` 只在 Ask Data 分支，不合并到 Ami Brain。
2. 为 Ami Brain 试运行准备独立目标数据库，其 migration history 只包含 Ami Brain 候选基线要求的 migration。
3. 在独立目标库执行批准的 `migrate deploy` 和 post-verify。
4. 部署 candidate 后运行带 candidate lock 的正式审计：

```bash
cd /Users/ju/Documents/ami/beauty-salon-admin/packages/server-v2
npm run brain:migration:target-audit -- \
  --candidate-lock=<LOCK> \
  --label=<AMI_BRAIN_TRIAL_DATABASE> \
  --out=outputs/ami-brain-release-candidates/<CANDIDATE_ID>/artifacts/target-database.json \
  --strict
```

5. 预期结果：审计数据库目标与部署 ready 完全一致，`pending=[]`、`checksumMismatches=[]`、`unexpected=[]`、关键结构无缺失、`status=ready`。
6. 共享 Supabase 开发库可以继续用于多主线开发联调，但不得签发 Ami Brain 正式 `target_database` receipt。

## 9. 当前状态

Ask Data 归属判定：**已完成本地 commit**。
发布判定：**仍为 No-Go**。

剩余动作是准备与 Ami Brain migration inventory 一致的独立试运行数据库；不再以跨主线合并方式解决。
