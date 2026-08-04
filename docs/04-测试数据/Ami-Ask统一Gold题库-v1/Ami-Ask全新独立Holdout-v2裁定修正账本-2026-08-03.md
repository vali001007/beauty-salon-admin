# Ami Ask 全新独立 Holdout v2 裁定修正账本

## 1. 账本边界

- 冻结合同：`Ami-Ask全新独立Holdout合同-v2.json`
- 冻结文件 SHA-256：`3cd978bf2e0e193bf23ebe0d45558e09aab288f5bf00115ea51cc44f8268fc38`
- 原则：不修改、不覆盖、不重新命名冻结合同。本账本只记录复测后发现的 Gold 裁定缺陷，并作为后续合同生成器和新 Holdout 的修正依据。
- 证据用途：Holdout v2 保留为一次性独立测试的原始证据；以下题目在统计“模型错误”与“Gold 错误”时必须分开计算。

## 2. 裁定修正

| 题目 ID | 原冻结裁定 | 修正裁定 | 原因 |
|---|---|---|---|
| `ami_brain_2000:BQ0549` | detail | ranking | “哪些项目贡献了主要营收”要求按项目营收贡献排序。 |
| `ami_brain_2000:BQ0561` | detail | ranking | 同上。 |
| `ami_brain_2000:BQ0555` | detail + year | ranking + year | 国庆缺年份；补齐年份后仍应返回项目营收贡献排行。 |
| `ami_brain_2000:BQ0720` | scalar | grouped by payment method | “支付方式结构”要求按支付方式分组，不能只返回总支付金额。 |
| `ami_brain_2000:BQ0740` | scalar | grouped by payment method | 同上。 |
| `ami_brain_2000:BQ0730` | scalar + year | grouped by payment method + year | 双十一缺年份；补齐后按支付方式分组。 |
| `ami_brain_2000:BQ1358` | scalar | grouped by cost category | “成本结构”要求按成本类别分组。 |
| `ami_brain_2000:BQ1348` | scalar + year | grouped by cost category + year | 五一缺年份；补齐后按成本类别分组。 |
| `ami_brain_2000:BQ1368` | scalar + year | grouped by cost category + year | 春节缺年份；补齐后按成本类别分组。 |
| `ami_brain_2000:BQ0893` | detail | scalar reservation count | “有几个预约”只要求数量，不要求逐条预约明细。 |
| `ami_brain_2000:BQ1178` | trend query | clarification: comparison_relation | “耗占比”未定义分子和分母，直接按库存流水回答会制造错误口径。 |
| `ami_brain_2000:BQ1186` | trend query | clarification: comparison_relation | 同上。 |
| `ami_brain_2000:BQ1194` | trend query + year | clarification: year + comparison_relation | 五一缺年份，同时“耗占比”缺分子和分母。 |
| `ami_brain_2000:BQ1605` | detail with ROI | grouped by activity | “哪些活动在亏钱”应按活动返回归因净收入、估算成本、营销利润和 ROI，并筛选收入小于成本。 |
| `ami_brain_2000:BQ1612` | detail with ROI | grouped by activity | 同上。 |

退款率“正常/偏高”、可疑连续退款等题目的 `threshold` 裁定在冻结合同中已经正确，保留原裁定；本轮只补强合同生成器和多槽位澄清回归，避免后续题库重新退化。

## 3. 统计口径

- 原始独立 Holdout v2 指标继续按冻结合同原样保留，保证不可篡改。
- 复盘报告增加“Gold 缺陷校正后指标”，但不得覆盖原始指标。
- 新生成 Gold/Holdout 必须使用修正后的合同生成器；Holdout v2 不得重新生成后冒充新的独立测试。
