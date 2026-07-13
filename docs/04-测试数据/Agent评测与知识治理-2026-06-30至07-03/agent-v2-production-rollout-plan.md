# Agent V2 生产灰度与旧正则退役 Runbook

生成时间：2026-07-06 11:49:30 Asia/Shanghai

## 结论

- Runbook 就绪：是
- 本地前置就绪：是
- 允许直接执行生产：否
- 生产退役就绪：否
- 生产证据仍阻塞：是
- 生产证据阻塞项：5
- Live 配置审计：已接入
- 生产 API health：可达
- Zeabur 后端 env 已确认：否
- GitHub 生产 hook 开关：关闭
- 生产 hook 触发条件就绪：否
- 生产部署同步审计：已接入
- 生产部署同步已证明：否
- 生产 commit：<missing>
- 本地改动条目：161
- 发布前安全审计：已接入
- 可直接发布：否
- 疑似 Secret：0
- 发布前改动条目：161
- GitHub 发布交接包：已接入
- GitHub 发布交接就绪：是
- GitHub 发布批次：6
- GitHub 提交仍需授权：是
- 合并后 Zeabur 验收：已接入
- 合并后验收器就绪：是
- 合并后生产已验证：否
- 合并后验收阻塞项：5
- 合并后目标提交：a84af6bf5cd3f3056bbca9f063e71347d3b1bf90
- 合并后生产 commit：<missing>
- 建议：发布前安全审计无疑似 Secret，GitHub 发布交接包已就绪；需用户授权后按交接包 stage/commit/PR，再由 Zeabur 自动部署。当前仍不能删除旧正则。

## 执行阶段

| 阶段 | 状态 | 标题 | 责任方 | 证据 |
| --- | --- | --- | --- | --- |
| D-1 本地基线 | 就绪 | 冻结本地验收基线 | 研发 | strict eval、production config readiness、retirement handoff、local completion audit 均通过。 |
| D0 生产配置 | 需授权执行 | 配置生产 API、Secrets、LLM 观测和治理权限 | 运维/研发 | 生产 API hook URL、deploy token、GitHub Secrets、Zeabur 后端环境变量、DB migration 授权和 core:agent-governance:view/manage 权限记录。 |
| D1-D7 Shadow 观察 | 需授权执行 | 开启 7 天 shadow / kg_llm_preferred / 受控 kg_llm_only 观察 | 产品/研发/运维 | 连续 7 天 AgentRun、AgentRunAuditDetail、AgentToolCall、AgentFeedback、rollback 记录导出。 |
| D8 证据聚合 | 需授权执行 | 聚合 shadow 导出为 candidate 证据 | 研发/运维 | candidate evidence、shadow evidence aggregate JSON/Markdown，且不自动写正式生产证据。 |
| D8 证据校验 | 需授权执行 | 校验并写入正式生产证据 | 研发/产品/运维 | production evidence check pass=true，正式 agent-v2-legacy-retirement-production-evidence.json 写入。 |
| D9 退役审批 | 阻塞 | 旧正则删除前最终门禁 | 产品/研发/运维 | strict retirement preflight 通过、真实回滚验证通过、删除 PR 验证通过。 |

## 阶段动作

### D-1 本地基线 冻结本地验收基线

- 状态：就绪
- 责任方：研发
- 证据：strict eval、production config readiness、retirement handoff、local completion audit 均通过。

- 确认当前 PR 或发布分支包含最新报告。
- 确认 Agent V2 变更已提交并合入 Zeabur 跟踪的 GitHub 分支；本地未提交改动不会被 Zeabur 自动部署。
- 提交前先生成 GitHub 发布交接包，按批次确认 Agent V2 范围和验证命令。
- 合并后运行 post-merge deploy verify，确认 GitHub gate、Zeabur health 和生产 commit 均指向目标提交。
- 确认发布前安全审计 secretFindingCount=0。
- 确认本地完成度审计仍显示 localOpenUncheckedCount=0。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit
npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify
npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:retirement-handoff:strict
npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict
```

### D0 生产配置 配置生产 API、Secrets、LLM 观测和治理权限

- 状态：需授权执行
- 责任方：运维/研发
- 证据：生产 API hook URL、deploy token、GitHub Secrets、Zeabur 后端环境变量、DB migration 授权和 core:agent-governance:view/manage 权限记录。

- Zeabur GitHub 自动部署负责代码同步、构建和服务重启，不依赖 Agent V2 deploy hook。
- Agent V2 deploy hook 负责让 GitHub workflow 在 main 分支提交后自动触发能力治理数据 auto-publish；workflow 不配置 schedule，后端 AGENT_V2_AUTO_PUBLISH_CRON 保持 false。
- 启用前先在 Zeabur 后端配置同轮 AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN，并把 AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED 作为审计证据置为 true。
- 只有受控 hook smoke 窗口才把 GitHub Variable AGENT_V2_PRODUCTION_HOOK_ENABLED 设为 true；打开后每次 main push 通过 gate 都会尝试触发 auto-publish。
- 保持 AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false。
- 生产默认仍保留 legacy_regex 或受控治理表灰度。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:production-live-config-audit
npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence
```

