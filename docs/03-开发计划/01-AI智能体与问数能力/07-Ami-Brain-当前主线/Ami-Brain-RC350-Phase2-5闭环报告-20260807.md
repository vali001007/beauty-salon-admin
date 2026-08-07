# Ami Brain RC350 Phase 2～5 闭环报告

日期：2026-08-07
分支：`codex/ami-brain-release-switch-exec-20260806`
范围：Ami Brain 当前主线、Release #453、query_only_v1、DeepSeek 运行口径
不纳入范围：Ami Ask / Ask Data、690 扩展人工观察集、生产治理切换

## 1. 结论

Phase 2～5 的服务端开发任务已完成，并通过 targeted 回归、代码级测试和本地 RC350 diagnostic 验证。

必须区分两个口径：

1. 开发闭环：已闭环。Run #340 已验证最后一个剩余题 BQ1634 通过。
2. 最新完整 350 发布证据：未闭环。按用户指令，本轮修完 BQ1634 后未再重跑完整 350；最新完整 350 仍是 Run #339，结果为 349/350。

因此，本报告可以作为“Phase 2～5 开发闭环证据”，但不能替代正式 RC350 350/350 发布证据。

## 2. 已完成开发内容

### Phase 2：事实证据和 grounded answer

- 增加 deterministic honest boundary：不能接入口径时明确边界，不用相近指标或概览数据替代。
- 补齐项目经营建议的可验证输出：
  - 淡季/旺季主推项目候选。
  - 客单价主推项目候选。
  - 耗材成本控制建议。
- 财务提成汇总增加可见公式与计算过程，避免计算依据只藏在 metadata/table 内。
- BQ1634 召回策略和话术从“纯模板文案”升级为：
  - 分层召回策略。
  - 策略依据。
  - 预期观察指标。
  - 可编辑话术。
  - query_only_v1 只读边界。

### Phase 3：多轮上下文绑定

- 无上轮结果集或无法唯一绑定时进入澄清，不直接猜测。
- 对“转化最好那个策略再跑一次”等动作型多轮，保持 query_only_v1 边界，不执行营销动作。
- BQ1949 已通过 targeted 和全量 diagnostic。

### Phase 4：歧义追问和 query_only 动作边界

- 预约、充值、核销缺少关键对象时输出澄清，不返回执行成功。
- 越权场景优先进入权限拒绝：
  - 泛化退款。
  - 修改提成规则。
  - 生成提成结算。
  - 跨门店、利润/毛利/成本/储值负债、敏感手机号导出、删除客户等。
- 调整退款规则，保留“查询退款记录/历史/明细”和带具体订单线索的只读查询空间。

### Phase 5：Provider 失败归因

- 本轮未扩大改造 AI provider 基础设施。
- 通过 targeted 与 full diagnostic 验证 providerUnavailable 已在当前用例中归零。
- Provider 异常与业务能力失败在报告中分开记录，不把供应商波动当作业务功能失败，也不把重跑成功伪装成完整发布证据。

## 3. 代码变更范围

- `packages/server-v2/src/brain/brain-chat.service.ts`
- `packages/server-v2/src/brain/brain-chat.service.spec.ts`
- `packages/server-v2/src/brain/cognition/brain-intent-completeness-policy.service.ts`
- `packages/server-v2/src/brain/cognition/brain-intent-completeness-policy.service.spec.ts`
- `packages/server-v2/src/brain/capability/executors/brain-focused-business-capability.executor.ts`
- `packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts`
- `packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.spec.ts`

未修改 Ami Ask / Ask Data 范围文件。

## 4. 验证结果

| 类型 | 证据 | 结果 | 说明 |
| --- | --- | --- | --- |
| 修复集合 targeted | Run #334 `rc350_deepseek_phase2_5_repair104_v3_targeted_20260807` | 104/104 | 修复集合通过 |
| 剩余 7 题 targeted | Run #338 `rc350_deepseek_phase2_5_core350_remaining7_after_priority_fix_20260807` | 7/7 | 权限、多轮、provider 波动题均通过 |
| 全量本地 diagnostic | Run #339 `rc350_deepseek_phase2_5_core350_local_diagnostic_v3_20260807` | 349/350 | 唯一剩余 BQ1634 `suspected_false_success` |
| BQ1634 targeted | Run #340 `rc350_deepseek_phase2_5_bq1634_after_strategy_fix_20260807` | 1/1 | 修复后通过 |
| build | `npm --prefix packages/server-v2 run build` | 通过 | Nest build 通过 |
| 意图完整性单测 | `npx jest src/brain/cognition/brain-intent-completeness-policy.service.spec.ts --runInBand` | 43/43 | 通过 |
| Brain 入口关注用例 | `npx jest src/brain/brain-chat.service.spec.ts --runInBand -t "BQ0566\|BQ0570\|BQ1448\|BQ0778\|BQ1988\|BQ1989\|BQ1990\|BQ1959\|BQ1960"` | 3/3 命中通过 | 其余未命中用例被 Jest 跳过 |
| Domain executor recall 用例 | `npx jest src/brain/capability/executors/brain-domain-service-capability.executor.spec.ts --runInBand -t "BQ1634\|recall"` | 3/3 命中通过 | 覆盖召回策略与话术 |
| Brain check | `npm --prefix packages/server-v2 run brain:check:test` | 73/73 | 通过 |
| Brain release acceptance tests | `npm --prefix packages/server-v2 run brain:release:acceptance:test` | 161/161 | 通过 |

## 5. 证据文件

- `docs/04-测试数据/Ami-Brain-分层验收/rc350_deepseek_phase2_5_repair104_v3_targeted_20260807/targeted/summary.json`
- `docs/04-测试数据/Ami-Brain-分层验收/rc350_deepseek_phase2_5_core350_remaining7_after_priority_fix_20260807/targeted/summary.json`
- `docs/04-测试数据/Ami-Brain-分层验收/rc350_deepseek_phase2_5_core350_local_diagnostic_v3_20260807/targeted/summary.json`
- `docs/04-测试数据/Ami-Brain-分层验收/rc350_deepseek_phase2_5_bq1634_after_strategy_fix_20260807/targeted/summary.json`

## 6. 剩余发布边界

按用户指令，本轮跳过 BQ1634 修复后的完整 350 重跑。因此：

- 不能声明“最新完整 RC350 已 350/350 通过”。
- 可以声明“Phase 2～5 开发闭环，上一轮完整 diagnostic 349/350，唯一失败 BQ1634 已 targeted 修复通过”。
- 若要进入正式发布候选，还需要后续单独执行完整 RC350 或 release-core acceptance，并重新绑定 candidate / runtime / deployment / model / target DB 证据。

## 7. 产品风险说明

当前代码层面已解决主要产品风险：

- 对不能回答的问题，不再用相近指标冒充结论。
- 对动作类问题，不再在 query_only_v1 下输出执行成功。
- 对权限不足问题，优先拒绝而不是进入模型规划。
- 对召回策略类问题，避免只给通用话术，补齐策略依据和预期观察指标。

仍需产品侧保留的上线前边界：

- 最新完整 350 尚未在 BQ1634 修复后重跑。
- 云端 Zeabur / 生产健康 / 部署 commit 不在本报告内闭环。
- 人工三端 E2E、权限矩阵、provider fallback/fail-safe 仍需独立证据。
