# Agent V2 Shadow 证据聚合报告

生成时间：2026-07-06 06:43:52 Asia/Shanghai
输入文件：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-shadow-evidence-export.example.json
默认输入：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-shadow-evidence-export.json
示例输入：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-shadow-evidence-export.example.json
候选证据输出：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.candidate.json

## 结论

- Candidate 强度：不足
- 观察天数：1
- 总运行：3
- shadow 运行：1
- kg_llm_preferred 运行：1
- kg_llm_only / legacy_retired 运行：0
- 有用率样本：3
- LLM 观测：有
- 回滚验证：无
- 建议：已生成 candidate 证据；必须再通过 agent-v2:legacy-retirement-evidence -- --input <candidate> 校验后，才能考虑写入正式生产证据。

## 聚合明细

- 运行模式分布：{"shadow":1,"kg_llm_preferred":1,"legacy_regex":1}
- 最终引擎分布：{"legacy_regex":2,"kg_llm":1}
- 状态分布：{"success":3}
- 重大回归：0
- 高风险自动执行：0
- KG 有用率：100.00% / 样本 1
- Legacy 有用率：100.00% / 样本 2
- LLM P99：610ms
- LLM 失败率：100.00%
