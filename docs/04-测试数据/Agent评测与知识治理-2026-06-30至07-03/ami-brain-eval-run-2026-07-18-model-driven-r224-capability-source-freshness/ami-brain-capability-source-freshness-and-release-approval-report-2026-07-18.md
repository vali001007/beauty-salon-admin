# Ami Brain R224 能力源码新鲜度与发布审批前置报告

> 执行日期：2026-07-18
>
> 执行模式：本地代码修复 + 真实数据库只读预检 + 本地候选产物生成
>
> 数据库写入：0
>
> 真实 release 创建/激活：未执行

## 一、产品结论

release 314 不能直接激活。其 21 张能力卡的目录合同本身有效，但其中 19 张已与当前代码源指纹不一致，源码新鲜度门禁正确拒绝了该历史快照。

本轮已完成这 19 张过期能力卡的本地重新生成：

- 生成成功：`19/19`
- 生成阻断：`0`
- `productionReady`：`true`（仅代表生成门禁通过，不代表已发布生产）
- 源码指纹一致：`19/19`
- 权限合同一致：`19/19`
- compile / contract / security / test 门禁：`19/19` 全部通过

当前状态是“审批材料和本地候选已就绪”，不是“数据库候选 release 已创建”。

## 二、根因与修复

### 2.1 根因

`BrainCapabilityContractRefreshNarrativeService` 原先把“权限码变化”和“读写/确认/幂等安全边界变化”都判定为 `capability_contract_refresh_safety_drift`。这导致权限从旧的宽权限收窄为 `core:brain:beautician-view` 时，已治理的业务语义样本无法复用，候选生成被错误阻断。

### 2.2 修复原则

- Scanner 的当前权限合同是唯一真相源，生成候选不再复用旧快照权限。
- 只有权限变化时，允许复用旧快照中已治理的名称、意图、正反例和同义词。
- `readOnly`、`sideEffect`、`requiresConfirmation`、`idempotency` 任一变化仍失败关闭。
- 候选显式记录“权限合同已更新，需治理审批”，不静默放行。

### 2.3 回归证据

- 权限单独变化可刷新，生成结果只包含当前 Scanner 权限。
- 旧的 `core:beautician-performance:view` 和 `core:customer:view` 不会被继承到三张美容师本人能力。
- 读写模式、副作用、确认和幂等变化的 4 组测试全部验证为拒绝。

## 三、候选能力范围

### 3.1 重新生成的 19 张能力卡

| 业务域 | 能力卡 |
| --- | --- |
| 美容师 | `beautician_customer_card_progress`、`beautician_material_preparation`、`beautician_service_overview` |
| 客户/前台 | `customer_facts`、`front_desk_operations_overview`、`reservation_list`、`reservation_action_preview` |
| 店长/员工 | `store_operations_overview`、`manager_staff_overview` |
| 财务 | `finance_payment_breakdown`、`finance_risk_overview` |
| 库存 | `inventory_operations_overview`、`inventory_procurement_advice` |
| 营销/动作预览 | `marketing_customer_segment`、`marketing_growth_overview`、`marketing_message_draft`、`marketing_touch_draft`、`customer_follow_up_draft`、`gap_fill_touch_preview` |

release 314 中余下的 `product_sales_ranking` 和 `project_service_ranking` 本次新鲜度校验未报过期，新的 21 张评测 release 可复用其当前版本。

### 3.2 美容师最小权限

3 张美容师能力的候选合同统一为：

`core:brain:beautician-view` + `core:brain:use` + `core:store:reservations`

且只允许 `beautician` 角色。业务执行仍受当前门店、登录账号绑定的活跃美容师身份和能力声明共同限制。

### 3.3 统一 Business Definition 候选

本地 evaluation-only 候选快照使用以下已验证但未发布的统一业务定义版本：

`129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 140, 141, 142`

覆盖优惠金额、退款笔数、员工提成、员工客户复购率、新客与转化、客户年龄分层、沉睡唤醒、商品销售额、库存消耗量、低于成本销售和商品毛利率。

