# Mock 数据使用约定

管理端运行时 API 已统一走 `src/api/real/*` 和 `server-v2`，`VITE_API_MODE` 不再控制 mock/real 切换。

`src/api/mock` 只保留两类用途：

- 演示数据夹具：`src/api/mock/data/*.json` 仍被客户画像、活动创建页和 `server-v2` seed 脚本读取。
- 历史测试/离线样例：旧 mock 函数暂时保留，方便对照字段结构，但新增业务不再要求同步实现一份 mock API。

新增接口时优先顺序：

1. 在 `packages/server-v2` 实现 schema、service、controller。
2. 在 `src/api/real/*` 实现前端 HTTP 调用。
3. 在 `src/api/*.ts` 门面直接导出 real 实现。
4. 只有演示页或 seed 明确需要固定样例数据时，才补充 `src/api/mock/data` 或轻量 fixture。

这样本地演示依赖真实后端和种子数据，避免前端 mock 与真实接口长期双写、双测、双维护。
