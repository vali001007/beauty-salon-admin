# Ami Aura Lite 经营关注卡片合并详细开发计划

版本：v1.0
日期：2026-06-07
适用范围：`packages/Ami-Aura-Lite-Kiosk` 店长经营驾驶舱
关联模块：Ami Aura Lite 智能终端、Ami_Core 终端角色看板、AI 经营建议

## 1. 背景与问题

当前店长经营驾驶舱中，“风险”和“建议”以两排卡片呈现：

- 第一排：高价值客户沉默、预约客户未到店、员工排班需要关注等风险事实。
- 第二排：生成沉默客户邀约、优先处理未到店预约、盯紧到店转化等建议动作。

从产品体验看，两排内容在业务含义上高度相关。用户实际决策路径是“看到风险 -> 理解原因 -> 立即知道下一步怎么做”，不需要先看一排风险，再去另一排寻找对应建议。

现有问题：

1. 信息重复：风险卡和建议卡表达的是同一批经营关注事项。
2. 对应关系不稳定：用户需要自行判断哪张建议卡对应哪张风险卡。
3. 首屏占用过高：两排卡片压缩了后续快捷操作和业务入口空间。
4. 数据结构易出错：后端返回结构化风险对象时，如果前端仍按字符串渲染，会触发 React 运行时错误。

## 2. 产品目标

将“风险”和“建议”合并为一组统一的“经营关注卡片”，每张卡片完成一个经营判断闭环：

```text
经营事项标题
风险等级
事实原因
建议动作
后续可选操作入口
```

目标效果：

- 店长一眼看到最重要的 3 个经营关注事项。
- 每个事项都包含明确的处理动作。
- 不再单独展示重复建议卡。
- 保留高/中/低风险标签，帮助用户排序处理优先级。
- 数据兼容旧字符串结构和新结构化对象，避免页面崩溃。

## 3. 设计原则

| 原则 | 说明 |
| --- | --- |
| 一事一卡 | 一个经营问题只占一张卡，不拆成“风险卡 + 建议卡”。 |
| 先事实后动作 | 卡片先讲业务事实，再给下一步建议。 |
| 风险优先 | 有风险对象时，以风险对象为主；建议只补充动作，不抢主标题。 |
| 兼容存量 | 继续兼容 `risks: string[]`、`highlights: string[]` 的旧数据。 |
| 结构化优先 | 新数据优先使用 `{ title, severity, reason, action }`。 |
| 可继续演进 | 后续可增加 CTA、负责人、截止时间、处理状态。 |

## 4. 目标信息架构

### 4.1 页面结构

```text
店长经营驾驶舱
  KPI 区
    客户总数 / 营业额 / 预约客户 / 到店客户 / 活跃客户
  经营关注区
    卡片 1：高价值客户沉默
    卡片 2：预约客户未到店
    卡片 3：员工排班需要关注
  快捷指令区
    经营 / 员工 / 客户增长 / 库存 / 预约 / 收银
```

### 4.2 单张卡片结构

```text
[图标] 高价值客户沉默                         [中]
马语嫣 累计消费 ￥192,825，已 49 天未到店，今日无预约。

建议动作
安排顾问今天优先联系马语嫣，用最近护理记录邀约复购或预约。
```

### 4.3 风险等级展示

| severity | 文案 | 样式方向 |
| --- | --- | --- |
| high | 高 | 红色系，表示需优先处理 |
| medium | 中 | 黄色系，表示需今日跟进 |
| low | 低 | 绿色系，表示保持关注 |

## 5. 数据契约设计

### 5.1 当前兼容结构

前端需继续兼容：

```ts
interface DashboardCardData {
  title: string;
  subtitle: string;
  summary: string;
  kpis: KpiItem[];
  risks: Array<string | DashboardInsightItem>;
  highlights: Array<string | DashboardInsightItem>;
}
```

新增结构化对象：

```ts
interface DashboardInsightItem {
  title: string;
  severity?: 'high' | 'medium' | 'low' | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
}
```

### 5.2 短期合并规则

短期不改后端接口，只在前端渲染层合并：

1. 如果 `risks` 有数据：
   - 每个 `risk` 渲染为一张经营关注卡。
   - `risk.title` 作为卡片标题。
   - `risk.severity` 作为风险标签。
   - `risk.reason` 作为事实说明。
   - `risk.action` 作为建议动作。
   - 同位置的 `highlights[index]` 只作为动作兜底，不单独渲染。
