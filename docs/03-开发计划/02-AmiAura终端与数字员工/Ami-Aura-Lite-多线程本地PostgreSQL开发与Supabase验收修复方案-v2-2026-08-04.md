# Ami Aura Lite 多线程本地 PostgreSQL 开发与 Supabase 验收修复方案 V2

> 日期：2026-08-04（Asia/Singapore）
> 实施分支：`codex/ami-aura-local-dev-v2-20260804`
> 隔离 worktree：`/Users/ju/Documents/ami/beauty-salon-admin-local-dev-v2`
> 基线：`efb3a8ef2d2784b7a2568f260c6a366d6c2e8da9`

## 产品目标

本方案以缩短长期开发反馈时间为主线，同时保留多线程开发、权益核销安全、Supabase 真实验收和 Ami Brain Release 治理边界。

- 日常开发：每个 worktree 使用独立 slot、端口和本地 PostgreSQL 17 数据库。
- 共享验收：Supabase 用于真实数据、权限、门店范围、Pooler、Release 和浏览器 E2E。
- 候选签收：冻结 commit、diff、migration、数据目标、Release、模型、问题清单和 pipeline identity。
- 安全边界：本地通过不能替代 Supabase 验收；不自动激活、归档或回滚 Release；不执行破坏性数据库清理。

## 实施范围

### P0 核销安全

- Axios 重试策略为 `safe | idempotent | never`；读请求默认可安全重试，写请求默认不重试。
- 幂等写必须显式声明并携带稳定 `Idempotency-Key`，重试保持原 `X-Request-Id`。
- `/api/terminal/cards/consume` 强制校验幂等键，区分首次提交和成功回放。
- Kiosk 在输入未变化时复用同一 UUID，并区分明确失败、结果待核对和成功回放。
- 核销不再触发九接口全量快照，只失效受影响缓存。

### PostgreSQL 17 与开发槽位

- 使用独立 `postgres:17-bookworm` Compose，宿主机默认端口 `55432`。
- 密码、slot 租约、PID、日志和运行环境保存在 Git common dir，不覆盖仓库 `.env`。
- 本地只允许 `ami_dev_s01`—`ami_dev_s99`；共享模式只允许批准的 Supabase Host。
- slot 固定映射 API `8201`—`8299`、管理端 `5201`—`5299`、Kiosk `5301`—`5399`。
- 停止 slot 只停止已验证归属的进程，不删除 database 或 volume。

### Artifact 与 Supabase

- `brain:warmup:shadow` 只读比较 shared/artifact 身份、范围解析、关键 trace 和冷热耗时。
- `local-fast` 只有匹配且通过的 receipt 才可默认使用 Artifact；`brain-dev` 默认 shared。
- Release 416/452 只生成只读审计，不修改状态。
- Supabase 写操作使用本机跨 worktree 独占租约；只读验收不占写租约。

## 验收边界

- 自动化通过只证明代码和工具链，不等于真实环境完成。
- 必须补充两个完整 slot 同时运行、空库 migration、fixture 二次运行、数据库不串库的实测证据。
- 必须补充 Supabase 真实权限、跨店、Pooler、Kiosk/管理端浏览器 E2E，以及“响应丢失后同键恢复且只扣一次”的证据。
- 各批次保留独立 diff；未经授权不 commit、不 push、不建 PR。

## 实施记录

| 批次 | 当前状态 | 证据边界 |
| --- | --- | --- |
| 隔离 worktree | 已完成 | 原 Ami Brain 工作区保持不动 |
| P0 核销安全 | 代码与本地实测完成；共享环境部署阻断 | 新客户端改为 Header-only 幂等键以兼容旧 DTO；新后端仍支持 Header/Body 双入口、冲突 409、payload 冲突 409 和 `committed/replayed`。必须先部署后端，再灰度客户端 |
| PostgreSQL 17 基座 | 已完成 | PostgreSQL 17.10、UTC、`en_US.UTF-8`、`pgcrypto 1.3`、133/133 migrations；空库 migration gate 通过 |
| 多线程 slot | 已完成本地实测 | s01/s02 独立端口、数据库和进程身份；双槽位登录、查询、核销及单槽故障隔离通过；s02 停止后保留数据库与 volume |
| Artifact 影子验证 | 工具完成，本地结果符合预期，远端完整对照待执行 | 本地库无 Active Release，因此不签发 receipt、不误启用 Artifact；416/452 只读审计 `mutationsExecuted=0` |
| Supabase 共享验收 | Preflight 已冻结；响应丢失验收失败并形成 P0 阻断；事故数据已精确补偿 | 当前共享后端未保存核销幂等键，同键恢复重复扣减；重复记录 `501` 及其副作用已在授权后单事务撤销，P0 发布阻断仍需新后端部署和新验收解除 |

## 已完成证据

### 本地数据库与槽位

- s01、s02 均为独立数据库：`ami_dev_s01`、`ami_dev_s02`，未连接旧本机 `ami_core`。
- 两库均为 PostgreSQL `17.10`，时区 `UTC`，locale `en_US.UTF-8`，`pgcrypto 1.3`，Prisma migration `133/133` 对齐。
- 空库 migration gate 报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/postgres17-migration-gate-1785781033333.json`。
- `local-slot-v1` fixture 连续运行两次计数一致；s01/s02 登录、Bootstrap、客户/项目查询和核销不串库。
- 10 次 s02 API slot 启动中位 `14,193ms`，P95 `14,312ms`；包含 migration deploy、watcher 启动和 liveness 身份核对。报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/slot-startup-s02-1785782298160.json`。

