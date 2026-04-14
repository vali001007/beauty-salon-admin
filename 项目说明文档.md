# 美业管理平台 — 项目说明文档

## 一、项目概述

本项目是一个面向美容院/美业连锁门店的综合管理平台前端应用，原始设计稿来源于 Figma（由 Figma Make 导出为代码）。系统涵盖客户管理、门店运营、商品与库存、订单处理、智能营销等核心业务模块，旨在为美业经营者提供一站式数字化管理工具。

- 项目名称：beauty salon
- Figma 设计稿：https://www.figma.com/design/Y3Ytwv6emMVMADyekScXVG/beauty-salon
- 当前状态：前端 UI 原型阶段（使用 Mock 数据，无后端对接）

---

## 二、技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18.3 + TypeScript |
| 构建工具 | Vite 6.3 |
| 路由 | React Router 7 |
| 样式 | Tailwind CSS 4 + CSS 变量主题系统 |
| UI 组件库 | shadcn/ui（Radix UI 原语）+ MUI（部分图标） |
| 图表 | Recharts |
| 富文本编辑器 | TipTap |
| 动画 | Motion (Framer Motion) |
| 拖拽 | react-dnd |
| 日期处理 | date-fns + react-day-picker |
| 轮播 | Embla Carousel / react-slick |
| 表单 | react-hook-form |
| 通知 | Sonner |
| 抽屉 | Vaul |

---

## 三、项目结构

```
beauty salon/
├── index.html                    # HTML 入口
├── package.json                  # 依赖与脚本
├── vite.config.ts                # Vite 配置（含 @ 别名指向 src）
├── postcss.config.mjs            # PostCSS 配置（空，Tailwind v4 自动处理）
├── README.md                     # 项目简介
├── ATTRIBUTIONS.md               # 开源许可声明（shadcn/ui MIT、Unsplash 图片）
├── guidelines/
│   └── Guidelines.md             # 设计规范（当前为空）
└── src/
    ├── main.tsx                  # 应用入口，挂载 React 根节点
    ├── styles/
    │   ├── index.css             # 样式总入口
    │   ├── tailwind.css          # Tailwind 配置
    │   ├── theme.css             # 主题变量（亮色/暗色）
    │   ├── fonts.css             # 字体（当前为空）
    │   └── tiptap.css            # TipTap 编辑器样式
    ├── imports/
    │   └── figma-make-inventory.md  # 库存管理模块 Figma 设计规格文档
    └── app/
        ├── App.tsx               # 根组件，提供 RouterProvider
        ├── routes.tsx            # 路由配置（所有页面路由定义）
        ├── components/
        │   ├── Layout.tsx        # 全局布局（侧边栏 + 顶部栏 + 内容区）
        │   ├── UI.tsx            # 通用 UI 组件（Input、Button、Table 系列）
        │   ├── AddProjectDialog.tsx  # 添加项目弹窗
        │   ├── figma/
        │   │   └── ImageWithFallback.tsx  # 图片加载失败兜底组件
        │   └── ui/               # shadcn/ui 组件集（40+ 组件）
        └── pages/                # 业务页面（25 个）
```

---

## 四、功能模块详解

### 4.1 仪表盘（Dashboard）
- 路由：`/dashboard`
- 数据概览面板，展示核心经营指标

### 4.2 客户管理
| 页面 | 路由 | 说明 |
|------|------|------|
| 客户数据 | `/customers/data` | 客户列表、筛选、搜索 |
| 客户画像 | `/customers/profile` | 单客户详情与消费画像 |
| 智能邀约 | `/customers/script` | AI 生成邀约话术，含对话式交互 |

### 4.3 智能营销
| 页面 | 路由 | 说明 |
|------|------|------|
| 活动管理 | `/customer-marketing/activity-management` | 营销活动列表、创建、状态管理 |
| 活动效果 | `/customer-marketing/activity-effect/:id` | 单个活动的效果分析 |
| 智能推荐 | `/customer-marketing/intelligent-recommendation` | AI 营销策略推荐 |
| 策略模板 | `/customer-marketing/strategy-templates` | 营销方案模板库 |
| 效果分析 | `/customer-marketing/effect-analysis` | 营销整体效果数据分析 |

### 4.4 门店管理
| 页面 | 路由 | 说明 |
|------|------|------|
| 项目类型管理 | `/stores/project-types` | 服务项目分类管理 |
| 项目管理 | `/stores/projects` | 服务项目 CRUD |
| 美容师管理 | `/stores/beauticians` | 美容师信息管理 |
| 美容师等级设置 | `/stores/beautician-levels` | 美容师等级体系配置 |
| 排班管理 | `/stores/scheduling` | 美容师排班日历 |

