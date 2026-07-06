# Agent V2 KG-only 与旧正则差异归因报告

生成时间：2026-07-06 06:36:54 Asia/Shanghai
评测题来源：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-eval-drafts.json

## 摘要

- P0 总数：103
- 差异数：21
- 差异率：20.39%
- KG 命中期望：21
- legacy 命中期望：0
- 需要修正 KG 的差异：0
- 是否可凭归因进入退役：可以

## 分类统计

| 分类 | 数量 | 含义 |
|---|---:|---|
| KG 正确 / legacy 缺口 | 21 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| legacy 正确 / KG 缺口 | 0 | KG-only 未命中但旧链路正确；旧正则仍是兜底，需先补图谱/Manifest/映射。 |
| KG 正确 / legacy 相邻 | 0 | 新链路与期望一致，旧链路命中相邻能力；可作为新链路改进样例。 |
| legacy 正确 / KG 相邻 | 0 | KG-only 命中相邻能力但旧链路正确；需修正 KG 映射或互斥规则。 |
| 新旧均需复核 | 0 | 新旧链路均偏离期望或命中不同相邻能力；需产品/业务确认归因。 |
| 新旧均缺口 | 0 | 新旧链路均未命中期望能力；需补能力或修正评测口径。 |

## 差异明细

| ID | 问题 | 期望 | KG-only | legacy | preferred | 分类 | 退役影响 |
|---|---|---|---|---|---|---|---|
| q061 | 现在哪些产品库存不够了 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q067 | 现在库存金额大概多少 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q079 | 库存的周转率怎么样 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q060 | 这个客人要退款，原因是项目没做完，怎么处理 | finance.refund.metric | finance.refund.metric | - | finance.refund.metric / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q002 | 帮我看一下库存整体情况 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q005 | 精华液现在库存还有多少 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q006 | 帮我看一下所有低于安全库存的产品 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q011 | 这个月库存消耗和上个月比有没有异常 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q012 | 帮我看一下补水系列产品的库存 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q015 | 哪些产品的安全库存线设得不合理 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q019 | 现在门店和仓库的库存加起来有多少 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q024 | 最贵的那几样耗材现在库存怎么样 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q040 | 帮我查一下我们的库存损耗率高不高 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q068 | 我们的库存周转目标是多少天，达到了吗 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q070 | 帮我设置一个当某产品低于安全库存就提醒我的规则 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q080 | 如果接待量增加20%，库存够用吗 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q053 | 最近退款原因主要是什么 | finance.refund.metric | finance.refund.metric | - | finance.refund.metric / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q054 | 哪个美容师的退款率最高 | finance.refund.metric | finance.refund.metric | - | finance.refund.metric / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q060 | 退款走了什么审批流程，合规吗 | finance.refund.metric | finance.refund.metric | - | finance.refund.metric / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q013 | 库存低的产品有哪些？（然后）帮我生成补货清单 | inventory.bom.consumption.records.records.list | inventory.bom.consumption.records.records.list | - | inventory.bom.consumption.records.records.list / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
| q022 | 有个客人投诉说效果差，我应该退款还是再给她做一次 | finance.refund.metric | finance.refund.metric | - | finance.refund.metric / kg_llm | KG 正确 / legacy 缺口 | 新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。 |
