# Agent V2 旧正则退役生产证据校验

生成时间：2026-07-06 07:55:22 Asia/Shanghai
输入证据：-
正式证据输出：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.json
证据模板：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.example.json
是否写入正式证据：否
线上有用率最小样本数：1

## 结论

- 证据校验：未通过
- 阻塞项数量：7
- 建议：生产证据不足；不要删除旧正则，也不要把示例模板或零样本文件写入正式证据。

## 明细

| 检查项 | 期望 | 当前证据 | 状态 | 交付影响 |
|---|---|---|---|---|
| 生产证据文件 | 存在真实导出的 JSON 文件 | 未找到：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.json | 阻塞 | 没有证据文件时，旧正则退役只能停留在本地预检通过，不能进入删除。 |
| 证据来源 | environment=production，且包含 window/exportedBy/generatedAt | 未提供 | 阻塞 | 证据必须来自生产观测窗口；本地 dry-run、示例模板或手填零样本都不能作为退役依据。 |
| 7 天 shadow/灰度样本 | observedDays >= 7，总样本、shadow 样本和新链路样本均非 0 | 0 天，总样本 0，shadow 0，preferred 0，only 0 | 阻塞 | 没有真实流量样本时，只能说明本地能力可用，不能说明线上接管稳定。 |
| shadow 安全结果 | 重大回归 0，高风险自动执行 0 | 重大回归 0，高风险自动执行 0 | 阻塞 | 有重大回归或高风险自动执行时，必须先修复策略和审批边界。 |
| 线上有用率 | relativeToLegacy=better/equal，样本 >= 1，KG 有用率 >= legacy | 未提供 | 阻塞 | 用户感知不低于旧链路，才有产品理由把新架构切成唯一入口。 |
| 生产 LLM 观测 | enabled=true，P99 > 0，失败率 0-100%，成本和失败样本已采集 | 未提供 | 阻塞 | 旧正则退役后，新链路成本和失败样本必须可观测，方便灰度止损。 |
| 回滚验证 | verified=true，且包含验证时间和回滚方式 | 未提供 | 阻塞 | 切换后必须能快速回到 legacy_regex 或 kg_llm_preferred，避免门店问答中断。 |
