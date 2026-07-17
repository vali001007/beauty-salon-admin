# Ami Brain 待迁移项只读预检报告

生成时间：2026-07-17T14:55:43.315Z

## 1. 总结

- 总体状态：`ready`
- 数据库写入：未执行
- 是否进入审批：是
- 审批动作：通过 / 修改 / 拒绝
- 审批摘要：3 条待迁移项通过只读预检，可以进入执行审批。

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

## 5. 执行边界

- 本脚本只读取 migration 历史、系统目录、Role 和 store_manager 权限。
- 本脚本不会执行 migration、resolve、DDL、DML、回填或权限修改。
- 只有状态为 `ready` 且用户另行明确授权后，才可进入 apply -> verify。

## 6. 等待流失代码就绪证据

- 新增统一 `CustomerWaitingEpisode` 事实模型和受约束 migration。
- 预约签到自动开始等待记录；同一预约的活动等待记录幂等。
- 前台预约页支持开始等待、开始服务和结构化离店原因。
- Brain 新增 `customer_waiting_loss_overview`，只认明确的 `wait_too_long`。
- 两项语义指标均为无阻塞 draft：等待过久离店客户数、等待记录覆盖率。

## 7. 验证

| 验证项 | 结果 |
| --- | --- |
| 等待服务、预约集成、migration | `9/9` 通过 |
| Brain 专用能力 suite | `29/29` 通过 |
| 语义意图、模板、评测期望、resolver | `65/65` 通过 |
| 迁移预检 | `11/11` 通过 |
| Brain 全量测试 | 135 个 suite 通过，1 个跳过；`1698/1699` 测试通过 |
| `server-v2` build | 通过 |
| Prisma validate | 通过 |
| 管理端应用 build | 通过 |
| 数据库写入 | `false` |

## 8. 当前边界

本报告证明三条待迁移项均可进入审批，不证明任何新表或权限已经落库。等待流失能力当前为代码就绪；真实库没有等待事实表，也没有可用于产品验收的真实等待记录。
