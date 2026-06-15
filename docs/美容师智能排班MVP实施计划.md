# 美容师智能排班 MVP 实施计划

日期：2026-06-07

## 目标

在现有“排班管理”基础上，新增一套可落地的智能辅助排班能力，让店长可以从“手工点选时段”升级为“系统生成建议班表，店长审核后发布”。

MVP 不追求一步到位的 AI 自动排班，而是先解决三个高频问题：

1. 哪些时段应该多排人。
2. 哪些排班和预约存在冲突。
3. 系统能否一键给出一个可用、可解释、可人工调整的班表。

## 产品边界

### 本期做

- 周维度智能排班预览。
- 基于已有预约和历史预约量生成需求热力图。
- 根据美容师状态、已有排班、预约占用生成建议班表。
- 保存前检查硬冲突。
- 给每份班表输出评分、风险和解释。
- 店长确认后才写入正式排班。
- 支持“复制上周并优化”。

### 本期不做

- 大模型直接生成最终班表。
- 自动修改客户已确认预约。
- 跨门店借调。
- 复杂劳动合同和薪资工时规则。
- 完整机器学习预测。
- 员工端自主换班审批。

## 当前系统适配点

现有排班链路：

- 页面：`src/app/pages/Scheduling.tsx`
- 前端 API：`src/api/real/scheduling.ts`
- 后端 Controller：`packages/server-v2/src/scheduling/scheduling.controller.ts`
- 后端 Service：`packages/server-v2/src/scheduling/scheduling.service.ts`
- 数据表：`Schedule`、`Reservation`、`Project`、`Beautician`

当前保存逻辑会按美容师和周覆盖原排班，因此智能排班发布时要谨慎：

- 预览接口不能写库。
- 发布接口必须带 `runId` 或建议方案快照。
- 发布前再次做冲突校验。
- 对已有预约和已锁定时段不能直接覆盖。

## 用户流程

### 1. 进入排班管理

店长进入 `/stores/scheduling`，默认看到当前周排班。

新增入口：

- 智能排班
- 检查冲突
- 需求热力图
- 复制上周并优化

### 2. 生成智能排班

店长点击“智能排班”，弹出配置弹窗：

- 排班周期：本周 / 下周 / 自定义。
- 生成方式：从空白生成 / 复制上周并优化 / 基于当前班表优化。
- 优先目标：覆盖预约 / 覆盖高峰 / 工时公平 / 减少人力。
- 是否保留已确认预约的美容师。
- 是否允许覆盖忙碌/请假时段。
- 高峰时段最低在岗人数。

推荐默认值：

- 生成方式：复制上周并优化。
- 优先目标：覆盖预约。
- 保留已确认预约美容师：开启。
- 允许覆盖请假：关闭。
- 允许覆盖忙碌：关闭。

### 3. 查看结果

生成后不直接保存，而是展示预览：

- 推荐班表。
- 班表总分。
- 预约覆盖率。
- 高峰覆盖率。
- 工时公平性。
- 冲突数量。
- 风险列表。
- 解释说明。

示例解释：

```text
周六 14:00-17:00 历史预约量较高，且已有 6 个预约，因此建议增加 2 名美容师在岗。
张美容师已在 15:00 有确认预约，因此保留该时段。
李美容师本周已排 38 小时，继续增加晚班会拉大工时差异，因此未优先安排。
```

### 4. 人工调整

店长可以在预览班表上继续手动调整：

- 设置正常。
- 设置忙碌。
- 设置请假。
- 恢复原班表。
- 查看该时段预约。

每次调整后重新计算评分和冲突。

### 5. 发布

店长点击“发布排班”：

1. 后端重新校验冲突。
2. 如果硬冲突为 0，则保存。
3. 如果存在硬冲突，则阻止发布并展示原因。

## 智能排班规则

### 硬约束

硬约束违反时不能发布：

- 美容师不存在或不属于当前门店。
- 美容师状态不可排班。
- 同一美容师同一时段重复排班。
- 请假时段不能排班。
- 已确认预约对应时段必须可服务。
- 已确认预约不能被排到美容师不可用时段。
- 排班不能超出门店营业时间。
- 项目时长必须有连续可用时段覆盖。

### 软约束

软约束影响评分，但允许店长确认：

- 高峰时段尽量多排人。
- 每位美容师周工时尽量均衡。
- 高级美容师优先覆盖高价值或复杂项目。
- 尽量减少碎片化 1 小时空档。
- 尽量延续上周稳定班型。
- 尽量保留客户熟悉的美容师。

