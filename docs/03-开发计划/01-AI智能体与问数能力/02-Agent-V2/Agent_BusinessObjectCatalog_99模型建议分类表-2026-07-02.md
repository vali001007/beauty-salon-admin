# Agent BusinessObjectCatalog 99 模型建议分类表

> 生成时间：2026-07-02
> 来源：`docs/04-测试数据/agent-knowledge-scan-report.json` 中 `missingBusinessObjectMappings` 的 99 个模型。
> 目的：为后续补齐 `BusinessObjectCatalog` 提供产品确认表。
> 结论：建议分为 51 个 Agent 必查对象、41 个 Agent 证据对象、7 个系统内部对象。

---

## 1. 分类口径

| 分类 | 判断标准 | Catalog 建议 |
|---|---|---|
| Agent 必查对象 | 门店用户、店长、前台、财务、库存、营销等角色会直接问到 | 进入 `BusinessObjectCatalog`，补中文名、queryableFields、displayFields、supportedActions |
| Agent 证据对象 | 用户一般不会直接问，但 Agent 回答时需要作为证据、来源、上下文 | 进入 `BusinessObjectCatalog`，建议增加 `evidenceOnly: true` 或等价标记 |
| 系统内部对象 | 认证、权限、Agent 配置、内部运行态，不应直接暴露给门店用户 | 不进入普通业务查询；建议 `internalOnly` 或白名单豁免 |

---

## 2. Agent 必查对象

这些对象建议优先进入 `BusinessObjectCatalog`。它们对应门店运营、财务、客户、库存、营销、排班、供应链等真实业务问题。

