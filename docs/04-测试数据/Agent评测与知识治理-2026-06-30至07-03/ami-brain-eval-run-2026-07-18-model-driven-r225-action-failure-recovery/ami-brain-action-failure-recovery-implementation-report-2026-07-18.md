# Ami Brain R225 真实动作失败恢复实施报告

> 执行日期：2026-07-18
>
> 范围：现有后台动作链路审计、预约改期/取消失败恢复、前端简化处置
>
> 真实业务数据写入：0

## 一、结论

旧进度记录中“采购、改约、触达仍主要停留在 `preview_action`”的描述已经过期。当前代码已经存在完整的：

`preview -> 用户确认 -> 权限/门店/参数摘要复验 -> 独占执行 -> 业务服务写入 -> 回执 -> Trace`

本轮发现的真实缺口是“失败恢复”：原实现一旦将执行记录写为 `failed`，用户再次确认只会收到历史失败结果，不会恢复执行。

本轮已完成首个可安全交付的恢复切片：

- 预约改期、取消：允许用户点击一次“重试执行”，使用原审批包络安全重放。
- 已取消预约：不再发起第二次取消，直接将当前预约回收为成功回执。
- 创建预约、采购单、客户跟进/营销触达草稿、服务完成：不允许盲目重试，明确提示用户先核对后台单据。

## 二、当前真实动作能力审计

| 动作 | 当前真实执行 | 当前回执 | 失败恢复 |
| --- | --- | --- | --- |
| 创建预约 | `ReservationsService.create` | reservation ID | 人工核对，禁止盲重试 |
| 改期 | `ReservationsService.update` | reservation ID | 已支持安全重放 |
| 取消预约 | `ReservationsService.cancel` | reservation ID | 已支持状态对账 + 安全重放 |
| 客户跟进任务 | `TerminalService.createFollowUpTask` | follow-up task ID | 人工核对，禁止盲重试 |
| 营销触达草稿 | `TerminalService.createFollowUpTask` | marketing touch draft ID | 人工核对，未对外自动发送 |
| 创建采购单 | `InventoryService.createPurchaseOrder` | purchase order ID | 人工核对，禁止盲重试 |
| 完成服务记录 | `TerminalService.completeTask` | service task ID | 人工核对，禁止盲重试 |
| 次卡核销 | 未接入 Brain Capability Gateway | 无 | 待独立闭环 |

“营销触达草稿”的真实写入是创建后台跟进任务，不是直接向客户发送消息。系统不得把“草稿已建立”说成“客户已收到”。

## 三、实现变更

### 3.1 恢复策略进入能力合同

`BrainCapabilityDescriptor` 新增：

```ts
failureRecovery: 'safe_replay' | 'manual_reconcile'
```

只有 `reschedule_reservation` 和 `cancel_reservation` 标记为 `safe_replay`。创建类动作统一标记为 `manual_reconcile`，直到底层业务服务能够证明全链路幂等。

### 3.2 安全重放

`BrainActionConfirmationService.retryFailedExecution` 执行前重新校验：

1. actionId、runId、userId、storeId 必须与原动作一致。
2. 原确认记录和原执行记录都必须为 `failed`。
3. 原审批包络未过期。
4. capability key、version、risk level、actor、store 与当前合同一致。
5. 参数摘要未被篡改。
6. 当前用户仍具有所需权限。
7. 当前业务对象仍属于当前门店。
8. 通过事务独占地将原失败执行恢复为 `executing`，并复用原 execution ID。

重试不会创建第二条同 idempotency key 执行记录。

### 3.3 用户操作

- 可安全重放的失败动作：页面只显示“重试执行”。
- 不可自动重试的动作：页面显示“请先核对后台业务单据”，不显示重试按钮。
- 重试成功后：替换失败结果，显示真实业务单据类型和 ID。

## 四、安全与产品边界

- 模型仍不能伪造 `confirmed` / `approved` 等用户确认字段。
- 重试端点仍需要 `core:brain:execute`。
- denied permission 会在重试时再次从当前权限中剔除。
- 跨用户、跨运行、跨门店的失败动作不可查找或重试。
- 创建类动作在底层强幂等完成前不得开放自动重试。

## 五、验证

| 验证项 | 结果 |
| --- | --- |
| 动作确认/网关/控制器/模型安全定向测试 | 4 suite / 37 tests 通过 |
| 管理端 API + Brain Workspace | 2 files / 7 tests 通过 |
| Brain 全量回归 | 136 suite 通过、1 suite 跳过；`1781/1782` tests 通过 |
| `server-v2` build | 通过 |
| 管理端 typecheck + Vite build | 通过 |
| 真实业务写入验收 | 未执行，需独立写库授权 |

## 六、剩余动作任务

1. 为创建预约、采购单、跟进任务和服务完成补底层幂等键或业务对账查询，然后再决定是否允许重试。
2. 将营销触达明确拆成“创建草稿/任务”和“对外发送”两个能力，对外发送继续使用独立高风险确认。
3. 次卡核销需要同时确定客户卡、项目、次数、服务人员、当前余次和库存/提成影响，待独立接入 Capability Gateway。
4. 在获得写库授权后，使用专用测试业务记录执行“失败 -> 重试 -> 单据唯一 -> 回执一致”真实验收。
