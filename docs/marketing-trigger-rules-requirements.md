# 自动营销触发规则技术需求文档

## 1. 背景与目标

当前 Ami_Core「智能营销 / 自动营销」页面已展示触发规则选择器，规则分为时间触发、行为触发、属性触发三类。现阶段前端只维护规则枚举、示例策略和表单展示，尚未形成可联调的规则参数、执行引擎、触达记录和效果归因接口。

本需求目标是把页面上的规则沉淀为可配置、可执行、可审计的自动营销规则体系，用于支持生日关怀、节假日营销、季节护肤、沉睡客户唤醒、消费画像运营等场景。

## 2. 当前页面规则范围

| 分类 | 规则编码 | 页面名称 | 业务含义 |
| --- | --- | --- | --- |
| 时间触发 | `birthday` | 生日关怀 | 在客户生日日前后触发祝福、优惠券、礼品等营销动作 |
| 时间触发 | `holiday` | 节假日营销 | 在指定节日前、当天或节后触发主题活动 |
| 时间触发 | `seasonal` | 季节性护肤 | 按春夏秋冬推荐对应护肤方案 |
| 时间触发 | `care_cycle` | 护理周期到期 | 上次护理后 N 天提醒客户预约下一次 |
| 时间触发 | `card_expiry` | 卡项即将到期 | 次卡/套餐到期前 N 天提醒使用或续费 |
| 行为触发 | `last_visit` | 最近消费时间 | 根据客户最后一次到店/消费距今天数触发 |
| 行为触发 | `consumption` | 消费金额 | 根据累计消费、周期消费或单次消费金额触发 |
| 行为触发 | `visit_frequency` | 到店频率 | 根据客户到店频率变化触发 |
| 行为触发 | `visit_gap` | 消费间隔异常 | 当前到店间隔超过客户历史平均间隔阈值时触发 |
| 行为触发 | `service_interest` | 项目/服务偏好 | 根据历史项目偏好推荐相关项目、次卡或套餐 |
| 行为触发 | `dormant` | 沉睡客户唤醒 | 长期未到店客户进入唤醒池 |
| 属性触发 | `member_level` | 会员等级 | 针对指定会员等级客户触发 |
| 属性触发 | `new_customer` | 新客户引导 | 新注册/新建档客户在指定窗口期触发 |
| 属性触发 | `skin_type` | 肌肤类型 | 按干性、油性、敏感、混合、中性等肌肤分类触发 |
| 属性触发 | `age_range` | 年龄段 | 按年龄区间触发，例如 25-35 岁抗初老 |

## 3. 核心数据模型

### 3.1 营销策略

