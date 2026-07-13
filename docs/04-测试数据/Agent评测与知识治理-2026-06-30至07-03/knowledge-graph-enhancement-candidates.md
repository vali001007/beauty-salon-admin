# Agent V2 知识图谱离线增强候选

生成时间：2026-07-06 05:20:13 Asia/Shanghai
图谱来源：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph.json
评测草稿来源：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-drafts.json

## 安全边界

- 只输出候选文件，不写生产库，不改 active graph。
- 所有候选状态均为 `review_required`，需要管理员审核。
- 低置信度候选必须写入人工覆盖表后，才会在下次 `kg:generate` 合入。

## 汇总

- businessObjectCount: 16
- unsupportedQuestionCount: 491
- synonymCandidates: 15
- fkBusinessMeaningCandidates: 120
- reviewItems: 80
- totalCandidates: 215

## 同义词候选

- 客人 -> business-object:customer；confidence=0.72；从未覆盖/待确认问法中抽取到“客人”，建议作为 客户 的人工审核同义词候选。
- 到店客人 -> business-object:customer；confidence=0.72；从未覆盖/待确认问法中抽取到“到店客人”，建议作为 客户 的人工审核同义词候选。
- 来店客人 -> business-object:customer；confidence=0.72；从未覆盖/待确认问法中抽取到“来店客人”，建议作为 客户 的人工审核同义词候选。
- 店里情况 -> business-object:businessoverview；confidence=0.72；从未覆盖/待确认问法中抽取到“店里情况”，建议作为 经营概览 的人工审核同义词候选。
- 门店情况 -> business-object:businessoverview；confidence=0.72；从未覆盖/待确认问法中抽取到“门店情况”，建议作为 经营概览 的人工审核同义词候选。
- 经营情况 -> business-object:businessoverview；confidence=0.72；从未覆盖/待确认问法中抽取到“经营情况”，建议作为 经营概览 的人工审核同义词候选。
- 经营状态 -> business-object:businessoverview；confidence=0.72；从未覆盖/待确认问法中抽取到“经营状态”，建议作为 经营概览 的人工审核同义词候选。
- 在店 -> business-object:reservation；confidence=0.72；从未覆盖/待确认问法中抽取到“在店”，建议作为 预约 的人工审核同义词候选。
- 还在店 -> business-object:reservation；confidence=0.72；从未覆盖/待确认问法中抽取到“还在店”，建议作为 预约 的人工审核同义词候选。
- 营业额 -> business-object:financemetric；confidence=0.72；从未覆盖/待确认问法中抽取到“营业额”，建议作为 财务指标 的人工审核同义词候选。
- 流水 -> business-object:financemetric；confidence=0.72；从未覆盖/待确认问法中抽取到“流水”，建议作为 财务指标 的人工审核同义词候选。
- 收款 -> business-object:financemetric；confidence=0.72；从未覆盖/待确认问法中抽取到“收款”，建议作为 财务指标 的人工审核同义词候选。
- 券 -> business-object:marketingactivity；confidence=0.72；从未覆盖/待确认问法中抽取到“券”，建议作为 营销活动 的人工审核同义词候选。
- 优惠券 -> business-object:marketingactivity；confidence=0.72；从未覆盖/待确认问法中抽取到“优惠券”，建议作为 营销活动 的人工审核同义词候选。
- 权益 -> business-object:marketingactivity；confidence=0.72；从未覆盖/待确认问法中抽取到“权益”，建议作为 营销活动 的人工审核同义词候选。

## FK 业务含义候选

