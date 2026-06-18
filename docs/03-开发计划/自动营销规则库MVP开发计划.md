# 自动营销规则库 MVP 开发计划

更新时间：2026-06-09

关联需求文档：[自动营销规则库需求文档](../02-产品设计/自动营销规则库需求文档.md)

## 1. 开发目标

本次 MVP 的目标是把当前「自动营销」里已有的触发规则，从创建策略时的下拉选项升级为可浏览、可复制、可自定义、可启用的规则模板资产库。

MVP 不做复杂规则编排引擎，不做拖拽条件组，不做 AI 自动上线规则。重点交付：

- 规则库列表页。
- 系统默认推荐规则模板。
- 门店自定义规则。
- 规则详情和受众预估。
- 一键启用规则并生成自动营销策略。
- 规则维度的基础效果汇总。

## 2. 当前基础

当前系统已经具备以下可复用能力：

| 能力 | 当前位置 | MVP 复用方式 |
| --- | --- | --- |
| 触发规则选项 | `GET /marketing/automation/trigger-options` | 迁移为规则模板数据源 |
| 自动营销策略 | `MarketingAutomationStrategy` | 启用规则时创建策略 |
| 受众预估 | `previewAudience()` | 规则预估接口复用现有逻辑 |
| 策略执行 | `executeStrategy()` | 继续按策略执行，不让规则模板直接执行 |
| 执行记录 | `MarketingAutomationExecution` | 规则效果统计复用执行记录 |
| 触达记录 | `MarketingAutomationTouch` | 规则效果统计复用触达记录 |
| 频控 | `filterTouchFatigue()` | 继续使用策略级和渠道级频控 |
| 前端动态参数表单 | `CreateMarketing.tsx` | 规则编辑表单复用参数渲染逻辑 |

## 3. MVP 范围

### 3.1 包含

- 新增规则模板模型和接口。
- 将当前后端 `getTriggerOptions()` 的规则沉淀为系统默认规则模板。
- 规则库列表支持分页、筛选、搜索。
- 规则详情支持查看默认参数、数据依赖、推荐动作、受众预估。
- 系统默认规则不可直接修改，可复制为「我的规则」。
- 我的规则支持编辑参数、触达动作、执行计划、频控。
- 支持从规则库一键启用，生成自动营销策略。
- 自动营销策略记录来源：手动创建、规则库、智能推荐。
- 规则效果展示关联策略数、启用策略数、触达人数、转化人数、收入。

### 3.2 不包含

- 多层嵌套 AND/OR 条件组。
- 拖拽式规则编排。
- 规则之间冲突自动仲裁。
- AI 自动生成规则后直接启用。
- 系统规则灰度发布和完整版本治理。

## 4. 推荐交付节奏

建议按 3 个小阶段交付，总体约 8 到 12 个开发日，视接口联调和页面细节可浮动。

| 阶段 | 周期 | 目标 |
| --- | --- | --- |
| 阶段 1 | 2 到 3 天 | 后端规则模板资产层 |
| 阶段 2 | 3 到 5 天 | 前端规则库页面和启用流程 |
| 阶段 3 | 2 到 4 天 | 联调、效果统计、测试验收 |

## 5. 后端开发计划

### 5.1 数据模型

新增 `MarketingRuleTemplate` 模型，用于承载系统默认规则和门店自定义规则。

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int | 主键 |
| `code` | String | 规则编码，如 `dormant_default` |
| `name` | String | 规则名称 |
| `description` | String? | 规则说明 |
| `source` | String | `system` / `store` |
| `category` | String | `time` / `behavior` / `attribute` |
| `categoryLabel` | String | 时间触发 / 行为触发 / 属性触发 |
| `scenario` | String | 到期提醒、流失召回等 |
| `priority` | String | P0/P1/P2/P3 |
| `status` | String | recommended/enabled/disabled/draft/archived |
| `version` | String | MVP 默认 `1.0.0` |
| `baseTemplateId` | Int? | 复制来源 |
| `storeId` | Int? | 门店自定义规则所属门店，系统规则为空 |
| `triggerType` | String | 对应当前 `MarketingTriggerType` |
| `paramSchema` | Json | 动态参数表单 |
| `defaultParams` | Json | 默认参数 |
| `recommendedActions` | Json | 推荐动作 |
| `scheduleDefault` | Json | 默认执行计划 |
| `frequencyCap` | Json | 频控建议 |
| `dataDependencies` | Json | 数据依赖 |
| `recommendationReason` | String? | 推荐理由 |
| `createdBy` | Int? | 创建人 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

