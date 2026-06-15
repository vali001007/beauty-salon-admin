# Ami Glow 客户服务小程序详细开发计划

版本：v1.0  
日期：2026-06-08  
需求来源：`docs/02-产品设计/Ami_Glow/Ami_Glow_客户服务小程序需求文档.md`  
原型来源：`docs/02-产品设计/Ami_Glow/` 下 6 张小程序原型截图  
关联系统：Ami_Core 管理端、`packages/server-v2`、AI Gateway、营销/项目/预约/客户/次卡/测肤模块

## 1. 开发结论

Ami Glow 一期开发建议按“先闭环、再增强”的方式推进。第一阶段不做完整商城和微信支付，先交付客户服务小程序的核心闭环：

1. 客户能打开小程序看到门店、Banner 和推荐项目。
2. 客户能浏览项目列表和项目详情。
3. 客户能选择门店、美容师、日期和时段完成预约，预约回写管理端。
4. 客户能完成微信登录、手机号绑定，并在“我的”查看预约、次卡、消费记录和会员卡。
5. 客户能从工具页进入 AI 测肤，生成报告、推荐项目，并保存到客户档案。
6. 管理端能承接小程序来源的预约、客户、测肤和行为事件。

一期建议新增两个主要工程边界：

```text
packages/Ami-Glow-MiniApp       # 新增客户服务小程序前端
packages/server-v2/src/customer-app  # 新增客户小程序 API 聚合模块
```

管理端第一期只做最小配置和承接，不做复杂页面生成器重构。首页 Banner、推荐项目、推荐活动优先复用现有营销、项目、优惠活动、商品、次卡数据，新增少量 Ami Glow 展示配置字段或后端聚合规则。

## 2. 目标范围

### 2.1 一期交付目标

| 目标 | 交付结果 |
| --- | --- |
| 页面还原 | 首页、预约、项目详情、预约弹层、工具、我的按原型实现 |
| 数据打通 | 首页内容、项目、预约、客户、次卡、消费记录、测肤结果与管理端/后端打通 |
| 预约闭环 | 小程序提交预约，管理端预约列表可查看并处理 |
| 测肤闭环 | 小程序上传图片测肤，生成报告，推荐项目，写入客户档案 |
| 会员服务 | 客户可查看自己的预约、次卡、消费记录、会员卡 |
| 营销归因 | 记录首页访问、项目点击、预约、测肤、推荐点击等行为 |

### 2.2 一期不做

| 不做项 | 原因 |
| --- | --- |
| 微信支付购买商品/次卡/项目 | 会显著增加支付、退款、对账、审核复杂度 |
| 拼团、分销、老带新 | 依赖支付和更完整的营销规则 |
| 完整优惠券领取和核销 | 需要优惠券库存、核销、过期和归因模型 |
| 复杂 CMS/拖拽装修 | 当前目标是还原原型和打通核心业务 |
| 多端统一营销页面渲染器重构 | 可与后续营销 H5/小程序生成器合并规划 |

## 3. 技术方案建议

### 3.1 小程序技术栈

建议一期优先选择 **原生微信小程序 + TypeScript**。

原因：

1. 当前原型是典型微信小程序形态，原生实现审核和能力调用最直接。
2. 一期页面数量少，原生开发成本可控。
3. 微信登录、手机号授权、拍照上传、扫码、拨号、分享等能力原生接入更稳定。
4. 后续如果要同时发布 H5，再评估 Taro/uni-app 或抽取业务 API SDK。

建议工程：

```text
packages/Ami-Glow-MiniApp
├─ miniprogram
│  ├─ app.ts
│  ├─ app.json
│  ├─ app.wxss
│  ├─ pages
│  │  ├─ home
│  │  ├─ booking
│  │  ├─ project-detail
│  │  ├─ tools
│  │  ├─ skin-test
│  │  ├─ skin-report
│  │  ├─ mine
│  │  ├─ my-reservations
│  │  ├─ my-cards
│  │  ├─ consumption-records
│  │  └─ member-card
│  ├─ components
│  │  ├─ tab-bar
│  │  ├─ project-card
│  │  ├─ reservation-sheet
│  │  ├─ empty-state
│  │  └─ loading-state
│  ├─ services
│  │  ├─ request.ts
│  │  ├─ auth.ts
│  │  ├─ home.ts
│  │  ├─ project.ts
│  │  ├─ reservation.ts
│  │  ├─ skin-test.ts
│  │  └─ mine.ts
│  ├─ stores
│  │  ├─ auth-store.ts
│  │  └─ store-context.ts
│  ├─ utils
│  │  ├─ date.ts
│  │  ├─ format.ts
│  │  ├─ event.ts
│  │  └─ upload.ts
│  └─ assets
└─ package.json
```

### 3.2 后端架构

