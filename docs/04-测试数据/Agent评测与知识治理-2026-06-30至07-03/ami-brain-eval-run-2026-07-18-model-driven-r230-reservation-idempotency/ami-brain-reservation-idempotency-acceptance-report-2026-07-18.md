# Ami Brain R230 预约创建强幂等与安全重放验收报告

## 一、结论

本轮通过。预约创建已从三套直接写库逻辑收口为统一 `ReservationsService.createIdempotent`，管理端、Ami Glow、Ami Aura Lite 和 Ami Brain 共用同一业务幂等合同。

当预约已创建，但 Brain 成功回执写入失败或网络响应不确定时，原请求重放返回同一预约，不创建第二条预约。

## 二、统一业务合同

- `Reservation` 新增可空唯一 `idempotencyKey` 和不可变 `creationFingerprint`。
- 原始外部键不明文入库，按 `storeId + bookingSource + rawKey` 生成 SHA-256 业务键。
- 创建请求指纹覆盖门店、来源、客户、项目、美容师、时间、时长和备注。
- 同键同指纹返回原预约；同键不同指纹返回冲突，不覆盖原单。
- 事务内使用 PostgreSQL advisory lock，并发同键请求串行收口。
- 创建后改期、重新分配美容师或修改备注，不会破坏原创建请求的回执恢复。

## 三、四端收口

| 入口 | 收口结果 |
| --- | --- |
| 管理端 `/reservations` | 支持 `Idempotency-Key` 请求头和 DTO 字段，来源固定为 `admin` |
| Ami Glow | H5/小程序幂等键进入结构化字段，不再写入备注；来源固定为 `ami_glow` / `ami_glow_h5` |
| Ami Aura Lite | 终端请求自动携带幂等键，来源固定为 `ami_aura_lite` |
| Ami Brain | 审批信封幂等键贯穿目标复验、Gateway 和预约 Service，来源固定为 `ami_brain` |

同一原始键在不同来源空间不冲突，同一来源和门店内才执行去重。

## 四、Brain 失败恢复

- `create_reservation` 从 `manual_reconcile` 升级为 `safe_replay`。
- 目标复验发现同键预约已提交时，先进入回执恢复，不因客户、项目或排期后续状态变化误阻断。
- 故障注入模拟“预约已提交，Brain 回执写入失败”，重试后预约总数不变。
- 重复点击确认由 Brain execution 层短路，并发或响应不确定由业务表级幂等收口。

## 五、隔离库验收

验收库为本机 `127.0.0.1:55434/ami_brain_reservation_r230`，生产数据库写入为 `0`。

| 验证项 | 结果 |
| --- | --- |
| 空库 migration 重放 | `102/102` 成功 |
| 增量升级 | `101 -> 102` 成功 |
| 历史预约保留 | `12 -> 12`，无丢失 |
| 旧数据新字段 | `idempotencyKey` / `creationFingerprint` 均为 `NULL` |
| 唯一索引 | `Reservation_idempotencyKey_key` 存在 |
| migration checksum | 本地与数据库一致 |
| 重复确认 | 短路返回原回执 |
| 同键顺序重放 | 返回同一预约 |
| 创建后业务字段变化 | 仍返回原预约 |
| 同键参数冲突 | 明确拒绝 |
| Brain 回执故障恢复 | 重试成功，预约不重复 |
| 并发同键 | 预约 1 条，两个请求返回同一业务对象 |
| 终端无客户 ID 并发 | 预约 1 条，新客户 1 条 |
| 跨来源同原始键 | 按来源隔离，不误去重 |

## 六、代码验证

| 验证项 | 结果 |
| --- | --- |
| 定向回归 | 6 suites / 85 tests 通过 |
| Brain 全量回归 | 136 suites 通过、1 suite 跳过；`1794/1795` tests 通过 |
| Prisma validate / generate | 通过 |
| `server-v2` build | 通过 |
| 管理端 typecheck + build | 通过 |
| Ami Aura Lite typecheck + build | 通过；仅有既有 chunk size 警告 |
| 验收脚本自身 TypeScript 错误 | `0` |
| 单文件透传编译时的历史错误 | 13 条，均在既有 AI/客户服务代码，本轮后端正式 build 已通过 |

## 七、能力治理

- `reservation_action_preview` Scanner 指纹从 `03406c744a8e...` 变为 `bc33ff5e4cbb...`。
- 开发验收用 synthetic candidate 生成 `1/1`，compile/contract/security/test 四项门禁全部通过。
- 本轮没有 `--persist-drafts`，没有创建新 release，没有激活生产能力。

## 八、剩余边界

1. 管理端预约详情尚未展示结构化来源和重放对账状态，按当前决策保留为后续管理端任务。
2. Ami Glow 预约成功事件与营销归因事件仍在预约事务之外；预约业务已强幂等，但事件 outbox 仍是后续统一后端任务。
3. `create_purchase_order`、`create_customer_followup`、`create_marketing_touch_draft` 等其他创建类动作仍未全部完成业务表级强幂等。
4. 营销对外真实发送、渠道回执和失败恢复仍未完成。

## 九、证据

- `ami-brain-reservation-action-acceptance-evidence.json`
- `ami-brain-reservation-migration-101-to-102-evidence.txt`
- `ami-brain-reservation-migration-checksum-r230.json`
- `ami-brain-capability-scan-r230-summary.json` / `.md`
- `candidate-bundle/`
