# Agent V2 本地完成度审计

生成时间：2026-07-06 11:49:03 Asia/Shanghai

## 结论

- 本地闭环可审计：是
- 生产退役就绪：否
- 剩余未勾选项：31
- 后置未勾选项：31
- 本地未收口项：0
- 建议：本地开发闭环已可审计：task.md 剩余未勾选项均属于生产/真实流量/旧正则最终退役后置项。

## 审计门禁

| 门禁 | 状态 | 期望 | 当前 | 影响 |
| --- | --- | --- | --- | --- |
| task.md 剩余未勾选项均已分类为后置生产项 | 通过 | localOpenUncheckedCount=0 | unchecked=31, deferred=31, localOpen=0 | 避免把本地尚未开发的任务误归入生产后置。 |
| 任务文档声明本地闭环边界 | 通过 | 包含“本地可闭环项已收口，生产/真实流量/授权项保留为后续上线阶段任务” | present | 产品交付口径明确：当前可验收本地开发，不误报生产完成。 |
| 本地闭环依赖报告齐备 | 通过 | eval、diff、dependency、rollback、config、preflight、evidence、handoff 报告均存在 | all reports exist | 审计不是只看 task.md 文案，而是读取当前报告证据。 |
| 核心本地门禁通过 | 通过 | strict eval pass=true，旧正则依赖审计 pass=true | eval=true, dependency=true, predicates=33 | 证明本地能力映射、权限、契约和旧正则依赖边界没有回退。 |
| 回滚演练和生产配置预留通过 | 通过 | rollback pass=true，production config readiness pass=true | rollback=true, config=true | 证明后续生产配置和回滚路径有本地保护。 |
| 退役交接包本地就绪但生产不误放行 | 通过 | handoffReady=true，localReady=true，productionReady=false | handoff=true, local=true, production=false | 可以进入生产/准生产证据采集，但不能删除旧正则或切 legacy_retired。 |
| GitHub 提交/PR 交接已准备好但仍需授权 | 通过 | secretFindingCount=0，github handoffReady=true，stageDryRunReady=true，authorizationRequired=true | releaseSecretFindings=0, changedEntryCount=161, handoffReady=true, stageDryRunReady=true, authorizationRequired=true | 证明后续只差用户授权执行 stage/commit/PR，且当前发布范围未发现疑似 Secret。 |
| Zeabur 部署和生产 hook 状态未被误报为完成 | 通过 | rolloutReady=true，postMergeVerifierReady=true，productionVerified=false，deploymentSyncProven=false，productionHookTriggerReady=false | rolloutReady=true, postMergeVerifierReady=true, postMergeProductionVerified=false, deploymentSyncProven=false, productionHealthReady=true, hookTriggerReady=false | 确认本地发布材料已准备好，但 GitHub 合入、Zeabur commit 证明和生产 hook 启用仍后置。 |
| 生产证据继续阻塞旧正则退役 | 通过 | retirementReady=false，productionEvidenceCheck pass=false，正式生产证据文件不存在 | retirementReady=false, productionBlockers=5, evidencePass=false, canonicalEvidenceExists=false | 确认当前没有伪造生产证据，旧正则最终退役仍后置。 |

## 剩余未勾选项分类

