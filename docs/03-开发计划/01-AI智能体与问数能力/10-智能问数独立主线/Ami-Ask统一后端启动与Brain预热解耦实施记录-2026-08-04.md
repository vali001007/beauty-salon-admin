# Ami Ask 统一后端启动与 Brain 预热解耦实施记录

- 日期：2026-08-04
- 分支：`codex/ami-ask-business-expansion-20260802`
- 范围：统一 `server-v2` 进程的启动就绪边界
- 产品边界：不改变 Ami Ask 37 视图 / 370 题冻结基线，不将 Ask 可用误报为 Ami Brain 可用

## 一、问题与产品影响

原统一后端在 `BrainActiveReleaseWarmupService.onApplicationBootstrap()` 中同步等待 Ami Brain Active Release Ontology 预热。共享开发库连接超时时，即使 Ami Ask 自身代码、数据库和模型链路正常，整个 Nest 进程也会退出。

这会把两个产品状态错误绑定：Brain 预热失败被放大为 Ask 不可用，并迫使 Ask 验收使用 `BRAIN_RELEASE_PILOT_MODE=true` 完全跳过 Brain 预热。该方式适合隔离测试，不适合表达“Ask 和 Brain 在同一后端独立就绪”。

## 二、实现

### 2.1 启动策略

新增：

```env
BRAIN_ACTIVE_RELEASE_WARMUP_STARTUP_MODE=blocking
```

- `blocking`：默认值，保持原有安全边界。Brain 预热失败会阻断统一后端就绪。
- `background`：预热在后台执行，不阻断 Ask 及其他不依赖 Brain Ontology 的模块启动。
- 其他值：启动直接报配置错误，不默默降级。

Ask 开发管理员启动脚本已显式使用 `background`；默认的普通后端启动行为保持不变。当前本地 `packages/server-v2/.env` 也已设置该非敏感开发配置，因此直接执行 `npm run dev` 也会使用后台预热；该本地配置不代表生产决策。

### 2.2 分层健康检查

- `GET /api/health/ready`：核心后端和数据库就绪。`background` 模式下 Brain 失败不阻断 200，但返回 `degradedComponents` 和完整预热状态。
- `GET /api/health/brain-ready`：Brain 独立就绪门禁。只有 Active Release Ontology 预热完成才返回 200，否则返回 503。

因此，运维、前端或路由层可以分别判定 Ask/核心后端和 Brain，不再用一个绿灯代表两者。

## 三、验收证据

### 3.1 自动验证

- Brain 预热与健康检查：2 suites / 17 tests 通过。
- Ask/只读内核：20 suites / 532 tests 通过。
- Ask 只读配置合同：5/5 通过。
- Ask API 验收合同：6/6 通过。
- `npm run ask-data:free-sql:typecheck` 通过。
- `npm run build` 通过。

### 3.2 真实进程

使用共享 Supabase 开发库、`background` 模式和开发管理员 Ask 连接启动最新 `dist`：

- Nest 进程正常启动并监听 8088。
- Brain 预热在 40.596 秒后因 `timeout exceeded when trying to connect` 失败。
- 失败前后 `GET /api/health/ready` 均返回 200，并显式返回 `brainActiveReleaseWarmup.state=warming/failed`、`brainActiveReleaseWarmupRequired=false` 和 degraded 标记。
- `GET /api/health/brain-ready` 在 warming 和 failed 状态均返回 503。
- 仅依赖本地 `.env` 、不在命令行显式传入启动模式的第二次进程也正常以 `background` 启动，`/api/health/ready` 返回 200。

这证明解耦目标成立：Brain 预热连接故障不再拖垮 Ask，同时 Brain 故障没有被隐藏。本次验收不证明 Brain 本身已就绪。

## 四、回滚和剩余边界

- 删除该环境变量或设为 `blocking`，即恢复原有强阻断模式。
- 无数据库 migration、无数据写入、无视图数量变化。
- 当前 `background` 失败状态需通过进程重启或后续独立恢复机制重试；本轮不把 Brain 恢复扩展为 Ask 范围。
- 生产是否使用 `background` 需要单独部署评审；开发 Ask 验收通过不代表生产 Brain 可降级运行已获批准。
