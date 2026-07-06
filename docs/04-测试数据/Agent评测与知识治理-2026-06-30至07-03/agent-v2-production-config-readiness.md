# Agent V2 生产配置预留 Readiness

生成时间：2026-07-06 10:39:08 Asia/Shanghai

## 结论

- 通过：是
- 阻塞项：0
- 建议：生产配置入口已按 GitHub 提交触发 auto-publish 预留；后端 Cron 保持关闭，仍需等生产 API、Secrets、Zeabur env、DB migration 授权和生产证据齐备后再启用生产 hook。

## 检查文件

- localEnvExample: `packages/server-v2/.env.example`
- productionEnvExample: `.env.production.example`
- workflow: `.github/workflows/agent-v2.yml`
- deployHookGuard: `packages/server-v2/src/agent-v2/capability-center/agent-v2-deploy-hook.guard.ts`
- grayStrategy: `packages/server-v2/src/agent-v2/agent-v2-gray-strategy.service.ts`
- governanceService: `packages/server-v2/src/agent-v2/governance/agent-v2-governance.service.ts`

## 门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| 本地环境样例预留生产 hook 变量但默认不启用 | 通过 | `AGENT_V2_DEPLOY_HOOK_URL`、token、Zeabur env 确认位存在，`AGENT_V2_AUTO_PUBLISH_CRON=false` | url=<empty>, token=<empty>, zeaburEnv=false, cron=false | 本地开发不会因为缺少生产 URL/token 被阻塞，也不会默认开启定时自动发布。 |
| 生产环境样例只给占位值，不携带真实 token | 通过 | 生产样例包含 hook URL/token/Zeabur env 确认位/cron/baseRef，token 是空值或生成提示占位 | url=<empty>, token=<generate-with-openssl-rand-base64-32>, zeaburEnv=false, cron=false, baseRef=origin/main | 后续配置有明确变量位，同时避免把真实生产 token 写进仓库。 |
| GitHub workflow 仅在显式开关、URL 和 token 同时满足时触发生产 hook | 通过 | hook step 使用 Secrets + Variable，跳过 pull_request，并要求 main push 或 workflow_dispatch、显式开关为 true、URL/token 非空 | if: ${{ github.event_name != 'pull_request' && (github.ref == 'refs/heads/main' \|\| github.event_name == 'workflow_dispatch') && env.AGENT_V2_PRODUCTION_HOOK_ENABLED == 'true' && env.AGENT_V2_DEPLOY_HOOK_URL != '' && env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN != '' }} | 生产自动发布不会在 PR、缺少 Secrets 或未显式打开生产 hook 开关时被误触发。 |
| 自动发布策略为 GitHub 提交触发 | 通过 | workflow 有 push 入口；生产 hook 只在 main push 或 workflow_dispatch 后执行；push 默认 git_diff 扫描 | push=present, hook=main_or_manual, pushScan=git_diff | 满足“每次提交 GitHub 后自动发布能力治理结果”的方向，同时只让 main 分支生产 hook 进入发布链路。 |
| 当前 workflow 不做定时自动发布 | 通过 | 只允许 push、pull_request、workflow_dispatch；没有 schedule | no schedule | 满足“平时不做定时自动化发布”，避免 GitHub schedule 或后端 Cron 双重发布。 |
| 生产 hook 调用携带专用 header 和 scanMode | 通过 | curl POST 使用 `x-agent-v2-deploy-token`，payload 包含 scanMode | header and scanMode present | 后续真正启用时，后端能识别来源并按增量策略执行。 |
| 后端 deploy hook 有专用 token guard | 通过 | 缺少或错误 token 会 Forbidden，比较使用安全等值方法 | guard configured | 外部自动发布入口不会复用普通用户 token，也不会无 token 执行。 |
| 生产默认仍保留旧链路，不随本地默认一起切换 | 通过 | `AGENT_V2_GRAY_MODE=legacy_regex`，`AGENT_INTENT_ENGINE=legacy_regex` | gray=legacy_regex, engine=legacy_regex | 生产接管仍由治理表/灰度规则和证据门禁控制，不被本地默认影响。 |
| 旧正则最终退役需要显式确认开关 | 通过 | env 样例默认 false，运行时和治理保存入口均检查 `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED` | env=false, runtime=present, governance=present | 后续即使误配 `legacy_retired`，也不会绕过生产证据和授权。 |

## 边界

- 本检查只读取本地文件，不连接生产数据库，不调用生产 API，不触发 deploy hook。
- 通过只代表后续生产配置入口已安全预留，不代表生产 shadow、线上有用率或旧正则退役已完成。
