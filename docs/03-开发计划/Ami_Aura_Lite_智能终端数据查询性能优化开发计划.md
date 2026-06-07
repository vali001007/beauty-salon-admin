# Ami Aura Lite 智能终端数据查询性能优化开发计划

版本：v1.0  
日期：2026-06-07  
适用范围：`packages/Ami-Aura-Lite-Kiosk`、`src/api/real/terminal.ts`、`packages/server-v2/src/terminal`  
问题来源：智能终端所有数据查询入口体感偏慢，不仅限于员工排班。

## 1. 背景

当前 Ami Aura Lite 智能终端在点击“经营、员工、客户增长、库存、预约、收银”等入口时，用户经常看到“正在拉取最新门店数据”的等待状态。实际体验表现为：

- 每次点击像是重新请求全量门店数据。
- 已经看过的数据再次进入仍要等待。
- 后端慢或不可用时，主内容区容易停留在 loading。
- 用户无法判断是“首次加载慢”“后台刷新中”还是“接口失败”。

从代码现状看，多个业务入口仍依赖 `loadCoreSnapshot()` 或聚合查询兜底。该模式适合演示和兜底，但不适合终端高频操作。

## 2. 优化目标

### 2.1 产品目标

让智能终端从“每次点击都等待拉数”升级为“常用入口秒开、后台刷新、关键操作后精准更新”。

目标体验：

- 用户点击高频入口时优先看到已有数据。
- 后台刷新不打断当前阅读和操作。
- 只有首次加载或无缓存时才展示骨架/加载。
- 操作成功后只刷新受影响的数据，不全量重拉。
- 页面明确展示数据更新时间和刷新状态。

### 2.2 技术目标

- 减少全量 snapshot 调用次数。
- 建立业务级缓存 TTL。
- 建立启动预取机制。
- 建立 stale-while-revalidate 数据策略。
- 建立专用轻量终端接口。
- 建立接口耗时埋点和慢查询定位机制。

## 3. 当前问题拆解

| 问题 | 表现 | 影响 |
| --- | --- | --- |
| 全量 snapshot 依赖过多 | 多个入口拉客户、预约、库存、卡项、订单、美容师等一批数据 | 单次点击耗时高，接口失败面大 |
| 缓存 TTL 偏短 | `roleDashboard` 约 15 秒，`coreSnapshot` 约 60 秒 | 用户频繁切换入口仍反复查询 |
| loading 阻断主内容 | 查询时主内容被“正在拉取最新门店数据”替代 | 体感更慢，用户无法继续查看旧数据 |
| 预取不足 | 进入终端后未充分预热高频入口 | 首次点击每个入口都要等 |
| 失效粒度粗 | 写操作后常清全局缓存 | 一个小操作导致多模块重查 |
| 缺少耗时观测 | 不清楚慢在前端、代理、后端、数据库还是 AI | 后续优化缺乏依据 |

## 4. 总体方案

采用四层优化：

1. **前端体感优化**：有缓存先展示，后台刷新，减少阻断式 loading。
2. **业务级缓存优化**：按数据变化频率设置 TTL，并支持精准失效。
3. **接口结构优化**：从全量 snapshot 改为专用轻量上下文接口。
4. **性能观测优化**：记录入口耗时、接口耗时、缓存命中率和错误率。

## 5. 目标架构

```text
用户点击入口
  -> terminalQueryClient 查询缓存
    -> 命中 fresh cache：直接展示
    -> 命中 stale cache：先展示旧数据 + 后台刷新
    -> 无 cache：展示骨架 + 请求轻量接口
  -> 请求成功
    -> 更新缓存
    -> 更新 UI
  -> 请求失败
    -> 若有旧数据：保留旧数据 + 显示刷新失败
    -> 若无旧数据：展示业务化错误和重试
```

## 6. 缓存策略

### 6.1 建议 TTL

| 数据类型 | 建议 TTL | 失效条件 |
| --- | --- | --- |
| bootstrap / 当前用户 / 门店 | 5 分钟 | 切换门店、重新登录 |
| 店长经营看板 | 60 秒 | 收银、核销、预约状态变化 |
| 今日预约 | 30 秒 | 新增/改期/取消/到店/完成 |
| 员工排班 | 5-10 分钟 | 保存排班、切换门店、跨周 |
| 客户增长/流失候选 | 3-5 分钟 | 客户建档、预约、消费、回访记录 |
| 库存预警 | 2-5 分钟 | 入库、出库、消耗、调拨 |
| 收银目录/项目/商品/卡项 | 10-30 分钟 | 商品、项目、卡项配置变更 |
| 客户搜索 | 1-3 分钟 | 同关键词查询命中缓存，客户资料更新后失效 |
| 自动化今日摘要 | 1-3 分钟 | 策略启停、手动运行、触达状态更新 |

### 6.2 缓存 Key 设计

