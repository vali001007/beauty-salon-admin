# Ami Brain R227 次卡核销关键动作实施报告

日期：2026-07-18

范围：统一核销事务安全收口、Brain 次卡核销预览与确认执行、能力生成门禁

分支：`codex/ami-brain-wip`

## 一、产品结论

次卡核销已经从“只能提示去管理端操作”升级为可确认执行的关键风险动作。用户必须明确客户、次卡/项目、核销次数和服务美容师；系统展示扣次影响，用户确认后才调用统一后台核销事务。

本轮没有真实扣减任何门店客户卡。代码闭环、权限、门店范围、并发安全、自动能力发现和候选生成已经通过；真实业务写入将在隔离数据库 migration 全链路验收完成后执行。

## 二、业务链路

```text
用户核销请求
  -> 模型/路由选择 card_usage_action_preview
  -> 当前门店解析客户、有效次卡、卡内项目、次数、美容师
  -> 生成 critical preview_action
  -> 用户确认
  -> 权限/门店/参数摘要/目标状态复验
  -> CardsService.verifyCardUsage
  -> 客户卡行锁
  -> 项目余次校验
  -> 扣减整卡余次
  -> CardUsageRecord
  -> BOM 耗材扣减
  -> 履约收入确认
  -> 美容师提成
  -> BrainActionExecution 回执与 Trace
```

## 三、统一后台修复

### 3.1 并发扣次

核销事务在读取并更新余次前对目标 `CustomerCard` 执行 `FOR UPDATE` 行锁。项目已用次数在锁内按 `customerCardId + projectName` 重新统计，避免同一卡并发请求同时使用旧余次。

### 3.2 门店与审计

- 服务美容师在扣次前验证当前门店和启用状态。
- 跨门店美容师不会进入核销记录或提成。
- `/cards/verify-usage` 和兼容 `/cards/usage` 强制使用当前登录用户作为 operator。
- 客户端传入 `operatorId` 会被覆盖，不能伪造核销人。

## 四、Brain 动作合同

| 项目 | 合同 |
| --- | --- |
| Capability | `card_usage_action_preview` |
| Gateway action | `verify_card_usage` |
| 权限 | `core:order:card-usage` |
| 风险 | `critical` |
| 确认 | 必须 |
| 失败恢复 | `manual_reconcile` |
| 业务回执 | `card_usage_record` ID、核销后剩余次数 |

目标解析规则：

1. 客户必须在当前门店唯一匹配。
2. 客户必须存在未过期、启用且有余次的次卡。
3. 项目必须属于该张次卡，并映射到当前门店项目。
4. 核销次数必须由用户明确提供，不默认 1 次。
5. 服务美容师必须在当前门店唯一匹配且启用。
6. 核销次数不得超过整卡余次或卡内项目余次。

## 五、防误操作

- “查看她的次卡情况”继续走只读客户事实，不生成核销动作。
- 只有明确“给/为/帮某客户核销、扣次、划扣”或带具体次数的动作表达进入预览。
- 无专用核销权限时，预览阶段即阻断，不等到确认后才报错。
- 模型或请求体不能伪造“已确认”。
- 失败后不开放自动重试，避免重复扣次数、耗材和提成。

## 六、能力治理

显式生产能力从 28 增至 29，Scanner blocked=0。

真实模型候选第一次生成结果：

- proposal：0
- blocked：1
- 原因：`model_positive_examples_not_executable`

根因是统一语义编译器未把“核销/扣次/划扣 + 预览/待确认”识别为 action 示例。补齐统一 action 语义后：

- 新核销候选：`1/1`，blocked=0，`productionReady=true`
- 共享 Action Executor 旧候选刷新：`4/4`，blocked=0，`productionReady=true`
- 未使用 `--persist-drafts`
- 数据库写入：0

R224 中以下 4 张候选源码指纹已过期并由 R227 候选替代：

- `reservation_action_preview`
- `customer_follow_up_draft`
- `marketing_touch_draft`
- `gap_fill_touch_preview`

## 七、验证

| 验证项 | 结果 |
| --- | --- |
| 核销链路定向测试 | 7 suite / 199 tests 通过 |
| 语义编译器测试 | 1 suite / 10 tests 通过 |
| Brain 全量测试 | 136 suite 通过、1 suite 跳过；`1791/1792` tests 通过 |
| `server-v2` build | 通过 |
| 管理端 typecheck + Vite build | 通过 |
| 新能力模型候选 | `1/1`，blocked=0 |
| 共享动作候选刷新 | `4/4`，blocked=0 |
| 真实业务写入 | 0 |
| migration | 未新增、未应用 |

## 八、剩余风险

1. `CardUsageRecord` 缺少业务表级外部幂等键，因此失败恢复仍为人工对账。
2. 尚未在隔离库执行真实核销，未核对客户卡、核销流水、库存、收入、提成和 Brain 回执的真实事务一致性。
3. 新候选和刷新候选尚未持久化治理数据库，未创建新的 evaluation release。
4. 120/650 题和生产 canary 尚未执行。

## 九、证据

- `ami-brain-capability-scan-r227.json`
- `ami-brain-capability-scan-r227.md`
- `candidate-bundle/`
- `refreshed-shared-action-candidates/`
