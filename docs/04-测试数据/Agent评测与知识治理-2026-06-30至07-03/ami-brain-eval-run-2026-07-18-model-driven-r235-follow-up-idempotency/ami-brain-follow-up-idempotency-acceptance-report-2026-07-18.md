# Ami Brain R235 客户跟进与营销触达草稿强幂等验收报告

## 结论

`create_customer_followup` 和 `create_marketing_touch_draft` 已从“失败后人工核对”升级为业务表级强幂等和 `safe_replay`。两项动作统一写入 `TerminalFollowUpTask`，营销动作只创建待处理草稿，不创建发送作业、不触发外部渠道。

## 完成内容

### 数据与服务

- `TerminalFollowUpTask` 增加可空唯一 `idempotencyKey` 和不可变 `creationFingerprint`。
- 原始请求键按 `storeId + source + rawKey` 哈希，明文键不进入任务 payload。
- 同键同参数返回原任务；同键不同客户、话术或关键参数明确冲突。
- 已提交重放在客户状态和分派规则复验前返回原任务，避免业务已成功后因客户停用导致回执无法恢复。
- advisory lock 与唯一索引共同保证并发同键只创建一条任务。
- 批量跟进以批次根键和客户 ID 派生子键，避免批内客户相互冲突。

### API 与 Brain

- 终端创建接口支持 `Idempotency-Key` 请求头和 DTO 字段，请求头优先。
- 管理端终端/营销 API 自动生成并复用请求键。
- Brain 审批信封的幂等键贯穿目标复验、Gateway 和 `TerminalService`。
- `create_customer_followup`、`create_marketing_touch_draft` 的失败恢复策略改为 `safe_replay`。

## 隔离库验收

| 验收项 | 结果 |
| --- | --- |
| 首次确认执行 | succeeded |
| 重复确认 | 短路返回原结果 |
| 业务服务直接重放 | 返回同一任务 |
| 任务状态变化后重放 | 返回原任务 |
| 同键不同话术 | 明确拒绝 |
| Brain 回执写入故障 | 识别为可安全重放 |
| 故障恢复后任务数 | `1` |
| 并发同键任务数 | `1` |
| 客户跟进/营销草稿同原始键 | 按来源隔离 |
| payload 明文幂等键 | `0` |
| MarketingDeliveryJob | `0` |
| MarketingAutomationTouch | `0` |

机器可读证据：

- `ami-brain-follow-up-action-acceptance-summary.json`
- `ami-brain-capability-scan-r235-summary.json`
- `candidate-bundle/`

## 回归结果

- 定向测试：`5` suites、`80` tests 通过。
- Brain 全量：`136` suites 通过、`1` suite 跳过；`1798/1799` tests 通过。
- `packages/server-v2` build：通过。
- 管理端 typecheck + build：通过。
- Prisma generate：通过。
- migration：空库 `104/104`，历史 `95 -> 104` 通过。

## 产品边界

本轮完成的是“审批后创建客户跟进任务/单客户营销触达草稿”。尚未实现短信、企微或其他渠道的真实发送、渠道回执、退避重试、退订治理和发送对账页面。这些继续作为营销执行平台和管理端后续任务，不在 Ami Brain 内另建第二套发送系统。