### 4.5 商品管理
| 页面 | 路由 | 说明 |
|------|------|------|
| 商品类型 | `/goods/types` | 商品分类（占位页，待开发） |
| 商品管理 | `/goods/products` | 商品列表与管理 |
| 次卡管理 | `/goods/cards` | 次卡套餐管理 |

### 4.6 订单管理
| 页面 | 路由 | 说明 |
|------|------|------|
| 商品订单管理 | `/orders/products` | 商品订单（占位页，待开发） |
| 门店项目预约 | `/orders/reservations` | 服务预约管理 |
| 次卡开卡管理 | `/orders/card-orders` | 次卡购买订单 |
| 次卡核销管理 | `/orders/card-usage` | 次卡使用核销记录 |

### 4.7 库存管理（核心模块，有详细设计规格）
| 页面 | 路由 | 说明 |
|------|------|------|
| 产品管理 | `/inventory/products` | 产品目录、分类树、SKU 管理、添加产品弹窗 |
| 库存管理 | `/inventory/stock` | 库存总览、批次管理（FIFO）、入库/出库操作、安全库存阈值 |
| 采购管理 | `/inventory/purchase` | AI 补货建议（基于 90 天数据预测）+ 采购订单全流程（草稿→审核→下单→收货） |
| 过期管理 | `/inventory/expiry` | 临期预警（60天/30天）、损耗分析（柱状图+饼图）、处置建议（促销/调拨/报废） |
| 门店库存与调拨 | `/inventory/transfer` | 多门店库存对比矩阵、AI 调拨建议、调拨单管理 |
| 服务消耗与BOM | `/inventory/consumption` | BOM 配方管理、消耗记录（偏差>20%异常标记）、未来 7 天库存预估 |

---

## 五、全局布局

应用采用经典的后台管理布局：

- 左侧导航栏（宽 256px）：深色背景（#0a1628），包含品牌 Logo "美业管理平台"，7 个一级菜单可折叠展开，选中项高亮（#1890ff）
- 顶部栏：白色背景，显示面包屑导航 + 管理员头像
- 内容区：灰色背景（#f0f2f5），白色卡片容器承载页面内容

---

## 六、主题与设计系统

- 支持亮色/暗色双主题，通过 CSS 变量切换
- 基础圆角：0.625rem
- 主色调：蓝色系（#1890ff 导航高亮）、粉色（品牌标识）
- 状态色：绿色（正常/在售）、橙色（低库存/临期）、红色（缺货/紧急/已过期）、蓝色（积压）、灰色（停售）
- 组件库：基于 shadcn/ui 的 40+ 预构建组件（Dialog、Tabs、Select、Accordion、Calendar 等）

---

## 七、数据状态

当前所有页面均使用组件内部的 Mock 数据（硬编码的数组常量），未接入任何后端 API。数据模型通过 TypeScript interface 定义，为后续 API 对接提供了类型基础。

典型数据实体包括：
- `Product`（产品）、`Category`（分类）、`StockItem`（库存项）、`Batch`（批次）
- `PurchaseOrder`（采购订单）、`ReplenishmentSuggestion`（补货建议）
- `ExpiringProduct`（临期产品）、`Store`（门店）、`TransferOrder`（调拨单）
- `Service`（服务项目）、`BOMItem`（BOM 物料）、`ConsumptionRecord`（消耗记录）
- `Card`（次卡）、`CardOrder`（开卡订单）、`Beautician`（美容师）
- `MarketingActivity`（营销活动）等

---

## 八、开发与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

路径别名：`@` 指向 `src/` 目录。

---

## 九、开源声明

- UI 组件基于 [shadcn/ui](https://ui.shadcn.com/)，MIT 许可证
- 图片素材来自 [Unsplash](https://unsplash.com)，遵循 Unsplash 许可协议

---

## 十、待完善事项

1. `商品类型`（/goods/types）和 `商品订单管理`（/orders/products）页面为占位页，尚未实现
2. `guidelines/Guidelines.md` 设计规范文档为空
3. `fonts.css` 字体文件为空，未配置自定义字体
4. 所有数据为 Mock 数据，需对接后端 API
5. 暗色主题已定义 CSS 变量，但未实现切换入口
6. 无单元测试或 E2E 测试
7. 无国际化（i18n）支持，当前仅中文界面