### 本地与共享反馈时间

以下为各 10 次同轮采样；静态页面 HTTP 与浏览器缓存数据不作为数据库提速结论，主要看登录、readiness 和 Bootstrap。

| 指标 | 本地 s01 中位 | 共享 Supabase 中位 | 中位时间下降 |
| --- | ---: | ---: | ---: |
| 登录 | 196ms | 894ms | 78.1% |
| `/api/health/ready` | 2ms | 171ms | 98.8% |
| Terminal Bootstrap | 6ms | 2,205ms | 99.7% |
| 页面静态 HTTP | 2ms | 3ms | 不构成数据库结论 |
| 本地核销成功回放 | 7ms | 未通过共享验收 | - |

- 本地报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/feedback-benchmark-local-s01-1785781863149.json`。
- 共享报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/feedback-benchmark-shared-supabase-1785781906510.json`。
- 浏览器热缓存页面标识采样：管理端本地中位 `57ms`，Kiosk 本地中位 `77ms`，现有共享 Kiosk 会话中位 `76ms`。该组保留浏览器缓存，不能作为冷启动前后对比。
- 当前没有“改造前、同 commit、同设备、同启动方式”的 10 次启动基线，因此不把历史数据包装成严格前后对照；登录、readiness 和 Bootstrap 已达到至少下降 50% 的本地反馈目标。

### Artifact 与 Release

- `brain:warmup:shadow` 已比较 Release、ontology、Definition Version、capability、scope 和 HTTP probes；只有四类探针齐全且一致才签发 receipt。
- 本地库无 Active Release，shadow 返回失败且 `local-fast` 回退 `shared`，符合 fail-closed 设计。
- Release 416/452 审计报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/brain-release-416-452-audit-1785781109922.json`。实际 Active Release 为 416、436、452；416/452 均有 ready Artifact；审计未执行状态变更。

### Supabase Preflight 与写验收

- 候选 `ami-aura-local-dev-v2-shared-20260804-final` 已冻结：当前 commit/diff、133 migration inventory、精确 Pooler Host、`storeId=6`、Release 452/fingerprint、provider/model、正式 suite manifest 和 `shared` pipeline。
- Preflight 报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/supabase-preflight-final.json`。
- 写验收使用跨 worktree 独占租约，执行后租约已释放。
- 当前共享后端首先拒绝 Body 中的新 `idempotencyKey` 字段，证明新客户端不能先于后端部署；客户端已调整为 Header-only，服务端继续保留双入口校验。
- Header-only 重试进一步证明当前共享后端没有持久化 `Idempotency-Key`：客户卡 `460` 从 20 次变为 18 次，生成核销记录 `500`、`501`，两条记录的 `idempotencyKey` 均为 `null`；各自产生 5 条库存流水和 1 条提成记录。
- 失败报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/card-response-loss-failed-1785783140127.json`。
- 用户明确授权后，新增默认 dry-run 的强保护补偿工具 `scripts/ami-card-duplicate-compensation.mjs`。工具要求精确卡/记录 ID、预期余次、固定确认短语、批准的 Supabase Host，并在 `SERIALIZABLE` 事务内重新执行全部断言和行锁核对。
- 只读审计确认 `500/501` 业务 payload 一致、两次核销间隔约 9.7 秒、各自 5 条库存流水完全对应；重复提成 `160` 为系统默认 `confirmed`，但未结算、未支付、未调整，也未进入 `CommissionSettlementRecord`。
- 2026-08-04 通过跨 worktree 独占写租约执行补偿：保留核销 `500`，删除重复核销 `501`、库存流水 `698—702` 和提成 `160`；客户卡 `460` 从 18 次恢复为 19 次。
- 商品及批次库存均按重复流水精确恢复：商品 `110/111/112/113/114` 分别恢复至 `79/20/75/2/40`；对应批次 `187/186/197/189/198` 同步恢复至相同数量。提交后全部验证通过，写租约已释放。
- 补偿报告：`/Users/ju/Documents/ami/beauty-salon-admin/.git/ami-dev-v2/reports/card-duplicate-compensation-1785803667452.json`。报告保留操作前快照；已删除记录不能通过普通页面直接恢复，如需反向恢复必须基于该快照另行制定受控事务。

## 发布与剩余验收顺序

1. 先部署包含核销幂等持久化、冲突校验和回放状态的新后端；部署后确认共享 readiness 暴露目标 Release fingerprint。
2. 再灰度 Header-only 的新管理端/Kiosk 客户端；旧客户端若发送 Body 键，新后端仍可兼容。
3. 使用一张新的共享验收卡重新执行“响应体丢失 -> 同键恢复 -> 只扣一次”，通过后再解除 P0 阻断。
4. 记录 `500/501` 的精确补偿已完成；后续不得再对已删除的 `501` 重复执行补偿工具。
5. 补齐共享管理端/Kiosk 的真实权限矩阵、跨店、Pooler 浏览器 E2E，以及 permission/cross-store/empty-result/key-trace 完整 manifest 后的 Artifact shadow。
6. 当前不自动 commit、push、建 PR，不修改 Release 416/452/436 状态。