```ts
type TerminalQueryKey =
  | ['bootstrap', storeId]
  | ['manager-dashboard', storeId]
  | ['today-reservations', storeId, date]
  | ['staff-schedules', storeId, weekStart]
  | ['customer-growth', storeId]
  | ['inventory-alerts', storeId]
  | ['cashier-context', storeId]
  | ['card-verification-context', storeId, keyword]
  | ['customer-search', storeId, keyword];
```

### 6.3 缓存状态

```ts
interface TerminalQueryState<T> {
  data?: T;
  status: 'idle' | 'loading' | 'success' | 'error';
  refreshStatus: 'idle' | 'refreshing' | 'failed';
  error?: string;
  updatedAt?: number;
  isStale: boolean;
}
```

## 7. 前端开发计划

### 阶段 1：查询体验改造 P0

目标：马上改善“所有查询都很忙”的体感。

涉及文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- 新增：`packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalQueryClient.ts`

任务：

1. 新增轻量 `terminalQueryClient`
   - 支持内存缓存。
   - 支持 TTL。
   - 支持 stale-while-revalidate。
   - 支持按 key 失效。
2. 修改微应用入口加载逻辑
   - 有缓存时立即返回缓存消息。
   - 后台刷新成功后替换最新卡片。
   - 后台刷新失败时保留旧卡片并提示“刷新失败，已显示上次数据”。
3. 修改 loading UI
   - 首次无缓存：显示骨架或 loading。
   - 有缓存刷新：不插入大块 loading 卡，改为卡片角标“更新中”。
4. 增加数据更新时间展示
   - 如“已更新 15:39”。
   - stale 数据显示“正在刷新”或“上次更新 2 分钟前”。

验收：

- 连续点击“经营/员工/库存/预约”不会每次都出现阻断式 loading。
- 缓存命中时页面 300ms 内展示内容。
- 后台刷新失败不清空已展示内容。

### 阶段 2：启动预取 P0

目标：打开终端后预热高频入口。

涉及文件：

- `packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts`
- `packages/Ami-Aura-Lite-Kiosk/src/app/services/terminalQueryClient.ts`

任务：

1. 终端启动成功后预取：
   - bootstrap
   - manager dashboard
   - today reservations
   - staff schedules
   - inventory alerts
   - cashier context/catalog
2. 预取采用低优先级并发
   - 首屏看板优先。
   - 其余入口后台预取，不阻塞首屏。
3. 切换门店时重置相关缓存并重新预取。

验收：

- 打开终端后 3-5 秒内，高频入口大部分已有缓存。
- 用户首次点击员工/库存/预约时优先展示预取结果。

### 阶段 3：操作后精准失效 P0/P1

目标：避免一个操作导致所有数据重拉。

任务：

| 操作 | 失效缓存 |
| --- | --- |
| 新增/改期/取消预约 | 今日预约、店长经营看板、员工排班 |
| 到店/完成预约 | 今日预约、店长经营看板 |
| 收银成功 | 店长经营看板、客户增长、收银相关客户缓存 |
| 次卡核销 | 店长经营看板、客户卡项、客户增长 |
| 新客户建档 | 客户搜索、客户增长、店长经营看板 |
| 保存排班 | 员工排班、店长经营看板 |
| 库存入库/出库/消耗 | 库存预警、店长经营看板 |

验收：

- 写操作成功后只刷新相关卡片。
- 无关入口缓存不被清空。

## 8. 后端开发计划

### 阶段 4：轻量接口 P1

目标：减少前端依赖全量 snapshot。

建议新增/收敛接口：

| 接口 | 用途 | 返回范围 |
| --- | --- | --- |
| `GET /terminal/dashboard/manager` | 店长经营看板 | KPI + attentionItems |
| `GET /terminal/dashboard/staff-schedules` | 员工排班摘要 | 美容师 + 本周排班 + 今日占用 |
| `GET /terminal/dashboard/today-reservations` | 今日预约 | 今日预约列表 + 状态统计 |
| `GET /terminal/dashboard/customer-growth` | 客户增长/流失 | Top N 客户候选 + 原因 |
| `GET /terminal/dashboard/inventory-alerts` | 库存预警 | 低库存 + 临期 + 补货建议 |
| `GET /terminal/context/cashier` | 收银上下文 | 客户候选 + 项目/商品目录 |
| `GET /terminal/context/card-verification` | 核销上下文 | 客户候选 + 可用卡项 |

要求：

- 每个接口只返回当前卡片需要的数据。
- 默认限制 Top N，例如客户候选 10 个、预约 20 条、库存预警 20 条。
- 避免返回大对象全文，例如客户健康档案、订单明细、图片、长文本。
- 需要详情时再二次查询详情接口。

验收：

- 高频入口不再调用 `loadCoreSnapshot()`。
- 单接口响应体明显小于全量 snapshot。
- 本地接口 P95 目标小于 800ms。

### 阶段 5：服务端缓存 P1

目标：减少数据库重复聚合。

任务：

1. 为终端看板类接口增加短 TTL 服务端缓存。
2. 缓存维度：storeId + date/weekStart + role。
3. 写操作后主动失效相关缓存。
4. 对慢聚合增加数据库索引或查询优化。