建议在 `server-v2` 新增客户小程序聚合模块：

```text
packages/server-v2/src/customer-app
├─ customer-app.module.ts
├─ customer-app-auth.controller.ts
├─ customer-app-home.controller.ts
├─ customer-app-projects.controller.ts
├─ customer-app-reservations.controller.ts
├─ customer-app-skin-tests.controller.ts
├─ customer-app-me.controller.ts
├─ customer-app-events.controller.ts
├─ customer-app.service.ts
├─ customer-app-auth.service.ts
├─ dto
├─ guards
└─ types
```

关键原则：

1. 小程序接口不直接暴露管理端 JWT 权限接口。
2. 小程序接口不直接复用设备鉴权的 `terminal/*` 外部入口。
3. 小程序接口在服务层复用现有 `ProjectsService`、`ReservationsService`、`TerminalService`、`PromotionsService`、AI Gateway 等能力。
4. 小程序用户使用微信登录态和客户 token。
5. 所有接口强制按 `storeId + customerId/openid` 做数据隔离。

### 3.3 管理端改造

一期管理端建议采用轻量改造：

1. 项目、商品、次卡、活动增加 Ami Glow 展示字段或使用后端默认聚合规则。
2. 预约列表能识别来源 `ami_glow`。
3. 客户详情能看到小程序绑定信息、测肤记录、行为轨迹。
4. 营销效果报表能按渠道看到 `ami_glow`。

不建议一期做大型装修器或完整小程序运营后台。

## 4. 阶段排期

按 2 名前端、1 名后端、1 名管理端/全栈、1 名测试的常规节奏估算，一期建议 5-6 周完成可验收版本。

| 阶段 | 周期 | 目标 | 主要产出 |
| --- | --- | --- | --- |
| 阶段 0：准备与基线 | 2-3 天 | 确认技术栈、接口口径、原型细节 | 开发分支、工程骨架、接口清单 |
| 阶段 1：后端基础与小程序骨架 | 1 周 | 打通登录、首页、项目基础数据 | 小程序可运行、首页/预约列表基础渲染 |
| 阶段 2：预约闭环 | 1-1.5 周 | 完成项目详情、预约弹层、可预约时段、预约回写 | 客户可提交预约，管理端可见 |
| 阶段 3：我的与会员查询 | 1 周 | 完成个人中心、预约、次卡、消费记录、会员卡查询 | 客户可自助查个人服务信息 |
| 阶段 4：AI 测肤闭环 | 1-1.5 周 | 完成拍照上传、测肤报告、推荐项目、写回档案 | 测肤结果可查看和管理端承接 |
| 阶段 5：管理端承接、埋点与验收 | 1 周 | 完成配置、归因、联调、测试修复 | 一期验收包 |

## 5. 详细任务拆分

### 5.1 阶段 0：准备与基线

#### 目标

确定工程边界、API 命名、数据源、测试门店和验收口径，避免后续返工。

#### 任务

| 编号 | 任务 | 负责人 | 产出 | 验收 |
| --- | --- | --- | --- | --- |
| 0.1 | 确认小程序技术栈和工程目录 | 前端 | `packages/Ami-Glow-MiniApp` 方案确认 | 技术栈无争议 |
| 0.2 | 确认小程序 AppID、开发者、测试体验版流程 | 产品/前端 | 小程序配置清单 | 可在微信开发者工具打开 |
| 0.3 | 确认测试门店和测试账号 | 产品/测试 | 测试门店数据清单 | 项目、客户、次卡、消费记录、测肤样例可用 |
| 0.4 | 确认 API 前缀 | 后端 | `/customer-app/*` | 与现有 `/terminal/*`、管理端接口边界清晰 |
| 0.5 | 确认一期字段范围 | 后端/前端 | DTO 草案 | 首页、项目、预约、我的、测肤字段覆盖需求 |
| 0.6 | 建立开发分支 | 工程负责人 | `codex/ami-glow-miniapp` 或等效分支 | 分支创建完成 |

#### 注意事项

1. 不要改动或清理现有文档、原型和历史目录。
2. 新增工程尽量独立，避免影响管理端当前构建。
3. 所有客户侧接口从第一天开始按真实鉴权设计，避免后期重写。

### 5.2 阶段 1：后端基础与小程序骨架

#### 目标

小程序可以启动，四个 Tab 可切换，首页和预约列表能从后端真实接口加载基础数据。

#### 后端任务