## 班表评分

建议总分 100：

| 维度 | 分值 | 说明 |
| --- | ---: | --- |
| 预约覆盖 | 30 | 已有预约是否有美容师和连续可服务时段 |
| 高峰覆盖 | 20 | 高峰时段在岗人数是否达标 |
| 冲突风险 | 20 | 请假、忙碌、重复、不可用等冲突 |
| 工时公平 | 15 | 美容师之间周工时差异 |
| 技能匹配 | 10 | 美容师和项目能力是否匹配 |
| 员工偏好 | 5 | 是否满足默认可用时间和偏好 |

评分展示建议：

- 90-100：优秀，可直接发布。
- 75-89：可用，建议查看风险。
- 60-74：需调整后发布。
- 60 以下：不建议发布。

## 数据模型建议

### 第一优先级

新增 `SchedulingRuleConfig`：门店排班规则。

关键字段：

- `storeId`
- `businessStartTime`
- `businessEndTime`
- `slotMinutes`
- `peakRules`
- `maxDailyHours`
- `maxWeeklyHours`
- `minRestMinutes`
- `defaultMinStaff`
- `createdAt`
- `updatedAt`

新增 `BeauticianAvailability`：美容师默认可用时间。

关键字段：

- `beauticianId`
- `weekday`
- `startTime`
- `endTime`
- `type`: `available` / `unavailable` / `preferred`
- `effectiveFrom`
- `effectiveTo`

新增 `BeauticianTimeOff`：请假和临时不可用。

关键字段：

- `beauticianId`
- `date`
- `startTime`
- `endTime`
- `reason`
- `status`

新增 `SmartSchedulingRun`：智能排班运行记录。

关键字段：

- `storeId`
- `weekStart`
- `status`
- `inputSnapshot`
- `generatedSchedules`
- `score`
- `warnings`
- `createdBy`
- `confirmedAt`

### 第二优先级

新增 `BeauticianProjectSkill`：美容师项目能力。

关键字段：

- `beauticianId`
- `projectId`
- `skillLevel`
- `certified`
- `priority`

新增 `StoreResource` / `ResourceBooking`：房间、床位、仪器资源。

## 接口设计

### 生成预览

```http
POST /scheduling/smart/preview
```

请求：

```json
{
  "storeId": 1,
  "weekStart": "2026-06-08",
  "mode": "copy_last_week_optimize",
  "objective": "cover_reservations",
  "keepConfirmedReservations": true,
  "allowOverrideBusy": false,
  "allowOverrideLeave": false,
  "peakMinStaff": [
    { "weekday": 6, "startTime": "14:00", "endTime": "17:00", "minStaff": 4 }
  ]
}
```

响应：

```json
{
  "runId": "smart_20260607_001",
  "weekStart": "2026-06-08",
  "score": 86,
  "summary": {
    "reservationCoverageRate": 0.96,
    "peakCoverageRate": 0.88,
    "hardConflictCount": 0,
    "softWarningCount": 3
  },
  "schedules": [],
  "warnings": [],
  "explanations": []
}
```

### 评估当前班表

```http
POST /scheduling/smart/evaluate
```

用途：

- 手动调整后重新评分。
- 保存前检查冲突。

### 发布班表

```http
POST /scheduling/smart/publish
```

请求：

```json
{
  "runId": "smart_20260607_001",
  "weekStart": "2026-06-08",
  "schedules": []
}
```

要求：

- 发布前重新校验硬冲突。
- 硬冲突为 0 才写入 `Schedule`。
- 记录发布人和发布时间。

### 需求热力图

```http
GET /scheduling/demand?weekStart=2026-06-08
```

响应：

```json
{
  "weekStart": "2026-06-08",
  "slots": [
    {
      "date": "2026-06-13",
      "startTime": "14:00",
      "endTime": "15:00",
      "expectedReservations": 5,
      "requiredStaff": 3,
      "scheduledStaff": 2,
      "level": "high"
    }
  ]
}
```

## 后端实现拆分

建议在 `packages/server-v2/src/scheduling` 下新增：

- `smart-scheduling.controller.ts`
- `smart-scheduling.service.ts`
- `scheduling-conflict.service.ts`
- `scheduling-demand.service.ts`
- `scheduling-score.service.ts`
- `scheduling-rules.service.ts`

职责：

