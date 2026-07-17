# Ami_Core Admin

Ami_Core 美业管理平台前端。当前阶段以 MVP 联调准备为主，默认使用 `server-v2 + PostgreSQL + real API`，mock 仅作为显式开启的 UI 演示/单测兜底。

## 本地启动

```bash
npm install
npm run dev:full
```

管理端地址：`http://localhost:5173`，API 默认代理到 `http://127.0.0.1:8080/api`。

`npm run dev` 和 `npm run dev:full` 都会先确认本地 API 可用；如果 API 未启动，会自动拉起 `server-v2`，再启动管理端前端。前端运行期间也会持续检查 API 健康状态，后端掉线时自动重启，避免登录或页面刷新时才出现 Vite `ECONNREFUSED` 代理错误。

智能终端本地联调使用：

```bash
npm run dev:kiosk

# 或在终端包内启动
npm --prefix packages/Ami-Aura-Lite-Kiosk run dev:full
```

智能终端地址：`http://127.0.0.1:5175`。终端包内直接运行 `npm --prefix packages/Ami-Aura-Lite-Kiosk run dev` 时也会自动托管后端，避免页面运行后持续输出 `/api/* ECONNREFUSED`。

## 默认账号

- 用户名：`admin`
- 密码：`11111111`
- 角色：超级管理员，拥有全部权限

## 环境变量

`.env` 默认配置应保持 real：

```bash
VITE_API_MODE=real
VITE_API_BASE_URL=/api
```

显式 mock 演示可复制 `.env.mock.example`：

```bash
VITE_API_MODE=mock
VITE_API_BASE_URL=/api
```

本地 real 联调默认使用主线后端 `packages/server-v2`，根项目已提供一键命令：

```bash
npm run dev:full

# 或拆开启动
npm run dev:api
npm run dev:web
```

Vite 开发服务器会把 `/api` 代理到 `VITE_API_PROXY_TARGET`，未配置时为 `http://127.0.0.1:8080`。

如果登录页出现 `/api/auth/login` 代理拒绝连接，先执行：

```bash
npm run dev:doctor
```

本地完整联调优先使用：

```bash
npm run dev:full
```

- `real`：默认模式，走 `src/api/real/*`，请求会基于 `VITE_API_BASE_URL`，默认回退 `/api`
- `mock`：只在 `VITE_API_MODE=mock` 时启用，走 `src/api/mock/*`，适合 UI 演示、离线兜底和单元测试
- 真实请求自动附带 `Authorization: Bearer <token>` 和 `X-Store-Id`
- 新业务逻辑优先落在 `packages/server-v2`；mock 只补返回结构样例，不承载库存扣减、支付退款、营销归因等真实闭环规则

## 常用命令

```bash
npm run dev:full
npm run dev:kiosk
npm run dev:doctor
npm run dev:api
npm run dev:web
npm run build
npm run test
npm run test:coverage
npm run lint
npm run format
npm run db:migrate:v2
npm run db:generate:v2
npm run db:seed:promotion-assets:verify
npm run db:studio:v2
```

## 当前状态

- 自动营销触发规则已切到 API 驱动，支持默认参数、命中预估、策略启停和执行记录
- Ami Aura Lite / Terminal API 已补齐，覆盖设备登录、门店绑定、客户识别、服务任务、次卡核销、肌肤检测和推荐闭环
- build、test 已可通过；lint 当前仅剩少量 warnings
- 根目录不再提供 demo seed 入口；发布验收以真实迁移、构建测试和 `db:seed:promotion-assets:verify` 为准

## API 契约

- [通用接口契约](docs/api-contract.md)
- [自动营销触发规则需求](docs/marketing-trigger-rules-requirements.md)
- [Ami Aura Lite / Terminal API](docs/terminal-api.md)

统一约定：

- 分页响应以 `items` 为主字段，同时保留 `data` 兼容旧页面
- 错误响应统一为 `{ message, code?, status?, details? }`

## Docker 演示

仓库内的 `Dockerfile.app` 会构建前端静态产物，并通过 `serve` 在 8080 端口提供服务：

```bash
docker build -f Dockerfile.app -t ami-core-admin .
docker run --rm -p 8080:8080 ami-core-admin
```

访问地址：`http://localhost:8080`

## Core API 与 AI Gateway

主业务 API 和 AI Gateway 统一由 `packages/server-v2` 承接。根项目启动后端统一使用：

```bash
npm run dev:api
```

或进入后端目录直接启动：

```bash
cd packages/server-v2
npm install
npm run dev
```

默认地址：

```bash
http://localhost:8080/api
```

前端 real 模式建议配置：

```bash
VITE_API_MODE=real
VITE_API_BASE_URL=http://localhost:8080/api
```

AI Gateway 环境变量：

```bash
PORT=8080
REQUEST_BODY_LIMIT=12mb
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
LLM_BASE_URL=https://api.deepseek.com
LLM_CHAT_PATH=/chat/completions
LLM_API_KEY=your-server-side-key
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=512
LLM_TIMEOUT_MS=30000
LLM_DAILY_BUDGET=0
FACEPP_API_KEY=your-faceplusplus-api-key
FACEPP_API_SECRET=your-faceplusplus-api-secret
FACEPP_SKIN_ANALYZE_URL=https://api-cn.faceplusplus.com/facepp/v1/skinanalyze
FACEPP_SKIN_ANALYZE_TIMEOUT_MS=30000
FACEPP_SKIN_ANALYZE_FALLBACK=true
```

已落地的 AI API：

- `POST /api/ai/chat/messages`
- `POST /api/ai/generate/customer-invitation-script`
- `POST /api/ai/generate/marketing-copy`
- `POST /api/ai/generate/campaign-variants`
- `POST /api/ai/generate/customer-summary`
- `POST /api/ai/generate/service-note-summary`
- `POST /api/ai/generate/skin-test-explanation`
- `POST /api/ai/analyze/skin-photo`
- `POST /api/ai/generate/terminal-service-advice`
- `POST /api/ai/recommend/next-best-action`
- `GET /api/ai/audit-logs/paginated`

AI 肤质检测说明：
- 管理端 `/customers/data` 的 `AI肤质检测` 只调用 Core 后端 `/api/ai/analyze/skin-photo`。
- Core 后端配置 `FACEPP_API_KEY` 与 `FACEPP_API_SECRET` 后，会调用 Face++ 皮肤分析-高阶版。
- 未配置 Key 或 Face++ 临时不可用时，`FACEPP_SKIN_ANALYZE_FALLBACK=true` 会返回演示级兜底结果；生产环境可改为 `false` 让接口直接报错。

约束：

- 管理端和 Ami Aura Lite 不保存大模型 Key，只调用 Core API。
- `LLM_PROVIDER=mock` 时返回稳定模拟结果，适合本地演示；正式环境建议配置 DeepSeek 或 OpenAI-compatible provider。
- 旧 `/v1/messages` 兼容入口已移除；新业务继续使用 Agent Gateway 或 `/api/ai/*`。