| 编号 | 任务 | 文件/模块 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 1.1 | 新增 `customer-app` 模块 | `packages/server-v2/src/customer-app` | 建立 module、controller、service、dto | `server-v2` 构建通过 |
| 1.2 | 微信登录接口 | `/customer-app/auth/wechat-login` | 接收 code，返回小程序 token；开发期可 mock 微信换取 openid | 可获得 token |
| 1.3 | 手机号绑定接口 | `/customer-app/auth/bind-phone` | 手机号匹配客户，未匹配则创建客户 | 绑定后返回 customerId |
| 1.4 | 当前客户接口 | `/customer-app/me` | 返回头像、昵称、会员等级、绑定状态 | 我的页可用 |
| 1.5 | 首页聚合接口 | `/customer-app/home` | 返回门店、Banner、推荐项目、活动、商品、次卡 | 首页可渲染 |
| 1.6 | 项目列表接口 | `/customer-app/projects` | 支持 keyword、recommended、category、分页 | 预约页可渲染 |
| 1.7 | 项目详情接口 | `/customer-app/projects/:id` | 返回图片、价格、时长、简介、详情、活动 | 详情页可渲染 |
| 1.8 | 客户小程序鉴权 Guard | `guards` | 校验小程序 token，注入 customer/openid | 个人接口不可越权 |

#### 小程序任务

| 编号 | 任务 | 页面/模块 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 1.9 | 小程序工程初始化 | `packages/Ami-Glow-MiniApp` | TypeScript、基础配置、环境变量 | 微信开发者工具可启动 |
| 1.10 | 请求封装 | `services/request.ts` | baseURL、token、错误处理、loading | 可调用后端接口 |
| 1.11 | 主题和公共样式 | `app.wxss` | 紫色主题、背景、卡片、按钮、安全区 | 页面风格统一 |
| 1.12 | 自定义底部 Tab | `components/tab-bar` | 首页、预约、工具、我的 | 四 Tab 可切换 |
| 1.13 | 首页页面 | `pages/home` | 门店行、Banner、推荐服务 | 接口数据真实渲染 |
| 1.14 | 预约列表页面 | `pages/booking` | 搜索、推荐/全部、项目卡片、分页 | 能搜索和加载更多 |
| 1.15 | 工具页骨架 | `pages/tools` | 皮肤检测、护肤知识、电话客服入口 | 入口可点击 |
| 1.16 | 我的页骨架 | `pages/mine` | 用户卡片、功能列表 | 登录状态展示正确 |

#### 管理端任务

| 编号 | 任务 | 说明 | 验收 |
| --- | --- | --- | --- |
| 1.17 | 明确首页数据默认规则 | 不新增页面时，优先从已发布活动、推荐项目、上架商品、启用次卡取数 | 首页有可展示数据 |
| 1.18 | 测试门店补齐素材 | 确保项目有图片、价格、时长和简介 | 首页/预约页图片不空 |

### 5.3 阶段 2：预约闭环

#### 目标

客户从项目列表进入项目详情，选择预约条件后提交预约，管理端能看到来源为 Ami Glow 的预约。

#### 后端任务

| 编号 | 任务 | 接口 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 2.1 | 可预约美容师接口 | `/customer-app/projects/:id/available-beauticians` | 按项目、门店、技能/启用状态返回美容师 | 弹层可选择美容师 |
| 2.2 | 可预约时段接口 | `/customer-app/reservations/availability` | 按门店、项目、美容师、日期返回可选时段 | 冲突时段不可选 |
| 2.3 | 创建预约接口 | `POST /customer-app/reservations` | 创建预约，来源 `ami_glow`，支持幂等 key | 管理端预约列表可见 |
| 2.4 | 预约冲突校验 | service | 防止同一美容师同一时间重复预约 | 并发提交不会双写 |
| 2.5 | 客户信息补全 | create reservation | 未有客户姓名/手机号时要求补全 | 预约数据完整 |
| 2.6 | 预约事件写入 | `/customer-app/events` 或内部记录 | 记录 submit/success/fail | 后续可归因 |

#### 小程序任务

| 编号 | 任务 | 页面/组件 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 2.7 | 项目详情页 | `pages/project-detail` | 主图、价格、简介、详情、分享、收藏、底部按钮 | 视觉接近原型 |
| 2.8 | 预约弹层组件 | `components/reservation-sheet` | 门店、项目、美容师、日期、时段、确认 | 字段和状态完整 |
| 2.9 | 日期周选择 | `utils/date.ts` | 上一周/下一周，默认今天起 7 天 | 选中态正确 |
| 2.10 | 美容师选择 | 弹层/子组件 | 展示可预约美容师，支持“到店分配”配置 | 能选择和回填 |
| 2.11 | 时段选择 | 弹层/子组件 | 调可预约时段接口，展示可选/不可选状态 | 过去/冲突时段不可选 |
| 2.12 | 手机号绑定拦截 | auth store | 提交预约前校验绑定状态 | 未绑定会引导绑定 |
| 2.13 | 预约提交状态 | reservation service | loading、防重复、成功/失败提示 | 不重复提交 |
| 2.14 | 预约成功引导 | 成功 Toast/弹窗 | 提供“查看我的预约”入口 | 可进入我的预约 |
| 2.15 | 分享项目 | `onShareAppMessage` | 带 projectId、storeId、channel | 分享后可打开详情 |

