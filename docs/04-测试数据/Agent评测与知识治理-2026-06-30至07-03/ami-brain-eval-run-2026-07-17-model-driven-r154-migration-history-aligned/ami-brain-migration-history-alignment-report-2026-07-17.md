# Ami Brain Migration 历史对齐报告

## 一、结论

当前 Ami Brain 分支与远端数据库的 migration 历史分叉已经解除。只补入数据库已应用的 `20260715150000_store_metrics_core` migration 文件，没有执行任何数据库写入，也没有整体引入 Store Metrics 功能提交。

## 二、对齐对象

| 项目 | 值 |
| --- | --- |
| 源分支 | `codex/store-metrics-core` |
| 源提交 | `c016840a feat: implement store metrics core system` |
| 集成文件 | `packages/server-v2/prisma/migrations/20260715150000_store_metrics_core/migration.sql` |
| 源提交总文件数 | 45 |
| 本轮实际集成文件数 | 1 |

没有 cherry-pick 整个提交，避免把 Store Metrics 后端、管理端、权限、终端和历史脚本未经审查地混入 Ami Brain 主线。

## 三、文件一致性

Git blob 与当前工作文件的 SHA-256 均为：

`75818cd1da9f70e36bbdc0d151fd8ccfd235cdbe117d673851128e43ed8e3d03`

文件共 126 行，DDL/DML 内容保持不变。

## 四、Prisma 状态

对齐后的 `prisma migrate status`：

- 本地共 98 个 migration。
- 数据库独有 migration：0。
- 已应用但本地被修改 migration：0。
- 本地待应用：
  - `20260717130000_store_manager_supply_manage_permission`
  - `20260717220000_customer_service_feedback_core`

Prisma 正常退出 migration 历史分叉判断，只以状态码 1 提示存在待应用 migration。

## 五、验证

| 验证项 | 结果 |
| --- | --- |
| Migration 文件 SHA-256 | 与源 Git blob 完全一致 |
| `prisma migrate status` | 历史一致，仅剩两个待应用项 |
| `prisma validate` | 通过 |
| `server-v2` build | 通过 |
| `git diff --check` | 通过 |

## 六、边界与风险

- 本报告只证明 migration 历史一致，不证明两个待迁移项已落库。
- 当前分支尚未集成 Store Metrics 的 Prisma 模型、服务、API、管理端页面和权限；这些属于独立产品功能，必须单独审查和验收。
- 下一步执行 migration 前必须进行只读 preflight，检查目标表、字段、约束、角色权限、影响行数和回滚方案。
- 未获得用户明确数据库写入授权前，不执行 `migrate deploy`、`db execute` 写入、回填或 `migrate resolve`。
