# Agent V2 生产 live 配置审计

生成时间：2026-07-06 10:39:11 Asia/Shanghai

## 结论

- 通过：否
- 阻塞项：2
- GitHub deploy token Secret：已配置
- GitHub hook URL Secret：已配置
- 后端 token：已配置
- 后端 token 指纹：f568081a8d177c5d
- 生产 API health：可达 (200)
- Zeabur 后端 env 已确认：否
- GitHub 生产 hook 开关：关闭
- 生产 hook 触发条件就绪：否
- 建议：生产 API hook URL 已配置且 health 可达；当前策略改为 GitHub main 提交后自动触发 Agent V2 auto-publish，后端 Cron 保持 false。下一步需先在 Zeabur 后端确认同轮 deploy token，再受控打开 GitHub 生产 hook 开关并做 hook smoke。

## 来源

- githubRepo: `vali001007/beauty-salon-admin`
- backendEnv: `packages/server-v2/.env`
- serverGitignore: `packages/server-v2/.gitignore`
- workflow: `.github/workflows/agent-v2.yml`
- productionHealthProbe: `https://ami-service.zeabur.app/api/health`

## 门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| 可只读读取 GitHub Secret 名称 | 通过 | `gh secret list` 成功执行 | secrets=AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN, AGENT_V2_DEPLOY_HOOK_URL | 证明后续配置不是只写本地文档，而是能从 GitHub 回读 Secret 名称。 |
| GitHub 已配置 deploy token Secret | 通过 | `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 存在 | present | GitHub workflow 触发生产 hook 时具备鉴权 token 来源。 |
| 可只读读取 GitHub Variable | 通过 | `gh variable list` 成功执行 | AGENT_V2_PRODUCTION_HOOK_ENABLED=false | 生产 hook 显式开关使用 GitHub Variable，避免 URL/token 配好后自动误触发。 |
| GitHub 生产 hook 显式开关当前保持关闭 | 通过 | `AGENT_V2_PRODUCTION_HOOK_ENABLED` 未设置为 true | false | 按 GitHub 提交触发 auto-publish 的策略启用前，先确认 Zeabur 后端同轮 token，避免下一次 main push 误触发失败。 |
| GitHub 已配置生产 hook URL Secret | 通过 | `AGENT_V2_DEPLOY_HOOK_URL` 存在 | present | 缺少该 Secret 时 workflow 条件不会满足，生产 hook 不会触发；当前仍需生产 API 域名。 |
| 后端真实 env 文件不进入 Git | 通过 | `packages/server-v2/.gitignore` 忽略 `.env` | ignored | 真实 deploy token 不会因本机 env 同步被提交到仓库。 |
| 后端 env 已配置同轮 deploy token | 通过 | `AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN` 非空 | present fingerprint=f568081a8d177c5d | 后端 deploy hook guard 能校验来自 GitHub 的专用 token。 |
| 后端 env 已配置生产 hook URL | 通过 | `AGENT_V2_DEPLOY_HOOK_URL` 非空 | https://ami-service.zeabur.app/api/agent-v2/capability-center/auto-publish/deploy-hook | 本机配置和 GitHub Secret 采用同一个生产 hook URL，便于审计和后续 smoke。 |
| 生产 API health 只读可达 | 通过 | `GET <生产 API>/api/health` 返回 2xx | status=200, url=https://ami-service.zeabur.app/api/health, body={"status":"ok","timestamp":"2026-07-06T02:39:11.295Z"} | 证明该域名是可访问的 server-v2 后端，而不是前端站点或错误域名。 |
| Zeabur 后端同轮 token 环境变量已确认 | 失败 | `AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED=true` | false | 只有确认部署平台后端也持有同轮 token，GitHub workflow 才能安全进入 hook smoke。 |
| 后端 Cron 自动发布保持关闭 | 通过 | `AGENT_V2_AUTO_PUBLISH_CRON=false` | false | 当前策略是 GitHub 提交触发 auto-publish，平时不做后端定时自动发布。 |
| auto-publish 采用 GitHub 提交触发 | 通过 | workflow 有 push 入口、无 schedule；生产 hook 限 main push 或 workflow_dispatch；push 默认 git_diff | push=present, schedule=absent, hook=main_or_manual, pushScan=git_diff | 把能力治理 auto-publish 绑定到 GitHub 提交流水线，不启用日常定时自动发布。 |
| 生产灰度默认仍走旧链路 | 通过 | `AGENT_V2_GRAY_MODE=legacy_regex` 且 `AGENT_INTENT_ENGINE=legacy_regex` | gray=legacy_regex, engine=legacy_regex | 配置 token 不会把生产问答直接切到 KG/LLM 正式接管。 |
| 旧正则退役确认开关保持关闭 | 通过 | `AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false` | false | 即使后续误配 legacy_retired，也不会绕过生产证据和授权。 |
| workflow 仍要求显式开关、URL 和 token 同时满足才触发 hook | 通过 | 条件包含 explicit enable、URL/token 非空、非 PR、main 或 workflow_dispatch | condition present | 当前显式开关未打开时，即使 URL/token 已配置也不会调用生产 hook。 |
| 生产 hook 不在后端 env 未确认时误放行 | 失败 | hook trigger ready 需要 GitHub URL/token、后端 URL/token、health 和 Zeabur env 确认同时满足 | githubUrl=true, githubToken=true, hookEnabled=false, backendUrl=true, backendToken=true, health=true, zeaburEnv=false | 把“URL 已配置”和“可触发生产 hook”拆开，避免仅凭 GitHub Secret 就误判生产已接通。 |

## 边界

- 本审计只读取 GitHub Secret 名称和本机后端 env 键状态，不读取 GitHub Secret 明文。
- 本审计只对生产 API 执行 GET /api/health 只读探测，不触发 deploy hook，不连接生产数据库，不删除旧正则。
- token 只输出 SHA-256 短指纹用于同轮配置核对，不输出明文。
- Zeabur 后端是否已设置同轮 token 需要通过部署平台环境变量确认，本审计不会读取 Zeabur Secret 明文。
