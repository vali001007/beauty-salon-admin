# Ami Brain 模型驱动候选能力真实灰度验收报告

**日期：** 2026-07-15  
**真实门店：** storeId `6`  
**最终灰度 Release：** `59`  
**最终 Eval Run：** `29`  
**最终状态：** 候选门禁通过，已完成激活与 rules 回滚，当前生产仍运行 rules baseline。

## 1. 结论

本轮证明的不是“六域终极经营智能体已经完成”，而是以下最小闭环已经真实成立：

```text
后端业务/数据合同
  -> Business Definition 自动候选与发布
  -> Capability 自动生成
  -> 模型结构化意图
  -> Capability 检索/计划
  -> 参数化真实查询
  -> citation 与结构化 blocks
  -> 发布评测
  -> 激活
  -> rules 回滚
```

最终 5 个候选能力、10 条能力样例和 4 条安全对抗样例全部通过，结果为 `14/14`。候选能力随后被归档，当前唯一 active release 是 `ami-brain-rules-baseline-20260714`，因此本轮验证没有把开发候选长期留在生产路径。

## 2. 已发布统一业务定义

| 定义 | 当前版本 | 状态 | 用途 |
| --- | ---: | --- | --- |
| `metric.paid_amount` | 3 | published / passed | 当前门店指定周期实收金额 |
| `metric.product_sales_quantity` | 3 | published / passed | 当前门店商品销量排行 |
| `metric.project_service_count` | 3 | published / passed | 当前门店项目服务次数排行 |

同时发布商品、项目、美容师 ID/名称 6 个维度定义。指标合同从后端执行器、Prisma 字段、权限和 store scope 反向验证，Capability 只保存定义引用，不保存第二份公式。

## 3. 最终候选技能

| Resource Version ID | Capability | 版本 | Grounding | 真实边界 |
| ---: | --- | ---: | --- | --- |
| 37 | `customer_facts` | 6 | domain_service | 精确客户事实查询 |
| 38 | `order_revenue_analysis` | 6 | semantic_query | 单周期实收汇总 |
| 39 | `product_sales_ranking` | 7 | semantic_query | 指定周期商品销量排行 |
| 44 | `project_service_ranking` | 8 | semantic_query | 指定周期项目服务次数排行 |
| 43 | `reservation_list` | 9 | domain_service | 当前门店指定周期预约列表 |

回滚后以上版本状态均为 `archived`，没有候选技能保持生产 active。

## 4. 发布门禁结果

最终 eval run `29`：

| 门禁 | 结果 |
| --- | ---: |
| 总样例 | 14 |
| 通过 | 14 |
| 失败 | 0 |
| 覆盖完整 | true |
| 可发布 | true |
| 缺失 Capability | 0 |

能力样例覆盖客户事实、实收查询、商品排行、项目排行和预约列表。安全样例覆盖：

- Prompt injection
- 跨门店读取
- `roleHint` 冒充财务权限
- 假动作确认

四类安全样例均通过。

## 5. 灰度过程中发现并修复的问题

1. 单步计划预算等于工具超时，调度后必然耗尽。
2. Supervisor 接受小于 DAG 关键路径的模型预算。
3. Supervisor 把模型自造的时间对象直接传给工具，出现错误年份和非法字段。
4. 排行执行器拒绝合法 `orderBy`，导致正确意图无法执行。
5. “项目/商品/预约”泛指实体被当成具体实体筛选。
6. 客户实体未自动绑定 `entity.customer`，字段查询被错误要求澄清。
7. “最近7天”被旧解析器解释为最近30天。
8. 模型生成跨门店、命名门店和冲突时间样例，污染发布评测。
9. Capability 业务域由模型选择，导致指标域丢失和检索不稳定。
10. 发布门禁要求模型复述 Capability 全部辅助域，正确实收结果被误判失败。
11. Kimi 与 DeepSeek 的结构化语义遵循度差距明显，模型配置必须进入发布门禁。

以上问题均通过合同归一化、Ontology 自动链接、确定性参数覆盖、关键路径预算、结构化重试和候选编译门禁修复，没有通过降低答案正确性或安全评分解决。

## 6. 自动化能力链路现状

本轮链路已经支持：

- 扫描显式后端 Capability 声明。
- 校验 Controller/Service/Prisma/Permission/store scope 证据。
- 自动生成指标、维度和 Capability 候选。
- 只引用统一 Business Definition 版本。
- 自动生成契约、样例、风险说明和 executor binding。
- 自动持久化 draft，进入评测、发布、激活和回滚。
- 后端合同变化后生成新版本，不覆盖旧版本。

仍需人工审批的对象是发布风险和统一业务口径，不是 JSON Schema、关键词或技能代码。

## 7. 代码与构建验证

```text
Brain Jest: 114 passed, 1 skipped
Tests: 1377 passed, 1 skipped
server-v2 build: passed
root typecheck + Vite build: passed
```

## 8. 未完成项与产品风险

- 尚未用最终 release 重跑 650 题，不能据此宣称总体真实可用率达到 42% 或终极指标。
- 员工表现、库存风险 resolver 仍未发布，营销优先级仍缺统一公式。
- 实收比较、趋势和诊断没有执行器，本轮已从合同中收窄为 query，避免“合同承诺大于实现”。
- 真实写动作没有扩面，采购、改约、群发、核销仍需后续 Capability 和事务回执。
- Kimi 同集门禁结果为 `6/14`，当前不满足主模型发布要求。

## 9. 下一步门禁

1. 发布员工表现与库存风险 resolver Capability。
2. 在统一业务口径中心确认营销优先级公式。
3. 实现多周期 comparison/trend executor。
4. 使用候选 release 重跑 650 题并输出六层评分。
5. 达到阶段指标后再进入连续 canary，不把一次 14 题通过等同于长期生产稳定性。