同时建议给现有 `MarketingAutomationStrategy` 增加来源字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | String | `manual` / `rule_library` / `recommendation` |
| `ruleTemplateId` | Int? | 来源规则模板 |
| `ruleTemplateVersion` | String? | 启用时使用的规则版本 |

如果希望 MVP 更轻量，也可以第一期不加外键关系，仅保存 `ruleTemplateId` 和 `ruleTemplateVersion` 字段，减少迁移复杂度。

### 5.2 数据迁移与种子数据

新增迁移：

```text
packages/server-v2/prisma/migrations/<timestamp>_marketing_rule_templates/
```

新增 seed 方法：

- 从当前 `getTriggerOptions()` 规则清单整理系统默认规则。
- P0 默认推荐规则必须写入：
  - 沉睡客户唤醒
  - 次卡/套餐即将到期
  - 优惠券即将到期
  - 领券未核销
  - 小程序浏览未预约
  - 预约放弃
  - 生日触发
- P1/P2 规则可同步写入，但状态可标记为 `recommended` 或 `disabled`。

注意：不要形成两套规则源。MVP 迁移后，`getTriggerOptions()` 应优先从规则模板读取系统规则，再映射成现有前端需要的结构。

### 5.3 后端接口

新增接口挂在 `MarketingController`：