| 序号 | Model | 建议中文名 | 典型用户问题 | 建议优先级 | 建议动作 |
|---:|---|---|---|---|---|
| 1 | AmiMonthlyBill | Ami 月度账单 | 本月 Ami 费用是多少 | P2 | 加入 Catalog |
| 2 | AppointmentGapCandidate | 预约空档候选 | 今天哪些空档可以填补 | P1 | 加入 Catalog |
| 3 | AppointmentGapOpportunity | 预约空档机会 | 哪些时段适合召回客户填档 | P1 | 加入 Catalog |
| 4 | BeauticianAvailability | 美容师可预约时间 | 哪个美容师下午有空 | P1 | 加入 Catalog |
| 5 | BeauticianLevel | 美容师等级 | 哪些美容师是高级美容师 | P2 | 加入 Catalog |
| 6 | BeauticianTimeOff | 美容师请假 | 今天哪些美容师请假 | P2 | 加入 Catalog |
| 7 | Card | 卡项定义 | 这个卡项有什么权益 | P1 | 加入 Catalog |
| 8 | CashierShift | 收银班次 | 今天谁开的收银班 | P1 | 加入 Catalog |
| 9 | CommissionRecord | 提成记录 | 本月员工提成明细 | P1 | 加入 Catalog |
| 10 | CommissionRule | 提成规则 | 这个项目怎么算提成 | P1 | 加入 Catalog |
| 11 | CommissionRuleAssignment | 提成规则分配 | 哪些员工用了这个提成规则 | P1 | 加入 Catalog |
| 12 | CommissionSettlement | 提成结算 | 本月提成结算了吗 | P1 | 加入 Catalog |
| 13 | CommissionSettlementRecord | 提成结算明细 | 某员工这次结算多少钱 | P1 | 加入 Catalog |
| 14 | CustomerBalanceAccount | 客户余额账户 | 客户储值余额是多少 | P1 | 加入 Catalog |
| 15 | CustomerBalanceTransaction | 客户余额流水 | 客户最近充值消费流水 | P1 | 加入 Catalog |
| 16 | CustomerHealthProfile | 客户健康/皮肤档案 | 这个客户有哪些护理禁忌 | P2 | 加入 Catalog |
| 17 | DailySettlement | 日结记录 | 今天日结情况怎么样 | P1 | 加入 Catalog |
| 18 | MarketingAutomationExecution | 营销自动化执行 | 最近自动触达执行效果如何 | P1 | 加入 Catalog |
| 19 | MarketingAutomationStrategy | 营销自动化策略 | 当前有哪些自动化营销规则 | P2 | 加入 Catalog |
| 20 | MarketingPageLead | 营销页线索 | 活动页收集了哪些客户线索 | P1 | 加入 Catalog |
| 21 | MarketingRecommendationSnapshot | 营销推荐快照 | 当前推荐做哪些营销活动 | P1 | 加入 Catalog |
| 22 | MarketingRuleTemplate | 营销规则模板 | 有哪些可用营销模板 | P2 | 加入 Catalog |
| 23 | OperatingCost | 经营成本 | 本月固定成本和变动成本是多少 | P1 | 加入 Catalog |
| 24 | PrintJob | 打印任务 | 今天有哪些小票打印任务 | P2 | 加入 Catalog |
| 25 | ProcurementOrder | 采购单 | 最近采购单有哪些 | P1 | 加入 Catalog |
| 26 | ProcurementOrderItem | 采购单明细 | 这张采购单买了哪些商品 | P1 | 加入 Catalog |
| 27 | ProductSupplier | 商品供应商关系 | 这个商品由哪个供应商供货 | P1 | 加入 Catalog |
| 28 | ProjectBomItem | 项目耗材明细 | 这个项目消耗哪些耗材 | P1 | 加入 Catalog |
| 29 | ProjectType | 项目类型 | 哪些项目属于护理类 | P2 | 加入 Catalog |
| 30 | Promotion | 权益/促销资产 | 当前可用优惠权益有哪些 | P1 | 加入 Catalog |
| 31 | ResourceBooking | 资源预约 | 房间或仪器今天被谁预约了 | P2 | 加入 Catalog |
| 32 | Schedule | 排班 | 今天员工排班怎么样 | P1 | 加入 Catalog |
| 33 | SchedulingRuleConfig | 排班规则 | 当前排班规则是什么 | P2 | 加入 Catalog |
| 34 | ServiceTask | 服务任务 | 今天哪些服务任务未完成 | P1 | 加入 Catalog |
| 35 | SkinTest | 皮肤测试 | 客户最近皮肤测试结果 | P2 | 加入 Catalog |
| 36 | StockBatch | 库存批次 | 哪些库存快临期 | P1 | 加入 Catalog |
| 37 | StockMovement | 库存流水 | 这个商品最近出入库记录 | P1 | 加入 Catalog |
| 38 | Store | 门店 | 多门店经营对比 | P1 | 加入 Catalog |
| 39 | StoreResource | 门店资源 | 哪些房间或仪器可用 | P2 | 加入 Catalog |
| 40 | SupplierOrder | 供应商订单 | 供应商订单进度如何 | P1 | 加入 Catalog |
| 41 | SupplierOrderItem | 供应商订单明细 | 这批供应商订单包含哪些商品 | P1 | 加入 Catalog |
| 42 | SupplierQualification | 供应商资质 | 供应商资质是否过期 | P2 | 加入 Catalog |
| 43 | SupplierSettlement | 供应商结算 | 本月供应商应结算多少 | P1 | 加入 Catalog |
| 44 | SupplierShipment | 供应商发货 | 哪些采购已发货 | P1 | 加入 Catalog |
| 45 | SupplierShipmentItem | 供应商发货明细 | 这次发货有哪些商品 | P1 | 加入 Catalog |
| 46 | SupplyQuote | 供应报价 | 哪个供应商报价更低 | P2 | 加入 Catalog |
| 47 | SupplySettlement | 供货结算 | 供货平台结算情况 | P2 | 加入 Catalog |
| 48 | SupplySku | 供货 SKU | 平台供货商品有哪些 | P2 | 加入 Catalog |
| 49 | SupplySupplier | 供货商 | 可选供货商有哪些 | P2 | 加入 Catalog |
| 50 | TerminalFollowUpTask | 终端跟进任务 | 今天有哪些客户跟进任务 | P1 | 加入 Catalog |
| 51 | TransferOrder | 调拨单 | 哪些门店调拨单待处理 | P1 | 加入 Catalog |

---

## 3. Agent 证据对象

这些对象不建议作为普通用户直接查询入口，但应作为 Agent 回答的证据来源、溯源数据或上下文。

