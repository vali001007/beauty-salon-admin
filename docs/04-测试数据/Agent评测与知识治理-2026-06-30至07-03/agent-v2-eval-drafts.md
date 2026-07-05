# Agent V2 Eval 草稿

生成时间：2026-07-03 14:49:06 Asia/Shanghai
来源问题库：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md

## 摘要

- 草稿总数：650
- P1：87
- P2：460
- 未匹配能力：418
- 契约通过：232
- 需复核：418
- 阻断：0

## Eval 草稿列表

| ID | 问题 | 角色 | 期望意图 | 期望能力 | 输出 | 权限 | 契约 | 失败分类 | 优先级 | 待确认 |
|---|---|---|---|---|---|---|---|---|---|---|
| q001 | 今天店里情况怎么样，给我来个总结 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q002 | 今天营业额到多少了 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q003 | 今天来了几个客人，现在还有几个在店 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q004 | 今天和昨天比营业额差多少 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 本周跟上周比，哪天差距最大 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q006 | 这个月目标完成率多少了，还差多远 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q007 | 今天客单价多少，跟平时比怎么样 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q008 | 今天有没有什么异常情况我需要知道 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 现在店里哪些美容师在忙，哪些空着 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q010 | 今天退款有几笔，金额多少 | 店长经营 Agent | metric_summary | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q011 | 这个月跟上个月比收入差多少 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q012 | 今天新客老客各来了几个 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q013 | 现在几点了，下午还有几个预约 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q014 | 今天哪个项目做得最多 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 今天最大的一笔消费是多少 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q016 | 今天折扣优惠送出去多少钱 | 店长经营 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q017 | 最近三天营业额趋势怎么样 | 店长经营 Agent | trend_analysis | finance.revenue.trend | kpi/chart/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q018 | 这周有没有哪天特别差，为什么 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q019 | 今天现金收了多少，微信支付宝各多少 | 店长经营 Agent | metric_summary | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q020 | 今天储值卡消耗了多少，新充值了多少 | 店长经营 Agent | metric_summary | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q021 | 最近哪些老客好久没来了，帮我列一下 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 上个月新来了多少新客，转化了多少 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 我们店里的 VIP 客户有多少个 | 店长经营 Agent | metric_summary | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q024 | 哪些客户卡里的次数快用完了还没约 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q025 | 最近有没有客户投诉或者表达不满 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q026 | 这个月流失了多少客户，主要是什么原因 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q027 | 哪些客户是高价值但最近不太活跃的 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q028 | 帮我看一下今天到店客人的画像，主要是什么年龄段 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q029 | 我们的老客回头率大概是多少 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q030 | 有没有哪些客户快到生日了可以做关怀 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q031 | 帮我找一下三个月没来消费的客户 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q032 | 哪些客户消费了钱但很少用次卡 | 店长经营 Agent | record_lookup | customer.consumption.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q033 | 最近有没有客户因为等待时间长而离开 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q034 | 我们有多少客户开了次卡但从来不来消费 | 店长经营 Agent | metric_summary | finance.card-package-sales.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q035 | 今天有没有重要客户来店，需要特别关注的 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q036 | 哪些沉睡客户最近有点被唤醒的迹象 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q037 | 帮我看一下客户满意度整体情况 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q038 | 这个月新客主要来自什么渠道 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 老客户平均多久回来一次 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q040 | 哪些客户最近消费频率明显下降 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q041 | 这个月谁的业绩最好 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q042 | 哪个美容师接的客人最多 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q043 | 谁的客户复购率最高 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q044 | 有没有员工这周业绩明显下滑 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q045 | 这个月提成最高的是谁，大概多少 | 店长经营 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q046 | 各美容师今天的排班情况，有没有空档 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q047 | 今天谁请假了，有没有影响接待 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 哪个美容师的客诉最多，最近有没有 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q049 | 新员工试用期表现怎么样 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 帮我看一下各美容师的服务次数对比 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q051 | 今天谁服务了几个客人 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q052 | 哪个员工这个月进步最快 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q053 | 有没有员工最近很长时间没有新客了 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q054 | 本月员工总提成大概多少 | 店长经营 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q055 | 哪个美容师擅长的项目客户最满意 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q056 | 有没有员工到期转正需要我处理 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 最近有没有员工出现迟到早退 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q058 | 哪个美容师的升单能力最强 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 帮我看一下员工这周的工作饱和度 | 店长经营 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q060 | 有没有员工的客户被别的美容师挖走的迹象 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q061 | 现在哪些产品库存不够了 | 店长经营 Agent | record_lookup | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q062 | 有没有快过期的产品，数量多少 | 店长经营 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q063 | 这个月耗材用了多少，正常吗 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q064 | 最近卖得最好的产品是什么 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q065 | 有什么产品积压太久了 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q066 | 下次采购需要补什么货 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q067 | 现在库存金额大概多少 | 店长经营 Agent | metric_summary | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q068 | 有没有哪个项目因为缺耗材没法做 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q069 | 这个月产品销售额是多少 | 店长经营 Agent | metric_summary | order.product.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q070 | 最近采购了什么，花了多少钱 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q071 | 有没有产品快断货但还没采购的 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q072 | 临期产品怎么处理比较好 | 店长经营 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q073 | 哪些耗材消耗速度最快 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q074 | 现在仓库里护肤品还有多少 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q075 | 有没有产品卖出去的价格低于成本的 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q076 | 最近有没有收到供应商的涨价通知 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q077 | 这个月退货了多少，原因是什么 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q078 | 哪些产品毛利率最高 | 店长经营 Agent | metric_summary | finance.product-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q079 | 库存的周转率怎么样 | 店长经营 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q080 | 帮我生成一份补货建议 | 店长经营 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q081 | 今天有没有什么需要我特别注意的风险 | 店长经营 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q082 | 最近有没有现金流异常的情况 | 店长经营 Agent | diagnose_with_evidence | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q083 | 这周预约爽约率高不高 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q084 | 有没有大额异常退款我不知道的 | 店长经营 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q085 | 店里设备最近有没有什么问题 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q086 | 今天有没有超时服务影响了下一个预约 | 店长经营 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q087 | 最近折扣幅度有没有超出正常范围的 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q088 | 有没有员工在没有授权的情况下给了额外优惠 | 店长经营 Agent | diagnose_with_evidence | finance.discount-permission-risk.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q089 | 这个月利润率下降原因是什么 | 店长经营 Agent | diagnose_with_evidence | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q090 | 有没有客户最近投诉了但我还没处理 | 店长经营 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q091 | 最近储值卡提现风险高不高 | 店长经营 Agent | trend_analysis | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q092 | 有没有次卡即将过期但客户还有很多余量 | 店长经营 Agent | diagnose_with_evidence | card.package.status.lookup | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q093 | 今天有没有超过接待能力的情况 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q094 | 最近某个美容师的客户流失率异常高吗 | 店长经营 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q095 | 有没有项目成本明显上涨影响毛利的 | 店长经营 Agent | diagnose_with_evidence | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q096 | 最近有没有出现服务事故或皮肤过敏的情况 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q097 | 这个月有没有收到很多差评或负面反馈 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q098 | 最近有没有员工离职带走客户的风险 | 店长经营 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q099 | 店里消防安全检查需要做吗 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q100 | 今天有没有需要我马上处理的紧急事项 | 店长经营 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q001 | 我想做个召回活动，哪些客户最值得联系 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q002 | 帮我找一下45天没来的客户，大概有多少人 | 营销增长 Agent | metric_summary | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q003 | 哪些客户买了次卡但最近一直不来用 | 营销增长 Agent | record_lookup | card.package.inactive-customers.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q004 | 有没有之前消费很多但突然消失的客户 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q005 | 新客中哪些人最有潜力转成长期客户 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q006 | 帮我找一下对我们上次活动有响应的客户 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q007 | 哪些客户是只来一次就再没回来的 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q008 | 有没有客户对某个项目特别感兴趣但还没办卡 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q009 | 帮我找下这个月快过生日的客户 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q010 | 哪些客户最近消费明显减少 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q011 | 我想做个高端护理套餐推广，找哪些客户合适 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q012 | 帮我把客户按消费金额分一下层 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q013 | 最近新客转化效果好不好，问题出在哪 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q014 | 有没有客户对优惠很敏感，老是等打折才来 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q015 | 哪些客户推荐过新人来，转介绍能力强 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q016 | 帮我找一下只做过基础项目没有升单的客户 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q017 | 有没有客户用过会员权益但感觉不是很满意 | 营销增长 Agent | diagnose_with_evidence | customer.coupon.status.lookup | table/evidence_panel/data_gap | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q018 | 最近哪个时间段新客最多，从哪些渠道来 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q019 | 帮我找一下办了卡但还没预约的新客 | 营销增长 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q020 | 疗程快结束的客户有多少，适合推续购 | 营销增长 Agent | metric_summary | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q021 | 帮我策划一个母亲节的促销活动 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 国庆节前后我应该做什么活动 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 夏天快来了，有什么适合推的季节性项目 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q024 | 我想做个老带新的活动，怎么设计比较合理 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q025 | 帮我策划一个针对沉睡客户的召回方案 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q026 | 年底有哪些营销节点我应该提前准备 | 营销增长 Agent | record_lookup | marketing.agent.automations.effects.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q027 | 我想推一个储值送赠品的活动，怎么设计 | 营销增长 Agent | explain_with_evidence | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q028 | 帮我想个适合在朋友圈发的活动主题 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q029 | 我想做一个次卡促销，折扣力度给多少合适 | 营销增长 Agent | metric_summary | finance.card-package-sales.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q030 | 帮我设计一个新客专属的欢迎礼包 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q031 | 最近销售下滑，有什么活动可以拉动一下 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q032 | 我们店三周年了，做什么活动比较有意义 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q033 | 如何设计一个让客户主动发朋友圈的活动 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q034 | 帮我策划一个回馈老客的感恩活动 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q035 | 我想推一个疗程套餐，定价和权益怎么设计 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 有没有不用打折也能吸引客户来的方法 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q037 | 帮我做一个针对 VIP 客户的专属活动 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q038 | 情人节快到了，适合推什么项目或活动 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 如何设计一个让客户愿意提前预约的方案 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q040 | 帮我策划一个线上引流到线下体验的活动 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q041 | 帮我写一条发给60天没来客户的召回消息 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q042 | 给下周要来的客户写一条提醒消息 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q043 | 帮我写个朋友圈文案推一下我们的新项目 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q044 | 给刚来店体验过的新客写一条跟进话术 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q045 | 帮我写一条推荐疗程续购的私信 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q046 | 给即将到期的次卡客户写一条温馨提醒 | 营销增长 Agent | record_lookup | card.package.status.lookup | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q047 | 帮我写一个活动通知，发给全体会员 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 写一条推荐客户带朋友来体验的邀请话术 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q049 | 帮我写个生日祝福加优惠的消息模板 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 写一条引导客户给好评或推荐的话术 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q051 | 帮我写个给冷淡客户重新建立联系的话术 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q052 | 给首次办卡的客户写一条欢迎词 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q053 | 帮我写一段向客户介绍新员工的文案 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q054 | 写一条提醒客户预约空档时间的消息 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q055 | 帮我写个针对男性客户的推广文案 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q056 | 写一条解释疗程效果需要坚持的话术 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 给消费满额的客户写一条回馈感谢消息 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q058 | 帮我写一条推荐产品的朋友圈文案 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 写一条适合私信给沉默了很久的老客户的话 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q060 | 帮我写个短视频脚本介绍我们的主打项目 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q061 | 上次那个满减活动效果怎么样 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q062 | 我给客户发了优惠券，核销率高不高 | 营销增长 Agent | record_lookup | marketing.coupon-redemption.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q063 | 这个月活动花了多少钱，带来了多少收入 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q064 | 哪种权益对客户吸引力最大 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q065 | 帮我算一下如果打八折，毛利还剩多少 | 营销增长 Agent | metric_summary | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q066 | 免费体验活动来的客人转化率多少 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q067 | 送赠品和打折哪种方式效果更好 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q068 | 我们的优惠券平均核销周期是多久 | 营销增长 Agent | explain_with_evidence | marketing.coupon-redemption.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q069 | 这个月进店的客人里有多少是被活动吸引来的 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q070 | 帮我评估一下推疗程套餐和推单次消费哪个更划算 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q071 | 储值赠送方案定在什么比例客户更愿意储值 | 营销增长 Agent | record_lookup | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q072 | 最近一次活动有没有带来持续复购的客户 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q073 | 帮我看一下这个季度营销投入回报情况 | 营销增长 Agent | explain_with_evidence | marketing.agent.automations.effects.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q074 | 哪个渠道带来的客户质量最好 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q075 | 拼团活动客户买单了但来了几次就不来了，怎么提升留存 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q076 | 帮我分析一下为什么上次活动转化率低 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q077 | 免费次卡换来的客户和付费客户的消费行为有什么差异 | 营销增长 Agent | record_lookup | card.package.free-vs-paid.behavior.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q078 | 这个月发了多少优惠，有没有被滥用的情况 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q079 | 如果我把新客首单价格降低，长期来看划算吗 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q080 | 帮我评估一下现在的会员体系有没有问题 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q081 | 帮我设置一个客户45天没来自动发提醒的规则 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q082 | 我想让系统自动给快过期次卡的客户发消息 | 营销增长 Agent | record_lookup | card.package.status.lookup | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q083 | 能不能在客户生日当天自动送一个小礼物 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q084 | 帮我设置一个新客来店三天后自动跟进的流程 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q085 | 如何让系统自动识别高流失风险的客户并提醒我 | 营销增长 Agent | record_lookup | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q086 | 我想在每次服务结束后自动发一条感谢消息 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q087 | 能不能根据客户消费习惯自动推荐下次预约时间 | 营销增长 Agent | record_lookup | customer.consumption.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q088 | 帮我设置一个超过一定金额消费自动升级会员等级的规则 | 营销增长 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q089 | 有没有办法让系统自动识别客户的节假日并发关怀 | 营销增长 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q090 | 帮我设计一个从新客到老客的自动化培育流程 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q091 | 能不能在客户消费后自动给她推荐下一个适合的项目 | 营销增长 Agent | record_lookup | customer.consumption.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q092 | 我想自动收集每次服务后的客户满意度 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q093 | 帮我设置一个低活跃度客户的自动唤醒流程 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q094 | 能不能根据库存临期自动触发促销给合适的客户 | 营销增长 Agent | record_lookup | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q095 | 帮我做一个疗程快结束时自动提醒续购的规则 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q096 | 如何自动识别并感谢转介绍新客的老客户 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q097 | 帮我设置一个活动后自动复盘效果的提醒 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q098 | 能不能在员工空档时自动推送客户填满档期 | 营销增长 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q099 | 我想在特定节日前三天自动准备活动方案 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q100 | 帮我检查一下现在有哪些自动化规则在运行，效果怎么样 | 营销增长 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q001 | 帮我查一下张雯，她上次来是什么时候 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q002 | 有个客人说她叫李梅，手机尾号3256，帮我找一下 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q003 | 这个客人有没有在我们店消费过 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q004 | 帮我查一下这个客人有没有预约 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 她上次做的什么项目，有没有特别备注 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q006 | 这位客人是什么会员等级 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q007 | 帮我看一下这个客人的消费记录 | 前台接待 Agent | record_lookup | customer.consumption.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q008 | 她的皮肤有没有什么过敏或者特殊注意事项 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 这个客人有没有欠款或者退款记录 | 前台接待 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q010 | 她上次来有没有表达过什么不满 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q011 | 这位客人之前是哪个美容师服务的 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q012 | 帮我搜一下今天预约了但还没来的客人 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q013 | 有个客人刚进门，叫王芳，帮我快速看一下她的情况 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q014 | 这个客人有没有办过卡，还有多少次 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 她喜欢什么时间来，有没有固定的习惯 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q016 | 帮我找一下今天预约了但是要改期的客人 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q017 | 这位客人之前有没有对某个产品表示感兴趣 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q018 | 她有没有给我们推荐过新客户 | 前台接待 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q019 | 帮我看一下这个客人的标签和备注 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q020 | 这个客人的储值余额还有多少 | 前台接待 Agent | metric_summary | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q021 | 她有没有参加过我们的活动 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 这个客人是从哪个渠道来的 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 帮我看一下今天所有到店客人的基本信息 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q024 | 有个客人说她家人也来过，帮我找一下 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q025 | 这位客人有没有未核销的优惠券 | 前台接待 Agent | diagnose_with_evidence | customer.coupon.status.lookup | table/evidence_panel/data_gap | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q026 | 今天下午还有几个预约没到 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q027 | 现在几点了，下一个预约是谁，什么时候 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q028 | 今天所有的预约给我列一下 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q029 | 帮我查一下明天的预约情况 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q030 | 张美丽的预约是几点，做什么项目 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q031 | 有没有预约了但还没确认的客人 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q032 | 今天有没有可能爽约的预约需要提前联系 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q033 | 下午3点那个预约是谁，有什么要注意的 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q034 | 这周哪天最忙，哪天还有空档 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q035 | 帮我看一下今天赵美容师的预约安排 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 有客人想改期，帮我看看明天有没有空档 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q037 | 今天有没有超时的预约影响到下一个 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q038 | 帮我确认一下明天所有预约都通知到位了吗 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 今天有预约的客人里有没有 VIP 需要特别准备 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q040 | 有个客人临时来了没预约，现在还能安排吗 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q041 | 今天有没有需要特别准备物品的预约 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q042 | 帮我看一下这周的预约密度，哪里有空位 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q043 | 有客人说她下午有预约但我找不到记录 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q044 | 今天有几个预约是做面部的，几个是身体的 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q045 | 帮我统计一下今天的到店率，爽约了几个 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q046 | 有没有预约超过两小时没有确认的 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q047 | 帮我提醒一下明天上午的所有预约客人 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 今天下午最后一个预约是几点，是谁 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q049 | 本周有没有某个美容师排得特别满，需要调整 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 帮我看一下这个月预约最多的是哪几天 | 前台接待 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q051 | 这个客人用次卡核销，帮我看一下她的次卡情况 | 前台接待 Agent | explain_with_evidence | card.usage.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q052 | 帮我打开收银界面，客人要结账了 | 前台接待 Agent | navigation_action | navigation.cashier.open | action_card/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q053 | 这个客人说她有优惠券，帮我查一下 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q054 | 客人要充值，帮我看一下充值套餐有哪些 | 前台接待 Agent | record_lookup | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q055 | 这笔单子用什么支付方式，微信还是现金 | 前台接待 Agent | explain_with_evidence | cashier.payment.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q056 | 帮我算一下这个客人今天消费多少，该收多少钱 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 客人说她的次卡还有余量，帮我确认一下 | 前台接待 Agent | explain_with_evidence | card.package.status.lookup | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q058 | 这个客人买产品有会员折扣吗 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 帮我开具今天消费的收据或发票 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q060 | 这个客人要退款，原因是项目没做完，怎么处理 | 前台接待 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q061 | 帮我查一下今天收了多少现金 | 前台接待 Agent | metric_summary | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q062 | 这个客人说她上次有预存的金额，帮我查一下 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q063 | 今天有几笔是用储值卡消费的 | 前台接待 Agent | explain_with_evidence | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q064 | 这个客人消费满多少可以升级会员 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q065 | 帮我查一下上周某天的收款记录 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q066 | 有个客人说她付了款但没有记录，帮我核查 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q067 | 今天刷卡消费有几笔，金额多少 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q068 | 帮我打开核销界面，客人要用次卡 | 前台接待 Agent | navigation_action | navigation.card-usage.open | action_card/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q069 | 这个客人的次卡有效期还有多久 | 前台接待 Agent | explain_with_evidence | card.package.status.lookup | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q070 | 帮我看一下今天所有的收款明细 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q071 | 这个客人之前有没有欠款 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q072 | 她买产品还是做项目，分别怎么结算 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q073 | 今天第一笔收款是几点，是谁的 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q074 | 帮我查一下这个月已经收了多少钱 | 前台接待 Agent | metric_summary | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q075 | 有客人申请退卡，流程是什么 | 前台接待 Agent | needs_capability_mapping | order.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q076 | 现在店里有几个客人在，分别做什么 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q077 | 李美容师现在在忙吗，大概还要多久 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q078 | 我们店现在有没有空余的床位 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q079 | 帮我看一下今天哪个美容师可以接新单 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q080 | 这个客人等了很长时间，帮我安抚一下，说什么比较好 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q081 | 有个客人问我们推荐什么项目，她是新客皮肤偏干 | 前台接待 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q082 | 这个客人问最近有没有什么优惠活动 | 前台接待 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q083 | 客人要买产品带走，我们现在有什么产品可以卖 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q084 | 有客人问洗手间怎么走，顺便问问有没有什么她能做的项目 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q085 | 这个客人说她过敏，之前记录了什么 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q086 | 帮我查一下我们店的停车指引或者位置信息 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q087 | 有客人说上次做的项目效果不好，我应该怎么回应 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q088 | 这个客人想换一个美容师，怎么处理比较好 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q089 | 今天来了一个新客人，我应该介绍什么 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q090 | 客人等待时间太长，我能给她什么补偿或安抚 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q091 | 有个客人说她想试一个新项目，适合她吗 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q092 | 这个客人要求开发票，我怎么操作 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q093 | 有客人问我们营业时间，周末有没有加班 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q094 | 这个客人想带朋友一起来，能同时安排吗 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q095 | 有客人说要投诉，我应该怎么处理 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q096 | 帮我查一下今天下午哪个时段可以加客 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q097 | 客人问礼品卡怎么使用，帮我解释一下 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q098 | 这个客人要改变服务内容，临时加项目可以吗 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q099 | 今天有没有员工没到岗，怎么影响接待 | 前台接待 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q100 | 帮我记录一下这个客人今天反映的问题 | 前台接待 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q001 | 我今天有几个客人，分别几点 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q002 | 下一个客人是谁，做什么项目 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q003 | 我今天第一个客人几点来 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q004 | 下午那个客人叫什么名字，有什么要注意的 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 今天最后一个客人几点结束 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q006 | 我今天有没有空档，几点到几点 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q007 | 下一个客人上次做了什么，有没有什么特殊要求 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q008 | 今天我总共要服务几个小时 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 有没有客人临时取消了，我可以提前下班吗 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q010 | 我今天的客人里有没有首次来的新客 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q011 | 下一个客人有没有皮肤过敏或者什么注意事项 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q012 | 今天有哪个客人是比较难服务的，需要注意什么 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q013 | 我现在服务完这个客人，下一个几点来 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q014 | 今天有没有安排我去做培训或其他任务 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 下午两点那个客人想做什么项目 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q016 | 我今天要用到什么产品和耗材 | 美容师服务 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q017 | 今天有没有客人提前到了在等我 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q018 | 我这周的排班是怎样的 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q019 | 帮我看一下今天客人的护理历史 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q020 | 我今天最后一个客人结束后还有没有安排 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q021 | 下一个客人的疗程做到哪一步了 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 今天有没有需要我帮客人续卡或者推荐项目的 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 我今天的客人里有没有 VIP 需要特别对待 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q024 | 下一个客人最近情绪状态怎么样，需要特别关心吗 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q025 | 帮我看一下今天整体的服务流程安排 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q026 | 这个客人皮肤类型是什么，适合做什么护理 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q027 | 她上次反映皮肤有点干，这次应该用什么产品 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q028 | 这个客人有过敏史，做项目前我需要注意什么 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q029 | 她的疗程做了几次了，还有几次 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q030 | 这次护理后我应该给她什么建议 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q031 | 这个客人说她最近压力大，皮肤状态差，怎么建议 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q032 | 她上次护理后反映有点红，这次怎么调整 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q033 | 这个客人年龄偏大，适合推荐什么抗老项目 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q034 | 她一直在做同一个项目，我应该推荐她升级吗 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q035 | 这个客人皮肤最近出油多，护理重点应该放在哪里 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 她问我护理后回家怎么保养，我怎么回答 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q037 | 这次服务完我应该推荐她预约哪个项目 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q038 | 这个客人皮肤有色斑，我应该重点关注什么 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 她的护理周期建议是多久来一次 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q040 | 这个客人问我们最新的护理项目是什么，有什么特点 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q041 | 她上次问过某个仪器项目，我该怎么介绍 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q042 | 这个客人皮肤比较敏感，用什么护理方案最安全 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q043 | 她最近在家用什么护肤品，和我们的方案冲突吗 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q044 | 这个客人问为什么护理效果没有朋友说的好 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q045 | 她下次应该做什么，间隔多久比较合适 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q046 | 这个客人的护肤目标是什么，我应该怎么制定方案 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q047 | 她问做完护理可以化妆吗，我怎么回答 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 这个客人皮肤最近特别暗沉，有什么针对性建议 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q049 | 她之前做过的项目哪个效果最好 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 这个客人想改变护理方向，我怎么给她分析 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q051 | 帮我记录今天这个客人做了什么，有什么反馈 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q052 | 这次护理用了哪些产品，消耗了多少 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q053 | 客人今天说皮肤有改善，帮我记录一下 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q054 | 我想给这个客人写一个护理总结 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q055 | 帮我记录一下客人这次的特殊需求 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q056 | 这个客人今天护理完皮肤状态怎么样，我怎么描述 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 帮我建一个跟进任务，提醒我两周后联系这个客人 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q058 | 这个客人今天表示很满意，我能不能请她推荐朋友 | 美容师服务 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 帮我记录一下这次用的仪器参数 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q060 | 客人护理结束后说想买一瓶精华，帮我记一下 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q061 | 这个客人问能不能下次带老公来做项目，帮我记录 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q062 | 服务结束后我应该说什么话送客人 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q063 | 这次护理发现客人有一处皮肤问题，怎么记录和处理 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q064 | 帮我查一下上次给这个客人做护理时记了什么 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q065 | 这个客人今天对某个产品不满意，帮我记录一下 | 美容师服务 Agent | record_lookup | order.product.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q066 | 服务中我发现客户皮肤状态有明显变化，怎么记录 | 美容师服务 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q067 | 帮我写一份这个客人三个月的护理进度总结 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q068 | 这次服务完我应该推荐她做什么预约 | 美容师服务 Agent | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q069 | 客人说想改变护理方案，我应该怎么和她沟通 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q070 | 帮我记录这次服务时长和具体操作步骤 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q071 | 这个客人提出了一个我不确定的皮肤问题，怎么办 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q072 | 帮我设置一个提醒，下个月初联系这个客人 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q073 | 这次护理结束后需要给客人发什么跟进消息 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q074 | 客人今天疗程结束了，帮我记录最终效果 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q075 | 我想给这个客人推荐一个新的护理方向，怎么记录 | 美容师服务 Agent | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q076 | 我这个月业绩是多少 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q077 | 我这个月目标完成了多少 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q078 | 我今天已经做了几个客人，收入多少 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q079 | 我的提成这个月大概是多少 | 美容师服务 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q080 | 我这个月比上个月进步了多少 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q081 | 我在店里的业绩排名第几 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q082 | 我还需要做多少业绩才能完成本月目标 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q083 | 我这个月服务了多少客人 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q084 | 我的复购率在店里算高还是低 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q085 | 我做得最好的项目是什么 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q086 | 我的客户有多少是老客户 | 美容师服务 Agent | metric_summary | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q087 | 有没有哪个客户最近好久没来了，我应该联系一下 | 美容师服务 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q088 | 我这个月升单做得怎么样 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q089 | 我昨天的提成是多少 | 美容师服务 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q090 | 我的客户满意度高不高 | 美容师服务 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q091 | 这个月还有几天，我能完成目标吗 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q092 | 我上个月业绩是多少，跟这个月比怎么样 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q093 | 有没有客户反映对我的服务不满意 | 美容师服务 Agent | diagnose_with_evidence | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q094 | 我接过最长服务的客人是谁，做了什么 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q095 | 我这个月新客转化了几个 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q096 | 我的技术培训记录是什么，还有哪些没完成 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q097 | 我这个月迟到或者请假了几次 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q098 | 我做的哪类项目客户最满意 | 美容师服务 Agent | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q099 | 有没有老板对我最近的表现有什么反馈 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q100 | 帮我分析一下我的业绩为什么这个月低了 | 美容师服务 Agent | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q001 | 现在哪些东西快没了 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q002 | 帮我看一下库存整体情况 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q003 | 有没有什么产品只剩最后几瓶了 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q004 | 这个月用了多少洗面奶，还剩多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 精华液现在库存还有多少 | 库存采购 Agent | metric_summary | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q006 | 帮我看一下所有低于安全库存的产品 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q007 | 仓库里有多少货，大概值多少钱 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q008 | 哪些产品这周消耗特别快 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 现在缺货最紧急的是什么 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q010 | 有没有产品一直有但从来不用的 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q011 | 这个月库存消耗和上个月比有没有异常 | 库存采购 Agent | diagnose_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q012 | 帮我看一下补水系列产品的库存 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q013 | 我们的防晒产品还有多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q014 | 服务用的一次性耗材还够用多久 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 哪些产品的安全库存线设得不合理 | 库存采购 Agent | record_lookup | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q016 | 帮我查一下某个供应商上次送货的情况 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q017 | 这个月采购了多少钱的货 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q018 | 有没有产品一直在消耗但一直没有采购 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q019 | 现在门店和仓库的库存加起来有多少 | 库存采购 Agent | metric_summary | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q020 | 哪些产品的周转率最低 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q021 | 帮我统计一下这季度每个产品的用量 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 有没有最近需求突然增加的产品 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 我们的理疗仪器耗材还够用多少次 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q024 | 最贵的那几样耗材现在库存怎么样 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q025 | 帮我看一下今天进出库的记录 | 库存采购 Agent | record_lookup | inventory.stock.operation.draft | action_card/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q026 | 哪些产品快过期了，还有多少 | 库存采购 Agent | metric_summary | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q027 | 帮我看一下30天内要过期的东西 | 库存采购 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q028 | 有没有已经过期的产品还在用 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q029 | 这批快过期的产品怎么处理最合适 | 库存采购 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q030 | 有没有办法在过期前把这些产品消耗掉 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q031 | 我们一般临期产品是怎么处理的 | 库存采购 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q032 | 这个月有没有因为过期而损耗的产品 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q033 | 哪些产品最容易过期，需要重点关注 | 库存采购 Agent | record_lookup | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q034 | 帮我制定一个临期产品的消化方案 | 库存采购 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q035 | 进货太多导致积压的产品有哪些 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 有没有产品开了之后很长时间还没用完 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q037 | 帮我计算一下这批临期货品的损失金额 | 库存采购 Agent | explain_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q038 | 过期的护肤品怎么处理，有没有规定 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q039 | 最近有没有因为保存不当导致产品变质 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q040 | 帮我查一下我们的库存损耗率高不高 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q041 | 有没有办法减少临期产品的出现 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q042 | 我们每个月大概会损耗多少货值 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q043 | 有没有供应商可以接受临期产品退换货 | 库存采购 Agent | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q044 | 帮我算一下如果做促销可以消化多少临期货 | 库存采购 Agent | metric_summary | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q045 | 临期产品的优惠力度给多少合理 | 库存采购 Agent | metric_summary | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q046 | 下次采购要买什么，给我列一个清单 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q047 | 这个月需要补多少基础护肤品 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 哪些东西需要马上采购不能等了 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q049 | 帮我看一下每个供应商上次报价 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 我们常用的哪个供应商性价比最好 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q051 | 帮我生成一份本月的采购计划 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q052 | 这批补水精华买多少量比较合适 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q053 | 有没有供应商最近有优惠活动 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q054 | 帮我比较一下两个供应商的价格 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q055 | 帮我估算一下这次采购大概要花多少钱 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q056 | 这个产品最近涨价了，要不要提前多备一些 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 帮我看一下历史采购记录，我们一般一次买多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q058 | 采购时有没有什么需要特别注意的资质问题 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 帮我生成一份发给供应商的询价单 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q060 | 有没有国内供应商可以替代进口的 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q061 | 这个月原材料价格有没有上涨趋势 | 库存采购 Agent | diagnose_with_evidence | finance.revenue.trend | kpi/chart/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q062 | 节假日前要不要多备一些货 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q063 | 帮我看一下各品类的最低采购量要求 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q064 | 我们和供应商的账期是怎么约定的 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q065 | 有没有哪个产品可以换个供应商降低成本 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q066 | 帮我核对一下这张采购单的数量和价格 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q067 | 最近有没有新的更好的供应商可以考虑 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q068 | 我们的库存周转目标是多少天，达到了吗 | 库存采购 Agent | metric_summary | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q069 | 这批货什么时候能到，影响不影响使用 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q070 | 帮我设置一个当某产品低于安全库存就提醒我的规则 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q071 | 这个月哪个项目消耗耗材最多 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q072 | 平均每个客人消耗多少耗材 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q073 | 这个项目的标准耗材用量是多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q074 | 有没有美容师用料比标准多很多的情况 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q075 | 这个月各项目的耗材成本各是多少 | 库存采购 Agent | metric_summary | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q076 | 帮我看一下耗材成本占服务收入的比例 | 库存采购 Agent | metric_summary | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q077 | 有没有耗材被浪费或者使用不规范的情况 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q078 | 这个季度耗材消耗和收入的对比怎么样 | 库存采购 Agent | metric_summary | finance.revenue.trend | kpi/chart/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q079 | 帮我分析一下哪个项目的耗材成本最高 | 库存采购 Agent | record_lookup | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q080 | 如果接待量增加20%，库存够用吗 | 库存采购 Agent | explain_with_evidence | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q081 | 我们每天大概消耗多少清洁类耗材 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q082 | 最近消耗异常的产品有没有 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q083 | 帮我看一下这个项目的理论耗材和实际差多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q084 | 有没有可以用替代品降低耗材成本的地方 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q085 | 这个月每日平均耗材费用是多少 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q086 | 帮我统计一下做一个疗程全程需要多少耗材 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q087 | 哪种产品的成本控制空间最大 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q088 | 有没有耗材使用没有按规范记录的情况 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q089 | 帮我对比一下各美容师的耗材使用效率 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q090 | 这个月的耗材成本比上个月高了多少，原因是什么 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q091 | 供应商说这批货要延期到货，我怎么安排 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q092 | 这批新货到了，帮我记录入库 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q093 | 有货品到了但和采购单不符，怎么处理 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q094 | 我们哪个供应商的交货最稳定 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q095 | 和供应商发生了纠纷，怎么记录和处理 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q096 | 这批货的质检结果在哪里查 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q097 | 供应商给了一个新品，要不要试用 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q098 | 最近物流很慢，我们需要提前多少天下单 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q099 | 我们的主要供应商联系方式怎么找 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q100 | 帮我整理一下今年所有供应商的交易记录 | 库存采购 Agent | needs_capability_mapping | inventory.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q001 | 今天收了多少钱 | 财务风控 Agent | metric_summary | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q002 | 这个月营业额是多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q003 | 昨天的日结做了没，结果怎么样 | 财务风控 Agent | explain_with_evidence | finance.daily-settlement.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q004 | 帮我做一个今天的收入汇总 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 今天现金、微信、支付宝各收了多少 | 财务风控 Agent | metric_summary | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q006 | 这周每天的收入情况给我看一下 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q007 | 今天的收入和预期差多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q008 | 这个月比上个月多了还是少了 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 帮我核对一下今天的收款和系统记录是否一致 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q010 | 今天有没有漏收或者多收的情况 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q011 | 这个月储值收款有多少 | 财务风控 Agent | metric_summary | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q012 | 帮我看一下最近三个月的收入趋势 | 财务风控 Agent | metric_summary | finance.revenue.trend | kpi/chart/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q013 | 今天项目收入和产品销售各多少 | 财务风控 Agent | metric_summary | order.product.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q014 | 这个月有没有大额异常收款 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 帮我查一下某个日期的收款记录 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q016 | 这个月次卡销售了多少金额 | 财务风控 Agent | metric_summary | finance.card-package-sales.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q017 | 有没有收款没有对应服务记录的情况 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q018 | 今天所有员工的收款加起来多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q019 | 帮我看一下今天不同支付渠道的手续费 | 财务风控 Agent | explain_with_evidence | finance.payment-channel-fee.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q020 | 这个月到账的钱和开单的钱差多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q021 | 有没有客人预付了但还没使用的金额 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 帮我统计一下这个月每个项目的收入占比 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q023 | 今天的日均客单价是多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q024 | 这个月哪天收入最高，原因是什么 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q025 | 帮我出一份这周的收入明细报表 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q026 | 这个月的毛利率是多少 | 财务风控 Agent | metric_summary | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q027 | 帮我看一下各项目的毛利情况 | 财务风控 Agent | metric_summary | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q028 | 哪个项目的成本最高 | 财务风控 Agent | record_lookup | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q029 | 这个月耗材成本占了多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q030 | 员工提成这个月花了多少 | 财务风控 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q031 | 帮我算一下这个项目的实际毛利 | 财务风控 Agent | metric_summary | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q032 | 这个月运营成本有哪些，各多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q033 | 有没有哪个项目的毛利异常低 | 财务风控 Agent | diagnose_with_evidence | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q034 | 房租水电这个月花了多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q035 | 帮我看一下固定成本和变动成本的占比 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 这个月利润比上个月高还是低，为什么 | 财务风控 Agent | diagnose_with_evidence | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q037 | 有没有成本项目异常增加的情况 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q038 | 帮我看一下这个项目的定价合不合理 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 这个月打折优惠减少了多少收入 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q040 | 员工工资加提成占总收入的比例是多少 | 财务风控 Agent | metric_summary | finance.staff-commission.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q041 | 有没有成本控制的空间 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q042 | 这个月的净利润大概是多少 | 财务风控 Agent | metric_summary | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q043 | 帮我算一下盈亏平衡点，每月至少要做多少收入 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q044 | 产品销售的毛利和服务项目的毛利哪个高 | 财务风控 Agent | metric_summary | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q045 | 有没有低价项目其实在亏损 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q046 | 帮我看一下这个月各项成本的增长情况 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q047 | 这个季度和上个季度的成本结构有什么变化 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 帮我分析一下为什么这个月利润下降了 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q049 | 有没有可以在不影响服务的情况下降低成本的建议 | 财务风控 Agent | diagnose_with_evidence | finance.project-gross-profit.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q050 | 帮我做一个本月的成本利润分析报告 | 财务风控 Agent | explain_with_evidence | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q051 | 这个月退款了多少 | 财务风控 Agent | metric_summary | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q052 | 今天有没有退款申请需要处理 | 财务风控 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q053 | 最近退款原因主要是什么 | 财务风控 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q054 | 哪个美容师的退款率最高 | 财务风控 Agent | explain_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q055 | 有没有异常大额退款我不知道的 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q056 | 这个月打折优惠批了多少 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q057 | 有没有员工超权限给了额外折扣 | 财务风控 Agent | diagnose_with_evidence | finance.discount-permission-risk.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q058 | 最近折扣幅度有没有超出规定范围 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q059 | 这个月优惠券核销了多少 | 财务风控 Agent | metric_summary | marketing.coupon-redemption.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q060 | 退款走了什么审批流程，合规吗 | 财务风控 Agent | explain_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q061 | 有没有重复退款或者重复消费的情况 | 财务风控 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q062 | 某个客人要退卡，涉及多少金额 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q063 | 退款是退到原支付方式还是储值余额 | 财务风控 Agent | explain_with_evidence | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q064 | 帮我看一下所有待审批的退款申请 | 财务风控 Agent | explain_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q065 | 这个月因为退款损失了多少收入 | 财务风控 Agent | metric_summary | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q066 | 有没有退款后马上重新消费的异常情况 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q067 | 员工自主给客户打折的权限是多少 | 财务风控 Agent | metric_summary | finance.discount-permission-risk.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q068 | 这个月免单或赠送了多少金额 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q069 | 有没有退款但服务已经做完的纠纷 | 财务风控 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q070 | 帮我统计一下本月折扣总金额和折扣率 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q071 | 有没有退款影响到员工提成的情况 | 财务风控 Agent | diagnose_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q072 | 退款申请的平均处理时间是多久 | 财务风控 Agent | explain_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q073 | 有没有客户经常退款的异常行为 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q074 | 本月退款和上月比增加了多少 | 财务风控 Agent | metric_summary | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q075 | 帮我生成一份退款明细报告 | 财务风控 Agent | record_lookup | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q076 | 现在现金流情况怎么样 | 财务风控 Agent | explain_with_evidence | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q077 | 有没有哪里有财务漏洞需要注意 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q078 | 这个月有没有不正常的流水 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q079 | 有没有员工私自收款不入账的风险 | 财务风控 Agent | diagnose_with_evidence | cashier.payment.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q080 | 帮我看一下储值卡的未消耗余额有多少，这是我们的负债 | 财务风控 Agent | metric_summary | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q081 | 有没有税务方面需要注意的事项 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q082 | 这个月的应收账款有多少还没收回来 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q083 | 有没有跨月的预付款需要处理 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q084 | 帮我查一下某笔交易的完整流水 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q085 | 有没有员工报销存在问题的 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q086 | 这个月的现金收入有没有核对过 | 财务风控 Agent | diagnose_with_evidence | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q087 | 有没有收款和服务记录对不上的情况 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q088 | 帮我检查一下这个月的财务数据有没有异常 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q089 | 储值卡余额总计多少，如果客户都来消费我们能撑住吗 | 财务风控 Agent | metric_summary | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q090 | 有没有长期未消耗的大额储值需要关注 | 财务风控 Agent | diagnose_with_evidence | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q091 | 帮我看一下这个月的现金流量情况 | 财务风控 Agent | explain_with_evidence | finance.payment-method-breakdown.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q092 | 有没有跨月的分期付款记录 | 财务风控 Agent | diagnose_with_evidence | cashier.payment.records.list | table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q093 | 员工报销和财务记录有没有不符的地方 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q094 | 这个月有没有超出预算的支出 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q095 | 帮我做一个财务健康检查，看看有没有风险点 | 财务风控 Agent | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q096 | 有没有长期挂账的待处理款项 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q097 | 这个月的财务报告什么时候要出，需要什么数据 | 财务风控 Agent | explain_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q098 | 有没有可疑的重复收费或者双计费情况 | 财务风控 Agent | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q099 | 帮我生成一份月度财务简报 | 财务风控 Agent | explain_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q100 | 帮我分析一下如果下个月客流减少30%，财务压力有多大 | 财务风控 Agent | explain_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q001 | 帮我看看 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q002 | 最近情况怎么样 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q003 | 有什么问题吗 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q004 | 给我来一个报告 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q005 | 查一下 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q006 | 昨天的 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q007 | 这个客人 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q008 | 帮我搞一下活动 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q009 | 钱的事情 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q010 | 那个数据 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q011 | 帮我查一下张雯的信息。（然后）她上次来是什么项目？ | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q012 | 帮我看今天的预约。（然后）其中有几个是VIP？ | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q013 | 库存低的产品有哪些？（然后）帮我生成补货清单 | 附：Edge Case 与多轮对话测试问题 | record_lookup | inventory.bom.consumption.records.records.list | table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q014 | 本月营业额多少？（然后）比上个月高了多少？ | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q015 | 帮我找45天没来的客户。（然后）给她们发一条召回消息 | 附：Edge Case 与多轮对话测试问题 | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q016 | 这个月哪个员工业绩最好？（然后）给她发个鼓励通知 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q017 | 有哪些临期产品？（然后）适合搭配什么活动消化掉？ | 附：Edge Case 与多轮对话测试问题 | record_lookup | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q018 | 帮我看一下退款情况。（然后）有没有异常的？（然后）具体是哪几笔？ | 附：Edge Case 与多轮对话测试问题 | diagnose_with_evidence | finance.risk-diagnostics.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q019 | 今天哪个时间段还有空档？（然后）能不能再加一个客人进去？ | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q020 | 这个月毛利率是多少？（然后）为什么比上个月低？ | 附：Edge Case 与多轮对话测试问题 | diagnose_with_evidence | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q021 | 我想做个活动，但又不想太影响利润，怎么平衡 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q022 | 有个客人投诉说效果差，我应该退款还是再给她做一次 | 附：Edge Case 与多轮对话测试问题 | explain_with_evidence | finance.refund.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q023 | 我想提升员工积极性，同时控制提成成本，有什么建议 | 附：Edge Case 与多轮对话测试问题 | metric_summary | finance.commission-cost-optimization.advice | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q024 | 帮我同时看一下库存和即将来做项目的客人需求，有没有缺货风险 | 附：Edge Case 与多轮对话测试问题 | diagnose_with_evidence | inventory.expiring-risk.list | table/evidence_panel/action_card | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q025 | 这个月收入增加了但利润反而降了，问题出在哪 | 附：Edge Case 与多轮对话测试问题 | metric_summary | finance.overall-gross-margin.metric | kpi/table/evidence_panel | allow | pass | 待验证 | P2 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q026 | 有一个老客户三个月没来了，她还有大额储值，怎么召回她 | 附：Edge Case 与多轮对话测试问题 | record_lookup | order.member-card.records.list | table/evidence_panel | allow | pass | 待验证 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q027 | 员工最近情绪不好影响服务，同时营业额也在下滑，有关系吗 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q028 | 新招了个美容师，怎么快速帮她建立客源 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q029 | 临近年底，帮我从经营、客户、库存三个维度做个盘点 | 附：Edge Case 与多轮对话测试问题 | record_lookup | inventory.stock.operation.draft | action_card/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q030 | 我想同时提升复购率和客单价，应该从哪里入手 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q031 | 不对，我问的是上个月不是这个月 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q032 | 这个数据不对，帮我重新查一下 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q033 | 我不要表格，给我用文字说 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q034 | 太复杂了，简单说重点就行 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q035 | 这个客人不是张雯，是张文 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q036 | 不是今天的预约，是明天的 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | customer.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q037 | 我不要看全部的，只看VIP客户 | 附：Edge Case 与多轮对话测试问题 | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q038 | 这个活动方案不合适，改一个思路 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | marketing.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q039 | 不要给我建议了，就告诉我数据 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q040 | 这个结果不对，重新算一下 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q041 | 帮我把今年所有数据都分析一遍 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q042 | 生成一份完整的年度运营报告 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q043 | 帮我列出所有客户的消费明细 | 附：Edge Case 与多轮对话测试问题 | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q044 | 把所有员工过去一年的业绩全部列出来 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | store.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q045 | 帮我同时做六件事：查今日营收、看预约、检查库存、分析员工、找沉睡客户、生成月报 | 附：Edge Case 与多轮对话测试问题 | record_lookup | agent.multi-domain.summary | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q046 | 我要做一个非常复杂的活动，需要同时满足：拉新、促复购、清库存、提升客单价、增加员工收入 | 附：Edge Case 与多轮对话测试问题 | metric_summary | agent.multi-domain.summary | kpi/table/evidence_panel | allow | pass | 待验证 | P0 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q047 | 帮我预测下个季度的营业额 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q048 | 帮我设计一套完整的客户生命周期运营方案 | 附：Edge Case 与多轮对话测试问题 | record_lookup | customer.customer.app.contact.records.list | table/evidence_panel | needs_review | pass | 权限缺失 | P1 | 确认题目是否应进入正式回归集<br>确认期望输出类型是否准确 |
| q049 | 这家店值多少钱，帮我估值 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
| q050 | 帮我把店里所有的问题都找出来，给我一个完整的改进方案 | 附：Edge Case 与多轮对话测试问题 | needs_capability_mapping | finance.unmapped.eval_candidate | answer/evidence_panel | needs_review | needs_review | 能力缺失 | P2 | 未匹配到能力草稿，需要人工确认是否新增能力<br>确认是否为闲聊/低风险直答/业务查询 |