| Method | Path | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/marketing/automation/rule-templates` | `core:marketing:view` | 分页获取规则库 |
| GET | `/marketing/automation/rule-templates/:id` | `core:marketing:view` | 获取规则详情 |
| POST | `/marketing/automation/rule-templates/:id/clone` | `core:marketing:create` | 复制为我的规则 |
| POST | `/marketing/automation/rule-templates` | `core:marketing:create` | 创建自定义规则 |
| PUT | `/marketing/automation/rule-templates/:id` | `core:marketing:update` | 更新自定义规则 |
| POST | `/marketing/automation/rule-templates/:id/preview-audience` | `core:marketing:view` | 预估命中客户 |
| POST | `/marketing/automation/rule-templates/:id/enable` | `core:marketing:create` | 基于规则创建并启用策略 |
| POST | `/marketing/automation/rule-templates/:id/disable` | `core:marketing:update` | 停用规则或关联策略 |
| GET | `/marketing/automation/rule-templates/:id/effects` | `core:marketing:analytics` | 获取规则效果 |

MVP 权限先复用现有营销权限，不强制新增细粒度权限码。

### 5.4 Service 逻辑

新增核心方法：

| 方法 | 说明 |
| --- | --- |
| `findRuleTemplates(query)` | 按来源、分类、场景、优先级、状态、关键词分页查询 |
| `getRuleTemplateById(id)` | 获取规则详情，同时返回关联策略和效果摘要 |
| `cloneRuleTemplate(id, context)` | 系统规则复制为门店自定义规则 |
| `createRuleTemplate(dto)` | 创建门店自定义规则 |
| `updateRuleTemplate(id, dto)` | 只允许更新门店自定义规则 |
| `previewRuleTemplateAudience(id)` | 复用 `previewAudience()`，传入模板的 `triggerType/defaultParams` |
| `enableRuleTemplate(id, dto)` | 创建 `MarketingAutomationStrategy` 并设置为 `enabled` |
| `disableRuleTemplate(id)` | 停用规则关联策略或更新规则状态 |
| `getRuleTemplateEffects(id)` | 聚合策略、执行、触达和转化数据 |

系统默认规则保护：

- `source = system` 的规则禁止普通用户直接 `PUT`。
- 用户修改系统规则时必须先调用 `clone`。
- `clone` 后的规则 `source = store`，保留 `baseTemplateId`。

### 5.5 与现有自动营销策略的关系

规则模板不直接执行，启用后生成自动营销策略：

```text
规则模板 -> 启用 -> 自动营销策略 -> 执行记录 -> 触达记录 -> 效果统计
```

启用规则时生成策略字段建议：

- `name` 使用规则名称，可允许用户确认前修改。
- `description` 使用规则说明。
- `source = rule_library`。
- `ruleTemplateId` 记录来源模板。
- `ruleTemplateVersion` 记录启用时版本。
- `triggerRules` 由 `triggerType + defaultParams` 生成。
- `actions` 使用规则推荐动作或用户确认动作。
- `schedule` 使用规则默认执行计划。
- `status = enabled`。

## 6. 前端开发计划

### 6.1 类型与 API

新增类型文件或扩展 `src/types/marketing.ts`：

- `MarketingRuleTemplate`
- `MarketingRuleTemplateInput`
- `MarketingRuleTemplateQuery`
- `MarketingRuleEffectSummary`
- `MarketingRuleTemplateSource`
- `MarketingRuleTemplateStatus`

新增 API 门面：

```text
src/api/marketingRuleTemplate.ts
src/api/real/marketingRuleTemplate.ts
```

也可以合并进现有 `src/api/marketing.ts`，但为避免文件继续膨胀，建议独立 API 文件。

### 6.2 路由与菜单

新增页面：

```text
src/app/pages/MarketingRuleLibrary.tsx
```

新增路由：

```text
/customer-marketing/rule-library
```

新增菜单：

```text
智能营销 / 规则库
```

MVP 权限：

```text
core:marketing:template
```

后续可拆成 `core:marketing:rule:view`。

### 6.3 规则库列表页

页面结构：

- 顶部标题：规则库。
- 说明文案：系统推荐规则和我的自定义规则。
- 筛选栏：
  - 来源：全部、系统推荐、我的规则。
  - 分类：全部、时间触发、行为触发、属性触发。
  - 场景：全部、到期提醒、流失召回、转化召回、会员经营、个性化推荐、裂变营销。
  - 优先级：全部、P0、P1、P2、P3。
  - 状态：全部、推荐启用、已启用、停用、草稿。
  - 搜索框。
- 列表表格：
  - 规则名称。
  - 来源。
  - 分类。
  - 场景。
  - 优先级。
  - 推荐渠道。
  - 预计命中客户。
  - 已关联策略。
  - 最近效果。
  - 状态。
  - 操作。
- 分页：默认 10 条。

操作按钮：

- 查看。
- 启用。
- 复制。
- 编辑。
- 停用。

### 6.4 规则详情抽屉

复用现有 shadcn/ui 风格，右侧抽屉展示：

- 基础信息。
- 推荐理由。
- 规则说明。
- 默认参数摘要。
- 数据依赖。
- 推荐动作。
- 频控建议。
- 受众预估。
- 效果摘要。
- 关联策略。

详情抽屉里的核心按钮：

- 系统规则：启用、复制为我的规则。
- 我的规则：启用、编辑、停用。

### 6.5 规则编辑弹窗

建议复用 `CreateMarketing.tsx` 中的参数表单思路：

- `paramSchema` 动态渲染参数字段。
- 用户修改参数后标记为「已自定义」。
- 触达渠道使用多选。
- 推荐动作使用表单列表。
- 执行计划支持每日、每周、每月、实时。
- 保存前支持预览命中客户。

编辑限制：

- 系统规则不可编辑。
- 我的规则可编辑。
- 编辑后状态可保存为草稿或推荐启用。

### 6.6 一键启用流程

点击启用后打开确认弹窗：

- 展示规则名称。
- 展示触发条件摘要。
- 展示预计命中客户数。
- 展示推荐动作和渠道。
- 展示执行计划。
- 展示频控提示。

按钮：

- 直接启用。
- 修改后启用。
- 取消。

直接启用成功后：

- 调用 `POST /rule-templates/:id/enable`。
- Toast 提示「规则已启用，并生成自动营销策略」。
- 刷新规则库列表。
- 提供跳转到自动营销策略列表的入口。

## 7. 默认推荐规则整理

MVP 默认启用推荐优先 P0：

| 规则 | triggerType | 场景 | 默认状态 |
| --- | --- | --- | --- |
| 沉睡客户唤醒 | `dormant` | 流失召回 | recommended |
| 次卡/套餐即将到期 | `card_expiry` | 到期提醒 | recommended |
| 优惠券即将到期 | `coupon_expiry` | 到期提醒 | recommended |
| 领券未核销 | `coupon_claimed_unused` | 转化召回 | recommended |
| 小程序浏览未预约 | `browse_abandonment` | 转化召回 | recommended |
| 预约放弃 | `booking_abandonment` | 转化召回 | recommended |
| 生日触发 | `birthday` | 会员经营 | recommended |

P1 规则同步进入规则库，但可放在推荐列表后方：

- 护理周期到期。
- 最近消费时间。
- 到店间隔异常。
- 会员等级。
- 肤质类型。
- 新客转化。

## 8. 测试计划

### 8.1 后端测试

新增或扩展：

```text
packages/server-v2/src/marketing/marketing.service.spec.ts
packages/server-v2/src/marketing/marketing.controller.spec.ts
```

重点用例：

- 获取规则库分页成功。
- 按来源、分类、优先级、状态筛选成功。
- 系统默认规则不可直接编辑。
- 系统规则复制为我的规则成功。
- 我的规则编辑参数成功。
- 规则受众预估复用现有预估逻辑。
- 启用规则后创建自动营销策略，且 `source/ruleTemplateId/ruleTemplateVersion` 正确。
- 规则效果统计能聚合关联策略和触达数据。

### 8.2 前端测试

建议覆盖：

- 规则库页面加载成功。
- 筛选和搜索触发正确 API 参数。
- 点击查看打开详情抽屉。
- 系统规则点击编辑时提示复制。
- 复制规则后进入我的规则。
- 修改参数后保存，参数来源显示已自定义。
- 点击启用后生成策略并刷新列表。

### 8.3 手动验收

手动验收路径：

1. 登录管理端。
2. 进入「智能营销 / 规则库」。
3. 查看系统默认规则列表。
4. 打开「沉睡客户唤醒」详情。
5. 预估命中客户。
6. 复制为我的规则。
7. 修改沉睡天数为 45 天并保存。
8. 启用该自定义规则。
9. 到「自动营销」确认生成策略。
10. 执行策略后查看规则效果摘要。

## 9. 验收标准

- 规则库页面可访问，菜单路径正确。
- 默认展示 10 条规则，分页可用。
- P0 默认推荐规则完整展示。
- 用户能按来源、分类、场景、优先级、状态筛选规则。
- 用户能查看规则详情和受众预估。
- 系统默认规则不可直接编辑。
- 用户能复制系统规则为我的规则。
- 用户能编辑我的规则参数并保存。
- 用户能一键启用规则并生成自动营销策略。
- 自动营销策略能记录来源规则。
- 规则效果至少展示关联策略数、触达人数、转化人数、收入。
- 后端 `npm run build`、`npm run test` 通过。
- 根项目 `npm run build`、相关前端测试通过。

## 10. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 规则源重复 | 后端规则选项和规则库不一致 | `trigger-options` 从规则模板映射生成 |
| 数据依赖不足 | 预估命中客户为 0，用户误以为规则无效 | 在详情页展示数据不足提示 |
| 启用规则生成策略后难追踪 | 效果无法回到规则维度 | 策略保存 `ruleTemplateId` 和版本 |
| 自定义规则参数无效 | 执行失败或命中异常 | 后端校验 `paramSchema` 与必填参数 |
| 页面复杂度过高 | 用户不知道先做什么 | P0 规则置顶，提供「推荐启用」状态 |
| 权限拆分过早 | 增加开发成本 | MVP 复用现有营销权限 |

## 11. 开发任务清单

### 后端

- [ ] 新增 Prisma 模型 `MarketingRuleTemplate`。
- [ ] 给 `MarketingAutomationStrategy` 增加来源字段。
- [ ] 新增迁移和系统默认规则 seed。
- [ ] 实现规则库分页查询接口。
- [ ] 实现规则详情接口。
- [ ] 实现复制系统规则接口。
- [ ] 实现创建和更新自定义规则接口。
- [ ] 实现规则受众预估接口。
- [ ] 实现规则启用生成策略接口。
- [ ] 实现规则停用接口。
- [ ] 实现规则效果接口。
- [ ] 调整 `trigger-options` 从规则模板读取。
- [ ] 补充 service/controller 测试。

### 前端

- [ ] 新增规则库类型定义。
- [ ] 新增规则库 API。
- [ ] 新增 `MarketingRuleLibrary` 页面。
- [ ] 新增菜单和路由。
- [ ] 实现规则库筛选、搜索、分页。
- [ ] 实现规则详情抽屉。
- [ ] 实现受众预估展示。
- [ ] 实现复制为我的规则。
- [ ] 实现自定义规则编辑弹窗。
- [ ] 实现一键启用确认弹窗。
- [ ] 实现规则效果摘要展示。
- [ ] 补充前端测试或核心手动验证。

### 联调验收

- [ ] P0 规则数据完整。
- [ ] 系统规则保护逻辑正确。
- [ ] 自定义规则保存后可复用。
- [ ] 启用规则后策略生成正确。
- [ ] 策略执行后规则效果可回流。
- [ ] 构建和测试通过。

## 12. 建议实施顺序

1. 后端先建规则模板表和 seed。
2. 后端把 `trigger-options` 改为从规则模板映射，确保旧自动营销页面不受影响。
3. 后端完成规则库 CRUD、预估、启用、效果接口。
4. 前端接入规则库列表和详情。
5. 前端完成复制、编辑、一键启用。
6. 联调默认 P0 规则闭环。
7. 补测试和验收。

## 13. MVP 完成后的下一步

MVP 完成后，下一阶段建议做：

- 智能推荐页直接推荐规则库规则。
- 规则效果排序，帮助用户看到哪些规则值得启用。
- 默认规则版本管理。
- 按门店客单价、经营阶段、客户规模推荐不同默认参数。
- 规则效果差时给出自动优化建议。

