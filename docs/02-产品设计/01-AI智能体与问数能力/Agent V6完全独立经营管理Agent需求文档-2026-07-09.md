# Agent V6 完全独立经营管理 Agent 需求文档

版本：v1.0
日期：2026-07-09
定位：独立新产品线 PRD，不作为现有 Agent V1-V5 的升级说明。
适用对象：产品、研发、数据、实施、运营、管理端 Ami Core 负责人。

## 0. 编写边界

本需求文档按“clean-room”方式定义 Agent V6：

- 不引用、不继承、不复用本项目既有 Agent 历史版本的产品方案、代码结构、提示词、评测题库或治理实现。
- 仅把 Ami Core 视为未来要被 V6 扫描、接入和运营的业务系统，不把当前项目已有 Agent 能力当作 V6 前提。
- 本文基于 2026-07-09 可查到的外部 Agent 技术、企业应用和美业软件案例整理，外部趋势用于定义 V6 的目标形态，不代表具体技术选型已经锁死。
- 本文是需求文档，不是开发计划；后续应另行输出独立架构方案、数据权限方案、任务拆解和验收用例。

当前仓库状态提示：工作区已有大量未提交 Agent、Kiosk、server-v2、前端页面与文档改动。本文只新增本文件，不修改历史 Agent 文件，避免混淆交付边界。

## 1. 一句话目标

Agent V6 要成为“能像成熟店长和运营团队一样理解、判断、协同、执行和复盘门店经营”的独立数字经营系统。

它不是一个聊天问数助手，也不是某个单点业务 Agent。它应覆盖门店日常经营的完整闭环：

自然语言输入 -> 记忆和追问 -> 语义理解 -> 角色分工 -> 数据查询和事实核对 -> 风险判断 -> 建议生成 -> 受控业务操作 -> 结果回写 -> 审计复盘 -> 迭代优化。

## 2. 外部调研结论

### 2.1 Agent 技术正在从“会回答”进入“会使用工具和协同工作”

OpenAI Agents SDK 的当前核心能力包括 Agent、handoffs/agents as tools、guardrails、function tools、MCP 集成、sessions、human-in-the-loop、tracing 和 evals。这说明生产级 Agent 的关键不再是单轮提示词，而是运行时、工具、记忆、护栏、可观测和评测闭环。参考：[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)。