### D1-D7 Shadow 观察 开启 7 天 shadow / kg_llm_preferred / 受控 kg_llm_only 观察

- 状态：需授权执行
- 责任方：产品/研发/运维
- 证据：连续 7 天 AgentRun、AgentRunAuditDetail、AgentToolCall、AgentFeedback、rollback 记录导出。

- 优先按门店、persona、entrypoint、capabilityId 小范围开启。
- 每日检查重大回归、高风险自动执行、LLM 失败率和用户有用率。
- 有异常时立即回到 legacy_regex 或 kg_llm_preferred。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment production
```

### D8 证据聚合 聚合 shadow 导出为 candidate 证据

- 状态：需授权执行
- 责任方：研发/运维
- 证据：candidate evidence、shadow evidence aggregate JSON/Markdown，且不自动写正式生产证据。

- 使用真实生产导出文件作为输入。
- 确认 shadow 模式反馈口径：用户实际看到 legacy，KG 侧只做观测。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input <production-export.json>
```

### D8 证据校验 校验并写入正式生产证据

- 状态：需授权执行
- 责任方：研发/产品/运维
- 证据：production evidence check pass=true，正式 agent-v2-legacy-retirement-production-evidence.json 写入。

- 先只读校验 candidate 证据。
- 只有产品、研发和运维确认来源可信后，才使用 --write-canonical。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json>
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json> --write-canonical
```

### D9 退役审批 旧正则删除前最终门禁

- 状态：阻塞
- 责任方：产品/研发/运维
- 证据：strict retirement preflight 通过、真实回滚验证通过、删除 PR 验证通过。

- 确认正式生产证据通过后再切 legacy_retired 或删除旧正则。
- 删除旧正则后复跑 server-v2 build、P0 eval、管理端 build 和 Kiosk build。

```powershell
npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight -- --strict-retirement
npm.cmd --prefix packages/server-v2 run build
npm.cmd run build
npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build
```

## 每日 Shadow 检查

- 确认当日生产默认仍可回退到 legacy_regex 或 kg_llm_preferred。
- 抽查 AgentRun / AgentRunAuditDetail / AgentToolCall 是否持续落库。
- 抽查 LLM latencyP99、failureRate、cost 和失败样本是否可见。
- 抽查高风险自动执行数量是否为 0。
- 抽查用户反馈样本，区分 shadow 下用户实际看到的 legacy 结果和 KG 侧观测结果。

## 最终退役条件

- 生产或准生产连续 7 天 shadow / kg_llm_preferred / kg_llm_only 运行导出通过校验。
- 线上用户有用率样本非 0，且新链路不低于旧链路。
- 生产 LLM 延迟、失败率、成本和失败样本均可观测。
- 高风险自动执行为 0。
- 真实回滚验证已记录时间、执行人、方法和结果。
- 正式生产证据写入后，`agent-v2:legacy-retirement-preflight -- --strict-retirement` 通过。
- 产品、研发和运维共同授权删除旧正则。

## 来源

- canonicalProductionEvidence: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence.json`
- evalGate: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-gate-report.json`
- productionConfigReadiness: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.json`
- productionEvidenceCheck: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-production-evidence-check.json`
- retirementPreflight: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-legacy-retirement-preflight.json`
- retirementHandoff: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-retirement-handoff.json`
- localCompletionAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-local-completion-audit.json`
- productionLiveConfigAudit (optional): `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-live-config-audit.json`
- productionDeploymentSyncAudit (optional): `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-deployment-sync-audit.json`
- releaseReadinessAudit (optional): `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.json`
- githubReleaseHandoff (optional): `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.json`
- postMergeDeployVerify (optional): `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-post-merge-deploy-verify.json`

## 边界

- 本 runbook 只生成生产执行计划，不配置 Secrets、不调用生产 API、不连接生产库、不写正式生产证据。
- 生产执行必须等待生产域名、token、Secrets、LLM 观测、DB migration、权限和运维窗口明确授权。
- Runbook 就绪不等于旧正则退役完成。