#### 管理端任务

| 编号 | 任务 | 说明 | 验收 |
| --- | --- | --- | --- |
| 2.16 | 预约来源展示 | 预约列表/详情显示来源 `Ami Glow` | 门店能识别小程序预约 |
| 2.17 | 预约筛选支持来源 | 可按来源筛选，至少后端字段保留 | 运营可统计来源 |
| 2.18 | 客户档案关联 | 新客预约时创建/绑定客户 | 客户详情可见预约 |

### 5.4 阶段 3：我的与会员查询

#### 目标

客户可以自助查看个人预约、次卡、消费记录和会员卡，减少对客服的重复咨询。

#### 后端任务

| 编号 | 任务 | 接口 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 3.1 | 我的预约列表 | `/customer-app/me/reservations` | 支持状态分页 | 只返回当前客户数据 |
| 3.2 | 我的预约详情 | `/customer-app/me/reservations/:id` | 返回项目、门店、美容师、时间、状态 | 详情完整 |
| 3.3 | 客户取消预约 | `/customer-app/me/reservations/:id/cancel` | 未到店/未完成可取消，记录原因 | 管理端状态同步 |
| 3.4 | 我的次卡 | `/customer-app/me/cards` | 返回次卡名称、剩余次数、有效期、适用项目 | 数据与管理端一致 |
| 3.5 | 次卡使用记录 | `/customer-app/me/card-usage-records` | 分页返回核销记录 | 客户可查历史 |
| 3.6 | 消费记录 | `/customer-app/me/consumption-records` | 项目/商品/次卡/会员卡消费 | 金额和时间准确 |
| 3.7 | 会员卡接口 | `/customer-app/me/member-card` | 返回等级、余额、权益 | 我的页可展示 |
| 3.8 | 会员卡流水 | `/customer-app/me/member-card/transactions` | 返回充值、扣款、赠送等记录 | 明细可查 |
| 3.9 | 客服信息 | `/customer-app/contact` | 当前门店电话、地址、营业时间 | 工具/我的可用 |

#### 小程序任务

| 编号 | 任务 | 页面 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 3.10 | 我的页完善 | `pages/mine` | 头像、昵称、会员等级、功能列表 | 与原型接近 |
| 3.11 | 我的预约页 | `pages/my-reservations` | 状态筛选、预约卡片、取消预约 | 可查和取消 |
| 3.12 | 我的次卡页 | `pages/my-cards` | 次卡列表、剩余次数、有效期 | 数据正确 |
| 3.13 | 消费记录页 | `pages/consumption-records` | 按时间分页，展示金额和类型 | 数据正确 |
| 3.14 | 会员卡页 | `pages/member-card` | 余额、等级、权益、流水入口 | 数据正确 |
| 3.15 | 联系客服 | `wx.makePhoneCall` | 使用门店电话 | 可拨号 |
| 3.16 | 关于我们 | 门店信息页/弹窗 | 展示地址、电话、营业时间 | 信息完整 |
| 3.17 | 登录绑定体验 | `pages/mine`/公共组件 | 未绑定时展示绑定引导 | 流程顺畅 |

#### 安全验收

1. A 客户不能访问 B 客户预约详情。
2. 未登录访问个人接口返回明确未授权。
3. 取消预约必须二次确认。
4. 已完成、已取消、已到店预约不可由客户再次取消。

### 5.5 阶段 4：AI 测肤闭环

#### 目标

客户能从工具页进入 AI 测肤，上传/拍摄照片，生成测肤报告，获得护理建议和推荐项目，并将结果写回客户档案。

#### 后端任务

| 编号 | 任务 | 接口/模块 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 4.1 | 图片上传策略 | upload service | 支持临时上传、压缩或后端中转 | 图片可安全提交 |
| 4.2 | 测肤分析接口 | `POST /customer-app/skin-tests/analyze` | 复用 AI Gateway/现有测肤能力 | 返回报告 |
| 4.3 | 测肤记录列表 | `GET /customer-app/skin-tests` | 返回当前客户测肤历史 | 只看本人 |
| 4.4 | 测肤详情 | `GET /customer-app/skin-tests/:id` | 返回指标、总结、建议 | 报告页可渲染 |
| 4.5 | 测肤推荐 | `/customer-app/skin-tests/:id/recommendations` | 按问题推荐项目/商品/次卡 | 可跳项目详情 |
| 4.6 | AI 解读 | 内部调用 `/ai/generate/skin-test-explanation` | 生成客户可读解释 | 文案稳定 |
| 4.7 | 写回客户档案 | customer health profile | 更新肤质、最近测肤时间、皮肤状态 | 管理端可见 |
| 4.8 | 测肤行为事件 | events | start/complete/recommendation click | 可归因 |
| 4.9 | 合规与审计 | AI audit logs | 记录 provider、model、usage、风险提示 | 可追溯 |

