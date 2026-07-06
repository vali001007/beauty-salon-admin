# Agent V2 能力治理报告

生成时间：2026-07-05 18:38:57 Asia/Shanghai

## 发布策略

直接写入、删除、发券、下发必须审批或阻断；其他只读、指标、趋势、详情、诊断、草稿类能力可自动发布，但必须有权限、证据包和字段策略。

## 扫描规模

- Prisma 模型：122
- DTO 类：166
- 后端接口：587
- 已识别权限接口：266
- 前端路由：68
- 能力草稿：577
- Eval 草稿：650
- 未映射 Eval：418

## 分布

### 发布策略分布

- auto_publish：320
- approval_required：250
- write_blocked：7

### 领域分布

- finance：252
- marketing：77
- customer：68
- industry：68
- order：39
- store：37
- inventory：36

### Eval 失败分类分布

- 能力缺失：418
- 待验证：159
- 权限缺失：73

## 门禁缺口

- 缺权限能力：0
- 权限来自领域推断：50
- 缺 DTO 能力：50
- 缺主表/数据源能力：0
- 中高风险自动发布候选：0
- 未映射题目样例：50 / 418

### 缺权限能力样例

无

### 权限推断能力样例

| 能力ID | 名称 | 策略 | 风险 | 待确认 |
|---|---|---|---|---|
| customer.customer.app.contact.records.list | 客户 customer app / contact记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.display.configs.records.list | 客户 admin / display configs记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.home.records.list | 客户 customer app / home记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.cards.records.list | 客户 me / cards记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.consumption.records.records.list | 客户 me / consumption records记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.member.card.records.list | 客户 me / member card记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.records.list | 客户 customer app / me记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.reservations.records.list | 客户 me / reservations记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.projects.id.detail | 客户 projects / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.projects.records.list | 客户 customer app / projects记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.reservations.availability.records.list | 客户 reservations / availability记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.skin.tests.id.detail | 客户 skin tests / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.skin.tests.id.recommendations.detail | 客户 :id / recommendations详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.marketing.page.context | 客户 customer marketing页面语义 | auto_publish | low | 确认页面对应业务对象<br>确认是否已有后端 API 支撑<br>确认权限码与字段策略 |
| customer.customers.card.portraits.records.list | 客户 customers / card portraits记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.consumption.records.records.list | 客户 customers / consumption records记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.health.profiles.records.list | 客户 customers / health profiles记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.id.health.profile.detail | 客户 :id / health profile详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.id.profile.detail | 客户 :id / profile详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.page.context | 客户 customers页面语义 | auto_publish | low | 确认页面对应业务对象<br>确认是否已有后端 API 支撑<br>确认权限码与字段策略 |

### 缺 DTO 能力样例

| 能力ID | 名称 | 策略 | 风险 | 待确认 |
|---|---|---|---|---|
| customer.customer.app.contact.records.list | 客户 customer app / contact记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.cards.records.list | 客户 me / cards记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.member.card.records.list | 客户 me / member card记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.me.records.list | 客户 customer app / me记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.projects.id.detail | 客户 projects / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customer.app.skin.tests.id.detail | 客户 skin tests / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.consumption.records.records.list | 客户 customers / consumption records记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.health.profiles.records.list | 客户 customers / health profiles记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.id.detail | 客户 customers / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.customers.id.health.profile.detail | 客户 :id / health profile详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.id.profile.detail | 客户 :id / profile详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.miniapp.behavior.analysis.records.list | 客户 customers / miniapp behavior analysis记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.customers.profile.analytics.overview.metric | 客户 profile analytics / overview指标查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.customers.profile.analytics.records.list | 客户 customers / profile analytics记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.profile.analytics.segment.records.list | 客户 profile analytics / segment记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.customers.profile.analytics.skin.records.list | 客户 profile analytics / skin记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.customers.records.list | 客户 customers记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.customers.segment.count.records.list | 客户 customers / segment count记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |
| customer.marketing.predictions.customers.id.detail | 客户 customers / :id详情查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约<br>权限码来自领域推断，需绑定真实 controller 或 route 权限 |
| customer.marketing.predictions.customers.records.list | 客户 predictions / customers记录查询 | auto_publish | low | 确认业务对象口径<br>确认权限码<br>确认字段脱敏策略<br>确认接口入参 DTO 或请求契约 |

### 中高风险自动发布候选样例

无

## 建议

- 优先把领域推断权限替换为后端 @Permissions 或前端 route permission，避免自动发布依赖弱口径。
- 对缺 DTO 的接口补充入参契约或标记为只读无参，减少工具调用参数幻觉。
- 未映射题目需要按领域批量归并为新能力或明确标记为闲聊/暂不支持。
- 自动发布候选风险分布可接受。
