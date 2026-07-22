# Ami Brain 持续评测治理报告

> 日期：2026-07-21
>
> 范围：650 题文件评测、治理库评测运行、失败题回归、管理端评测中心
>
> 结论：评测已从“每次人工重跑全量并查看原始 JSON”升级为“完整发布门禁 + 失败题定向回归 + 自动下一轮清单”的持续治理闭环。

## 一、修复前断点

1. 650 题脚本虽支持手工传 `--question-ids`，但需要人工从近 3 MB 结果 JSON 中整理题号。
2. 产品缺陷与模型供应商失败混在同一失败清单，容易把基础设施抖动误当成业务能力退化。
3. 定向评测仍显示固定 650 题标题，并错误附带全量历史基线，导致报告口径失真。
4. 治理库已保存 `BrainEvalRun/BrainEvalResult`，但不能从上一轮失败自动创建回归运行。
5. 管理端只显示通过/失败计数和原始 JSON，没有失败题复测、回归状态、结构化逐题结果和运行中自动刷新。

## 二、文件评测持续回归

### 2.1 新增命令合同

`npm.cmd --prefix packages/server-v2 run brain:eval -- <参数>` 现支持：

- `--regression-from=<上一轮结果 JSON>`：自动读取上一轮失败题。
- `--regression-scope=product`：只测产品失败，排除模型供应商不可用；默认值。
- `--regression-scope=provider`：只重试供应商失败。
- `--regression-scope=all`：复测全部非可用题。
- 可继续叠加 `--limit`、`--persona`、`--release-id` 和 `--concurrency`。
- `--regression-from` 与手工 `--question-ids` 冲突时直接失败，避免两套选择口径交叉覆盖。

### 2.2 自动产物

每次评测除结果 JSON 和 Markdown 报告外，新增：

`ami-brain-model-driven-eval-regression-manifest-2026-07-15.json`

manifest 固定输出：

- 产品失败题号及状态/原因聚合。
- 供应商失败题号及状态/原因聚合。
- 全部失败题号。
- release ID、release fingerprint 和来源结果文件。

下一轮无需人工抄题号，可直接把本次 results JSON 传给 `--regression-from`。

### 2.3 650 题来源识别

Release 362 完整 650 结果包含：

| 分组 | 数量 |
| --- | ---: |
| 产品失败 | 283 |
| 其中指标查询失败 | 99 |
| 其中意图未覆盖 | 138 |
| 其中异常 | 31 |
| 其中假阳性 | 15 |
| 模型供应商不可用 | 7 |

因此后续修复 99 条指标查询失败时，可以只运行对应产品失败回归，不必每次重复 650 题；正式生产发布前仍必须执行完整门禁。

## 三、治理库失败题回归

- `POST /brain/governance/evals/runs` 新增 `sourceEvalRunId`。
- 后端按当前门店读取已完成来源运行，只选择 `deterministicPassed=false` 的题目。
- 来源 release、role 和失败 case key 自动继承；手工指定不同 release 时直接拒绝。
- evaluation-only release 的动态 capability/security/time case 会从冻结 release manifest 重建，不依赖是否已持久化到 `BrainEvalCase`。
- 回归运行固定为 `release_regression`，不能被误当作完整发布门禁，也不能单独生成 `canRelease=true`。
- summary 输出 selected、resolved、unresolved、providerUnavailable 和 passed。

## 四、管理端评测中心

- 最新运行显示通过率、失败题数和回归状态。
- 已完成且存在失败题的运行提供“复测失败”操作。
- 排队中或运行中的评测每 3 秒自动刷新，页面隐藏时停止请求。
- 逐题结果改为结构化表格，展示问题、case key、回答/失败原因和耗时，不再把原始 JSON 直接暴露给用户。
- 完整发布门禁、开发定向评测、通用评测和失败题回归使用不同类型标签。

## 五、真实 smoke

使用 Release 362 的完整结果作为回归来源，执行 `product + limit=1` 真实请求：

| 项目 | 结果 |
| --- | --- |
| 自动选中题目 | `qb-manager-business-overview-005` |
| 问题 | 经营概览样本 |
| 状态 | `metric_failed` |
| 首层失败 | `intent:intent_mismatch` |
| 模型供应商失败 | 0 |
| 回归门禁 | 未通过 |
| 下一轮 manifest | 已生成，并继续保留该题 |

这说明持续评测机制工作正常，但该经营概览问题本身仍需后续能力修复。本单元不修改该业务能力，也不把它计为完成。

Smoke 证据：

`docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-p1-continuous-eval-smoke-2026-07-21/`

真实数据库仅新增 2 次单题评测会话/消息/运行审计；没有执行采购、改约、触达、核销等业务写操作，生产 active release 未改变。

## 六、验证门禁

| 门禁 | 结果 |
| --- | --- |
| 评测回归、DTO、Controller、治理服务定向测试 | `5 suites / 62 tests passed` |
| 管理端评测中心测试 | `1 file / 2 tests passed` |
| Brain 全量测试 | `339 passed / 3 skipped` suites；`3853 passed / 10 skipped` tests |
| `packages/server-v2` build | 通过 |
| 管理端 typecheck:all | 通过 |
| 管理端 production build | 通过 |
| Release 362 单题真实回归 smoke | 正常完成并准确保留未修复题 |
| `git diff --check` | 通过 |

## 七、发布边界

失败题回归用于缩短日常修复反馈周期，不能替代最终完整 650、发布审计、安全门禁和生产 canary。当前产品深度 P1 已全部完成，下一阶段只进入已授权的最终 P0 发布流程；生产发布前仍需使用唯一候选执行最终门禁并确认没有新增回归。