#### 小程序任务

| 编号 | 任务 | 页面/组件 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 4.10 | 测肤入口 | `pages/tools` | 点击“皮肤检测”进入流程 | 可进入 |
| 4.11 | 测肤拍摄指引页 | `pages/skin-test` | 展示光线、正脸、隐私提示 | 用户需确认 |
| 4.12 | 拍照/上传 | `wx.chooseMedia` | 支持相机和相册 | 图片可选 |
| 4.13 | 图片压缩和预览 | `utils/upload.ts` | 上传前压缩，用户可重拍 | 弱网可用 |
| 4.14 | 分析等待状态 | skin-test | 展示 loading、超时提示 | 不白屏 |
| 4.15 | 测肤报告页 | `pages/skin-report` | 综合评分、肤质、指标、AI 建议 | 可读性好 |
| 4.16 | 推荐项目卡片 | report component | 点击进入项目详情或预约 | 可转化 |
| 4.17 | 测肤历史入口 | 我的/工具 | 查看历史测肤记录 | 可回看 |
| 4.18 | 测肤失败兜底 | skin-test | 失败提示、重新上传、联系客服 | 可恢复 |

#### 合规要求

1. 测肤前必须展示授权和免责声明。
2. 文案明确“仅供美容护理参考，不构成医疗诊断”。
3. 图片不得长期明文缓存在小程序端。
4. 服务端返回 fallback/演示结果时必须标注“仅供参考”。

### 5.6 阶段 5：管理端承接、埋点与验收

#### 目标

补齐运营承接和可验收能力，确保门店能管理小程序带来的预约、客户、测肤和营销效果。

#### 管理端任务

| 编号 | 任务 | 模块 | 说明 | 验收 |
| --- | --- | --- | --- | --- |
| 5.1 | 项目 Ami Glow 展示配置 | 项目管理 | showInAmiGlow、排序、标签、摘要 | 配置后小程序展示变化 |
| 5.2 | 活动 Ami Glow Banner 配置 | 营销/优惠活动 | Banner 图、跳转对象、有效期 | 首页 Banner 可配置 |
| 5.3 | 商品/次卡展示配置 | 商品/次卡 | 是否展示、推荐标签 | 首页可展示 |
| 5.4 | 门店展示信息配置 | 门店管理 | 电话、地址、营业时间、小程序展示名 | 小程序门店信息准确 |
| 5.5 | 客户详情展示小程序绑定 | 客户管理 | openid/unionid 脱敏、来源、绑定时间 | 客户侧数据可追踪 |
| 5.6 | 客户详情展示测肤记录 | 客户健康档案 | 最新测肤、历史报告入口 | 顾问可查看 |
| 5.7 | 预约来源和渠道字段展示 | 预约管理 | 来源、活动、项目入口 | 运营可识别 |
| 5.8 | Ami Glow 渠道报表 | 营销报表 | 访问、点击、预约、测肤、转化 | 可看基础效果 |

#### 后端任务

| 编号 | 任务 | 说明 | 验收 |
| --- | --- | --- | --- |
| 5.9 | 行为事件落库 | 支持 eventType、storeId、customerId、targetType、targetId、channel | 事件可查 |
| 5.10 | 预约归因字段 | reservation 关联 source/channel/promotion/page | 预约可归因 |
| 5.11 | 首页缓存策略 | 门店首页聚合可短缓存 30-60 秒 | 首页响应稳定 |
| 5.12 | 接口限流 | 登录、测肤、事件接口设置合理限流 | 防滥用 |
| 5.13 | 错误格式统一 | 返回 `{ message, code, status, details }` | 小程序能统一提示 |

#### 小程序任务

| 编号 | 任务 | 说明 | 验收 |
| --- | --- | --- | --- |
| 5.14 | 埋点 SDK | 封装 `trackEvent`，失败不阻塞主流程 | 事件稳定上报 |
| 5.15 | 分享参数恢复 | projectId、storeId、channel、promotionId | 分享打开正确页面 |
| 5.16 | 空状态与错误态统一 | 首页、列表、详情、我的、测肤 | 不白屏 |
| 5.17 | 全局 loading 和 toast | 统一体验 | 反馈清晰 |
| 5.18 | 视觉细节打磨 | 卡片、按钮、Tab、弹层、安全区 | 与原型接近 |

## 6. 数据库与模型改造建议

实际以当前 Prisma schema 为准，一期建议最少新增/扩展以下数据。

