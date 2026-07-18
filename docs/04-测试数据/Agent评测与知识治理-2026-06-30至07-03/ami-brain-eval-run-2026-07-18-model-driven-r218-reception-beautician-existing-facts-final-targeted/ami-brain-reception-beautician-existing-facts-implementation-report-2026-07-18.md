# Ami Brain 前台与美容师现有事实能力实施报告

日期：2026-07-18

## 1. 本次目标

把当前管理端和后端已经存在的预约、服务、客户卡项、项目 BOM 与美容师身份事实接入模型驱动能力链路，解决前台和美容师问题命中通用概览但答不到具体名单、时间和卡项进度的问题。

本次不新增预约通知回执、培训任务、客户情绪、爽约预测或其他管理端缺失事实。

## 2. 已实现

- 前台预约精确筛选：待到店、待确认、确认超时、指定时间、客户、美容师、第一/最后预约、项目类型和日期排行。
- 美容师个人排期：开始/结束时间、空档、计划时长、取消、首次到店、提前签到、上次服务和注意事项。
- `beautician_material_preparation`：根据有效预约和项目 BOM 返回标准用料。
- `beautician_customer_card_progress`：根据本人预约客户的有效卡项返回已用、余次和到期日。
- 精确正例合同修复：完全匹配已治理正例后不再被通用名词维度二次误拦截。
- 最小权限：新增 `core:brain:beautician-view`，保持本人身份和门店范围收口，不授予全店客户或全店绩效权限。
- 迁移预检：新增美容师权限迁移检查；当前真实角色缺少 `core:brain:use` 和 `core:brain:beautician-view`，状态为 `ready`，未写库。

## 3. 真实数据核验

门店 6 的只读核验结果：

| 事实 | 结果 |
| --- | --- |
| 2026-07-05 美容师预约 | 5 条 |
| 下午预约样例 | 16:30 陈诗涵 / 紧致抗衰护理 / 唐伊 |
| 沈晴当天计划服务 | 1 个，75 分钟 |
| 标准用料 | 补水精华液 5ml、屏障修护精华 2ml、一次性面巾 1片、院装温和洁面乳 5ml |
| 周紫萱卡项 | 综合养护20次卡，已用 4 次，剩余 16 次 |

## 4. 评测结果

R218 使用 release 314 和门店 6 的真实请求路径运行 19 题：

| 结果 | 数量 |
| --- | ---: |
| `usable_exact` | 16 |
| 正确 `unsupported_intent` | 3 |
| `metric_failed` | 0 |
| provider unavailable | 0 |
| 假阳性 | 0 |

三条正确边界分别为：预约通知是否送达、今天是否安排培训或其他任务、客户近期情绪状态。系统没有用预约状态、个人排期或客户备注伪造这些事实。

“今天有没有需要我帮客人续卡或者推荐项目的”从 R216 的 `metric_failed` 修复为 R217/R218 的 `usable_exact`，实际选择 `beautician_customer_card_progress`。回答只披露卡项事实，并明确统一续卡阈值和项目推荐规则尚未发布。

## 5. 工程验证

| 验证 | 结果 |
| --- | --- |
| 定向主链路回归 | 7 suite / 302 tests passed |
| Brain 全量 | 136 suite passed / 1 skipped；1767 passed / 1 skipped |
| `server-v2` build | passed |
| 管理端权限测试 | 15 passed |
| 管理端 typecheck + Vite build | passed |
| 待迁移只读预检 | 4 migrations ready，databaseWritePerformed=false |

## 6. 发布边界

- release 314 是权限合同调整前的评测快照，仅用于验证业务回答链路。
- `20260718153000_beautician_brain_self_permissions` 尚未应用，真实美容师角色仍不能使用本次新增 Ami Brain 权限。
- 应在数据库变更审批、apply 和真实账号验证完成后重新生成能力版本与候选 release。
- 当前未进行生产激活、灰度切换、push 或 PR。
