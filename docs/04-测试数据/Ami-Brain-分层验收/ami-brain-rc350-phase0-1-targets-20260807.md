# Ami Brain RC-350 Phase 0～1 目标回归清单

日期：2026-08-07
范围：Ami Brain 当前分支 `codex/ami-brain-release-switch-exec-20260806`
不纳入：Ami Ask / Ask Data 分支、690 扩展人工观察集、正式云端切换

## Phase 0：冻结本轮阻断簇

本轮只把 RC-350 中的 `suspected_false_success` 作为 Phase 1 修复入口，原因是它对产品风险最高：用户看到的是“像成功的答案”，但事实、公式或建议闭环不足。

目标题：

| Case | 问题 | 修复目标 |
| --- | --- | --- |
| BQ1297 | 昨天各美容师的提成汇总 | 支持全员按美容师汇总，不能误要求用户先选择单个美容师 |
| BQ1298 | 昨天毛利率是多少 | 输出毛利率时必须给出公式、收入和毛利口径 |
| BQ1299 | 次卡未履约负债有多少 | 输出负债金额时必须给出剩余次数乘单次确认价值的公式口径 |
| BQ1447 | 储值负债太高有什么风险怎么办 | 除金额外必须给出储值负债风险和处理建议 |
| BQ1563 | 最近7天拓客成本的趋势 | 成本事实未治理发布时必须诚实说明边界，并给出可核验的新客转化基线 |

## Phase 1：运行时修复边界

本次修复只改 Ami Brain 运行时答案契约：

1. 财务域 `finance_risk_overview`
   - 全员提成汇总：直接走 `buildFinanceStaffCommissionRows` 全员聚合。
   - 财务标量：在答案文本中补公式和口径，不改变已有 KPI block 主结构。
   - 储值负债建议：风险类问题追加风险解释和处理建议。

2. 营销域 `marketing_growth_overview`
   - 拓客成本趋势：没有治理发布的营销成本事实时，不输出伪趋势。
   - 保留可验证的新客建档、首单转化、转化率作为边界内事实。

## 定向验证命令

```bash
npm --prefix packages/server-v2 test -- src/brain/capability/executors/brain-domain-service-capability.executor.spec.ts --runInBand
```

发布前仍需按当前 RC 机制重跑核心 350：

```bash
npm --prefix packages/server-v2 run brain:eval:full-domain -- --stage=targeted --case-ids=BQ1297,BQ1298,BQ1299,BQ1447,BQ1563
```

说明：第二条命令是仓库当前 targeted runner；只覆盖 RC-350 核心阻断题，不把 690 扩展集纳入发布分母。

## Phase 1 验证结果

### 单测

```bash
npm --prefix packages/server-v2 test -- src/brain/capability/executors/brain-domain-service-capability.executor.spec.ts src/brain/cognition/brain-semantic-intent-compiler.service.spec.ts src/brain/eval/ami-brain-full-domain-eval-suite.spec.ts --runInBand
```

结果：3 个 test suite 通过，317 个测试通过。

### 5 题 targeted 回归

```bash
npm --prefix packages/server-v2 run brain:eval:full-domain -- --stage=targeted --case-ids=BQ1297,BQ1298,BQ1299,BQ1447,BQ1563 --run-key=phase0_1_false_success_fix_v4_20260807 --checkpoint-every=5 --max-cases-per-invocation=5 --concurrency=2
```

结果：

- Run：#325
- total：5
- pass：5
- failureClusters：无
- suspected_false_success：0
- qualityBuckets：`honest_boundary=1`、`manual_review=4`
- provider/model：`deepseek/deepseek-v4-flash`

说明：4 个财务题因题库没有逐题数值 Gold 真值，归入 `manual_review`，不再归为疑似假成功；BQ1563 因营销成本事实未治理发布，归入 `honest_boundary`，不输出伪趋势。