```ts
interface MarketingAutomationStrategy {
  id: number;
  name: string;
  description: string;
  status: 'draft' | 'enabled' | 'paused' | 'archived';
  executionType: 'auto' | 'manual';
  schedule: {
    type: 'daily' | 'weekly' | 'monthly' | 'date_range' | 'realtime';
    time?: string;
    weekdays?: number[];
    startDate?: string;
    endDate?: string;
  };
  triggerRules: MarketingTriggerRule[];
  ruleRelation: 'AND' | 'OR';
  actions: MarketingAction[];
  audienceLimit?: AudienceLimit;
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 触发规则

```ts
interface MarketingTriggerRule {
  type:
    | 'birthday'
    | 'holiday'
    | 'seasonal'
    | 'care_cycle'
    | 'card_expiry'
    | 'last_visit'
    | 'consumption'
    | 'visit_frequency'
    | 'visit_gap'
    | 'service_interest'
    | 'dormant'
    | 'member_level'
    | 'new_customer'
    | 'skin_type'
    | 'age_range';
  params: Record<string, unknown>;
}
```

### 3.3 营销动作

```ts
interface MarketingAction {
  type: 'coupon' | 'discount' | 'gift' | 'points' | 'sms' | 'push' | 'wechat' | 'miniapp';
  value: string;
  channel?: 'sms' | 'miniapp' | 'wechat' | 'group' | 'store' | 'moments';
  contentTemplate?: string;
}
```

## 4. 各规则参数与判定逻辑

### 4.1 时间触发

| 规则 | 必填参数 | 判定逻辑 | 默认频率 |
| --- | --- | --- | --- |
| `birthday` | `offsetDays`, `dateScope` | 客户生日与当前日期差值命中范围，例如生日当天、前 7 天、生日月 | 每日 08:00 |
| `holiday` | `holidayCode`, `offsetDays`, `dateRange` | 系统节日表命中指定节日前后窗口 | 每日 08:00 |
| `seasonal` | `season`, `skinTypes?`, `projectCategories?` | 当前日期落入季节区间，并可叠加肤质/项目偏好过滤 | 每日或活动周期 |
| `care_cycle` | `projectId?`, `cycleDays`, `lastServiceType` | 客户上次完成指定护理后满 N 天 | 每日 09:00 |
| `card_expiry` | `beforeDays`, `cardType?`, `remainingTimes?` | 客户次卡/套餐将在 N 天内到期，可叠加剩余次数 | 每日 09:00 |

### 4.2 行为触发

| 规则 | 必填参数 | 判定逻辑 | 依赖数据 |
| --- | --- | --- | --- |
| `last_visit` | `operator`, `days` | `today - lastVisitDate` 满足大于/小于/等于 N 天 | 客户档案、订单/核销 |
| `consumption` | `operator`, `amount`, `period` | 客户累计、单次或周期消费金额满足阈值 | 订单、次卡订单 |
| `visit_frequency` | `windowDays`, `operator`, `count` | 最近 N 天到店次数满足阈值或较上周期下降 | 预约、服务、核销 |
| `visit_gap` | `multiplier`, `minDays` | 当前间隔大于客户历史平均消费间隔的倍数，且超过最小天数 | 消费记录 |
| `service_interest` | `projectCategory`, `minCount`, `windowDays` | 最近 N 天消费指定项目/类别达到次数 | 项目订单、核销 |
| `dormant` | `days`, `excludePurchasedRecently` | N 天未到店，且未在最近周期内购买或预约 | 客户档案、订单、预约 |

### 4.3 属性触发

| 规则 | 必填参数 | 判定逻辑 | 依赖数据 |
| --- | --- | --- | --- |
| `member_level` | `levels` | 客户会员等级在指定集合内 | 客户档案 |
| `new_customer` | `withinDays`, `hasNoOrder?` | 新建档 N 天内，可限定未消费 | 客户档案、订单 |
| `skin_type` | `skinTypes` | 客户肌肤档案分类命中 | 肌肤档案、Aura Lite 检测 |
| `age_range` | `minAge`, `maxAge` | 客户年龄落入区间 | 客户档案 |

### 4.4 美业行业推荐默认参数

系统创建策略时，应根据规则类型自动填入以下推荐默认参数。默认值用于降低门店配置成本，用户可在策略编辑表单中自定义修改；保存时以后端返回或用户提交的最终参数为准。

| 规则 | 推荐默认参数 | 默认值依据 | 用户可修改项 |
| --- | --- | --- | --- |
| `birthday` 生日关怀 | `offsetDays: -7`，`dateScope: birthday_month`，`repeatPolicy: once_per_year`，`channels: ['sms', 'miniapp']`，`defaultAction: birthday_discount_20_percent_off` | 美业生日营销通常提前 3-7 天触达，给客户留预约时间；生日月权益更容易提升到店率 | 提前/延后天数、生日当天/生日月、权益内容、触达渠道 |
| `holiday` 节假日营销 | `holidayCode: auto_upcoming_major_holiday`，`offsetDays: -10`，`dateRange: [-10, 3]`，`channels: ['miniapp', 'wechat', 'moments']` | 节日前 7-14 天是活动预热窗口，适合套餐、礼品卡、亲友同行等活动 | 节日、预热天数、活动周期、渠道、活动权益 |
| `seasonal` 季节性护肤 | `season: current`，`leadDays: 15`，`skinTypes: auto_by_season`，`projectCategories: auto_by_season` | 换季前后皮肤问题明显，提前半个月推荐更适合预约排期 | 季节、肤质范围、推荐项目类别、活动周期 |
| `care_cycle` 护理周期到期 | `cycleDays: 28`，`lastServiceType: facial_care`，`remindDaysBefore: 3`，`channels: ['miniapp', 'sms']` | 面部护理常见复购周期约 21-30 天，28 天适合作为通用默认值 | 护理项目、周期天数、提前提醒天数、渠道 |
| `card_expiry` 卡项即将到期 | `beforeDays: 30`，`remainingTimes: 1`，`cardType: all`，`actionIntent: use_or_renew` | 次卡到期前 30 天提醒客户消耗，剩余 1 次以内同时适合续卡推荐 | 到期提前天数、剩余次数阈值、卡类型、续费优惠 |
| `last_visit` 最近消费时间 | `operator: greater_than`，`days: 30`，`excludeBooked: true`，`channels: ['sms', 'miniapp']` | 多数美业客户 30 天未到店即进入轻唤醒窗口 | 未到店天数、是否排除已预约客户、渠道、权益 |
| `consumption` 消费金额 | `period: cumulative`，`operator: greater_than_or_equal`，`amount: 5000`，`tierAction: vip_care` | 5000 元累计消费可作为普通门店高价值客户初筛线，后续可按品牌客单价调整 | 统计周期、金额阈值、累计/单次、权益策略 |
| `visit_frequency` 到店频率 | `windowDays: 90`，`operator: less_than`，`count: 2`，`compareToPreviousWindow: true` | 90 天内少于 2 次或较上周期下降，说明客户活跃度转弱 | 观察窗口、次数阈值、是否环比、触达权益 |
| `visit_gap` 消费间隔异常 | `multiplier: 2`，`minDays: 45`，`excludeNewCustomer: true` | 到店间隔超过个人历史均值 2 倍，且超过 45 天，通常需要干预 | 倍数、最小天数、是否排除新客、渠道 |
| `service_interest` 项目/服务偏好 | `windowDays: 180`，`minCount: 2`，`projectCategory: last_top_category`，`recommendMode: related_project` | 180 天内同类项目 2 次以上可判断偏好，适合推荐升级项目或套餐 | 观察窗口、最低次数、项目类别、推荐模式 |
| `dormant` 沉睡客户唤醒 | `days: 60`，`excludePurchasedRecently: true`，`excludeBooked: true`，`wakeLevel: medium` | 60 天未到店比 30 天更接近沉睡客户，适合较强优惠唤醒 | 沉睡天数、是否排除已购/已约客户、唤醒强度 |
| `member_level` 会员等级 | `levels: ['gold', 'platinum', 'diamond']`，`actionIntent: privilege_care`，`channels: ['wechat', 'store']` | 高等级会员更适合权益维护、专属服务和店员跟进 | 会员等级范围、权益、渠道、是否店员跟进 |
| `new_customer` 新客户引导 | `withinDays: 7`，`hasNoOrder: true`，`touchDay: 3`，`defaultAction: first_order_coupon` | 新客建档后 3-7 天内引导首单，转化效率较高 | 新客窗口、触达日、是否限定未消费、首单权益 |
| `skin_type` 肌肤类型 | `skinTypes: ['dry', 'oily', 'sensitive', 'combination', 'normal']`，`sourcePriority: ['aura_lite', 'health_profile', 'manual']`，`recommendMode: skin_care_plan` | 美业项目推荐高度依赖肤质，优先采用 Ami Aura Lite 检测结果 | 肤质范围、数据来源优先级、推荐项目/商品 |
| `age_range` 年龄段 | `minAge: 25`，`maxAge: 40`，`theme: anti_aging_entry`，`channels: ['miniapp', 'wechat']` | 25-40 岁是抗初老、维稳、轻抗衰项目的主力人群 | 年龄区间、营销主题、推荐项目、渠道 |

默认参数补充规则：

- 若用户从“智能推荐”跳转创建策略，推荐结果中的人群、肤质、项目、金额等参数优先覆盖系统默认值。
- 若门店已配置行业参数模板，门店模板优先于平台默认值。
- 若客户画像数据缺失，规则引擎应跳过无法判定的客户，不应按默认值强行命中。
- 默认触达时间建议为每日 09:00；生日关怀可使用每日 08:00；节假日活动可使用活动期每日 10:00。
- 默认频控建议为同策略同客户 7 天内最多触达 1 次；生日、卡到期、护理周期类规则可按事件周期单独计算。

## 5. 执行流程

1. 定时任务按策略 `schedule` 拉取启用中的策略。
2. 根据 `triggerRules` 和 `ruleRelation` 计算命中客户。
3. 做去重和频控：同策略同客户每日最多触发一次，同渠道每日最多触达一次。
4. 生成触达任务：短信、小程序、企微、门店跟进等。
5. 写入执行日志和客户触达记录。
6. 后续根据核销、回店、下单、续卡数据做效果归因。

## 6. API 需求

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/marketing/automation/trigger-options` | 获取规则目录、参数 schema、默认值 |
| GET | `/marketing/automation/strategies/paginated` | 自动营销策略分页 |
| POST | `/marketing/automation/strategies` | 创建策略 |
| PUT | `/marketing/automation/strategies/{id}` | 更新策略 |
| POST | `/marketing/automation/strategies/{id}/enable` | 启用策略 |
| POST | `/marketing/automation/strategies/{id}/pause` | 暂停策略 |
| DELETE | `/marketing/automation/strategies/{id}` | 删除策略 |
| POST | `/marketing/automation/strategies/preview-audience` | 新建策略保存前预估命中客户 |
| POST | `/marketing/automation/strategies/{id}/preview-audience` | 预估命中客户 |
| POST | `/marketing/automation/strategies/{id}/execute` | 手动执行一次 |
| GET | `/marketing/automation/executions/paginated` | 执行记录分页 |
| GET | `/marketing/automation/executions/{id}` | 执行详情 |
| GET | `/marketing/automation/effects` | 策略效果统计 |

