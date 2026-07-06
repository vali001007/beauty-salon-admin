# Agent V2 旧正则退役预检报告

生成时间：2026-07-06 07:46:45 Asia/Shanghai
Eval gate 来源：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json
Eval gate 时间：2026-07-06 07:13:27 Asia/Shanghai
差异归因来源：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-diff-attribution.json
差异归因时间：2026-07-06 06:36:54 Asia/Shanghai
生产证据来源：-
生产证据时间：-
生产证据模板：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.example.json

## 结论

- 本地退役前置门禁：通过
- 是否可删除旧正则：不可以
- 阻塞项数量：5
- 建议：本地工程门禁和退役安全门禁通过，但旧正则仍不可删除；需要先补齐生产 7 天 shadow/有用率/LLM 观测/回滚证据。

## 门禁明细

| 类别 | 门禁 | 期望 | 当前证据 | 状态 | 交付影响 |
|---|---|---|---|---|---|
| 本地门禁 | P0 strict gate | eval gate summary.pass=true | 通过 | 通过 | 本地 P0 门禁不过时不能灰度，更不能删除旧正则。 |
| 本地门禁 | P0 阻断项 | 未映射、权限待审、契约失败、错路由均为 0 | 未映射 0，权限待审 0，契约失败 0，错路由 0 | 通过 | P0 仍有阻断项时，新架构不能作为正式唯一入口。 |
| 本地门禁 | P0 运行态正确率 | >= 98% | 100.00%（103 / 103） | 通过 | 证明 runtime planning 不只是静态 Manifest 通过。 |
| 本地门禁 | P0 同题稳定性 | >= 99% | 100.00%（103 / 103） | 通过 | 同题多次不稳定会导致灰度期间门店感知为答案漂移。 |
| 本地门禁 | 高风险自动发布 | 0 | 0 | 通过 | 高风险动作不能绕过审批或阻断策略。 |
| 本地门禁 | 规划延迟 P99 | <= 800ms | 5.76ms / 样本 515 | 通过 | 本地规划延迟过高会影响管理端和终端问答体验。 |
| 本地门禁 | 静态 P0 Manifest 兜底 | 所有 P0 期望 capabilityId 都存在于静态 enabled Manifest | P0 能力 27 个，静态缺失 0 个 | 通过 | 删除旧正则前必须保证 DB Manifest 或动态发布异常时，P0 能力仍有静态兜底。 |
| 本地门禁 | 回滚开关 | legacy_regex/kg_llm_preferred/kg_llm_only/legacy_retired 均可识别，生产默认仍可回 legacy_regex | 模式缺失 0，生产默认 legacy_regex，非生产默认 kg_llm_preferred，未确认 legacy_retired -> kg_llm_preferred，确认后 -> legacy_retired | 通过 | 旧正则退役前必须保留显式模式开关，确保可以从 kg_llm_only/legacy_retired 快速回到 legacy_regex。 |
| 本地门禁 | 历史 run 审计兼容 | 运行审计仍记录 strategy、决策、候选、工具计划和 AgentRunAuditDetail | persistPlan/recordStep/AuditDetail/strategy/capabilityMapping/toolTrace 均存在 | 通过 | 旧正则删除后仍需要能回看历史 run 里的新旧引擎选择、回退原因和工具执行证据。 |
| 退役安全 | KG-only 与旧链路差异率 | <= 5% 或已完成逐项业务归因 | 20.39%（21 / 103）；已归因 21 条，KG 待修 0 条 | 通过 | 差异率过高时不能直接删除旧正则，需要先判断哪些是新链路改进、哪些是错路由。 |
| 退役安全 | KG-only 与旧链路逐项归因 | 已生成归因报告，且 KG 待修差异为 0 | 差异 21 条，KG 命中期望 21 条，legacy 命中期望 0 条，KG 待修 0 条 | 通过 | 归因未完成或 KG 仍有待修差异时，不能把旧正则从安全兜底中移除。 |
| 退役安全 | kg_llm_preferred 回退旧链路率 | <= 1% 或已完成回退原因归因 | 0.00%（0 / 515） | 通过 | 仍大量回退旧链路说明旧正则还承担安全兜底，不能删除。 |
| 生产证据 | 生产证据来源 | environment=production，且包含 window/exportedBy/generatedAt | 未提供生产证据文件 | 阻塞 | 防止本地 dry-run、staging/local 导出或手工模板被误当成旧正则退役依据。 |
| 生产证据 | 生产 shadow 观察 | >= 7 天、真实 shadow/灰度样本非 0，且无重大回归 | 0 天；未提供生产证据文件 | 阻塞 | 本地 dry-run 不能替代真实门店问题、真实权限和真实入口流量。 |
| 生产证据 | 线上用户有用率 | 不低于旧链路，且样本数 >= 1 | 未提供生产观测证据 | 阻塞 | 用户有用率不达标时，技术门禁通过也不能切成唯一入口。 |
| 生产证据 | 生产 LLM 观测 | 延迟、成本、失败率和失败样本已纳入线上观测 | 未接入生产观测 | 阻塞 | 没有生产 LLM 观测时，无法判断成本和失败样本是否可接受。 |
| 生产证据 | 可回滚方案 | 已在生产或准生产验证 | 未提供回滚验证证据 | 阻塞 | 旧正则删除前必须证明可以从 kg_llm_only/legacy_retired 快速回退。 |

## 阻塞项

- 生产证据来源：未提供生产证据文件。防止本地 dry-run、staging/local 导出或手工模板被误当成旧正则退役依据。
- 生产 shadow 观察：0 天；未提供生产证据文件。本地 dry-run 不能替代真实门店问题、真实权限和真实入口流量。
- 线上用户有用率：未提供生产观测证据。用户有用率不达标时，技术门禁通过也不能切成唯一入口。
- 生产 LLM 观测：未接入生产观测。没有生产 LLM 观测时，无法判断成本和失败样本是否可接受。
- 可回滚方案：未提供回滚验证证据。旧正则删除前必须证明可以从 kg_llm_only/legacy_retired 快速回退。