| 行号 | 章节 | 分类 | 内容 | 原因 |
| ---: | --- | --- | --- | --- |
| 1177 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 当满足退役条件后删除旧正则： | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1178 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | P0 strict gate 连续通过。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1179 | T12.3 删除旧 CapabilityDecisionService | production_evidence_deferred | shadow 对比 7 天无重大回归。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1180 | T12.3 删除旧 CapabilityDecisionService | production_evidence_deferred | 线上用户有用率不低于旧链路。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1181 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 高风险自动执行为 0。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1182 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 可回滚方案已验证。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1183 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 删除或降级： | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1184 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | `AgentV2CapabilityDecisionService` 正则判断。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1185 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 对应过时测试。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1186 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 重复手写查询逻辑。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1197 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 旧 `isXxx` 规则不再参与正式能力选择。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1199 | T12.3 删除旧 CapabilityDecisionService | legacy_retirement_deferred | 删除后 `server-v2` build、P0 eval、管理端 build 通过。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1281 | Sprint 6：图谱可视化、灰度和旧规则退役 | production_evidence_deferred | shadow 对比。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1282 | Sprint 6：图谱可视化、灰度和旧规则退役 | legacy_retirement_deferred | 旧正则退役。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1342 | 18.4 旧正则退役回归 | production_evidence_deferred | 开启 shadow 7 天。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1345 | 18.4 旧正则退役回归 | legacy_retirement_deferred | 切到 `kg_llm_preferred`。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1346 | 18.4 旧正则退役回归 | production_evidence_deferred | 观察线上失败分类。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1347 | 18.4 旧正则退役回归 | legacy_retirement_deferred | 切到 `kg_llm_only`。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1348 | 18.4 旧正则退役回归 | legacy_retirement_deferred | 删除旧正则。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1352 | 18.4 旧正则退役回归 | legacy_retirement_deferred | 新架构稳定接管。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1353 | 18.4 旧正则退役回归 | legacy_retirement_deferred | 旧规则删除后仍可通过评测、构建和核心手动场景。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1369 | 19.2 技术完成标准 | legacy_retirement_deferred | 正式能力选择不再依赖 33 个 `isXxx` 正则。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1454 | 22. 最终交付清单 | legacy_retirement_deferred | 旧 `CapabilityDecisionService` 正则退役。 | 旧正则最终删除必须等待生产证据、回滚验证和授权。 |
| 1645 | 剩余关键缺口 | production_evidence_deferred | M3 生产正式默认仍保持 `legacy_regex` 或治理表灰度控制；需 7 天 shadow、线上有用率、回滚验证和授权后才能改为生产默认接管。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1704 | 更新后的剩余关键缺口 | production_evidence_deferred | P0 运行时采样已完成，但还不是线上真实流量评测；仍需把实际 AgentRun/ToolCall 的延迟、缓存、命中差异持续落库并按门店/入口看 7 天。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1755 | 更新后的剩余关键缺口 | production_evidence_deferred | 真实生产 LLM Key、模型延迟、成本和失败率尚未接入线上观测；本轮验证的是 AI Gateway 调用链路、mock/fake LLM 单测和不可用降级。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1756 | 更新后的剩余关键缺口 | production_evidence_deferred | 评测运行已可落库，但尚未自动从 CI/定时任务写入生产库；当前需要管理员或后续 automation 调用导入接口。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1757 | 更新后的剩余关键缺口 | production_evidence_deferred | `kg_llm_preferred` 仍需要 7 天真实 shadow 数据判断差异，旧正则暂不能删除。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1801 | 更新后的剩余关键缺口 | production_evidence_deferred | 真实生产 LLM Key、模型延迟、成本、失败率和失败样本仍需接入线上观测；本地只能证明 AI Gateway 调用链路、mock/fake LLM 单测和降级策略。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1802 | 更新后的剩余关键缺口 | production_evidence_deferred | 评测运行已可落库，deploy hook 已有服务 token，但 CI/定时任务写入生产库仍需真实部署环境配置 `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN`、数据库连接和调度任务。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |
| 1803 | 更新后的剩余关键缺口 | production_evidence_deferred | `kg_llm_preferred` 仍需要 7 天真实 shadow 数据判断差异，旧正则暂不能删除。 | 需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。 |

## 来源

- task: `docs/03-开发计划/01-AI智能体与问数能力/task.md`
- canonicalProductionEvidence: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.json`
- evalGate: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json`
- legacyDiffAttribution: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-diff-attribution.json`
- legacyDependencyAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-dependency-audit.json`
- rollbackDrill: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-rollback-drill.json`
- productionConfigReadiness: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.json`
- retirementPreflight: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-preflight.json`
- productionEvidenceCheck: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence-check.json`
- retirementHandoff: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-retirement-handoff.json`
- releaseReadinessAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.json`
- githubReleaseHandoff: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.json`
- productionLiveConfigAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-live-config-audit.json`
- productionDeploymentSyncAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-deployment-sync-audit.json`
- productionRolloutPlan: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.json`
- postMergeDeployVerify: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-post-merge-deploy-verify.json`

## 下一步

- 继续保持本地 strict gate、生产配置 readiness、回滚演练和退役交接包在 CI 中通过。
- 生产 API 域名、deploy token、GitHub Secrets、后端环境变量和调度任务稳定后，再进入生产/准生产证据采集。
- 完成 7 天 shadow、线上有用率、生产 LLM 延迟/失败率/成本观测和真实回滚验证后，再写正式生产证据并申请旧正则删除授权。

## 边界

- 本审计只读取本地文档和报告，不连接生产库、不调用生产 API、不写正式生产证据。
- 本地闭环可审计不等于生产退役完成；旧正则删除仍以后续生产证据和授权为准。