建议服务端 TTL：

- manager dashboard：30 秒
- staff schedules：5 分钟
- today reservations：30 秒
- inventory alerts：2 分钟
- cashier catalog：10 分钟

验收：

- 同门店重复点击接口耗时明显下降。
- 写操作后数据不会长期陈旧。

## 9. 性能观测计划

### 9.1 前端埋点

新增查询指标：

```ts
interface TerminalQueryMetric {
  key: string;
  source: 'cache-fresh' | 'cache-stale' | 'network' | 'prefetch';
  durationMs: number;
  success: boolean;
  errorCode?: string;
  dataSize?: number;
  updatedAt: number;
}
```

记录位置：

- 每次微应用入口查询。
- 每次预取。
- 每次后台刷新。
- 每次查询失败。

### 9.2 后端指标

建议记录：

- endpoint
- storeId
- durationMs
- dbQueryCount
- responseSize
- cacheHit
- errorCode

### 9.3 慢查询判定

| 等级 | 前端体感 | 判定 |
| --- | --- | --- |
| 正常 | 0-500ms | 无需提示 |
| 可接受 | 500-1200ms | 保持骨架或小 loading |
| 慢 | 1200-3000ms | 显示“正在更新数据” |
| 过慢 | 3000ms+ | 显示“数据较多，正在后台刷新”并允许继续操作 |

## 10. UI 改造规范

### 10.1 Loading 分层

| 场景 | UI |
| --- | --- |
| 首次无缓存 | 骨架屏 |
| 有旧数据后台刷新 | 卡片角标“更新中” |
| 刷新成功 | 更新“已更新 HH:mm” |
| 刷新失败且有旧数据 | 保留旧数据 + 小提示“刷新失败，显示上次数据” |
| 刷新失败且无旧数据 | 错误卡 + 重试按钮 |

### 10.2 禁止事项

- 不要在有旧数据时用整块 loading 覆盖内容。
- 不要所有入口都显示“正在拉取最新门店数据”。
- 不要把接口失败表现为空白页。
- 不要让 AI 建议阻塞业务卡片展示。

## 11. 分期排期

| 阶段 | 内容 | 优先级 | 预计耗时 |
| --- | --- | --- | --- |
| 1 | 前端查询缓存与 stale-while-revalidate | P0 | 1-2 天 |
| 2 | 启动预取与 loading 体验改造 | P0 | 1 天 |
| 3 | 操作后精准失效 | P0/P1 | 1-2 天 |
| 4 | 后端轻量接口 | P1 | 3-5 天 |
| 5 | 服务端缓存与查询优化 | P1 | 2-3 天 |
| 6 | 性能埋点与慢查询面板 | P2 | 2-3 天 |

P0 合计：3-5 天。  
P0 + P1 合计：8-13 天。  
完整版本含 P2：10-16 天。

## 12. 验收标准

### 12.1 体感验收

- 已打开终端后，切换常用入口不再频繁出现整块 loading。
- 缓存命中时 300ms 内展示卡片。
- 后台刷新时用户仍能查看旧数据。
- 后端暂时不可用时，页面保留上次数据。

### 12.2 性能验收

| 指标 | 目标 |
| --- | --- |
| 高频入口缓存命中展示 | < 300ms |
| 高频入口网络刷新 P75 | < 800ms |
| 高频入口网络刷新 P95 | < 1500ms |
| 首屏可用 | < 2s |
| 预取完成 | < 5s |
| 全量 snapshot 调用次数 | 高频入口 0 次 |

### 12.3 技术验收

- `npm run build` 通过。
- 相关 Vitest 用例通过。
- Browser 验证无运行时错误。
- 控制台无新增 error。
- 切换门店缓存正确隔离。
- 写操作后相关数据正确刷新。

## 13. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 缓存导致数据陈旧 | 用户看到旧预约/库存 | 显示更新时间；写操作后精准失效；关键交易不读陈旧缓存。 |
| 预取增加后端压力 | 首次进入瞬时请求变多 | 控制并发，分优先级预取，失败静默降级。 |
| 轻量接口重复建设 | 与现有 role dashboard 重叠 | 先复用现有接口，逐步收敛到统一 dashboard/context 命名。 |
| 离线/后端不可用 | 数据无法更新 | 保留上次可用缓存，提示刷新失败。 |
| 门店切换缓存污染 | A 门店数据显示到 B 门店 | cache key 必须包含 storeId。 |

## 14. 当前建议的第一步落地

第一步建议直接做 P0：

1. 新建 `terminalQueryClient.ts`。
2. 改造 `runMicroAppIntent()` 相关查询，支持缓存优先展示。
3. 将员工排班、经营看板、今日预约、库存预警接入缓存。
4. App 启动后后台预取这四类数据。
5. 把“正在拉取最新门店数据”的大 loading 改为仅首次无缓存时展示。

这一步不需要等后端改接口，能最快改善用户看到的“所有查询都很忙”的问题。

