# Mock 数据使用约定

管理端运行时 API 已统一走 `src/api/real/*` 和 `server-v2`，`VITE_API_MODE` 不再控制 mock/real 切换。

`src/api/mock` 只保留两类用途：

- 轻量字段夹具：`src/api/mock/fixtures.ts` 只保留少量客户、消费记录和健康档案样例，方便历史 mock 函数对照字段结构。
- 历史测试/离线样例：旧 mock 函数暂时保留，但不再维护本地大样本演示数据，新增业务不再要求同步实现一份 mock API。

新增接口时优先顺序：

1. 在 `packages/server-v2` 实现 schema、service、controller。
2. 在 `src/api/real/*` 实现前端 HTTP 调用。
3. 在 `src/api/*.ts` 门面直接导出 real 实现。
4. 只有单测或离线样例明确需要固定样例数据时，才补充轻量 fixture；不要再新增本地大样本 JSON。

这样本地演示依赖真实后端和种子数据，避免前端 mock 与真实接口长期双写、双测、双维护。