- `SmartSchedulingService`：编排预览、评估、发布。
- `SchedulingConflictService`：检查硬冲突。
- `SchedulingDemandService`：根据预约和历史数据计算需求。
- `SchedulingScoreService`：输出评分和解释。
- `SchedulingRulesService`：读取门店规则、美容师可用时间、请假。

## 第一版算法

MVP 使用“贪心生成 + 打分修正”，不直接上复杂求解器。

步骤：

1. 生成一周所有候选时段。
2. 读取当前周预约、上周排班、当前周已有排班。
3. 标记不可动时段：确认预约、请假、已过期时段。
4. 计算每个时段需求人数。
5. 优先满足已有预约。
6. 再补齐高峰时段最低人数。
7. 按美容师可用性、状态、周工时、等级和历史负载排序。
8. 生成候选班表。
9. 计算评分和解释。
10. 返回预览，不保存。

## 前端改造建议

页面 `src/app/pages/Scheduling.tsx` 增加以下区域：

- 顶部按钮：智能排班、检查冲突、需求热力图。
- 右侧抽屉：智能排班配置。
- 结果面板：评分、覆盖率、风险列表。
- 班表格子：增加冲突角标和推荐标记。
- 发布确认弹窗：显示本次将覆盖的时段数量。

交互原则：

- 智能排班默认只是预览。
- 自动生成的改动要高亮。
- 已确认预约占用时段不可直接覆盖。
- 店长手动改动优先级最高。

## 验收标准

### 功能验收

- 店长可以对下周生成智能排班预览。
- 生成结果不直接写入数据库。
- 店长可以看到评分和冲突列表。
- 有硬冲突时不能发布。
- 无硬冲突时可以发布并更新排班页。
- 已确认预约对应时段不会被自动清空。
- 请假时段不会被自动排班。

### 数据验收

- 智能排班运行有记录。
- 发布后的排班可追溯到生成记录。
- 评分和风险信息可复盘。

### 体验验收

- 店长能在 3 步内完成生成、查看、发布。
- 风险提示用业务语言表达，不只展示技术字段。
- 预览结果和正式排班有明显状态区分。

## 测试建议

### 单元测试

- 预约覆盖评分。
- 高峰需求计算。
- 请假冲突检测。
- 重复排班冲突检测。
- 已确认预约不可覆盖。
- 工时公平评分。

### 接口测试

- `POST /scheduling/smart/preview`
- `POST /scheduling/smart/evaluate`
- `POST /scheduling/smart/publish`
- `GET /scheduling/demand`

### 手动验证场景

- 周六下午高峰生成更多美容师。
- 某美容师请假后不被安排。
- 已确认预约的美容师和时段被保留。
- 调整一个时段后评分变化。
- 有冲突时发布失败。

## 开发排期建议

### 第 1 周：规则与评估

- 新增规则配置和请假/可用时间模型。
- 实现冲突检测。
- 实现班表评分。
- 增加 evaluate 接口。

### 第 2 周：智能生成

- 实现需求热力图。
- 实现 copy last week + optimize。
- 实现 preview 接口。
- 生成解释和风险列表。

### 第 3 周：前端体验

- 增加智能排班配置弹窗。
- 增加评分和风险面板。
- 增加预览态和发布态。
- 增加冲突角标。

### 第 4 周：发布与测试

- 实现 publish 接口。
- 补单元测试和接口测试。
- 跑通真实门店演示数据。
- 整理操作说明。

## 后续升级方向

### 约束求解器

当门店规模、员工数量、规则复杂度上来后，可以评估接入：

- Google OR-Tools CP-SAT。
- Timefold Solver。
- OptaPlanner。

这类工具适合处理硬约束、软约束、评分和组合优化，比大模型更适合作为排班核心。

### AI 助手

AI 放在智能排班稳定之后做：

- “为什么这样排”的解释。
- “帮我下周六多排晚班”的自然语言配置。
- 排班周报。
- 异常改派建议。

AI 输出必须转成结构化规则，再由排班引擎校验，不直接写库。

## 外部参考

- Google OR-Tools Employee Scheduling：`https://developers.google.com/optimization/scheduling/employee_scheduling`
- Google OR-Tools Constraint Optimization：`https://developers.google.com/optimization/cp/`
- Timefold Employee Shift Scheduling Constraints：`https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/constraints`
- Timefold Demand-based Scheduling：`https://docs.timefold.ai/employee-shift-scheduling/latest/shift-service-constraints/demand-based-scheduling`
- OptaPlanner Employee Rostering：`https://optaplanner.io/learn/useCases/employeeRostering.html`
