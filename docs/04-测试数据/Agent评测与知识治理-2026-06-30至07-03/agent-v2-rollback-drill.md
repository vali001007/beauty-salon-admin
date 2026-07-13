# Agent V2 本地回滚演练

生成时间：2026-07-06 07:51:32 Asia/Shanghai

## 结论

- 通过：是
- 阻塞项：0
- 建议：本地回滚演练通过：生产默认、全局/规则/DB 回退、DB 规则刷新和 legacy_retired 防误启均可用。真实生产回滚仍需在生产或准生产执行并写入生产证据。

## 检查来源

- grayStrategy: `packages/server-v2/src/agent-v2/agent-v2-gray-strategy.service.ts`
- productionEnvExample: `.env.production.example`

## 演练门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| 生产无显式灰度配置时默认回到旧链路 | 通过 | defaultAgentV2GrayMode() 在 production 下返回 legacy_regex | mode=legacy_regex | 生产配置缺失或被清空时，默认不直接切新架构。 |
| 非生产默认保持新链路优先 | 通过 | defaultAgentV2GrayMode() 在 test/development 下返回 kg_llm_preferred | mode=kg_llm_preferred | 本地和 CI 继续靠近新架构验收，不影响生产默认。 |
| 生产环境样例保留回滚基线 | 通过 | AGENT_V2_GRAY_MODE=legacy_regex，AGENT_INTENT_ENGINE=legacy_regex，AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false | gray=legacy_regex, engine=legacy_regex, confirmed=false | 后续生产配置可通过环境变量回到旧链路，且默认不确认最终退役。 |
| 调试上下文可临时回退旧链路 | 通过 | context.agentV2GrayMode=legacy_regex 优先于 AGENT_V2_GRAY_MODE=kg_llm_only | mode=legacy_regex, source=context, engine=legacy_regex, fallback=false, shadow=false, retired=false, rule=- | 治理调试和人工排障可以临时验证旧链路。 |
| 全局环境变量可回退旧链路 | 通过 | AGENT_V2_GRAY_MODE=legacy_regex 返回 legacy_regex | mode=legacy_regex, source=env_global, engine=legacy_regex, fallback=false, shadow=false, retired=false, rule=- | 生产异常时可先用全局开关恢复旧链路。 |
| 环境规则可按入口/能力回退旧链路 | 通过 | 匹配 capabilityId + entrypoint 的 AGENT_V2_GRAY_RULES 优先于全局 kg_llm_only | mode=legacy_regex, source=env_rule, engine=legacy_regex, fallback=false, shadow=false, retired=false, rule=rollback-card-capability | 可对单能力或单入口回滚，避免全量切回影响新链路灰度。 |
| 治理表规则可优先于环境规则回退旧链路 | 通过 | active DB rule 匹配时返回 legacy_regex/db_rule | mode=legacy_regex, source=db_rule, engine=legacy_regex, fallback=false, shadow=false, retired=false, rule=db-rollback-card | 后续生产治理中心可用更细粒度规则回滚，不必修改全局环境变量。 |
| DB 灰度规则刷新后可从新链路回滚旧链路 | 通过 | refreshDbRules() 后由 kg_llm_only 变为 legacy_regex | before=kg_llm_only/db_rule/db-canary-kg-only, after=legacy_regex/db_rule/db-refresh-rollback | 治理中心改规则后，Runtime 可刷新缓存并快速回退。 |
| 未确认退役时 legacy_retired 自动降级 | 通过 | 生产 legacy_retired 且未设置确认开关时返回 kg_llm_preferred | mode=kg_llm_preferred, source=env_global, engine=kg_llm, fallback=true, shadow=false, retired=false, rule=- | 误配置最终退役不会直接切到不可回退状态。 |
| 证据确认后才允许 legacy_retired | 通过 | 生产 legacy_retired + AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true 返回 legacy_retired | mode=legacy_retired, source=env_global, engine=kg_llm, fallback=false, shadow=false, retired=true, rule=- | 最终退役需要显式确认，避免把本地演练当生产授权。 |

## 边界

- 连接生产数据库：否
- 调用生产 API：否
- 修改生产状态：否
- 写入正式生产证据：否
- 本演练只证明回滚开关和规则刷新路径在本地可执行；真实生产回滚验证仍需线上/准生产执行并纳入正式生产证据。
