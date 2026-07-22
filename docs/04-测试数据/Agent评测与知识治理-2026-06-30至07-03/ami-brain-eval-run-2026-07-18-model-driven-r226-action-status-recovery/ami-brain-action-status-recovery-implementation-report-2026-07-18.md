# Ami Brain R226 动作状态持久化恢复实施报告

日期：2026-07-18

范围：动作执行状态读取、管理端会话恢复、创建预约幂等边界审计

分支：`codex/ami-brain-wip`

## 一、结论

本单元补齐了真实动作闭环中的“刷新后可追溯”能力。用户重新打开会话或选择历史回答时，管理端会从后端恢复动作的待确认、执行中、成功、失败、过期和拒绝状态，并显示真实业务回执或失败恢复策略。

创建预约仍不允许自动重试。原因不是 Brain 没有 execution 唯一键，而是统一预约业务表没有外部幂等键和唯一约束。业务写入成功但回执持久化失败时，Brain 无法证明预约是否已经创建；自动重试存在重复预约风险。

## 二、代码实现

### 2.1 后端状态接口

新增：

```text
GET /brain/runs/:runId/actions
```

接口使用当前认证上下文中的 `userId` 和 `storeId`，只读取同一 run、同一用户、同一门店的 `BrainActionConfirmation` 和 `BrainActionExecution`。响应包括：

- `actionId`、`executionId`、`status`
- `receipt`
- `retryable`
- `recovery`
- `error`

查询不接受客户端传入用户或门店，不存在 roleHint 绕权入口。

### 2.2 管理端恢复

- 加载回答 Trace 时并行加载该 run 的动作状态。
- 成功动作恢复业务对象类型、ID 和回执文案。
- 安全重放动作恢复失败原因和“重试执行”入口。
- 创建类失败动作恢复人工核对提示，不开放自动重试。
- 待确认动作仍可确认或拒绝。
- 切换会话或门店时清空旧状态缓存。

### 2.3 幂等边界

审计证据：

- `Reservation` 没有外部幂等字段或唯一索引。
- `ReservationsService.create` 直接调用 `prisma.reservation.create`。
- 当前只能保证 Brain execution 记录唯一，不能保证预约业务写入唯一。

因此本单元没有使用 `remark`、客户 + 项目 + 时间组合或 Brain actionId 模拟业务幂等。完整方案已经登记到《Ami-Brain-管理端与后端能力缺失待补齐报告》。

## 三、安全边界

| 风险 | 当前控制 |
| --- | --- |
| 跨门店读取动作结果 | 查询固定带当前 `storeId` |
| 读取其他用户动作 | 查询固定带当前 `userId` |
| runId 猜测 | 只有同时命中用户和门店的动作才返回 |
| 刷新后重复确认 | 已执行状态恢复后不显示确认按钮 |
| 创建类盲重试 | 保持 `manual_reconcile` |
| 改约/取消重试 | 继续使用原 execution ID 和安全重放策略 |

## 四、验证结果

| 验证项 | 结果 |
| --- | --- |
| 后端定向测试 | 2 suite / 28 tests 通过 |
| 管理端定向测试 | 2 files / 8 tests 通过 |
| Brain 全量测试 | 136 suite 通过、1 suite 跳过；`1783/1784` tests 通过 |
| `npm.cmd --prefix packages/server-v2 run build` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 无空白错误，仅已有 CRLF 提示 |
| 真实业务写入 | 0 |
| 数据库 migration | 未新增、未应用 |

首次前端测试命令误带 Jest 参数 `--runInBand`，Vitest 拒绝该未知参数；移除后定向测试 `8/8` 通过。该错误属于命令参数，不属于产品代码失败。

## 五、当前整体进度

37 个一级交付任务仍为：

- 已完成：32
- 进行中：2
- 未开始：3
- 工程任务完成度：86.5%

真实动作任务已经完成审批执行、回执、状态恢复和改约/取消失败恢复。剩余动作能力为创建类业务表级强幂等、营销对外发送、次卡核销和真实写库验收。

下一阶段仍需先完成候选持久化和新 evaluation release 冻结，然后运行 120 题、650 题和生产 canary/回滚终验。