2. 如果 `risks` 为空但 `highlights` 有数据：
   - 将 `highlights` 作为“经营机会”卡片兜底展示。
3. 如果仍是字符串：
   - 字符串作为 `reason` 展示。
   - 标题使用“风险提示”或“Ami 建议”兜底。

### 5.3 中期推荐结构

后续建议后端直接输出统一字段：

```ts
interface ManagerAttentionItem {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  action: string;
  relatedType?: 'customer' | 'reservation' | 'staff' | 'inventory' | 'cashier';
  relatedId?: number | string;
  ownerRole?: 'manager' | 'reception' | 'beautician';
  dueHint?: string;
  status?: 'open' | 'processing' | 'done' | 'ignored';
}
```

推荐未来接口：

```ts
interface DashboardCardData {
  title: string;
  subtitle: string;
  summary: string;
  kpis: KpiItem[];
  attentionItems: ManagerAttentionItem[];
  risks?: Array<string | DashboardInsightItem>;
  highlights?: Array<string | DashboardInsightItem>;
}
```

## 6. 开发范围

### 6.1 本期范围

| 模块 | 文件 | 任务 |
| --- | --- | --- |
| 类型定义 | `packages/Ami-Aura-Lite-Kiosk/src/app/types.ts` | 增加 `DashboardInsightItem`，让 `risks/highlights` 支持结构化对象。 |
| 数据适配 | `packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts` | `normalizeManagerDashboard()` 保留结构化对象，不强制转字符串。 |
| UI 渲染 | `packages/Ami-Aura-Lite-Kiosk/src/app/components/RoleDashboards.tsx` | 合并风险与建议卡片，统一渲染为经营关注卡。 |
| 回归验证 | `packages/Ami-Aura-Lite-Kiosk` | 构建、单测、浏览器刷新验证。 |

### 6.2 本期不做

- 不改 `server-v2` 接口结构。
- 不删除 `highlights` 字段。
- 不增加卡片点击后的业务处理流。
- 不做复杂拖拽排序。
- 不做 AI 自动生成新卡片配置后台。

## 7. 详细开发任务

### 阶段 1：类型与兼容层

任务：

1. 新增 `DashboardInsightItem` 类型。
2. 将 `DashboardCardData.risks` 从 `string[]` 改为 `Array<string | DashboardInsightItem>`。
3. 将 `DashboardCardData.highlights` 从 `string[]` 改为 `Array<string | DashboardInsightItem>`。
4. 确认所有消费方都能处理字符串和对象两种输入。

验收：

- TypeScript 构建通过。
- 旧字符串数据不会崩溃。
- 新对象数据不会触发 React child 错误。

### 阶段 2：数据归一化

任务：

1. 修改 `normalizeManagerDashboard()`。
2. `risks` 使用 `asList<DashboardCardData["risks"][number]>()`。
3. `highlights` 使用 `asList<DashboardCardData["highlights"][number]>()`。
4. 保留后端返回对象的完整字段。

验收：

- 后端返回 `{ title, severity, reason, action }` 时，前端完整保留。
- 后端返回普通字符串时，前端仍正常展示。

### 阶段 3：UI 合并渲染

任务：

1. 增加 `isDashboardInsight()` type guard。
2. 增加 `getDashboardInsightContent()`，统一把字符串和对象转换为可渲染内容。
3. 增加风险等级文案映射：
   - `high -> 高`
   - `medium -> 中`
   - `low -> 低`
4. 增加风险等级样式映射。
5. 在 `ManagerDashboardCard` 中生成 `attentionItems`：
   - 优先使用 `risks`。
   - `risk.action` 优先作为建议动作。
   - `highlights[index]` 只作为动作兜底。
   - 没有 `risks` 时，`highlights` 兜底成为经营机会卡。
6. 删除第二排独立建议卡渲染。

验收：

- 店长驾驶舱只出现一组经营关注卡。
- 页面不再出现“生成沉默客户邀约 / 优先处理未到店预约 / 盯紧到店转化”独立建议标题。
- 每张风险卡内都有“建议动作”。
- 高/中/低标签仍展示。

### 阶段 4：视觉与交互打磨

任务：

1. 卡片维持 3 列布局，移动端降为 1 列。
2. 卡片标题单行截断，避免长标题撑开布局。
3. 风险标签固定在右上角。
4. 建议动作使用浅色内嵌区域，和事实说明形成层级。
5. 文案层级：
   - 标题：经营事项
   - 正文：事实原因
   - 内嵌区：建议动作

