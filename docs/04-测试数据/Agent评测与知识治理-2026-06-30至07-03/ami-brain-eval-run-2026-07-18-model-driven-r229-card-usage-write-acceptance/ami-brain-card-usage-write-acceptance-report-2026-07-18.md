# Ami Brain R229 次卡核销真实写入与幂等恢复验收报告

## 一、验收结论

本轮通过。Ami Brain 次卡核销已从“审批后可调用业务 Service”升级为“在业务事务已提交、Brain 回执失败、客户端重试或并发重复请求时，仍只产生一次业务副作用”。

隔离库实测证明：

- 确认核销 2 次后，卡余次从 10 变为 8，项目余次为 8。
- 确认收入为 200 元，商品和批次库存均从 10 变为 9。
- 生成 1 条库存流水，数量 `-1`，成本 20 元；生成提成 20 元。
- 重复确认直接返回既有回执，不再进入业务 Service。
- 同一幂等键的业务重放返回原核销记录；不同参数复用同键被明确拒绝。
- 故障注入模拟“业务已提交，Brain 成功回执写入失败”，重试后恢复同一业务记录，核销、扣库存和提成数量均为 1。
- 两个同键并发请求返回同一业务对象，核销、库存流水、提成均只生成 1 条。

## 二、实现收口

### 2.1 业务表级幂等

- `CardUsageRecord` 新增可空唯一字段 `idempotencyKey`。
- 外部幂等键按门店范围做 SHA-256 映射，避免明文请求键直接进入业务表。
- 核销事务先锁定 `CustomerCard`，再对幂等键取 PostgreSQL 事务级 advisory lock。
- 已有记录在校验原始业务参数一致后返回；参数冲突返回 `ConflictException`。
- 回执恢复优先于当前卡状态、余次和有效期重校验，避免业务已成功后因状态变化无法恢复回执。

### 2.2 Brain 执行恢复

- `BrainActionConfirmationService` 将审批信封中的幂等键传入目标复验和 Gateway。
- `BrainCapabilityGatewayService` 将核销幂等键传入 `CardsService.verifyCardUsage`。
- `verify_card_usage` 失败恢复策略从 `manual_reconcile` 升级为 `safe_replay`。
- `BrainActionTargetResolverService` 在发现已提交的同键核销记录时，允许恢复回执，不再被后续卡状态变化阻断。

### 2.3 能力治理同步

- `card_usage_action_preview` 能力声明已补充同键安全重放合同。
- Scanner 指纹从 `47fb9f...c88cd7` 变为 `10cc7b...68052`，治理层可感知这次合同升级。
- 已生成仅用于开发验收的 synthetic candidate，4 项门禁全部通过。
- 本轮没有使用 `--persist-drafts`，没有创建 release，没有激活生产能力。

## 三、Migration 验收

### 3.1 当前隔离库

- 目标：`127.0.0.1:55433/ami_brain_action_r229`。
- Prisma 识别 101 条 migration，结果为 `Database schema is up to date!`。
- 新 migration：`20260718190000_card_usage_action_idempotency`。

### 3.2 增量升级

在同一本机容器内创建临时增量库，保留 11 条既有核销记录，将结构和 migration 历史恢复为第 100 条后执行 Prisma deploy。

| 验证项 | 结果 |
| --- | --- |
| 增量路径 | `100 -> 101` 成功 |
| 既有核销记录 | `11 -> 11`，无丢失 |
| 旧数据幂等键 | 均为 `NULL`，兼容历史数据 |
| 唯一索引 | `CardUsageRecord_idempotencyKey_key` 存在 |
| migration checksum | 本地与数据库一致 |

R228 已另行完成前 100 条 migration 的空库重放、`95 -> 100` 增量升级、回填、权限和关键约束验收。R229 在此基础上补齐第 101 条的空库应用和增量升级证据。

## 四、验证结果

| 验证项 | 结果 |
| --- | --- |
| 隔离库真实写入 | 通过 |
| 顺序同键重放 | 副作用各 1 次 |
| 回执失败故障注入 | `safe_replay` 恢复成功 |
| 并发同键请求 | 核销、库存流水、提成均 1 条 |
| 参数冲突 | 明确拒绝 |
| Prisma validate / generate | 通过 |
| migration status | 101 条，已对齐 |
| 定向回归 | 6 suites / 108 tests 通过 |
| Brain 全量回归 | 136 suites 通过、1 suite 跳过；`1793/1794` tests 通过 |
| `server-v2` build | 通过 |
| 生产数据库写入 | `0` |

## 五、残余边界

1. 创建预约仍缺少统一业务表级强幂等，继续使用 `manual_reconcile`，不允许 Brain 盲目重试。
2. 营销能力仍为触达草稿，没有对外真实发送、渠道回执和失败恢复闭环。
3. 管理端核销详情尚未展示幂等来源和重放对账状态，已保留为后续管理端任务，不阻断本轮后端安全闭环。
4. `tsconfig.agent-eval-scripts.json` 全量 typecheck 仍被 14 条旧 Agent V2 脚本类型错误阻断，与本轮验收脚本无关；本轮脚本已用真实执行、定向测试和后端构建完成验收。
5. 并发验收触发 `pg` 关于同一 client 并发 `query()` 的弃用警告，本轮结果正确；升级 `pg@9` 前需将验收并发流切换为显式外部并发调度。

## 六、证据索引

- `ami-brain-card-usage-action-acceptance-evidence.json`：真实写入、故障注入和并发幂等结果。
- `ami-brain-migration-100-to-101-evidence.txt`：增量升级和历史数据保留结果。
- `ami-brain-migration-checksum-r229.json`：migration checksum 对齐结果。
- `ami-brain-capability-scan-r229-summary.json` / `.md`：能力声明指纹和扫描摘要。
- `candidate-bundle/`：开发验收用 synthetic candidate 及门禁报告。
