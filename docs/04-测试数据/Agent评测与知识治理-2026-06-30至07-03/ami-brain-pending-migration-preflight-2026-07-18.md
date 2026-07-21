# Ami Brain 待迁移项只读预检报告

生成时间：2026-07-18T04:36:29.606Z

## 1. 总结

- 总体状态：`ready`
- 数据库写入：未执行
- 是否进入审批：是
- 审批动作：通过 / 修改 / 拒绝
- 审批摘要：4 条待迁移项通过只读预检，可以进入执行审批。

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

## 4. 20260717233000_customer_waiting_episode_core

- 状态：`ready`
- 允许直接进入执行审批：是
- 结论：依赖表齐全，未发现等待事实 schema 冲突。
- 回滚边界：产生真实等待数据前可删表回滚；产生业务数据后必须先备份并走受审查迁移。

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| migration_history | pass | 该迁移仍待应用，未发现失败或回滚记录。 |
| waiting_dependencies | pass | Store、Customer 与 Reservation 依赖表齐全。 |
| waiting_target_table | pass | customer_waiting_episode 尚不存在，不会发生 CREATE TABLE 冲突。 |
| waiting_schema_contract | pass | 待迁移项将创建完整等待事实 schema 合同。 |

风险：

- 迁移将创建客户等待业务事实、原因约束和预约级活动等待唯一索引。

## 5. 20260718153000_beautician_brain_self_permissions

- 状态：`ready`
- 允许直接进入执行审批：是
- 结论：有效的 beautician 角色已满足授予本人范围 Ami Brain 权限的条件。
- 回滚边界：回滚必须通过受治理的角色管理移除 core:brain:use、core:brain:beautician-view、core:store:reservations。

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| migration_history | pass | 该迁移仍待应用，未发现失败或回滚记录。 |
| role_schema | pass | Role 表及迁移所需字段齐全。 |
| beautician_role | pass | 有效的 beautician 角色存在。 |
| permission_effect | pass | beautician 仍缺少 core:brain:use、core:brain:beautician-view。 |

风险：

- 执行后美容师可访问 Ami Brain，但能力执行仍受当前门店、登录账号绑定美容师身份和能力声明共同限制。

## 6. 执行边界

- 本脚本只读取 migration 历史、系统目录、Role、store_manager 和 beautician 权限。
- 本脚本不会执行 migration、resolve、DDL、DML、回填或权限修改。
- 只有状态为 `ready` 且用户另行明确授权后，才可进入 apply -> verify。
