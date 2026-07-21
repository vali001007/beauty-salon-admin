# Ami Brain 现有能力合同对齐实施报告

## 一、结论

本单元没有扩建管理端业务模块，只修复当前后台已经具备数据与功能但 Ami Brain 没有正确理解、选择或输出的问题。release 296 的前 120 题真实可用率为 `97/119 = 81.5%`，相比 R160 的 `82/119 = 68.9%` 提升 15 题。

## 二、完成内容

- 商品销售额读取订单商品明细净额，不再用全店实收或销量替代。
- 耗材消耗排行读取库存流水出库量，并补齐商品维度和降序排序合同。
- 新客转化诊断保留诊断回答形态，指标引用不再覆盖诊断意图。
- 新客转化多指标恢复新客数、转化数、转化率三项定义引用。
- 补齐员工提成总额、最近采购金额、项目 BOM 缺料、低余次卡、推广项目维度和新客来源/转化边界。
- 新增库存消耗量候选定义版本 140，门店 6 真实 fixture 校验通过，状态为 `validated_candidate`。

## 三、治理状态

| 项目 | 结果 |
| --- | --- |
| 评测 release | 296 |
| release key | `ami-brain-model-driven-r166-existing-capability-alignment-fresh-20260718-shadow` |
| 能力卡 | 19 |
| 目录有效性 | 通过 |
| 源码新鲜度 | 通过 |
| 发布模式 | draft / shadow / evaluationOnly |
| 生产切换 | 未执行 |

全量能力生成时，`customer_feedback_overview` 和 `customer_waiting_loss_overview` 因依赖定义尚未生产发布被门禁阻断。它们没有被带入 release 296，符合当前“数据库未迁移，不计入可用能力”的边界。

## 四、验证结果

| 验证项 | 结果 |
| --- | --- |
| 核心定向测试 | 7 个 suite、341 个测试通过 |
| resolver 与候选生成补充测试 | 通过 |
| `server-v2` build | 通过 |
| 商品销售额 targeted | usable_exact |
| 库存消耗排行 targeted | usable_exact |
| 新客转化诊断 targeted | usable_exact |
| 新客转化多指标 targeted | usable_exact |
| 120 题正式快照 | 97/119 = 81.5%，1 题 provider unavailable |
| 安全违规 | 0 |

## 五、剩余问题分层

### 管理端/后端缺失，延期

- 投诉满意度与完整客诉处置。
- 员工试用期、带教和转正审批。
- 设备台账与故障巡检。
- 服务事故、皮肤过敏事件与处置。
- 项目级收入、折扣和成本归因。
- 客户归属历史和变更事件。

### 当前事实已存在，继续修 Ami Brain

- 支付方式自然语言拆分。
- 退款原因明细。
- 商品售价低于成本和商品毛利排行的数据充分性审计与接入。
- 次卡临期高余量、员工客户流失、基础项目未升单。
- 通用风险/紧急事项的 Supervisor 结果过滤与摘要收敛。

## 六、证据目录

- 正式 120 题：当前目录下 `ami-brain-model-driven-eval-report-2026-07-15.md` 与结果 JSON。
- 三题合同修复：`ami-brain-eval-run-2026-07-18-model-driven-r167-existing-capability-targeted-v4`。
- 新客多指标修复：`ami-brain-eval-run-2026-07-18-model-driven-r169-new-customer-conversion-targeted`。
