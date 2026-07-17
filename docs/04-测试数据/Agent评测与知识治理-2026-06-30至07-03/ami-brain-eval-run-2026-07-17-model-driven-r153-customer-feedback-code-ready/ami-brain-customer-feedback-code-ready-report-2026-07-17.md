# Ami Brain 客户投诉与满意度代码就绪报告

## 一、结论

本轮完成客户投诉、满意度和美容师客诉排行的代码闭环，但尚未完成数据库落地和真实门店评测。准确状态是：

> 管理端、后端、统一业务语义和 Ami Brain 专用能力均已代码就绪；迁移历史不一致阻止新事实表落库，因此三条目标问题当前不能计入真实可用率。

## 二、覆盖问题

1. `最近有没有客户投诉或者表达不满`
2. `帮我看一下客户满意度整体情况`
3. `哪个美容师的客诉最多，最近有没有`

## 三、交付链路

| 层级 | 交付 |
| --- | --- |
| Prisma | `CustomerServiceFeedback` 统一事实模型与 `20260717220000_customer_service_feedback_core` migration |
| 后端 API | `/customer-feedback` 查询、详情、录入、更新、统计 |
| 管理端 | `/customers/feedback` 客户反馈工作台 |
| Ami Brain | `customer_feedback_overview` 专用能力 |
| 统一业务语义 | 投诉数、未解决投诉数、平均满意度、采集覆盖率、员工客诉数 |
| 评测口径 | 650 题期望指标加入投诉、满意度、覆盖率和员工客诉 |

## 四、产品回答合同

### 4.1 投诉概览

- 返回投诉总数、未解决投诉数、反馈总数和评价采集覆盖率。
- 无投诉记录时不说“客户都满意”，必须披露已完成服务中有多少采集到反馈。

### 4.2 满意度概览

- 有评分时返回平均分、有效评分数、低分数和覆盖率。
- 无有效评分时返回“未采集”，不得展示为 0 分。

### 4.3 员工客诉排行

- 只按关联美容师的投诉事实排序。
- 不使用服务量、业绩、提成、复购率或综合表现分替代客诉。
- 未关联美容师的投诉保留在门店投诉总数，但不进入个人排行。

## 五、权限与安全

- 查询和统计：`core:customer:view`。
- 录入和处理：`core:customer:update`。
- Brain 使用：`core:brain:use` + `core:customer:view`。
- 允许角色：`store_manager`、`customer_service`。
- 所有查询强制当前门店；写入前验证关联客户、服务任务、预约、订单、美容师和项目属于当前门店。
- migration 对反馈类型、评分范围、风险级别和处理状态增加数据库 CHECK 约束。

## 六、自动语义候选

静态扫描总结果：

| 项目 | 数量 |
| --- | ---: |
| 总候选 | 3911 |
| Draft | 3500 |
| Blocked | 411 |
| Metric | 107 |
| Dimension | 13 |
| Ontology | 3791 |

本轮五项指标全部为 `draft`，`blockedReasons` 为空：

- `customer_complaint_count`
- `customer_unresolved_complaint_count`
- `customer_average_satisfaction_rating`
- `customer_feedback_collection_coverage_rate`
- `staff_customer_complaint_count`

扫描临时证据：

`C:\Users\huawie\AppData\Local\Temp\ami-brain-semantic-candidates-25816.json`

## 七、验证结果

| 验证 | 结果 |
| --- | --- |
| 客户反馈 service/controller | 2 suite，4 test 通过 |
| 业务语义与能力定向测试 | 7 suite，124 test 通过 |
| 查询模板与候选生成复核 | 2 suite，44 test 通过 |
| Brain 全量回归 | 133 suite 通过，1 suite 跳过；1686 test 通过，1 test 跳过 |
| 后端构建 | 通过 |
| 管理端 API 测试 | 1 suite，2 test 通过 |
| 管理端生产构建 | typecheck 和 Vite build 通过 |
| 浏览器 | 未登录访问正确跳转 `/login`；无登录会话，登录后页面未做视觉验收 |

## 八、数据库阻塞

`prisma migrate status`：

- 本地 migration 数：97。
- 最后共同 migration：`20260715095000_store_manager_brain_read_permissions`。
- 本地待应用：
  - `20260717130000_store_manager_supply_manage_permission`
  - `20260717220000_customer_service_feedback_core`
- 数据库存在但当前分支缺失：
  - `20260715150000_store_metrics_core`

未执行 migration、真实反馈录入、候选同步、fixture 验证、evaluation release 创建或真实题目评测。

## 九、下一步门禁

1. 集成缺失 migration 历史并重新确认 `prisma migrate status`。
2. 单独授权后应用 migration，核验表、约束、索引和跨门店隔离。
3. 通过真实业务流程采集反馈，禁止向生产门店写评测假数据。
4. 同步并验证五项候选定义，创建 evaluationOnly release。
5. 运行三题 targeted、店长前 50 题和 P0 120 题。
6. 验收要求：三题真实可用、假阳性 0、未采集误判 0、跨门店读取 0。