| 序号 | Model | 建议中文名 | 作为证据的场景 | 建议优先级 | 建议动作 |
|---:|---|---|---|---|---|
| 1 | AgentApproval | Agent 审批记录 | 解释某个动作为什么未执行或待审批 | P2 | evidenceOnly |
| 2 | AgentAutomationEffect | Agent 自动化效果 | 评估自动化营销和运营动作效果 | P2 | evidenceOnly |
| 3 | AgentDailyArchive | Agent 日归档 | 治理日报、历史表现趋势 | P2 | evidenceOnly |
| 4 | AgentEvalRun | Agent 评测运行 | 解释能力回归和评测结果 | P2 | evidenceOnly |
| 5 | AgentFeedback | Agent 反馈 | 判断用户认为哪些回答无用 | P1 | evidenceOnly |
| 6 | AgentMemory | Agent 记忆 | 解释长期记忆和偏好来源 | P2 | evidenceOnly |
| 7 | AgentMessage | Agent 消息 | 对话审计和错误复盘 | P2 | evidenceOnly |
| 8 | AgentRenderedBlock | Agent 渲染块 | 复盘卡片、表格、图表输出 | P2 | evidenceOnly |
| 9 | AgentStep | Agent 执行步骤 | 解释工具调用和执行链路 | P2 | evidenceOnly |
| 10 | AgentToolCall | Agent 工具调用 | 定位工具失败、耗时和结果 | P1 | evidenceOnly |
| 11 | AiAuditLog | AI 审计日志 | 审计回答来源、失败原因 | P1 | evidenceOnly |
| 12 | AmiGlowDisplayConfig | 小程序展示配置 | 解释客户端展示内容 | P2 | evidenceOnly |
| 13 | AmiPerformanceRecord | Ami 绩效记录 | 评估智能终端使用效果 | P2 | evidenceOnly |
| 14 | AppointmentGapOpportunityEvent | 空档机会事件 | 解释填档机会的触发和转化 | P2 | evidenceOnly |
| 15 | BeauticianProjectSkill | 美容师项目技能 | 推荐美容师、判断可接项目 | P1 | evidenceOnly |
| 16 | Category | 分类 | 商品、项目、卡项归类展示 | P2 | evidenceOnly |
| 17 | ConsumptionRecord | 消耗记录 | 项目耗材成本、库存消耗分析 | P1 | evidenceOnly |
| 18 | CustomerAppEvent | 客户端事件 | 营销点击、访问、转化分析 | P1 | evidenceOnly |
| 19 | CustomerAppIdentity | 客户端身份 | 小程序用户和客户档案关联 | P2 | evidenceOnly |
| 20 | CustomerBehaviorEvent | 客户行为事件 | 客户活跃、复购、流失判断 | P1 | evidenceOnly |
| 21 | CustomerPredictionSnapshot | 客户预测快照 | 客户流失风险、复购机会解释 | P1 | evidenceOnly |
| 22 | IndustryAdoptionRecord | 行业方案采纳记录 | 解释行业模板落地情况 | P2 | evidenceOnly |
| 23 | IndustryEvidence | 行业证据 | 行业建议的来源证据 | P2 | evidenceOnly |
| 24 | IndustryKnowledgeItem | 行业知识条目 | 行业建议和模板推荐依据 | P2 | evidenceOnly |
| 25 | IndustryProductTemplate | 行业商品模板 | 商品建档和补货建议依据 | P2 | evidenceOnly |
| 26 | IndustryProjectBomItemTemplate | 行业项目 BOM 明细模板 | 项目耗材模板依据 | P2 | evidenceOnly |
| 27 | IndustryProjectBomTemplate | 行业项目 BOM 模板 | 项目 BOM 建议依据 | P2 | evidenceOnly |
| 28 | IndustrySalaryBenchmark | 行业薪酬基准 | 员工薪酬和提成建议参考 | P2 | evidenceOnly |
| 29 | IndustryServiceTemplate | 行业服务模板 | 项目建档、服务设计参考 | P2 | evidenceOnly |
| 30 | IndustrySupplyMappingRequest | 行业供货映射请求 | 供应链匹配和行业模板落地证据 | P2 | evidenceOnly |
| 31 | MarketingAttribution | 营销归因 | 活动效果和成交来源分析 | P1 | evidenceOnly |
| 32 | MarketingPageAttribution | 营销页归因 | 推广页转化来源分析 | P1 | evidenceOnly |
| 33 | MarketingPageEvent | 营销页事件 | 浏览、点击、提交线索统计 | P1 | evidenceOnly |
| 34 | MarketingPageVersion | 营销页版本 | 活动页改版效果对比 | P2 | evidenceOnly |
| 35 | PredictionRun | 预测运行 | 解释预测模型何时生成 | P2 | evidenceOnly |
| 36 | RecommendationEvent | 推荐事件 | 解释推荐是否被采纳和转化 | P2 | evidenceOnly |
| 37 | ScheduleVersion | 排班版本 | 排班调整历史和对比 | P2 | evidenceOnly |
| 38 | SmartSchedulingRun | 智能排班运行 | 解释排班优化结果来源 | P2 | evidenceOnly |
| 39 | SupplyCatalogMapping | 供货目录映射 | 商品和供货 SKU 匹配依据 | P2 | evidenceOnly |
| 40 | User | 用户/员工账号 | 操作人、员工、审核人证据 | P2 | evidenceOnly |
| 41 | UserStore | 用户门店关系 | 多门店权限和数据范围证据 | P2 | evidenceOnly |

