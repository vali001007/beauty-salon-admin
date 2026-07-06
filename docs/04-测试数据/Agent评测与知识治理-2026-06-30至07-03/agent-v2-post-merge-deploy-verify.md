# Agent V2 合并后 Zeabur 部署验收

生成时间：2026-07-06 11:46:58 Asia/Shanghai

## 结论

- 验收器就绪：是
- 发布后生产已验证：否
- 阻塞项：5
- Zeabur 跟踪分支：main
- 目标提交：a84af6bf5cd3f3056bbca9f063e71347d3b1bf90
- 当前分支：codex/local-save-2026-07-02-latest-dev
- 本地 HEAD：d01f836fbbb4be8b674c4b3dceb5663bf844400d
- origin/main：a84af6bf5cd3f3056bbca9f063e71347d3b1bf90
- 本地改动条目：161
- GitHub workflow：未确认
- GitHub workflow conclusion：<missing>
- GitHub workflow headSha：<missing>
- 生产 health：可达
- 生产 commit：<missing>
- 生产 commit 匹配目标：否
- GitHub 生产 hook 开关：关闭
- 生产 hook 触发条件：未就绪
- 建议：当前仍有 161 个本地改动条目，尚未形成合并后的干净 GitHub 提交；先获得授权 stage/commit/PR，再由 Zeabur 自动部署。

## 门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| 发布后验收依赖报告已生成 | 通过 | release handoff、rollout、live config、deployment sync、config readiness 报告存在 | all present | 缺少前置报告时，无法判断发布后验收是否覆盖了本地闭环、生产配置和部署同步。 |
| GitHub 发布交接包仍就绪 | 通过 | handoffReady=true | handoffReady=true | 证明待发布文件清单、PR brief 和 stage dry-run 仍可复用。 |
| 生产 rollout runbook 仍就绪 | 通过 | rolloutPlanReady=true | rolloutPlanReady=true | 发布后继续进入 Zeabur 部署确认、shadow 和旧正则退役证据链。 |
| 运行环境是合并后的干净提交 | 失败 | git status changedEntryCount=0 | changedEntryCount=161 | Zeabur 只能部署 GitHub 提交；本地仍有改动时，不能证明这些改动已经进入生产。 |
| Zeabur 跟踪分支目标提交可解析 | 通过 | origin/main 或 AGENT_V2_POST_MERGE_TARGET_COMMIT 非空 | a84af6bf5cd3f3056bbca9f063e71347d3b1bf90 | 没有目标 commit，就无法判断生产 health 返回的 commit 是否正确。 |
| 本地运行上下文对齐目标提交 | 失败 | localHead 与 targetCommit 匹配 | local=d01f836fbbb4be8b674c4b3dceb5663bf844400d, target=a84af6bf5cd3f3056bbca9f063e71347d3b1bf90 | 发布后验收应在合入后的目标提交上运行，避免拿未合并分支判断生产状态。 |
| GitHub Agent V2 Gate 在目标提交成功 | 失败 | 最近 main 分支 Agent V2 Gate completed/success 且 headSha=targetCommit | no workflow runs returned | Zeabur 自动部署前必须先确认 GitHub 侧 Agent V2 gate 对目标提交放行。 |
| Zeabur 生产 health 可达 | 通过 | GET /api/health 返回 2xx | status=200 | 证明生产后端在线；不可达时无法继续判断部署版本。 |
| 生产 health 暴露部署 commit | 失败 | response.deployment.commit 非空 | <missing> | 没有 commit 元信息时，只能证明服务在线，不能证明 Zeabur 已部署目标提交。 |
| 生产运行 commit 匹配目标提交 | 失败 | production deployment.commit 与 targetCommit 匹配 | production=<missing>, target=a84af6bf5cd3f3056bbca9f063e71347d3b1bf90 | 这是证明 Zeabur 已部署目标 GitHub 提交的核心证据。 |
| 自动发布策略仍是 GitHub 提交触发且无定时发布 | 通过 | production config readiness pass=true | pass=true | 确认 workflow 无 schedule、后端 Cron 关闭，符合“提交后发布、平时不定时发布”的产品口径。 |
| 生产 hook 开关状态可审计 | 通过 | live config audit present，hook enabled/ready 状态明确 | enabled=false, triggerReady=false | 发布代码不等于开启运营自动发布；hook 是否打开必须有独立证据。 |

## 来源

- githubReleaseHandoff: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-release-handoff.json`
- releaseReadinessAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-release-readiness-audit.json`
- productionRolloutPlan: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-rollout-plan.json`
- productionLiveConfigAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-live-config-audit.json`
- productionDeploymentSyncAudit: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-deployment-sync-audit.json`
- productionConfigReadiness: `docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-production-config-readiness.json`
- productionHealth: `https://ami-service.zeabur.app/api/health`
- targetBranch: `main`
- backendEnv: `packages/server-v2/.env`

## 边界

- 本验收器只读取本地 Git 状态、已有 Agent V2 报告、GitHub workflow 最近运行和 Zeabur GET /api/health。
- 本验收器不会执行 git add / commit / push，不触发 deploy hook，不写生产库，不删除旧正则。
- Zeabur 自动部署负责代码同步、构建和服务重启；Agent V2 deploy hook 只负责可选的能力治理 auto-publish。
- 当前策略为 GitHub main 提交后触发 auto-publish，workflow 不配置 schedule，后端 AGENT_V2_AUTO_PUBLISH_CRON 保持 false。