`/marketing/automation/trigger-options` 必须返回每个规则的 `defaultParams`，前端选中规则时直接填入这些默认值；用户修改后，提交接口保存用户修改后的最终参数。

## 7. 前端需求

- 规则选择器需要从后端规则目录读取，不再写死在页面内。
- 每个规则选中后展示对应参数表单，例如生日提前天数、消费金额阈值、沉睡天数。
- 规则选中后，系统自动填入推荐默认参数；默认参数必须可编辑，且需要展示“已使用系统推荐值/已自定义”状态。
- 支持多规则组合，并明确 `AND / OR` 关系。
- 创建策略前提供“预估命中客户”按钮，展示客户数量和抽样名单。
- 策略详情页展示触发规则、触达文案、执行记录、效果数据。
- 错误态需要区分参数无效、无命中客户、渠道不可用、余额不足、权限不足。

## 8. 后端需求

- 建立统一规则计算服务，所有规则输入输出标准化。
- 建立营销任务调度器，支持每日/每周/活动周期/实时触发。
- 建立触达频控和去重表，避免重复打扰客户。
- 建立执行日志，记录策略、规则、客户、渠道、动作、结果。
- 建立效果归因逻辑，按策略统计触达人数、核销率、回店率、收入、成本。
- 对手机号、微信、私密备注等敏感字段继续执行字段权限和脱敏策略。

## 9. 验收标准

- 能创建包含任一规则的自动营销策略。
- 能预览规则命中的客户数量，并与客户画像/消费画像数据一致。
- 启用策略后，定时任务可生成执行记录和触达记录。
- 同一客户不会在同一策略下被重复触达。
- 生日、沉睡、季节、消费金额四类核心规则至少有单元测试。
- `npm run lint`、`npm run build`、`npm run test` 通过。

## 10. MVP 优先级

P0：
- `birthday`
- `last_visit`
- `dormant`
- `consumption`
- `member_level`
- `skin_type`

P1：
- `holiday`
- `seasonal`
- `care_cycle`
- `card_expiry`
- `new_customer`

P2：
- `visit_frequency`
- `visit_gap`
- `service_interest`
- `age_range`