### 6.1 新增客户小程序身份表

用途：保存微信 openid/unionid 与客户档案绑定关系。

建议字段：

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| storeId | 绑定门店 |
| customerId | 关联客户 |
| openid | 小程序 openid |
| unionid | 微信开放平台 unionid，可空 |
| nickname | 微信昵称，可空 |
| avatarUrl | 头像，可空 |
| phone | 绑定手机号 |
| bindStatus | bound/unbound |
| lastLoginAt | 最近登录 |
| createdAt/updatedAt | 时间 |

### 6.2 扩展预约字段

建议在预约模型或扩展表中保留：

| 字段 | 说明 |
| --- | --- |
| source | `ami_glow` |
| channel | home/banner/share/skin_test/project_list 等 |
| promotionId | 活动 ID |
| marketingPageId | 营销页 ID |
| miniappOpenid | 小程序用户标识，建议脱敏展示 |
| idempotencyKey | 幂等键 |

### 6.3 新增小程序行为事件表

用途：支撑营销归因和报表。

建议字段：

| 字段 | 说明 |
| --- | --- |
| eventType | 事件类型 |
| storeId | 门店 |
| customerId | 客户，可空 |
| openid | 微信用户，可空 |
| sessionId | 游客会话 |
| source | `ami_glow` |
| channel | 渠道 |
| targetType | project/product/card/promotion/page/skin_test |
| targetId | 目标 ID |
| payloadJson | 扩展数据 |
| createdAt | 事件时间 |

### 6.4 展示配置字段

可按对象表扩展，或先建立通用展示配置表：

| 字段 | 说明 |
| --- | --- |
| objectType | project/product/card/promotion |
| objectId | 对象 ID |
| storeId | 门店 |
| showInAmiGlow | 是否展示 |
| sortOrder | 排序 |
| tags | 推荐、热门、新品 |
| bannerImage | 小程序 Banner 图 |
| summary | 小程序摘要 |
| ctaType | 预约、咨询、查看详情 |
| publishStatus | draft/published/offline |
| startAt/endAt | 展示周期 |

## 7. 接口开发清单

### 7.1 P0 接口

| 模块 | Method | Path | 状态 |
| --- | --- | --- | --- |
| 登录 | POST | `/customer-app/auth/wechat-login` | P0 |
| 登录 | POST | `/customer-app/auth/bind-phone` | P0 |
| 我的 | GET | `/customer-app/me` | P0 |
| 首页 | GET | `/customer-app/home` | P0 |
| 项目 | GET | `/customer-app/projects` | P0 |
| 项目 | GET | `/customer-app/projects/:id` | P0 |
| 预约 | GET | `/customer-app/projects/:id/available-beauticians` | P0 |
| 预约 | GET | `/customer-app/reservations/availability` | P0 |
| 预约 | POST | `/customer-app/reservations` | P0 |
| 我的预约 | GET | `/customer-app/me/reservations` | P0 |
| 我的预约 | POST | `/customer-app/me/reservations/:id/cancel` | P0 |
| 我的次卡 | GET | `/customer-app/me/cards` | P0 |
| 消费记录 | GET | `/customer-app/me/consumption-records` | P0 |
| 会员卡 | GET | `/customer-app/me/member-card` | P0 |
| 测肤 | POST | `/customer-app/skin-tests/analyze` | P0 |
| 测肤 | GET | `/customer-app/skin-tests/:id` | P0 |
| 测肤 | GET | `/customer-app/skin-tests/:id/recommendations` | P0 |
| 客服 | GET | `/customer-app/contact` | P0 |
| 埋点 | POST | `/customer-app/events` | P0 |

### 7.2 P1 接口

| 模块 | Method | Path | 状态 |
| --- | --- | --- | --- |
| 门店 | GET | `/customer-app/stores` | P1 |
| 活动 | GET | `/customer-app/promotions` | P1 |
| 活动 | GET | `/customer-app/promotions/:id` | P1 |
| 测肤 | GET | `/customer-app/skin-tests` | P1 |
| 次卡 | GET | `/customer-app/me/card-usage-records` | P1 |
| 会员卡 | GET | `/customer-app/me/member-card/transactions` | P1 |
| 知识 | GET | `/customer-app/knowledge` | P1 |
| 知识 | GET | `/customer-app/knowledge/:id` | P1 |

## 8. 小程序页面开发清单

