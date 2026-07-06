# Agent V2 GitHub PR Brief

生成时间：2026-07-06 11:57:34 Asia/Shanghai

## PR Title

feat(agent-v2): complete knowledge graph llm governance rollout

## Summary

- 完成 Agent V2 知识图谱 + LLM 意图抽取 + Manifest 映射 + 通用查询引擎 + 治理中心本地闭环。
- 接入 GitHub main 提交触发的 Agent V2 auto-publish hook 预留，保持无 schedule、后端 Cron 关闭和生产显式开关保护。
- 补齐生产 rollout、发布安全审计、部署同步审计、GitHub 发布交接和旧正则退役证据链。

## Release Batches

| Batch | Files | Purpose | Risk |
| --- | ---: | --- | --- |
| 发布控制、workflow 与环境样例 | 6 | 让 GitHub gate、auto-publish hook 条件、无定时发布策略和脚本入口可随代码一起交付。 | 会影响 CI 和后续生产 auto-publish 条件；当前仍不会打开生产 hook。 |
| 后端 schema、migration 与审计脚本 | 23 | 交付知识图谱、灰度规则、治理观测、生产 runbook、发布审计和旧正则退役证据链。 | 包含 Prisma migration 和生产证据脚本；提交后仍不能自动写生产库。 |
| Agent V2 后端运行时和治理服务 | 59 | 交付图谱 + LLM 意图抽取、能力映射、通用查询、Policy/Evidence/Contract、治理 API 和 health 部署元信息。 | 影响 Agent V2 主运行链路；生产默认仍由 gray mode 保持旧链路回退。 |
| 管理端治理中心、API 与权限入口 | 15 | 交付 Agent 治理中心、前端 API facade、路由、菜单和权限测试。 | 影响系统菜单和治理入口；普通门店角色仍不默认开放治理权限。 |
| Kiosk Agent 入口与终端适配 | 8 | 交付终端 agent_v1/agent_v2 选择、KG/LLM 架构透传和快捷动作保护。 | 影响终端 Agent 使用体验；快捷收银/核销动作仍保留。 |
| 开发计划、方案与测试证据 | 50 | 交付 task.md 计划闭环、方案来源、评测报告、图谱报告、发布审计和生产 runbook 证据。 | 主要是交付证据；报告应与代码门禁结果保持同步。 |

## Validation

- [ ] `npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict`
- [ ] `npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit`
- [ ] `npm.cmd --prefix packages/server-v2 run db:generate`
- [ ] `npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict`
- [ ] `npm.cmd --prefix packages/server-v2 run agent-v2:production-rollout-plan:strict`
- [ ] `npm.cmd --prefix packages/server-v2 run test -- --runTestsByPath src/agent-v2/agent-v2-runtime.service.spec.ts src/agent-v2/intent/agent-v2-intent-extraction.service.spec.ts src/agent-v2/query-engine/generic-query-engine.service.spec.ts src/agent-v2/governance/agent-v2-governance.service.spec.ts src/health/health.controller.spec.ts --runInBand`
- [ ] `npm.cmd --prefix packages/server-v2 run build`
- [ ] `npx.cmd vitest run src/app/pages/system/AgentGovernanceCenter.test.tsx src/test/permissions.test.ts`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build`
- [ ] `npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict`

## Current Gates

- GitHub release handoff: ready
- Secret findings: 0
- Local completion: ready
- Production rollout: ready
- Production hook trigger ready: no
- Deployment sync proven: no
- Stage manifest: docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.txt
- Stage dry-run: ready (161/161)

## Production Boundary

- This PR should not enable production hook by itself.
- Keep `AGENT_V2_PRODUCTION_HOOK_ENABLED=false` until Zeabur backend token env is confirmed and hook smoke is authorized.
- Keep `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false`; old regex removal still requires production shadow, useful-rate, LLM observability and rollback evidence.

## After Authorization

```powershell
git diff --check
npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit
npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict
git add --pathspec-from-file "docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-github-stage-manifest.txt"
git diff --cached --stat
git diff --cached --check
git commit -m "feat(agent-v2): complete knowledge graph llm governance rollout"
git push origin <branch>
```

## Boundaries

- 本交接报告只读取本地 Git 状态和已有 Agent V2 报告，不 stage、不 commit、不 push。
- handoffReady=true 只代表提交/PR 交接材料齐备，不代表生产已上线。
- 生产 hook、生产 DB 写入、旧正则删除和 Zeabur 配置变更仍必须等待明确授权。
