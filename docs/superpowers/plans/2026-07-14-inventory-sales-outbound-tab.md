# “销售出库”页签实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/inventory/consumption` 增加按需加载真实 `sale_out` 库存流水的“销售出库”页签。

**Architecture:** `ServiceConsumption` 只负责页签切换；新增 `SalesOutboundTab` 封装请求、缓存、筛选、汇总和表格展示。组件始终挂载，通过 `active` 控制首次请求，保证切换页签不重复加载。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、现有库存 Real API 和 UI 表格组件。

---

### Task 1：先建立销售出库组件测试

**Files:**

- Create: `src/app/pages/SalesOutboundTab.test.tsx`
- Create: `src/app/pages/SalesOutboundTab.tsx`

- [ ] 编写失败测试，mock `getStockMovements`，覆盖 inactive 不请求、首次 active 请求 `sale_out`、重复切换只请求一次。
- [ ] 增加真实字段展示测试：负数量按正数展示，缺失单号、库存和操作人显示 `--`。
- [ ] 增加日期、商品关键词和由真实 `storeName` 生成的门店筛选测试。
- [ ] 增加请求失败时页签内错误提示测试。
- [ ] 运行 `npx.cmd vitest run src/app/pages/SalesOutboundTab.test.tsx`，确认因组件尚未存在而失败。

### Task 2：实现独立销售出库组件

**Files:**

- Create: `src/app/pages/SalesOutboundTab.tsx`

- [ ] 接收 `{ active: boolean }`，使用 `useRef` 记录是否已经发起请求。
- [ ] 首次 active 时调用 `getStockMovements({ movementType: 'sale_out', page: 1, pageSize: 100 })`。
- [ ] 保存加载、失败和流水状态；失败时同时展示 toast 与页签内错误信息。
- [ ] 使用受控日期、关键词和门店筛选；门店选项从返回流水去重生成。
- [ ] 汇总当前筛选结果的记录数和 `Math.abs(quantity)` 数量合计。
- [ ] 渲染出库时间、销售单号、商品、SKU、出库数量、前后库存、门店、操作人和备注。
- [ ] 运行销售出库组件测试并确认通过。

### Task 3：接入服务消耗页面页签

**Files:**

- Modify: `src/app/pages/ServiceConsumption.tsx`
- Create: `src/app/pages/ServiceConsumption.test.tsx`

- [ ] 编写失败测试，mock BOM、行业模板、商品和销售出库组件，验证四个页签的 DOM 顺序。
- [ ] 扩展 `activeTab` 为 `bom | sales-outbound | consumption | forecast`。
- [ ] 在“项目耗材消耗”左侧增加“销售出库”按钮。
- [ ] 始终挂载 `SalesOutboundTab`，传入 `active={activeTab === 'sales-outbound'}`，非当前页签用 `hidden` 隐藏。
- [ ] 运行两个页面定向测试并确认通过。

### Task 4：验证和文档收口

**Files:**

- Modify: `docs/superpowers/plans/2026-07-14-inventory-sales-outbound-tab.md`

- [ ] 运行：

```powershell
npx.cmd vitest run src/app/pages/SalesOutboundTab.test.tsx src/app/pages/ServiceConsumption.test.tsx
npm.cmd run build
npm.cmd run check:api
git diff --check -- src/app/pages/ServiceConsumption.tsx src/app/pages/SalesOutboundTab.tsx src/app/pages/SalesOutboundTab.test.tsx src/app/pages/ServiceConsumption.test.tsx docs/superpowers
```

- [ ] 记录测试、构建和未验证项，不执行 commit、push 或 PR。

## 实施结果（2026-07-14）

- 已新增“销售出库”页签，顺序为“BOM管理 / 销售出库 / 项目耗材消耗 / 库存预估”。
- 已接入真实 `StockMovement.sale_out`，首次激活请求、后续切换不重复加载，并兼容 React StrictMode effect 重放。
- 已提供日期、商品关键词和真实门店筛选，以及记录数和出库数量汇总。
- 已展示销售单号、商品、SKU、出库数量、出库前后库存、门店、操作人和备注；缺失值统一显示 `--`。
- 真实数据库只读核验：当前共有 51 条 `sale_out` 流水，最新流水包含销售单号、负出库数量和出库前后库存。
- 定向测试 4/4、管理端 build、`check:api` 均通过。
- 未执行 commit、push 或 PR。
