# Ami Brain 待迁移项只读预检报告

生成时间：2026-07-17T14:29:31.949Z

## 1. 总结

- 总体状态：`ready`
- 数据库写入：未执行
- 是否进入审批：是
- 审批动作：通过 / 修改 / 拒绝
- 审批摘要：2 条待迁移项通过只读预检，可以进入执行审批。

## 2. 20260717130000_store_manager_supply_manage_permission

- 状态：`ready`
- 允许直接进入执行审批：是
- 结论：有效的 store_manager 已满足授予已注册供应链管理权限的条件。
- 回滚边界：回滚必须通过受治理的角色管理从 store_manager 移除 core:supply:manage。

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| migration_history | pass | 该迁移仍待应用，未发现失败或回滚记录。 |
| role_schema | pass | Role 表及迁移所需字段齐全。 |
| store_manager_role | pass | 有效的 store_manager 角色存在。 |
| permission_effect | pass | store_manager 尚未获得 core:supply:manage。 |

风险：

- 执行后会扩大 store_manager 对受治理供应链操作的授权范围。

## 3. 20260717220000_customer_service_feedback_core

- 状态：`ready`
- 允许直接进入执行审批：是
- 结论：依赖表齐全，未发现客户反馈 schema 冲突。
- 回滚边界：生产数据采集前可删除新表回滚；产生业务数据后必须先备份并走受审查迁移。

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| migration_history | pass | 该迁移仍待应用，未发现失败或回滚记录。 |
| foreign_key_dependencies | pass | Store 与 Customer 依赖表齐全。 |
| target_table | pass | customer_service_feedback 尚不存在，不会发生 CREATE TABLE 冲突。 |
| target_schema_contract | pass | 待迁移项将创建完整 schema 合同。 |

风险：

- 迁移将创建一张业务事实表和 8 个索引，应在受控发布窗口执行。

## 4. 执行边界

- 本脚本只读取 migration 历史、系统目录、Role 和 store_manager 权限。
- 本脚本不会执行 migration、resolve、DDL、DML、回填或权限修改。
- 只有状态为 `ready` 且用户另行明确授权后，才可进入 apply -> verify。

## 5. 自动化与验证证据

| 项目 | 结果 |
| --- | --- |
| 命令 | `npm.cmd run brain:migration:preflight -- --strict --out=<report>` |
| 分类器与脚本安全测试 | `10/10` 通过 |
| Brain 全量测试 | 135 个 suite 通过，1 个跳过；`1696/1697` 测试通过 |
| 新增脚本定向 TypeScript 检查 | 通过 |
| `server-v2` build | 通过 |
| 真实数据库预检 | `ready`，严格模式退出码 0 |
| 数据库写入 | `false` |

全量 `tsconfig.agent-eval-scripts.json` 检查仍被既有 Agent V2 脚本的 14 项空值类型错误阻塞；新增预检脚本及分类器的定向 TypeScript 检查通过，本轮未修改这些无关脚本。

## 6. 审批结论

两条迁移均已满足进入执行审批的技术条件。当前可选动作是：

- 通过：另行授权后按 `preflight -> apply -> verify` 执行两条 migration。
- 修改：调整权限范围、执行顺序、发布时间或回滚方案后重新预检。
- 拒绝：保持数据库现状，客户反馈能力继续维持代码就绪但不可真实运行。

本报告不是数据库执行授权，也不证明客户反馈表和供应链权限已经落库。
