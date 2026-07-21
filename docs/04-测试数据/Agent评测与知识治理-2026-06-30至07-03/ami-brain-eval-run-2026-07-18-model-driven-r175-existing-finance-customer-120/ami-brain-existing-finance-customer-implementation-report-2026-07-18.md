# Ami Brain 现有财务、商品与会员卡事实接入报告

## 一、结论

本单元没有新增管理端业务模块、数据表或真实写操作，只把现有支付、退款、订单商品成本和客户卡事实接入 Ami Brain。5 条目标问题全部达到 `usable_exact`；完整前 120 题为 `98/118 = 83.1%`，另有 2 条模型供应商不可用。

## 二、完成内容

- 现金、微信、支付宝自然语言问题返回支付方式拆分。
- 退款问题返回成功退款金额、笔数、原因分组和明细，缺失原因明确披露。
- 商品低于成本销售按净收入、退款冲减、赠品和成本来源计算。
- 商品毛利排行返回商品维度收入、成本、毛利率和成本覆盖率。
- 次卡临期高余量返回客户、到期天数、剩余次数和未履约价值。
- 新增两项受治理商品指标和 `product_margin_rows` resolver 合同。
- 写操作边界未变化，本单元全部为门店隔离的只读能力。

## 三、治理状态

| 项目 | 结果 |
| --- | --- |
| 评测 release | 297 |
| release key | `ami-brain-model-driven-r170-existing-finance-customer-facts-20260718-shadow` |
| 能力卡 | 19 |
| 商品低于成本定义 | 版本 141，validated_candidate |
| 商品毛利率定义 | 版本 142，validated_candidate |
| 目录与源码新鲜度 | 通过 |
| 发布模式 | draft / shadow / evaluationOnly |
| 生产激活 | 未执行 |

## 四、验证结果

| 验证项 | 结果 |
| --- | --- |
| 本单元定向测试 | 8 个 suite、247 个测试通过 |
| Brain 全量测试 | 135 个 suite 通过，1 个跳过；1725/1726 测试通过 |
| `server-v2` build | 通过 |
| Prisma schema validate | 通过 |
| 管理端 typecheck + Vite build | 通过 |
| 5 条 targeted | 5/5 usable_exact |
| 前 120 题 | 98/118 = 83.1%；观察值 98/120 = 81.7% |
| 精确 / 部分可用 | 96 / 2 |
| provider unavailable | 2 |
| 假阳性 | 2 |
| 安全违规 | 0 |

5 条目标问题：

1. 今天现金收了多少，微信支付宝各多少。
2. 有没有产品卖出去的价格低于成本的。
3. 这个月退货了多少，原因是什么。
4. 哪些产品毛利率最高。
5. 有没有次卡即将过期但客户还有很多余量。

## 五、剩余问题分层

延期到管理端/后端独立任务：投诉满意度、等待流失、试用期和转正、设备和消防巡检、服务事故与过敏、项目级成本归因、客户归属历史、权益满意度。

继续由 Ami Brain 基于已有事实处理：员工周业绩下滑、今日接待承载、通用风险/紧急事项、消费金额分层、折扣敏感、基础项目未升单和疗程续购。

## 六、证据

- 当前目录 `ami-brain-model-driven-eval-results-2026-07-15.json`。
- 当前目录 `ami-brain-model-driven-eval-report-2026-07-15.md`。
- 5 条定向结果目录：`ami-brain-eval-run-2026-07-18-model-driven-r174-existing-finance-customer-targeted-final`。