---

## 4. 系统内部对象

这些对象不建议进入门店运营 Agent 的普通查询对象。除非是系统管理员调试，否则应隐藏。

| 序号 | Model | 建议中文名 | 不建议暴露原因 | 建议动作 |
|---:|---|---|---|---|
| 1 | AgentDefinition | Agent 定义 | Agent 配置元数据，非门店业务对象 | internalOnly 或白名单 |
| 2 | AgentEvalCase | Agent 评测用例 | 测试资产，非业务经营数据 | internalOnly 或白名单 |
| 3 | AgentPersona | Agent 角色配置 | 系统配置，普通用户不应查询 | internalOnly 或白名单 |
| 4 | IndustryDataSource | 行业数据源 | 数据源配置，非业务对象 | internalOnly 或白名单 |
| 5 | RefreshToken | 刷新令牌 | 认证敏感对象，禁止 Agent 暴露 | internalOnly，强制敏感 |
| 6 | Role | 系统角色 | 权限配置，非经营问答对象 | internalOnly |
| 7 | UserRole | 用户角色关系 | 权限关系，非经营问答对象 | internalOnly |

---

## 5. 首批落地建议

不建议一次性把 99 个模型全部写进 `BusinessObjectCatalog`。建议按下面三批处理。

### 第一批：P1 必查对象

优先处理直接影响问答准确性的对象：

- `Card`
- `CashierShift`
- `CommissionRecord`
- `CommissionRule`
- `CommissionSettlement`
- `CustomerBalanceAccount`
- `CustomerBalanceTransaction`
- `DailySettlement`
- `MarketingPageLead`
- `MarketingRecommendationSnapshot`
- `OperatingCost`
- `ProjectBomItem`
- `Schedule`
- `ServiceTask`
- `StockBatch`
- `StockMovement`
- `SupplierSettlement`
- `TerminalFollowUpTask`
- `TransferOrder`

目标：让财务、客户资产、库存、排班、营销、提成类问题的证据和字段展示更业务化。

### 第二批：P1 证据对象

优先处理会影响解释可信度的证据对象：

- `AgentFeedback`
- `AgentToolCall`
- `AiAuditLog`
- `BeauticianProjectSkill`
- `ConsumptionRecord`
- `CustomerAppEvent`
- `CustomerBehaviorEvent`
- `CustomerPredictionSnapshot`
- `MarketingAttribution`
- `MarketingPageAttribution`
- `MarketingPageEvent`

目标：让 Agent 回答时能说清楚“为什么这样判断、数据来自哪里”。

### 第三批：internalOnly / evidenceOnly 机制

补充 Catalog 元数据能力：

- `evidenceOnly: true`
- `internalOnly: true`
- `sensitive: true`
- `defaultVisible: false`

目标：不是所有模型都进入用户可问范围，但都能被治理系统识别和解释。

---

## 6. 后续验收口径

| 验收项 | 目标 |
|---|---|
| P1 必查对象 | 全部进入 BusinessObjectCatalog |
| P1 证据对象 | 全部能作为 evidence source 展示 |
| 系统内部对象 | 不出现在普通 Agent 查询候选中 |
| 字段中文名 | P1 对象关键字段不再显示技术字段名 |
| 治理报告 | BusinessObjectCatalog 缺口从 99 明显下降 |
| Eval | 补充对象后 P0/P2 仍保持通过 |

---

## 7. 产品确认问题

需要产品确认以下边界：

1. `User` 是否允许被门店 Agent 查询，还是只作为员工/操作人证据。
2. `SkinTest` 当前是否已有完整业务闭环；如果只是记录，不应承诺医疗或诊断建议。
3. `AmiMonthlyBill` 和 `AmiPerformanceRecord` 是给平台运营看，还是也给门店店长看。
4. 供应链相关对象是否已开放给门店端，还是只在供货平台内部使用。
5. Agent 治理类对象是否只在系统管理员角色下可见。
