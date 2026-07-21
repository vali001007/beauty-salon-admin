# Ami Brain 营销策略真实动作与异步回执隔离库验收报告

日期：2026-07-18

## 一、验收结论

本轮完成了 Ami Brain 对现有营销自动化策略执行能力的真实动作闭环，并修复“发送任务刚入队就显示执行成功”的误导问题。

当前用户体验为：

1. Brain 读取当前门店已启用策略和实时受众，展示影响人数、渠道和风险。
2. 用户确认前不创建任何发送任务。
3. 确认后状态先显示“正在执行”，不再把排队等同于已触达。
4. 管理端自动轮询真实营销执行记录，最终显示成功、部分失败或失败，以及排队、触达和失败人数。
5. 业务提交后 Brain 回执写入失败时，使用原审批幂等键恢复同一执行，不重复创建 delivery job。

本轮复用现有 `MarketingService`、`MarketingExecutionService`、`MarketingDeliveryWorkerService` 和 `MarketingChannelService`，没有在 Ami Brain 内建设第二套营销发送系统。

## 二、代码修复

### 2.1 异步状态真实性

- `execute_marketing_strategy` 在业务执行为 `pending/running` 时返回 `executing`。
- `BrainActionExecution` 和 `BrainActionConfirmation` 保持执行中状态，不提前写成功。
- 动作状态查询按当前门店读取 `MarketingAutomationExecution`，把业务状态映射为：
  - `pending/running -> executing`
  - `success -> succeeded`
  - `partial_failed -> partially_succeeded`
  - `failed -> failed`
- 最终回执同步排队人数、触达人数、失败人数、渠道和完成时间。

### 2.2 管理端闭环

- 存在执行中动作时自动轮询 `/brain/runs/:runId/actions`。
- 页面隐藏时降低轮询频率，动作终态后自动停止。
- 动作卡展示业务执行进度，不要求用户手工进入营销页面反复查询。

### 2.3 目标解析修复

隔离验收首次运行发现，策略名称末尾包含数字时会被宽松正则误当作策略 ID。当前规则收紧为：

- “策略编号 12”“策略 ID 12”“策略#12”“策略号12”按 ID 解析。
- 整句只有“执行策略 12”时兼容历史问法。
- 普通策略名称中的年份、期数和其他数字不再传入 Prisma 整数主键。

## 三、干净隔离库验收

最终证据来自全新 PostgreSQL 16 容器 `ami-brain-marketing-action-r252`：

| 项目 | 结果 |
| --- | --- |
| migration | `105/105` |
| migration 失败/回滚 | `0` |
| 共享/生产库写入 | `0` |
| 外部短信/企微调用 | `0` |
| 容器清理 | 已完成 |
| 端口释放 | 已完成 |

### 3.1 受众漂移门禁

审批时受众为 1 人，确认前增加到 12 人。系统拒绝执行并要求重新审批：

- `audienceDriftRejected=true`
- `MarketingAutomationExecution=0`
- 未创建 touch、delivery job 或通知

### 3.2 站内通知成功链

| 验收项 | 结果 |
| --- | --- |
| 审批受众 | 12 人 |
| 初始 Brain 状态 | `executing` |
| delivery job | 12 |
| touch | 12 |
| 站内通知 | 12 |
| 最终已触达 | 12 |
| 最终失败 | 0 |
| 最终业务状态 | `success` |
| 最终 Brain 状态 | `succeeded` |
| 重复 worker 领取 | 0 |

重复确认直接返回原执行；同一业务幂等键重放返回原 `MarketingAutomationExecution`，没有创建第二批任务。

### 3.3 Brain 回执故障恢复

故障注入发生在业务执行和两个 delivery job 已提交后、Brain 回执持久化时：

| 验收项 | 结果 |
| --- | --- |
| 首次 Brain 状态 | `failed` |
| 重试策略 | `safe_replay` |
| 重试前 job | 2 |
| 重试后 job | 2 |
| 重试后状态 | `executing` |
| 渠道完成后状态 | `succeeded` |

证明“业务已提交但 Brain 丢回执”不会导致重复触达。

### 3.4 未配置渠道失败链

当前后台未配置真实短信供应商。隔离库使用短信策略验证失败闭环：

- 2 个任务均进入 `dead_letter`。
- `MarketingAutomationExecution.status=failed`。
- `failedCount=2`。
- Brain 动作最终同步为 `failed`，不会显示成功。
- 该终态失败不再显示无效的“重试执行”，恢复策略切换为 `manual_reconcile`；业务回执丢失仍保持 `safe_replay`。

## 四、能力治理

| 项目 | 结果 |
| --- | --- |
| Scanner | 30 张显式能力，blocked 0 |
| 过期 action 卡 | 6 张 |
| 刷新资源 | `556-561` |
| 刷新生成门禁 | proposals 6，blocked 0，productionReady true |
| evaluation release | `321` |
| release 卡片 | 24 |
| catalog | `valid=true` |
| source freshness | `valid=true` |
| 生产激活 | 未执行 |

## 五、验证结果

| 验证项 | 结果 |
| --- | --- |
| 后端动作定向测试 | 2 suites / 26 tests 通过 |
| 管理端 Workspace | 1 file / 7 tests 通过 |
| 后端全量 Jest | 329 suites 通过、3 suites 跳过；3626 tests 通过、10 tests 跳过 |
| 管理端 typecheck | app/test 全部通过 |
| `server-v2` build | 通过 |
| 管理端 Vite build | 通过 |
| `git diff --check` | 通过 |

## 六、模型评测边界

R253 使用 release `321` 重跑“执行自动触达策略 AMI-DEMO-FULL 沉睡客户唤醒策略”，模型运行时仍在 compile 阶段返回 `provider_unavailable`，耗时 33.364 秒，未进入工具发现。

因此必须区分：

1. 确定性路由、审批、真实业务写入、渠道 worker、回执和失败恢复已经通过。
2. 模型语义编译和工具自主发现的在线证据仍未通过。
3. Codex 当前使用的模型中转没有自动接入 `server-v2` AI Gateway。

## 七、范围结论与进度

按用户已确认的范围，本阶段只完成管理端和后端已经存在的业务能力。站内通知真实发送、终端任务、队列、回执、幂等和失败状态均已闭环，因此“真实动作执行闭环”一级任务关闭。

短信、企微渠道供应商、退订、模板审核和渠道账单属于营销执行平台缺口，已登记到独立管理端/后端缺口报告，不在 Ami Brain 内伪造。

按 37 个一级交付任务统计，当前为 **33 项完成、1 项进行中、3 项未开始，工程完成度 89.2%**。

进行中：完整 Capability Candidate/正式发布版本收口。

未开始：新 release 120 题门禁、六角色 650 题全量评测、生产 canary/回滚/终极验收。

## 八、证据索引

- `ami-brain-marketing-strategy-action-acceptance-evidence.json`
- `ami-brain-capability-scan-r252.md`
- `../ami-brain-eval-run-2026-07-18-model-driven-r253-marketing-strategy-execution-receipt-final/ami-brain-model-driven-eval-checkpoint-2026-07-15.json`
- 验收脚本：`packages/server-v2/prisma/ami-brain-marketing-strategy-action-acceptance.ts`