MCP 2025-06-18 规范把外部数据、工具、提示词和动态追问标准化，并明确工具调用需要用户知情、授权和安全控制。参考：[MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)、[MCP Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[MCP Elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)。

Google ADK 和 A2A 方向强调多 Agent 工作流、图式流程、记忆、MCP 工具、A2A 跨 Agent 通信和企业级部署。参考：[Google ADK](https://adk.dev/)、[Google A2A Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)。

产品启发：V6 必须从第一天就有工具注册、角色协同、运行追踪、权限护栏和评测框架，不能先做“聊天入口”，以后再补治理。

### 2.2 企业级 Agent 的核心卖点变成“可见、可控、可治理”

Salesforce Agentforce 3 把 Command Center、MCP 支持、session tracing、测试中心、行业 actions 和运行监控作为企业 Agent 扩展的关键能力。参考：[Salesforce Agentforce 3](https://www.salesforce.com/news/press-releases/2025/06/23/agentforce-3-announcement/)。

Microsoft Copilot Studio 的 generative orchestration 会根据工具、知识、话题和其他 Agent 的描述自动选择路径，并能在缺少参数时生成追问，同时也提供数据策略和连接器治理。参考：[Copilot Studio generative orchestration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions)、[Copilot Studio data policies](https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-data-loss-prevention)。

ServiceNow AI Control Tower 强调发现所有 AI agent/model/identity、治理风险、运行监控、权限最小化、注入防护、价值度量和 kill switch；2026 年扩展到跨系统的发现、观测、治理、安全和价值评估。参考：[ServiceNow AI Control Tower](https://www.servicenow.com/products/ai-control-tower.html)、[ServiceNow 2026 AI Control Tower update](https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-expands-AI-Control-Tower-to-discover-observe-govern-secure-and-measure-AI-deployed-across-any-system-in-the-enterprise/default.aspx)。

产品启发：V6 不能只给前台用户一个聊天框，还要给老板、管理员和研发一个“Agent 治理中心”，能看清每个 Agent 做了什么、为什么这么做、用了什么数据、有没有越权、带来多少价值。

### 2.3 美业软件正在从“功能模块”转向“AI workforce”

Zenoti 已公开推出面向美业、健康和健身行业的 AI Workforce，强调多个专用 Agent 覆盖接电话、预约、追踪流失、处理收入漏损等任务，并基于大量美业业务模式训练。参考：[Zenoti AI Workforce](https://www.zenoti.com/ai-workforce)。

Fresha 2026 年强调 AI 智能排程，把排班、房间、设备、服务时长、清洁缓冲、客户偏好和价格逻辑纳入实时优化。参考：[Fresha AI-powered intelligent scheduling](https://www.fresha.com/blog/fresha-ai-powered-intelligent-scheduling-beauty-wellness)。

Vagaro 的 Vera/Connect AI 方向覆盖客户沟通、营销、空档填充、基础问答和人工接管，且明确有“无法回答或客户要求人工时转给员工”的边界。参考：[Vagaro Business AI](https://www.vagaro.com/pro/business-ai)、[Vagaro Connect AI Support](https://support.vagaro.com/hc/en-us/articles/31806231306779-Set-Up-A-Chatbot-for-Your-Business-with-Connect-AI)。

产品启发：美业 Agent 的机会不在“能问报表”，而在“帮门店少漏单、少流失、少缺货、少坏账、少空档、少投诉、少靠店长经验”。V6 应按经营结果组织能力，而不是按后台菜单组织能力。

### 2.4 知识图谱和 Ontology 适合解决“行业语义”和“跨表理解”

Microsoft GraphRAG 将文本抽取、网络分析、LLM 提示和摘要结合，用于复杂私有数据理解与检索。参考：[Microsoft GraphRAG](https://www.microsoft.com/en-us/research/project/graphrag/)。

产品启发：V6 的 Ontology 不应是纯学术本体，而应是“美业经营语义层”：统一客户、预约、服务、疗程、会员卡、库存、员工、门店、营销、财务、风险和动作之间的对象关系、状态机、指标口径和权限含义。

### 2.5 Agent 安全不能后补

OWASP 2025/2026 对 LLM 与 Agentic AI 风险的关注点包括 prompt injection、工具误用、敏感数据泄露、过度代理、供应链和自主系统失控。NIST AI RMF 与 GenAI Profile 则强调治理、风险识别、评估和持续管理。参考：[OWASP GenAI Security Project](https://genai.owasp.org/)、[OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)、[NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)。

产品启发：V6 必须把“可执行动作”按风险分级，默认最小权限、默认审计、默认可回滚，任何影响客户资产、财务、库存、营销触达和员工绩效的操作都必须有 dry-run、审批和追责。

## 3. 产品定位

### 3.1 产品名称建议

内部代号：Agent V6
产品名建议：Ami Operator
定位语：美业门店数字店长与经营 Agent 团队。

### 3.2 核心用户

- 老板/投资人：关心收入、利润、现金流、风险、复购、组织效率和跨店对比。
- 店长：关心今天该处理什么、谁要跟进、哪里异常、怎样排班、怎样达成目标。
- 前台：关心预约、到店、接待、收银、提醒、客户问题和空档填充。
- 美容师/技师：关心客户偏好、服务历史、注意事项、复购建议和术后/护理跟进。
- 营销运营：关心客户分层、活动设计、投放触达、转化、归因和复盘。
- 财务/出纳：关心收支、退款、会员卡负债、对账、异常流水和经营利润。
- 库存/采购：关心低库存、临期、消耗、采购、供应商和服务项目消耗关系。
- 客服/私域：关心投诉、差评、沉睡客户、售后回访和满意度。
- 平台管理员：关心权限、审计、模型成本、运行质量、工具安全和能力迭代。

### 3.3 产品不是

- 不是单轮聊天机器人。
- 不是只读问数工具。
- 不是完全无监督的自动执行系统。
- 不是旧 Agent 版本的重命名。
- 不是用模型绕过现有业务权限的快捷入口。
- 不是要求用户学习 SQL、菜单路径或后台术语的专家系统。

## 4. 产品目标与成功指标

### 4.1 业务目标

1. 让门店管理从“人找数据、人盯异常、人凭经验决策”变成“Agent 主动发现、解释、建议和推进”。
2. 覆盖美业经营高频场景：预约、客户、服务、营销、会员卡、收银、库存、排班、人效、财务、风险、客服。
3. 让老板和店长每天打开系统时，优先看到“今天最该处理的事”，而不是一堆菜单。
4. 让前台和员工通过口语化输入完成查询、提醒、建任务、生成方案和受控操作。
5. 通过治理中心持续提升 Agent 覆盖率、准确率、执行成功率和业务价值。

### 4.2 可量化指标

- 语义覆盖：P0 覆盖门店 80% 高频只读查询和风险提示；P1 覆盖 80% 高频建议和低风险操作；P2 覆盖跨角色协同闭环。
- 追问能力：缺少关键参数时，P0 至少 90% 能问出可执行的下一问；不得胡乱假设关键客户、金额、时间或门店。
- 数据答案可信度：涉及经营数据的回答必须提供数据来源、时间范围和口径；P0 关键经营问数准确率目标不低于 95%。
- 操作安全：所有中高风险写操作 100% 进入 dry-run 和审批；无权限用户 100% 不可越权查看或执行。
- 治理可见性：100% Agent run 可追踪到用户、意图、角色、工具、数据源、输出、审批和结果。
- 业务价值：P1 起每个主动建议必须标注预计影响，如挽回客户、减少库存损耗、提升空档利用、降低财务风险。

## 5. 顶层体验

### 5.1 主界面：经营对话工作台

用户可以像和店长说话一样输入：

- “这周谁快流失了，帮我排一下跟进优先级。”
- “昨天收银有没有异常？特别是退款和会员卡扣次。”
- “最近补水项目消耗高，是不是库存快不够了？”
- “今天前台空档多吗？有什么办法补一下？”
- “帮我看看小王这个月业绩下滑是不是因为客源少。”

V6 应输出：

- 直接结论。
- 关键证据。
- 不确定项。
- 需要追问的问题。
- 可执行建议。
- 可一键生成的任务/方案/审批草案。

### 5.2 每日经营驾驶舱

系统每天自动给店长生成：

- 今日目标进度。
- 预约与空档风险。
- 高价值客户和流失风险。
- 财务/收银异常。
- 库存低量、临期和异常消耗。
- 员工排班和服务承接风险。
- 投诉/差评/售后重点。
- 建议动作清单。

驾驶舱不是静态报表，而是可继续追问：

- “为什么这个客户排第一？”
- “这条风险谁处理最合适？”
- “先帮我生成 3 条微信跟进话术。”
- “这个建议预计能带来多少收入？”

### 5.3 多 Agent 协同室

复杂任务不由一个 Agent 独立完成，而由角色协作：

- 店长 Agent 负责目标拆解和最终决策。
- 营销 Agent 负责客户分层、活动策略和触达建议。
- 财务 Agent 负责金额、负债、毛利和异常核验。
- 库存 Agent 负责消耗、库存、采购和临期风险。
- 前台 Agent 负责预约、到店、收银、提醒和客户沟通。
- 美容师 Agent 负责护理记录、客户偏好、服务建议。
- 客服 Agent 负责回访、投诉、沉睡客户和满意度。
- 数据审计 Agent 负责口径、证据、权限和反事实检查。

用户看到的不是一堆机器人聊天，而是一张任务卡：谁负责什么、查了什么、结论是什么、还缺什么、下一步怎么做。

## 6. 核心能力需求

### 6.1 记忆能力

V6 需要具备分层记忆，而不是简单保存聊天记录。

#### 6.1.1 记忆类型

- 会话短期记忆：当前对话中的上下文、代词、时间范围、用户刚刚确认的条件。
- 用户偏好记忆：老板、店长、前台等不同角色常用指标、表达习惯、关注门店、默认时间范围。
- 门店经营记忆：门店目标、经营规则、服务政策、活动节奏、重点客户策略。
- 实体别名记忆：客户昵称、员工昵称、项目口语名、门店简称、产品俗称。
- 决策记忆：历史上用户采纳/拒绝过的建议、审批结果、操作原因。
- 反馈记忆：用户指出过的错误、口径修正、禁用动作、敏感偏好。
- 任务记忆：进行中的营销、回访、采购、排班、财务核对等任务状态。

#### 6.1.2 记忆治理

- 用户可以查看、编辑、删除和禁用自己的长期记忆。
- 敏感信息默认不进入长期记忆，除非有明确用途和权限。
- 记忆必须标注来源、时间、作用域和有效期。
- 记忆进入推理前必须经过权限过滤，不能把老板级记忆泄露给普通员工。
- 记忆冲突时必须提示冲突并请求确认，不得静默覆盖关键经营规则。

### 6.2 模糊追问能力

V6 必须能识别口语中的缺省、歧义、代词和隐含意图。

#### 6.2.1 需要追问的典型情况

- 时间不明确：“最近”“这阵子”“上次活动后”。
- 对象不明确：“她”“那个老客户”“小王那组客户”。
- 指标不明确：“业绩差”“库存不太对”“回款慢”。
- 动作风险高：“帮我发一下”“把这个改掉”“直接退款”。
- 多意图混杂：“看下客户流失，再顺便给个活动方案”。
- 口径冲突：“收入”可能指实收、应收、项目收入、产品收入、毛利或现金流。

#### 6.2.2 追问原则

- 优先问最小必要问题，不把用户变成填表。
- 能根据上下文高置信推断的，先说明假设并允许用户改。
- 涉及客户资产、财务、库存、营销群发、员工绩效时必须显式确认。
- 追问要给可选项，减少用户输入成本。

示例：

用户：“帮我看看小王最近是不是不太行。”
V6：“你说的小王是美容师王琳，还是前台王晓？如果看员工业绩，我建议默认看最近 30 天的服务客数、项目收入、复购和客诉。要按这个口径看吗？”

### 6.3 美业全领域意图语义层

V6 要建设独立的“美业经营语义层”，覆盖对象、关系、状态、指标和动作。

#### 6.3.1 一级意图域

1. 经营概览：营收、利润、客流、客单、目标、趋势、跨店对比。
2. 客户经营：新客、老客、沉睡、流失、复购、偏好、客诉、生命周期。
3. 预约到店：预约、改约、取消、迟到、爽约、空档、房间/设备/人员匹配。
4. 服务履约：项目、疗程、护理记录、禁忌、耗材、效果反馈。
5. 会员与资产：会员卡、储值、权益、扣次、过期、负债、退款。
6. 收银财务：订单、支付、退款、折扣、分账、对账、毛利、异常流水。
7. 库存供应链：产品、耗材、库存、临期、低库存、采购、供应商、消耗预测。
8. 营销增长：分群、活动、触达、券、裂变、投放、转化、归因、复盘。
9. 员工人效：排班、业绩、提成、服务时长、满意度、培训、异常。
10. 客服私域：回访、投诉、差评、咨询、话术、服务补救。
11. 风险合规：财务风险、客户资产风险、库存风险、服务风险、权限风险。
12. 系统运维：接口、同步、设备、终端、任务失败、数据质量。

#### 6.3.2 Ontology 核心对象

- 门店：Store、BusinessUnit、Room、Device、Channel。
- 人：Customer、Employee、Role、Operator、Supplier。
- 商品服务：ServiceItem、TreatmentPlan、Package、Product、Consumable。
- 交易资产：Appointment、Order、Payment、Refund、MemberCard、Balance、Coupon。
- 经营动作：Campaign、FollowUpTask、PurchaseOrder、InventoryMovement、ScheduleChange。
- 风险事件：RiskSignal、Alert、Exception、Complaint、ChurnSignal、StockoutSignal。
- 知识规则：Policy、SOP、MetricDefinition、PermissionPolicy、ApprovalRule。
- Agent 对象：AgentRole、Tool、Capability、Run、Step、Memory、EvaluationCase。

#### 6.3.3 关系样例

- Customer 使用 MemberCard，产生 Order，参与 Campaign，拥有 ChurnSignal。
- ServiceItem 消耗 Consumable，依赖 Employee 技能，要求 Room/Device。
- Appointment 关联 Customer、Employee、ServiceItem、Room、Channel。
- Order 产生 Payment/Refund，影响 Revenue、Cashflow、PrepaidLiability。
- InventoryMovement 影响 Product 库存，可能由 ServiceItem 消耗或 PurchaseOrder 入库产生。
- Campaign 触达 Customer，产生 Conversion、Order、Attribution。
- RiskSignal 触发 FollowUpTask、Approval、Notification 或 Agent 建议。

#### 6.3.4 指标口径要求

每个指标必须有：

- 业务定义。
- 数据来源。
- 计算公式。
- 时间口径。
- 门店/员工/客户/项目维度。
- 权限等级。
- 是否可追溯到明细。
- 是否可被 Agent 用于建议或自动化。

### 6.4 多 Agent 角色协同

#### 6.4.1 角色矩阵

| 角色 Agent | 核心职责 | 可读数据 | 可建议动作 | 可执行动作边界 |
| --- | --- | --- | --- | --- |
| 店长总控 Agent | 目标拆解、优先级、跨角色协调、最终建议 | 全店经营汇总和授权明细 | 经营行动计划、人员分配、风险处置 | 中高风险动作必须审批 |
| 前台接待 Agent | 预约、到店、收银提醒、客户咨询 | 预约、客户基础、服务、订单状态 | 空档填充、预约调整、提醒话术 | 低风险提醒可执行，改约/退款需确认 |
| 营销增长 Agent | 客户分层、活动、触达、归因 | 客户画像、消费、活动、触达 | 活动方案、分群、优惠建议 | 群发/发券/预算消耗需审批 |
| 财务风控 Agent | 收银、对账、会员资产、异常 | 订单、支付、退款、会员卡、毛利 | 异常核查、对账任务、风险提示 | 任何资金/资产变更需审批 |
| 库存采购 Agent | 低库存、临期、消耗、采购 | 库存、产品、耗材、项目消耗 | 补货建议、临期处理、采购计划 | 采购单可草拟，提交需审批 |
| 美容师服务 Agent | 服务记录、客户偏好、护理建议 | 授权客户、服务历史、护理记录 | 个性化服务建议、复购提醒 | 不直接修改医疗/高敏记录 |
| 客服回访 Agent | 回访、投诉、差评、沉睡客户 | 客户沟通、工单、评价、回访 | 补救方案、回访话术、升级建议 | 自动触达需按客户授权 |
| 数据审计 Agent | 口径、证据、权限、幻觉检查 | 元数据、指标定义、运行日志 | 数据质量修正建议、评测用例 | 不直接改业务数据 |
| 安全治理 Agent | 权限、注入、越权、工具风险 | 权限、策略、审计、工具元数据 | 风险拦截、策略调整建议 | 禁用工具/kill switch 需管理员 |

#### 6.4.2 协同模式

- 串行协同：店长 Agent 拆任务，专业 Agent 逐个处理。
- 并行协同：营销、财务、库存同时分析同一经营问题。
- 互审协同：数据审计 Agent 对其他 Agent 的结论做口径和证据检查。
- 人机协同：Agent 给出方案，人确认后执行。
- 事件驱动：风险信号触发对应 Agent 主动分析和生成任务。

### 6.5 Ami Core 全业务扫描能力

V6 必须能够扫描 Ami Core 的后台业务、功能、权限、数据表和可执行能力，形成“能力地图”。这里的扫描是系统集成能力，不是复用旧 Agent。

#### 6.5.1 扫描对象

- 管理端菜单、路由和页面模块。
- 后端 API、controller、service、DTO、OpenAPI/Swagger 元数据。
- 数据库 schema、表、字段、索引、关系、枚举和字段敏感级别。
- 权限码、角色、菜单权限、数据范围、门店范围。
- 业务事件、任务、通知、审批和日志。
- 指标定义、报表、导出、经营看板。
- 终端、小程序、营销 H5 等外部业务入口的接口契约。

#### 6.5.2 扫描产物

每次扫描生成 `AmiCoreCapabilityMap`，至少包括：

- `domain`：业务域，如客户、预约、库存。
- `entity`：数据对象和表。
- `relation`：跨表关系。
- `readCapability`：可查询能力。
- `writeCapability`：可操作能力。
- `riskLevel`：操作风险等级。
- `permissionPolicy`：权限和数据范围。
- `toolCandidate`：可封装成 Agent 工具的接口。
- `evidenceSource`：来源文件/API/schema。
- `coverageStatus`：已接入、可接入、缺元数据、禁止接入。
- `owner`：业务/技术负责人。

#### 6.5.3 扫描原则

- P0 只读扫描，不直接生成可执行写操作。
- 扫描结果必须人工确认后才能进入工具注册中心。
- 任何涉及客户隐私、支付、会员资产、员工绩效的数据默认高敏。
- 识别不到口径或权限的能力，状态必须是“不可执行”，不能让模型自由猜。

### 6.6 底层技能体系

#### 6.6.1 数据查询技能

- 单表查询：按权限查询客户、预约、订单、库存、员工、活动等明细。
- 跨表组合查询：如“过去 30 天消费下降但仍有会员余额的高价值客户”。
- 指标查询：按已定义指标查询收入、毛利、客流、复购、库存周转。
- 明细追溯：从汇总答案下钻到来源记录。
- 口径解释：解释指标计算方式和排除项。
- 数据质量提示：识别缺字段、异常值、同步延迟和口径冲突。

#### 6.6.2 风险提示技能

- 客户风险：高价值流失、长期未到店、投诉未处理、疗程中断。
- 财务风险：退款异常、折扣异常、会员卡负债异常、支付对账差异。
- 库存风险：低库存、临期、异常消耗、账实不符、采购延迟。
- 预约风险：爽约率升高、空档过多、热门技师排满、房间/设备冲突。
- 员工风险：服务满意度下降、业绩异常、提成异常、排班过载。
- 营销风险：活动低转化、券核销异常、触达频率过高、预算失控。
- 系统风险：接口失败、终端离线、同步延迟、任务堆积。

#### 6.6.3 业务建议技能

- 今日行动优先级。
- 客户挽回策略。
- 活动方案和分群建议。
- 空档填充策略。
- 补货和临期处理建议。
- 员工排班和培训建议。
- 财务异常处理建议。
- 客诉补救策略。

所有建议必须包含：事实依据、预计影响、风险、执行成本、可选方案和推荐理由。

#### 6.6.4 业务操作技能

按风险分级：

- L0 纯展示：回答、解释、汇总、生成草稿。
- L1 低风险任务：创建内部待办、生成提醒草稿、保存分析报告。
- L2 可撤销业务动作：客户标签、跟进任务、活动草稿、采购草案。
- L3 影响客户或经营数据动作：预约改动、发券、营销群发、库存调整。
- L4 高风险动作：退款、会员卡资产变更、财务冲正、批量删除、权限变更。

执行要求：

- L0 可直接执行。
- L1 需要用户当前会话确认。
- L2 需要 dry-run 和确认。
- L3 需要审批流和审计。
- L4 默认禁止自动执行，只能生成申请单，必须由有权限的人审批。

## 7. 权限与安全需求

### 7.1 权限模型

V6 权限必须同时考虑：

- 用户身份：老板、店长、前台、美容师、财务、库存、客服、管理员。
- 门店范围：单店、多店、总部、加盟区域。
- 数据对象：客户、订单、会员卡、库存、员工、财务。
- 字段敏感级别：手机号、余额、支付、客诉、绩效等。
- 动作风险等级：查询、草稿、提醒、修改、资金、权限。
- Agent 身份：每个 Agent 也必须有独立服务身份和权限上限。

### 7.2 安全护栏

- 输入护栏：识别 prompt injection、越权请求、敏感数据请求和高风险动作。
- 工具护栏：工具 schema 校验、参数校验、权限校验、速率限制、幂等键。
- 输出护栏：敏感字段脱敏、禁止编造、必须引用数据来源。
- 记忆护栏：防止记忆投毒、跨角色泄露和过期规则继续生效。
- 运行护栏：异常时中断、降级、kill switch 和人工接管。
- 审批护栏：风险动作必须生成审批摘要，列出影响对象和可回滚方式。

### 7.3 审计要求

每次运行必须记录：

- 用户、角色、门店、设备/入口。
- 原始输入和意图解析。
- 触发的 Agent 和工具。
- 查询的数据源和过滤条件。
- 输出内容、置信度和引用证据。
- 是否追问、用户如何确认。
- 是否执行操作、执行前后差异。
- 审批人、审批时间、审批意见。
- 失败原因、重试和人工接管情况。

## 8. 可视化 Agent 治理与迭代

V6 必须内置 Agent Governance Center，面向产品、运营、管理员和研发。

### 8.1 治理中心模块

1. 能力地图：显示 Ami Core 哪些业务已被扫描、已接入、未接入、禁止接入。
2. Agent 编排图：展示角色 Agent、工具、数据源和 handoff 关系。
3. 运行追踪：每次 run 的步骤、工具、耗时、成本、失败点和证据。
4. 权限策略：按角色、数据、动作、风险等级配置权限。
5. 记忆管理：查看、禁用、删除、合并和审计记忆。
6. Ontology 管理：对象、关系、指标、别名、口语表达、状态机。
7. 工具注册中心：工具 schema、权限、风险等级、版本、测试结果。
8. 评测中心：意图识别、问数准确、追问质量、建议质量、越权拦截。
9. 反馈闭环：用户点赞/踩、纠错、采纳、拒绝、人工接管原因。
10. 价值看板：节省工时、挽回收入、减少风险、执行成功率、成本。

### 8.2 迭代机制

- 每个 Agent、工具、Ontology、指标和提示策略都必须版本化。
- 上线前必须跑评测集和权限用例。
- 上线后按真实运行反馈生成改进 backlog。
- 低质量回答要能追溯到原因：意图错、数据错、工具错、权限错、口径错、模型错。
- 支持灰度发布、回滚、禁用单个工具或单个 Agent。

## 9. 数据与系统架构需求

### 9.1 独立架构原则

- 独立运行时：V6 有自己的 orchestration runtime，不依赖历史 Agent runtime。
- 独立数据表：V6 的 run、memory、capability、tool、eval、approval、ontology 独立建模。
- 独立 API：V6 API 使用独立 namespace，如 `/api/agent-v6/*`。
- 独立治理页：V6 Governance Center 独立呈现，不混入旧治理台。
- 可接入 Ami Core：通过 capability map、API adapter、DB read model 和 approval gateway 接入。
- 可替换模型：底层模型供应商可配置，不把业务能力绑死在单一模型。

### 9.2 建议模块

- `AgentV6Orchestrator`：主编排器，负责意图、角色、计划、工具和结果。
- `AgentV6MemoryService`：分层记忆和记忆治理。
- `AgentV6SemanticLayer`：Ontology、指标、别名、口语语义。
- `AgentV6CapabilityScanner`：Ami Core 能力扫描。
- `AgentV6ToolRegistry`：工具注册、schema、权限、版本、风险。
- `AgentV6PolicyEngine`：RBAC/ABAC、数据范围、动作风险审批。
- `AgentV6EvidenceEngine`：数据来源、引用、口径和追溯。
- `AgentV6ApprovalGateway`：dry-run、审批、执行、回滚记录。
- `AgentV6GovernanceCenter`：治理台 API 和页面。
- `AgentV6EvaluationService`：离线评测、线上抽检、用户反馈。
- `AgentV6EventScheduler`：主动扫描、风险触发和计划任务。

### 9.3 核心数据对象建议

- `AgentV6Run`
- `AgentV6Step`
- `AgentV6Message`
- `AgentV6MemoryItem`
- `AgentV6OntologyNode`
- `AgentV6OntologyEdge`
- `AgentV6MetricDefinition`
- `AgentV6CapabilitySnapshot`
- `AgentV6ToolDefinition`
- `AgentV6ToolInvocation`
- `AgentV6PermissionPolicy`
- `AgentV6ApprovalRequest`
- `AgentV6Feedback`
- `AgentV6EvaluationCase`
- `AgentV6EvaluationResult`
- `AgentV6RiskSignal`

## 10. 关键用户故事

### 10.1 老板看经营

作为老板，我希望问“这周门店经营最需要我关注什么”，V6 能按收入、利润、客流、客户资产、库存、员工和风险给出 Top 5 事项，并解释每项的证据和建议动作。

验收：

- 能识别老板权限。
- 能跨域汇总。
- 能标注数据时间范围。
- 能给出优先级理由。
- 高风险建议只生成审批草案。

### 10.2 店长处理今日任务

作为店长，我希望系统每天自动生成“今日经营任务清单”，并能把任务分配给前台、美容师、客服或营销。

验收：

- 任务来自真实风险或目标差距。
- 每个任务有负责人建议、截止时间、预期影响。
- 可一键创建内部待办。
- 后续能追踪是否完成。

### 10.3 前台补空档

作为前台，我希望问“下午有没有空档，能不能补一下”，V6 能识别空档、推荐适合触达客户、生成话术，并在确认后创建跟进任务或触达草稿。

验收：

- 不自动群发。
- 推荐客户必须有理由。
- 尊重客户偏好和触达限制。
- 触达前需要确认。

### 10.4 财务查异常

作为财务，我希望问“昨天收银有没有问题”，V6 能查退款、折扣、会员卡扣次、支付失败、现金差异和异常操作。

验收：

- 能下钻到明细。
- 能解释异常规则。
- 不能越权暴露敏感数据。
- 只能生成核查任务，不能自动改账。

### 10.5 库存主动预警

作为库存负责人，我希望 V6 主动提醒“哪些耗材即将不够或临期”，并结合预约和项目消耗预测补货。

验收：

- 预测说明依据。
- 区分低库存、临期、异常消耗。
- 可生成采购草案。
- 采购提交需审批。

### 10.6 美容师个性化服务

作为美容师，我希望在客户到店前看到客户偏好、历史项目、禁忌、上次反馈和推荐话术。

验收：

- 只看授权客户。
- 高敏记录按权限脱敏。
- 推荐不能替代专业判断。
- 服务后能生成回访建议。

## 11. P0/P1/P2 范围

### 11.1 P0：独立底座和可信只读闭环

目标：证明 V6 是一个独立、可治理、能理解美业经营并可信问数/提示风险的系统。

范围：

- 独立 V6 namespace、数据模型和运行日志。
- 基础对话工作台。
- 分层记忆 P0：会话记忆、用户偏好、实体别名。
- 模糊追问 P0：时间、对象、指标、权限、风险动作。
- 美业 Ontology P0：核心对象、一级意图域、指标口径注册。
- Ami Core Capability Scanner P0：只读扫描 API/schema/权限/菜单，生成能力地图。
- 数据查询技能 P0：客户、预约、订单、会员卡、库存、员工、营销基础查询。
- 风险提示 P0：客户流失、预约空档、收银异常、库存低量/临期。
- 多 Agent P0：店长总控、营销、财务、库存、前台、数据审计。
- 权限 P0：角色权限、门店范围、字段脱敏、风险动作拦截。
- 治理 P0：运行追踪、工具注册、能力地图、反馈、评测基础。

不做：

- 不自动执行资金、库存、会员资产和营销群发。
- 不做完全自主排班。
- 不做跨系统第三方 Agent 互联。
- 不做语音实时 Agent。

### 11.2 P1：受控业务操作和多角色协同

目标：从“能查能建议”升级到“能生成可审批的业务动作并推动处理”。

范围：

- 多 Agent 协同任务卡。
- 客户跟进任务、营销活动草案、库存采购草案、财务核查任务。
- dry-run、审批、执行、回滚记录。
- 主动经营驾驶舱。
- 评测中心扩展到建议质量、追问质量和权限安全。
- 记忆扩展到决策记忆、反馈记忆和任务记忆。

### 11.3 P2：数字店长和经营自动化

目标：在强治理下，让 V6 能持续监控门店经营并主动驱动结果。

范围：

- 目标拆解和周期复盘。
- 动态排班/空档优化建议。
- 客户生命周期自动运营。
- 库存消耗预测和采购优化。
- 多门店对比和总部策略。
- 语音/终端/移动端协同。
- A2A/MCP 方式连接外部系统或第三方 Agent。

### 11.4 P3：门店数字经营网络

目标：从单店数字店长升级为跨店、跨角色、跨系统的数字经营团队。

范围：

- 跨门店经营策略。
- 区域经理 Agent。
- 加盟商经营顾问 Agent。
- 行业 benchmark 和经营模拟。
- Agent marketplace 或插件生态。

## 12. 验收标准

### 12.1 P0 必须通过

- 100% V6 run 有 trace、tool invocation、permission decision 和 evidence。
- 关键经营问数准确率不低于 95%，且能回溯明细。
- 典型口语化意图集覆盖不少于 200 条。
- 缺关键参数时不胡编，必须追问或声明假设。
- 无权限用户无法通过自然语言绕过菜单/API 权限。
- 所有 L3/L4 动作被拦截到审批或禁止执行。
- Capability Scanner 能输出 Ami Core 能力地图，并标明可接入/不可接入原因。
- Governance Center 能查看运行、能力、工具、反馈和评测结果。

### 12.2 P1 必须通过

- 多 Agent 协同任务能展示角色分工、证据和结论。
- 至少 5 类业务草案可生成：客户跟进、营销活动、采购、财务核查、空档填充。
- dry-run 能展示影响对象、字段变化、风险和回滚方式。
- 审批流可追踪到审批人和执行结果。
- 用户反馈能进入迭代 backlog。

### 12.3 P2 必须通过

- 主动风险任务能按计划触发，并可解释触发原因。
- 经营建议能追踪采纳、执行和业务结果。
- 跨门店、跨角色、跨系统协同不发生权限穿透。
- Agent 成本、延迟、错误率和业务价值可度量。

## 13. 主要风险与产品约束

| 风险 | 影响 | 约束 |
| --- | --- | --- |
| 模型编造数据 | 经营误判 | 所有经营数据必须来自工具和 evidence，不允许凭模型生成 |
| 口径不一致 | 老板不信任 | 指标必须注册口径，答案必须展示时间和范围 |
| 越权访问 | 隐私和合规风险 | RBAC/ABAC、字段脱敏、Agent 身份隔离 |
| 工具误用 | 错改业务数据 | 风险分级、dry-run、审批、幂等、回滚 |
| 记忆污染 | 长期错误建议 | 记忆来源、有效期、用户可管理、冲突提示 |
| 自动化过度 | 门店失控 | P0/P1 坚持人确认，中高风险不自动执行 |
| 接入面太大 | 研发失控 | Capability Scanner 先建地图，再分批接入 |
| 成本过高 | 商业化困难 | 按场景路由模型，缓存指标，异步任务，控制长上下文 |
| 员工抵触 | 落地慢 | 强调辅助和提效，提供人工接管和可解释建议 |

## 14. 对研发的关键要求

- 先做独立 V6 边界，再接 Ami Core，不在旧 Agent 中继续堆功能。
- 先定义工具 schema、权限和 evidence，再让模型调用。
- 先建立能力地图和指标口径，再追求全业务覆盖。
- 先做只读可信闭环，再做写操作。
- 先做治理中心和评测，再扩大自动化。
- 每个业务动作都要有“谁发起、为什么、影响什么、谁批准、结果如何”的记录。

## 15. 推荐的第一阶段交付物

后续建议按以下顺序继续产出：

1. 《Agent V6 独立技术架构方案》
2. 《Agent V6 Ami Core Capability Scanner 详细设计》
3. 《Agent V6 美业 Ontology 与指标口径设计》
4. 《Agent V6 权限、审批与安全护栏方案》
5. 《Agent V6 P0 开发计划与 tasks.md》
6. 《Agent V6 P0 验收用例与评测集》

## 16. 外部参考来源

- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- OpenAI API Agents guide: https://developers.openai.com/api/docs/guides/agents
- Model Context Protocol 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- MCP Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Elicitation: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- Google Agent Development Kit: https://adk.dev/
- Google Agent2Agent Protocol announcement: https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
- Microsoft Copilot Studio generative orchestration: https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions
- Microsoft Copilot Studio data policies: https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-data-loss-prevention
- Salesforce Agentforce 3: https://www.salesforce.com/news/press-releases/2025/06/23/agentforce-3-announcement/
- ServiceNow AI Agents: https://www.servicenow.com/products/ai-agents.html
- ServiceNow AI Control Tower: https://www.servicenow.com/products/ai-control-tower.html
- ServiceNow 2026 AI Control Tower update: https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-expands-AI-Control-Tower-to-discover-observe-govern-secure-and-measure-AI-deployed-across-any-system-in-the-enterprise/default.aspx
- Zenoti AI Workforce: https://www.zenoti.com/ai-workforce
- Fresha AI-powered intelligent scheduling: https://www.fresha.com/blog/fresha-ai-powered-intelligent-scheduling-beauty-wellness
- Vagaro Business AI: https://www.vagaro.com/pro/business-ai
- Vagaro Connect AI Support: https://support.vagaro.com/hc/en-us/articles/31806231306779-Set-Up-A-Chatbot-for-Your-Business-with-Connect-AI
- Microsoft GraphRAG: https://www.microsoft.com/en-us/research/project/graphrag/
- OWASP GenAI Security Project: https://genai.owasp.org/
- OWASP Agentic AI Threats and Mitigations: https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