验收：

- 1280 宽度下 3 张卡片一排展示。
- 窄屏下卡片不重叠、不横向溢出。
- 文案不会被按钮或标签遮挡。

### 阶段 5：验证与回归

命令验证：

```bash
cd "packages/Ami-Aura-Lite-Kiosk"
npm run build
```

```bash
npx vitest run --config "packages/Ami-Aura-Lite-Kiosk/vite.config.ts" "packages/Ami-Aura-Lite-Kiosk/src/app/intent/ruleIntentParser.test.ts"
```

浏览器验证：

1. 打开 `http://127.0.0.1:5175/login`。
2. 确认无 `Unexpected Application Error`。
3. 确认店长经营驾驶舱正常渲染。
4. 确认经营关注区只出现一组卡片。
5. 确认每张卡包含风险事实和建议动作。
6. 确认控制台无新增 error。

## 8. 验收标准

### 8.1 产品验收

- 店长无需在两排卡片之间建立对应关系。
- 每张卡都能回答：
  - 发生了什么？
  - 严重程度如何？
  - 为什么要关注？
  - 下一步做什么？
- 首屏信息密度下降，阅读路径更清晰。

### 8.2 技术验收

- `npm run build` 通过。
- 单测通过。
- 结构化风险对象不会导致 React 渲染错误。
- 字符串旧数据仍可展示。
- `highlights` 不再重复渲染为第二排建议卡。

### 8.3 演示验收

示例页面应展示：

```text
高价值客户沉默 [中]
马语嫣 累计消费 ￥192,825，已 49 天未到店，今日无预约。
建议动作：安排顾问今天优先联系马语嫣，用最近护理记录邀约复购或预约。

预约客户未到店 [中]
今日预约 5 位，已到店 4 位，仍有 1 位未到店。
建议动作：前台按预约时间排序电话确认，迟到客户标记状态，避免美容师空等。

员工排班需要关注 [低]
沈晴 今日有 1 个排班时段，忙碌时段 1 个。
建议动作：检查沈晴的预约分配，避免高峰期接待压力集中。
```

## 9. 排期建议

| 阶段 | 工作内容 | 优先级 | 预计耗时 |
| --- | --- | --- | --- |
| 1 | 类型与兼容层 | P0 | 0.5 天 |
| 2 | 数据归一化 | P0 | 0.5 天 |
| 3 | UI 合并渲染 | P0 | 0.5-1 天 |
| 4 | 视觉与响应式打磨 | P1 | 0.5 天 |
| 5 | 验证与回归 | P0 | 0.5 天 |

总计：2-3 天。
如果只完成当前原型演示版本，P0 可压缩到 0.5-1 天。

## 10. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 后端仍返回旧字符串 | 卡片信息不完整 | 前端保留字符串兜底标题和正文。 |
| `risks` 与 `highlights` 顺序不一致 | 错误合并建议动作 | 短期优先使用 `risk.action`，中期改为后端输出 `attentionItems`。 |
| 建议动作过长 | 卡片高度过高 | 限制后端文案长度，前端保留换行但控制层级。 |
| 结构化字段缺失 | 页面空白或显示异常 | `getDashboardInsightContent()` 做空值兜底。 |
| 未来需要点击处理 | 当前卡片无行动入口 | 在 `relatedType/relatedId` 基础上增加 CTA。 |

## 11. 后续演进

### 11.1 增加 CTA

每张经营关注卡后续可增加按钮：

- 生成邀约话术
- 分配前台跟进
- 查看客户档案
- 查看预约列表
- 查看美容师排班

### 11.2 增加处理状态

支持状态：

- 待处理
- 已分配
- 已跟进
- 已关闭

### 11.3 后端统一 attentionItems

当店长驾驶舱稳定后，建议由 `server-v2` 直接输出统一 `attentionItems`，前端不再按 `risks/highlights` 位置合并。

### 11.4 接入自动化草稿

高价值客户沉默、未到店预约等事项可一键生成自动化草稿：

- 沉默客户邀约策略
- 未到店提醒策略
- 服务完成未收银提醒
- 库存低水位提醒

## 12. 当前落地状态

截至 2026-06-07，本地原型包已完成 P0 合并验证：

- 已支持结构化风险对象。
- 已合并风险与建议为单组经营关注卡。
- 已移除独立建议卡重复展示。
- `npm run build` 已通过。
- `ruleIntentParser.test.ts` 已通过。
- in-app Browser 刷新验证无运行时错误。