这些定义必须进入同一个显式 evaluation release 的治理快照，不得在生产运行时绕过已发布定义目录。

## 四、release 314 审计

| 检查项 | 结果 |
| --- | --- |
| release fingerprint | `4876c4c71ace5b799f90b273906d8d0c6ef71c8346996e6fbd81d102d9dfbc43` |
| 能力卡数 | 21 |
| 目录合同 issue | 0 |
| 源码指纹过期 | 19 |
| 激活结论 | 拒绝 |

这证明发布门禁在正确工作：历史评测可以使用冻结快照复现，但历史快照不能带着旧代码指纹进入新生产发布。

## 五、数据库和审批边界

### 5.1 本轮未执行

- 未执行 `prisma migrate deploy`。
- 未使用 `--persist-drafts`。
- 未创建 evaluation release。
- 未发布 Business Definition。
- 未激活 release、未变更 canary、未写真实业务数据。

### 5.2 权限迁移预检

`20260718153000_beautician_brain_self_permissions` 状态为 `ready`，真实数据库中美容师角色仍缺少 `core:brain:use` 和 `core:brain:beautician-view`。本次只读预检明确 `databaseWritePerformed=false`。

同一预检中的供应链权限、客户反馈和客户等待 3 条迁移属于已冻结的管理端/后端独立任务，不应与本次 Ami Brain 权限迁移合并审批或执行。

## 六、建议的审批决策

### 建议：修改后批准

审批范围只保留与当前 Ami Brain 发布直接相关的内容：

1. 批准单独应用 `20260718153000_beautician_brain_self_permissions`。
2. 批准持久化本报告的 19 张新候选能力卡。
3. 复用 2 张未过期排行能力，创建 21 张能力卡的新 `draft / shadow / evaluationOnly` release。
4. 在该 release 内显式冻结上述 13 个已验证候选 Business Definition 版本。
5. 创建后立即执行目录、权限和 source freshness 门禁；任一 issue 非 0 则拒绝进入 120 题。

不批准在本次发布中同时应用客户反馈、客户等待和供应链角色权限迁移。

## 七、后续执行顺序

1. 获得数据库迁移和治理候选持久化的独立授权。
2. 应用并验证美容师 Brain 最小权限迁移。
3. 以明确 `createdBy` 持久化 19 张候选能力卡。
4. 创建 21 张能力卡的评测 release，不激活生产。
5. 运行目录、权限、业务定义依赖和源码新鲜度门禁。
6. 运行 120 题稳定性门禁，通过后再运行 650 题。
7. 只有 650 题、安全对抗、真实动作和回滚门禁全部通过后，才能进入 canary 审批。

## 八、验证记录

| 验证项 | 结果 |
| --- | --- |
| 重点六能力本地生成 | `6/6`，blocked=0 |
| release 314 全部过期能力刷新 | `19/19`，blocked=0 |
| 候选指纹/权限/门禁逐张校验 | `19/19`，invalid=0 |
| 合同刷新、生成、源码新鲜度、安全对抗 | 5 suite / 37 tests 通过 |
| 目录和迁移预检回归 | 3 suite / 57 tests 通过 |
| Brain 全量回归 | 136 suite 通过、1 suite 跳过；`1776/1777` tests 通过 |
| `server-v2` build | 通过 |
| 管理端 typecheck + Vite build | 通过 |
| release 314 目录合同 | issues=0 |
| release 314 source freshness | 19 张过期，正确拒绝 |
| 待迁移预检 | 4 条 ready，数据库写入 0 |

## 九、证据文件

- `ami-brain-capability-scan-r224.json`
- `ami-brain-capability-scan-r224.md`
- `candidate-bundle/generation-report.md`
- `candidate-bundle/generation-summary.json`
- `candidate-source-permission-gate-verification-r224.json`
- `release-314-catalog-source-freshness.log`
- `pending-migration-preflight.log`
