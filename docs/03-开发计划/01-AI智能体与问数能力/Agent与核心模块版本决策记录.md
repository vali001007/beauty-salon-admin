# Agent 与核心模块版本决策记录

> 本文件是 Agent 与核心模块版本定位、主入口、兼容边界和退役状态的唯一决策记录。

## 2026-07-21：Ami Aura Lite 智能终端统一接入 Ami Brain

### 决策

- Ami Brain 是 Ami Aura Lite 智能终端唯一智能运行时。
- 终端自由问答、多轮追问、动作确认、动作拒绝和回答反馈统一走 `server-v2` Brain 接口。
- Agent V1、V2、V3、V4、V5 从智能终端退役，不再提供版本切换、运行时调用或失败降级。
- Ami Brain 请求失败时终端明确提示重试，不切换到历史 Agent 或旧 AI 问答。

### 主入口

- 客户端：`packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.ts`
- 终端适配：`packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalAgentAdapter.ts`
- 服务端：`packages/server-v2/src/brain/brain.controller.ts`

### 替代对象与状态

| 对象 | 智能终端状态 | 处置 |
| --- | --- | --- |
| Agent V1 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V2 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V3 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V4 | 已退役 | 删除终端入口和调用链，不再降级 |
| Agent V5 | 已退役 | 删除终端入口和调用链，不再降级 |
| Ami Brain | 主线 | 智能终端唯一智能运行时 |

### 兼容边界

- 管理后台历史 Agent 工作台不在本次改造范围内。
- `server-v2` 中 V1–V5 历史 API 暂时冻结保留，供终端之外的既有消费者迁移；不得重新接回智能终端。
- 历史终端会话数据不删除。智能终端只展示带 `runtime: ami_brain` 来源标识的新会话，旧会话继续保留在数据库。
- 收银、预约、核销、办卡、充值、服务记录等确定性业务流程继续调用统一业务 API，不经过历史 Agent。

### 发布门禁

- 终端页面不存在 V1–V5 切换入口或本地版本状态。
- 终端生产代码不存在 V1–V5 创建、追问、审批和旧 AI 兜底调用。
- Ami Brain 失败后只显示错误和重试提示，不产生第二条智能请求。
- 新终端会话写入 `runtime: ami_brain`，历史面板过滤无来源标识的旧记录。
- 终端定向测试、类型检查、无 mock 检查和独立构建全部通过后，才允许进入发布流程。

### 旧版后续处置

- 当前阶段：V1–V5 在智能终端侧已退役，在管理后台和服务端标记为冻结保留。
- 后续删除服务端历史模块前，必须完成消费者扫描、真实数据审计和独立删除方案，并重新获得删除及发布授权。

## 2026-07-22：Ami Brain 当前账号恢复模型驱动核心只读 Canary

### 决策

- 当前门店 6、当前操作账号 1 定向切换到模型驱动 Release #396：`ami-brain-core-readonly-20260722-user1-model`。
- 本次只恢复 10 项核心只读能力，不进行全量用户发布，也不启用采购、核销、营销执行等动作能力。
- 其他账号继续使用现有 rules 基线，避免在基础错题完成修复前扩大影响面。

### 核心能力

- `customer_facts`
- `finance_payment_breakdown`
- `front_desk_operations_overview`
- `inventory_operations_overview`
- `manager_staff_overview`
- `order_revenue_analysis`
- `product_sales_ranking`
- `project_service_ranking`
- `staff_performance_ranking`
- `store_operations_overview`

### 发布门禁与结果

- 评测证据发布：Release #395 `ami-brain-core-readonly-20260722-eval`。
- 评测运行：Eval Run #103，31/31 通过，失败 0，模型供应商不可用 0。
- 能力覆盖、安全边界、跨门店、权限、提示注入和时间范围门禁全部通过。
- 当前账号运行时解析结果：`mode=model`、`releaseId=396`、能力候选数 10；34 个语义版本引用成功加载为 56 条定义快照。

### 回滚边界

- Release #396 仅作用于用户 1 / 门店 6；发现假成功、错误时间范围、越权或模型不可用时，立即回滚到 Release #3 rules 基线。
- 本次 Canary 通过不代表 650 题或全量能力已经达到发布标准；全量切换必须重新完成当前错题集、同义改写、650 题和真实生产路径门禁。

## 2026-07-15：门店经营指标核心模块 v1

| 项目 | 决策 |
| --- | --- |
| 模块 | `store-metrics` v1 |
| 定位 | 门店经营指标的统一事实、计算、质量、快照和目标服务 |
| 主入口 | `GET /api/store-metrics/overview`、管理端 `/store-operations/metrics` |
| 替代对象 | 店长首页独立收入聚合；Ami Brain 独立经营目标读取 |
| 兼容边界 | `BrainStoreOperatingTarget` 仅保留为旧数据迁移来源；新目标写入 `StoreMetricTarget` |
| 发布门禁 | Prisma 校验、迁移空库验证、后端/前端测试与构建、12 项人工复算；远端迁移单独授权 |
| 旧版处置 | 冻结旧目标写入口；旧历史关系只读推断并标记 `estimated`，不自动回填 |
