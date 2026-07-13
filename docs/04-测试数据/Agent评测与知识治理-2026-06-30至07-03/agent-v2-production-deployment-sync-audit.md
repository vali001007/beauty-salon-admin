# Agent V2 生产部署同步审计

生成时间：2026-07-06 11:46:27 Asia/Shanghai

## 结论

- 部署同步已证明：否
- 阻塞项：4
- Zeabur 跟踪分支假设：main
- 当前本地分支：codex/local-save-2026-07-02-latest-dev
- 当前本地 HEAD：d01f836fbbb4be8b674c4b3dceb5663bf844400d
- 本地未提交/未跟踪条目：161
- 生产 health：可达
- 生产 commit：<missing>
- 生产 commit 匹配本地 HEAD：否
- 建议：Zeabur 后端在线，但当前生产 health 尚不能返回 commit；本轮已补本地 health 元信息，需等代码推送并由 Zeabur 自动部署后再只读确认 commit。

## 门禁

| 门禁 | 状态 | 期望 | 当前 | 交付影响 |
| --- | --- | --- | --- | --- |
| Zeabur 生产 health 可达 | 通过 | GET /api/health 返回 2xx | status=200 | 证明 Zeabur 后端服务在线，代码部署平台本身可访问。 |
| 生产 health 暴露非敏感 commit 元信息 | 失败 | response.deployment.commit 非空 | <missing> | 没有 commit 元信息时，无法只读证明生产运行的是哪一次 GitHub 提交。 |
| 当前本地改动已进入可部署提交 | 失败 | git status changedEntryCount=0 | changedEntryCount=161 | Zeabur 只能部署 GitHub 上的提交；当前本地未提交/未推送改动不会自动进入生产。 |
| 当前分支与 Zeabur 跟踪分支一致 | 失败 | currentBranch=main | currentBranch=codex/local-save-2026-07-02-latest-dev | 如果 Zeabur 跟踪 main，当前本地分支的改动需要合入 main 后才会自动部署。 |
| 生产运行 commit 与本地目标提交一致 | 失败 | production deployment.commit 与 localHead 匹配 | production=<missing>, local=d01f836fbbb4be8b674c4b3dceb5663bf844400d | 只有 commit 匹配，才能证明 Zeabur 已部署到当前目标提交。 |

## 来源

- backendEnv: `packages/server-v2/.env`
- productionHealth: `https://ami-service.zeabur.app/api/health`
- trackedBranch: `main`

## 边界

- 本审计只读取本地 Git 状态和生产 GET /api/health，不触发 deploy hook，不写生产库。
- Zeabur 自动部署负责代码同步、构建和服务重启；Agent V2 deploy hook 只用于可选 auto-publish 运营动作。
- 当前生产 health 如果缺少 deployment.commit，只能证明服务可达，不能证明已运行目标 Git commit。