- AgentCapabilityManifestItem 通过 AgentCapabilityManifestItem.version -> AgentCapabilityManifestVersion 关联 AgentCapabilityManifestVersion -> data-model:agentcapabilitymanifestversion；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AgentCapabilityManifestVersion 通过 AgentCapabilityManifestVersion.items -> AgentCapabilityManifestItem 关联 AgentCapabilityManifestItem -> data-model:agentcapabilitymanifestitem；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AgentEvalCaseResult 通过 AgentEvalCaseResult.evalRun -> AgentEvalRun 关联 AgentEvalRun -> data-model:agentevalrun；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AgentEvalRun 通过 AgentEvalRun.caseResults -> AgentEvalCaseResult 关联 AgentEvalCaseResult -> data-model:agentevalcaseresult；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AiAuditLog 通过 AiAuditLog.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AiAuditLog 通过 AiAuditLog.device -> TerminalDevice 关联 TerminalDevice -> data-model:terminaldevice；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AiAuditLog 通过 AiAuditLog.user -> User 关联 User -> data-model:user；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AmiGlowDisplayConfig 通过 AmiGlowDisplayConfig.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AmiMonthlyBill 通过 AmiMonthlyBill.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AmiPerformanceRecord 通过 AmiPerformanceRecord.customer -> Customer 关联 Customer -> data-model:customer；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AmiPerformanceRecord 通过 AmiPerformanceRecord.order -> ProductOrder 关联 ProductOrder -> data-model:productorder；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AmiPerformanceRecord 通过 AmiPerformanceRecord.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.opportunity -> AppointmentGapOpportunity 关联 AppointmentGapOpportunity -> data-model:appointmentgapopportunity；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.events -> AppointmentGapOpportunityEvent 关联 AppointmentGapOpportunityEvent -> data-model:appointmentgapopportunityevent；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.customer -> Customer 关联 Customer -> data-model:customer；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.project -> Project 关联 Project -> data-model:project；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapCandidate 通过 AppointmentGapCandidate.followUpTask -> TerminalFollowUpTask 关联 TerminalFollowUpTask -> data-model:terminalfollowuptask；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunity 通过 AppointmentGapOpportunity.candidates -> AppointmentGapCandidate 关联 AppointmentGapCandidate -> data-model:appointmentgapcandidate；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunity 通过 AppointmentGapOpportunity.events -> AppointmentGapOpportunityEvent 关联 AppointmentGapOpportunityEvent -> data-model:appointmentgapopportunityevent；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunity 通过 AppointmentGapOpportunity.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunityEvent 通过 AppointmentGapOpportunityEvent.candidate -> AppointmentGapCandidate 关联 AppointmentGapCandidate -> data-model:appointmentgapcandidate；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunityEvent 通过 AppointmentGapOpportunityEvent.opportunity -> AppointmentGapOpportunity 关联 AppointmentGapOpportunity -> data-model:appointmentgapopportunity；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunityEvent 通过 AppointmentGapOpportunityEvent.customer -> Customer 关联 Customer -> data-model:customer；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- AppointmentGapOpportunityEvent 通过 AppointmentGapOpportunityEvent.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.availabilities -> BeauticianAvailability 关联 BeauticianAvailability -> data-model:beauticianavailability；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.level -> BeauticianLevel 关联 BeauticianLevel -> data-model:beauticianlevel；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.projectSkills -> BeauticianProjectSkill 关联 BeauticianProjectSkill -> data-model:beauticianprojectskill；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.timeOffs -> BeauticianTimeOff 关联 BeauticianTimeOff -> data-model:beauticiantimeoff；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.cardUsageRecords -> CardUsageRecord 关联 CardUsageRecord -> data-model:cardusagerecord；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.commissionRecords -> CommissionRecord 关联 CommissionRecord -> data-model:commissionrecord；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.commissionSettlements -> CommissionSettlement 关联 CommissionSettlement -> data-model:commissionsettlement；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.orderItems -> OrderItem 关联 OrderItem -> data-model:orderitem；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.reservations -> Reservation 关联 Reservation -> data-model:reservation；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.schedules -> Schedule 关联 Schedule -> data-model:schedule；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.serviceTasks -> ServiceTask 关联 ServiceTask -> data-model:servicetask；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.store -> Store 关联 Store -> data-model:store；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.followUpTasks -> TerminalFollowUpTask 关联 TerminalFollowUpTask -> data-model:terminalfollowuptask；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- Beautician 通过 Beautician.user -> User 关联 User -> data-model:user；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。
- BeauticianAvailability 通过 BeauticianAvailability.beautician -> Beautician 关联 Beautician -> data-model:beautician；confidence=0.68；为图谱 FK 关系补充中文业务含义，供 GenericQueryEngine 后续做跨表 join 路径说明和人工审核。

## 待审核治理项

- 今天店里情况怎么样，给我来个总结 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天营业额到多少了 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天来了几个客人，现在还有几个在店 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天和昨天比营业额差多少 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 本周跟上周比，哪天差距最大 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 这个月目标完成率多少了，还差多远 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天客单价多少，跟平时比怎么样 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天有没有什么异常情况我需要知道 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 现在店里哪些美容师在忙，哪些空着 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 这个月跟上个月比收入差多少 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天新客老客各来了几个 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 现在几点了，下午还有几个预约 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 今天哪个项目做得最多 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 今天最大的一笔消费是多少 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 今天折扣优惠送出去多少钱 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 这周有没有哪天特别差，为什么 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 最近哪些老客好久没来了，帮我列一下 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 上个月新来了多少新客，转化了多少 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 帮我看一下今天到店客人的画像，主要是什么年龄段 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 我们的老客回头率大概是多少 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 这个月新客主要来自什么渠道 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 这个月谁的业绩最好 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 哪个美容师接的客人最多 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 有没有员工这周业绩明显下滑 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 各美容师今天的排班情况，有没有空档 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 今天谁请假了，有没有影响接待 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 哪个美容师的客诉最多，最近有没有 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 新员工试用期表现怎么样 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 帮我看一下各美容师的服务次数对比 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 今天谁服务了几个客人 -> -；confidence=0.54；该问法未能稳定关联到业务对象，需产品或运营确认是否新增对象、能力或作为闲聊处理。
- 哪个员工这个月进步最快 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 有没有员工最近很长时间没有新客了 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 有没有员工到期转正需要我处理 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 最近有没有员工出现迟到早退 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 哪个美容师的升单能力最强 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 帮我看一下员工这周的工作饱和度 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 这个月耗材用了多少，正常吗 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 最近卖得最好的产品是什么 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 有什么产品积压太久了 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
- 下次采购需要补什么货 -> -；confidence=0.66；该问法能关联到业务对象，但仍缺能力、同义词或输出形态确认。