| 页面 | 路径 | 优先级 | 关键验收 |
| --- | --- | --- | --- |
| 首页 | `pages/home` | P0 | 门店、Banner、推荐服务真实渲染 |
| 预约/美容列表 | `pages/booking` | P0 | 搜索、筛选、分页、项目卡片 |
| 项目详情 | `pages/project-detail` | P0 | 主图、价格、详情、底部预约 |
| 预约弹层 | `components/reservation-sheet` | P0 | 门店、项目、美容师、日期、时段、确认 |
| 工具 | `pages/tools` | P0 | 皮肤检测、护肤知识、电话客服入口 |
| 测肤 | `pages/skin-test` | P0 | 授权提示、拍照上传、分析等待 |
| 测肤报告 | `pages/skin-report` | P0 | 指标、AI 解读、推荐项目 |
| 我的 | `pages/mine` | P0 | 用户卡、功能列表、登录绑定 |
| 我的预约 | `pages/my-reservations` | P0 | 列表、状态、取消 |
| 我的次卡 | `pages/my-cards` | P0 | 次卡余额、有效期、适用项目 |
| 消费记录 | `pages/consumption-records` | P0 | 消费明细分页 |
| 会员卡 | `pages/member-card` | P0 | 余额、等级、权益 |
| 关于我们 | `pages/about-store` | P1 | 门店介绍、地址、电话、营业时间 |
| 护肤知识 | `pages/knowledge` | P1 | 知识列表和详情 |

## 9. 测试计划

### 9.1 后端测试

| 测试项 | 覆盖 |
| --- | --- |
| 微信登录 | code 换 token、mock openid、token 过期 |
| 手机号绑定 | 匹配已有客户、创建新客户、重复绑定 |
| 首页聚合 | 无配置、有配置、活动过期、门店隔离 |
| 项目列表 | 搜索、推荐、分页、上下架 |
| 可预约时段 | 营业时间、项目时长、美容师占用、过去时间 |
| 创建预约 | 成功、冲突、重复提交、未绑定客户 |
| 我的数据 | 预约、次卡、消费记录、会员卡权限隔离 |
| AI 测肤 | 成功、失败、超时、fallback、写回档案 |
| 埋点 | 登录/游客事件、目标对象、归因字段 |

建议命令：

```bash
cd packages/server-v2
npm run build
npm run test
npm run lint
```

### 9.2 小程序测试

| 测试项 | 覆盖 |
| --- | --- |
| 页面视觉 | 6 张原型对应页面截图对比 |
| 首页 | Banner 点击、推荐项目跳转、门店展示 |
| 预约列表 | 搜索、筛选、加载更多、空状态 |
| 项目详情 | 分享、收藏、立即预约、不可预约状态 |
| 预约弹层 | 美容师、日期、时段、提交、错误提示 |
| 登录绑定 | 游客浏览、预约前绑定、我的页绑定 |
| 我的 | 预约、次卡、消费记录、会员卡 |
| 测肤 | 拍照、上传、等待、报告、推荐跳转 |
| 弱网 | 图片慢加载、接口失败、重试 |
| 设备 | iOS、Android、不同屏幕高度、安全区 |

### 9.3 管理端联调测试

| 测试项 | 验收 |
| --- | --- |
| 发布项目 | 小程序预约列表可见 |
| 下架项目 | 小程序不可预约 |
| 发布活动/Banner | 小程序首页可见 |
| 创建预约 | 管理端预约列表可见，来源为 Ami Glow |
| 取消预约 | 小程序取消后管理端状态同步 |
| 测肤完成 | 客户档案可查看测肤结果 |
| 行为事件 | 营销报表/事件表可查 |

## 10. 验收标准

### 10.1 产品验收

1. 四个底部 Tab 均可访问，页面结构与原型一致。
2. 首页可展示当前门店、Banner、推荐项目。
3. 预约页可搜索、筛选并进入项目详情。
4. 项目详情可打开预约弹层并完成预约。
5. 预约成功后管理端可看到对应预约。
6. 我的页可查看客户预约、次卡、消费记录和会员卡。
7. 工具页可进入 AI 测肤并生成报告。
8. 测肤推荐项目可进入项目详情或预约。
9. 联系客服可拨打当前门店电话。

### 10.2 技术验收

1. `packages/server-v2` 构建、测试、lint 通过。
2. 小程序无明显控制台错误。
3. 关键接口错误格式统一。
4. 预约提交有幂等和冲突校验。
5. 客户个人数据有权限隔离。
6. 图片加载失败有占位图。
7. 弱网和接口失败不白屏。
8. AI 测肤不在前端保存模型 Key。

### 10.3 数据验收

1. 小程序新客绑定后能在客户管理中找到。
2. 小程序预约能带 `source=ami_glow`。
3. 测肤报告能关联客户。
4. 行为事件能记录门店、客户、渠道、目标对象。
5. 首页推荐内容能按门店隔离。

