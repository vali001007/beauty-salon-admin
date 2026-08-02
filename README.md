# Ami Core

Ami Core 是面向美业经营场景的多端业务平台。本仓库包含管理端、统一业务后端、智能终端、客户服务端和营销端；所有真实业务数据统一由 `packages/server-v2` 提供。

## 当前开发基线

截至 2026-07-28，当前开发环境已验证为：

- Node.js `24.18.0`、npm `11.16.0`
- 管理端：`http://127.0.0.1:5173`
- Core API：`http://127.0.0.1:8080/api`
- Swagger：`http://127.0.0.1:8080/docs`
- PostgreSQL：远端 Supabase 开发库，通过 Session Pooler 连接
- Redis：本机 `127.0.0.1:6379`
- 本机 PostgreSQL：当前项目不使用
- API 健康检查和数据库连接状态已验证正常

当前开发组合为：

```text
本地代码 + 本地前后端 + 本地 Redis + 远端 Supabase 开发库
```

## 环境要求

- Node.js `>=24 <25`
- npm `>=11 <12`
- 可访问远端 Supabase 开发库
- 本机 Redis
- 不需要启动本机 PostgreSQL

进入项目后先确认 Node 版本：

```bash
nvm use
node --version
npm --version
```

安装依赖：

```bash
npm install
npm --prefix packages/server-v2 install
```

macOS 可使用 Homebrew 启动 Redis：

```bash
brew services start redis
redis-cli ping
```

## 后端环境变量

后端使用忽略提交的 `packages/server-v2/.env`。已有 `.env` 时不要用 `.env.example` 覆盖。

核心配置示例：

```dotenv
PORT=8080
DATABASE_URL=postgresql://USER:PASSWORD@YOUR_SUPABASE_SESSION_POOLER_HOST:5432/postgres?sslmode=require&uselibpqcompat=true
REDIS_URL=redis://127.0.0.1:6379
LLM_PROVIDER=mock
MARKETING_SCHEDULER_ENABLED=false
TERMINAL_AUTOMATION_SCHEDULER=disabled
```

- `DATABASE_URL` 必须指向已批准的 Supabase 开发库，不要填写本机 PostgreSQL。
- Supabase 运行时使用 Session Pooler；不要在文档、日志或 Git 中暴露真实密码。
- `.env.example` 仅作为字段参考，具体值以当前开发环境为准。
- AI Provider 默认可使用 `mock`；真实模型 Key 只能保存在后端环境变量中。

## 启动项目

推荐分别启动后端和管理端，日志更容易排查。

终端一：

```bash
npm run dev:api
```

终端二：

```bash
npm run dev:web -- --host 127.0.0.1
```

也可以使用统一启动入口：

```bash
npm run dev
```

前端通过 Vite 将 `/api` 代理到 `http://127.0.0.1:8080`。如果页面出现 `ECONNREFUSED`，先检查后端健康状态：

```bash
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/health/ready
```

macOS/Codex 环境如果因文件监听导致 Vite 无响应，可使用：

```bash
VITE_DISABLE_FILE_WATCH=1 npm run dev:web -- --host 127.0.0.1 --port 5173
```

该模式关闭热更新，修改代码后需要重启前端。

## 数据库开发约定

- 当前 Supabase 是开发数据库，常规业务读写、必要测试数据和已确认的 migration deploy 可以直接执行。
- 本机 `ami_core` 暂不使用，也不会与 Supabase 自动同步。
- 数据库操作前先确认 `DATABASE_URL` 的 Host，避免误连本地库、未知库或未来的生产库。
- 远端开发库部署已有 migration 使用：

```bash
npm --prefix packages/server-v2 run db:migrate:prod
```

- Prisma Client 生成使用：

```bash
npm run db:generate:v2
```

- `migrate reset`、`DROP`、`TRUNCATE`、`db push --force-reset`、无条件批量删除和不可逆数据覆盖属于高风险操作，执行前必须获得明确授权。
- migration、seed 或数据修复完成后必须检查结果，不能只以命令退出码作为业务验收。

## API 模式

管理端默认使用 Real API：

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=/api
```

- Real API 实现在 `src/api/real/*`，由 `server-v2` 提供真实业务能力。
- mock 仅用于单元测试、离线样例或显式 UI 演示，不作为新增业务的数据来源。
- 请求会自动附加登录 Token 和当前门店标识。
- 前端和其他客户端不得保存大模型或第三方服务密钥。

## 默认开发账号

- 用户名：`admin`
- 默认密码：`11111111`
- 角色：超级管理员

默认账号仅用于开发环境；部署新环境时应通过环境变量修改默认密码。

## 常用命令

```bash
npm run dev
npm run dev:doctor
npm run dev:api
npm run dev:web
npm run dev:kiosk
npm run build
npm run test
npm run test:coverage
npm run lint
npm run db:generate:v2
npm run db:seed:promotion-assets:verify
```

执行前以当前 `package.json` 中的脚本为准。

## 项目结构

```text
src/                          管理端主应用
packages/server-v2/           NestJS + Prisma 统一后端与 AI Gateway
packages/Ami-Aura-Lite-Kiosk/ 智能终端
packages/Ami-Glow-H5/         客户服务 H5
packages/Ami-Glow-MiniApp/    客户服务小程序
packages/marketing-h5/        公开营销活动 H5
packages/app/                 移动端 AI 助手
packages/agent-core/          共享 AI 对话能力
docs/                         API、计划与开发文档
```

各子项目不是统一 npm workspace，安装依赖或修改锁文件时只处理实际使用该依赖的项目。

## 其他客户端

Ami Aura Lite 智能终端：

```bash
npm run dev:kiosk
```

默认地址：`http://127.0.0.1:5175`。

其他 H5、小程序和移动端的启动方式见各自目录中的 `package.json` 及项目文档。

## 文档

- [通用 API 契约](docs/03-开发计划/08-数据接口测试与治理/api-contract.md)
- [Ami Aura Lite / Terminal API](docs/03-开发计划/08-数据接口测试与治理/terminal-api.md)
- [AGENTS 补充参考信息](docs/03-开发计划/09-Git发布与项目治理/AGENTS补充参考信息.md)

## Docker 前端演示

`Dockerfile.app` 用于构建管理端静态演示镜像：

```bash
docker build -f Dockerfile.app -t ami-core-admin .
docker run --rm -p 8080:8080 ami-core-admin
```

该镜像仅提供前端静态资源；真实业务仍需连接 Core API。
