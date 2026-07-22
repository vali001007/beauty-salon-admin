# Agent 与核心模块版本决策记录

## 门店经营指标核心模块 v1

| 项目 | 决策 |
| --- | --- |
| 日期 | 2026-07-15 |
| 模块 | `store-metrics` |
| 版本 | v1 |
| 定位 | 门店经营指标的统一事实、计算、质量、快照和目标服务 |
| 主入口 | `GET /api/store-metrics/overview`、管理端 `/store-operations/metrics` |
| 替代对象 | 店长首页独立收入聚合；Ami Brain 独立经营目标读取 |
| 兼容边界 | `BrainStoreOperatingTarget` 保留表结构，仅作为旧数据迁移来源；新目标写入 `StoreMetricTarget` |
| 发布门禁 | Prisma 校验、migration 空库验证、后端/前端测试与构建、12 项人工复算、远端迁移单独授权 |
| 旧版处置 | 冻结旧目标写入口；旧历史关系只读推断，标记 `estimated`，不自动回填 |

### 指标定义治理

12 项指标 key 固定，定义版本从 v1 起递增。口径变化不得原地覆盖历史快照；必须提升定义版本并保留旧快照解释能力。Ami Brain、管理端和店长工作台只能通过统一服务读取，不得复制财务或 cohort 公式。
