# Agent V2 旧正则退役交接包

生成时间：2026-07-06 08:04:50 Asia/Shanghai

## 结论

- 本地交接就绪：是
- 本地门禁通过：是
- 生产退役就绪：否
- 阻塞项：1
- 建议：本地退役交接包已就绪：可以进入生产/准生产证据采集阶段，但不能删除旧正则或切 legacy_retired。

## 报告来源

- evalGate: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json`
- diffAttribution: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-diff-attribution.json`
- legacyDependencyAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-dependency-audit.json`
- rollbackDrill: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-rollback-drill.json`
- productionConfigReadiness: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.json`
- retirementPreflight: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-preflight.json`
- productionEvidenceCheck: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence-check.json`
- productionEvidenceExample: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.example.json`
- shadowEvidenceExample: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-shadow-evidence-export.example.json`

## 交接门禁

| 门禁 | 状态 | 期望 | 当前 | 责任方 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 650 题 strict gate 通过 | 通过 | pass=true，P0 未映射/权限待审/契约失败/错路由均为 0，高风险自动发布为 0 | pass=true, p0=103, unmapped=0, permission=0, contract=0, wrongRoute=0, highRisk=0 | 研发 | 继续保持 strict gate 作为旧正则删除前置门禁。 |
| KG-only 与 legacy 差异已归因且 KG 无待修 | 通过 | safeToRetireByAttribution=true，needsKgFix=0 | safe=true, needsKgFix=0, diffTotal=21 | 研发 | 生产 shadow 期间继续观察真实问法差异。 |
| 旧正则依赖边界审计通过 | 通过 | legacy dependency audit pass=true，blockerCount=0 | pass=true, blockers=0, predicates=33 | 研发 | 后续新增能力不得继续扩张旧 isXxx 谓词。 |
| 本地回滚演练通过 | 通过 | rollback drill pass=true，blockerCount=0 | pass=true, blockers=0 | 研发/运维 | 生产或准生产仍需执行真实回滚验证并写入证据。 |
| 生产配置预留 readiness 通过 | 通过 | production config readiness pass=true，blockerCount=0 | pass=true, blockers=0 | 研发/运维 | 生产域名和 token 稳定后再填 GitHub Secrets / 后端环境变量。 |
| 旧正则退役本地预检通过 | 通过 | localPreflightPass=true，retirementSafetyBlockers=0 | local=true, safetyBlockers=0, ready=false | 研发 | 本地门禁通过后进入生产证据采集，不删除旧正则。 |
| 生产证据仍阻塞旧正则删除 | 生产证据阻塞 | retirementReady=false 且 productionEvidenceBlockers>0，production evidence check pass=false | ready=false, productionBlockers=5, evidencePass=false, evidenceBlockers=7 | 产品/运维/研发 | 补齐 7 天 shadow、线上有用率、LLM 观测和真实回滚验证后再写正式生产证据。 |
| 生产证据模板和 shadow 导出样例已存在 | 通过 | production evidence example 与 shadow export example 文件存在 | productionEvidenceExample=true, shadowEvidenceExample=true | 研发/运维 | 按模板导出真实生产证据，不手工伪造样本。 |

## 生产证据清单

- 生产或准生产连续 7 天 shadow / kg_llm_preferred / kg_llm_only 运行导出。
- 线上用户有用率样本，且新链路有用率不低于旧链路。
- 生产 LLM 延迟 P99、失败率、成本和失败样本观测。
- 高风险自动执行为 0 的线上证据。
- 真实回滚验证：从 kg_llm_only / legacy_retired 回到 legacy_regex 或 kg_llm_preferred，记录时间、方法和执行人。
- 生产 DB migration 授权执行与管理员 core:agent-governance:view/manage 权限授予记录。
- 生产 API hook URL、deploy token、GitHub Secrets、后端环境变量和调度任务配置记录。

## 后续命令

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment production
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input <production-export.json>
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json>
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json> --write-canonical
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight -- --strict-retirement
```

## 边界

- 本交接包只汇总本地报告和生产缺口，不连接生产库、不调用生产 API、不写正式生产证据。
- 通过交接包只代表可以进入生产/准生产证据采集阶段，不代表旧正则已可删除。