## 11. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 微信小程序 AppID/权限未准备 | 无法真机和体验版测试 | 阶段 0 先确认 AppID、开发者权限 |
| 微信手机号授权规则变化 | 影响绑定流程 | 支持授权失败后手动填写手机号 |
| 可预约时段规则复杂 | 影响预约准确性 | 一期先按营业时间、项目时长、美容师占用过滤，复杂排班后续增强 |
| AI 测肤接口耗时长 | 用户等待体验差 | 超过 10 秒提示等待，支持后台生成和稍后查看 |
| 图片存储与隐私合规 | 影响上线审核和用户信任 | 使用服务端中转/临时 URL，前端不长期缓存 |
| 管理端缺少展示配置 | 首页内容不可控 | 一期用默认聚合规则，阶段 5 补配置 |
| 数据模型与现有 schema 差异 | 开发返工 | 后端先读 Prisma schema，再确定最小字段扩展 |
| 支付需求提前插入 | 影响一期节奏 | 一期明确只做展示、预约、咨询和查询 |

## 12. 人员与协作建议

| 角色 | 主要职责 |
| --- | --- |
| 产品 | 确认原型细节、测试门店、展示规则、验收优先级 |
| 小程序前端 | 页面还原、微信能力、登录绑定、请求和状态管理 |
| 后端 | customer-app API、鉴权、预约、测肤、事件、数据隔离 |
| 管理端前端 | 展示配置、预约来源、客户测肤和报表承接 |
| 测试 | 端到端流程、设备兼容、权限、安全、弱网 |

建议每阶段结束做一次可演示版本：

1. 阶段 1 演示：首页和项目列表。
2. 阶段 2 演示：完整预约。
3. 阶段 3 演示：我的查询。
4. 阶段 4 演示：AI 测肤。
5. 阶段 5 演示：管理端承接和报表。

## 13. 推荐开发顺序

实际执行时，建议按以下顺序开工：

1. 新增小程序工程和后端 `customer-app` 模块。
2. 打通登录、门店上下文、首页聚合和项目列表。
3. 实现项目详情和预约弹层。
4. 实现可预约时段和创建预约。
5. 补齐我的预约、次卡、消费记录、会员卡。
6. 实现 AI 测肤上传、报告和推荐项目。
7. 增加行为事件和预约归因。
8. 管理端展示来源、客户测肤和基础配置。
9. 全链路联调、真机测试和体验版验收。

## 14. 一期交付清单

代码交付：

1. `packages/Ami-Glow-MiniApp` 小程序工程。
2. `packages/server-v2/src/customer-app` 后端模块。
3. 管理端 Ami Glow 来源、配置和承接改造。
4. Prisma schema/迁移，如需要新增身份表、事件表和展示配置。
5. 测试用例和测试数据。

文档交付：

1. 接口契约补充到 `docs/api-contract.md` 或新增 `docs/customer-app-api.md`。
2. 小程序配置说明。
3. 真机测试报告。
4. 上线检查清单。

上线前必须确认：

1. 小程序 AppID、服务器域名、隐私协议已配置。
2. 后端生产环境已配置微信小程序密钥。
3. AI Gateway 生产 Key 仅保存在后端。
4. 图片上传和访问域名已通过微信小程序域名校验。
5. 测肤免责声明和隐私授权文案已通过产品确认。
6. 测试门店数据已替换或隐藏，不影响正式门店。

## 15. 里程碑验收表

| 里程碑 | 验收内容 | 是否可演示 |
| --- | --- | --- |
| M1 骨架可跑 | 小程序四 Tab、首页、项目列表、登录 mock | 是 |
| M2 预约闭环 | 项目详情、预约弹层、提交预约、管理端可见 | 是 |
| M3 会员服务 | 我的预约、我的次卡、消费记录、会员卡 | 是 |
| M4 测肤闭环 | 拍照上传、AI 报告、推荐项目、档案写回 | 是 |
| M5 运营承接 | Banner/推荐配置、来源归因、行为事件、报表基础 | 是 |
| M6 一期发布候选 | 真机测试、权限测试、弱网测试、隐私合规检查通过 | 是 |

## 16. 后续二期方向

一期上线稳定后，二期可按业务价值排序推进：

1. 微信支付购买项目/商品/次卡。
2. 优惠券领取、核销和过期提醒。
3. 测肤历史趋势对比。
4. 个性化首页推荐。
5. 小程序订阅消息：预约提醒、护理周期提醒、次卡到期提醒。
6. 护肤知识内容管理。
7. 多门店地图和就近门店推荐。
8. 老带新、拼团和分销。
9. 与营销 H5/小程序生成器统一 Page Schema。

一期的核心判断标准不是功能数量，而是门店是否能完成这条链路：

```text
客户打开 Ami Glow -> 浏览推荐内容 -> 查看项目/完成测肤 -> 提交预约 -> 管理端承接服务 -> 客户回到我的查看权益和记录
```

只要这条链路稳定，Ami Glow 就具备作为客户侧入口继续扩展营销和交易能力的基础。
