# Ami Ask 命名实体真实验收 v1

- 开发门店：6
- 连接模式：`development_admin_entity_resolution`，只用于客户/员工姓名到内部 ID 的门店内唯一性解析，不代表生产只读 SQL 验收。
- 结果：27/27（100.0%）。

| ID | 问题 | 解析对象 | 预期 | 实际 | 结果 | 原因 |
|---|---|---|---|---|---|---|
| ami_brain_2000:BQ0242 | 唐伊是什么职级 | 唐伊 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0251 | 宋乔是什么职级 | 宋乔 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0260 | 沈晴是什么职级 | 沈晴 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0269 | 顾然是什么职级 | 顾然 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0278 | 顾然这半年的提成是多少 | 顾然 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0287 | 唐伊昨天的提成是多少 | 唐伊 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0296 | 宋乔本月的提成是多少 | 宋乔 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0869 | 唐伊今年有几个预约 | 唐伊 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0243 | 唐伊上个月的排班是怎样的 | 唐伊 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0261 | 沈晴这个季度的排班是怎样的 | 沈晴 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0281 | 顾然服务过的客户这半年满意度如何 | 顾然 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0290 | 唐伊服务过的客户昨天满意度如何 | 唐伊 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0299 | 宋乔服务过的客户本月满意度如何 | 宋乔 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0308 | 沈晴服务过的客户最近30天满意度如何 | 沈晴 | 解析稳定 ID | 已解析 ID | 通过 | - |
| ami_brain_2000:BQ0003 | 吴晓雯的会员等级是什么 | 吴晓雯 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0015 | 吴梦瑶的会员等级是什么 | 吴梦瑶 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0181 | 预测马欣怡的流失风险有多高 | 马欣怡 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0186 | 杨紫萱的客户价值分层预测 | 杨紫萱 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0189 | 预测孙婉清的流失风险有多高 | 孙婉清 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0192 | 黄思琪的客户价值分层预测 | 黄思琪 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0194 | 预测朱梦瑶的流失风险有多高 | 朱梦瑶 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0197 | 周若兰的客户价值分层预测 | 周若兰 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0198 | 预测林雨薇的流失风险有多高 | 林雨薇 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0201 | 王静怡的客户价值分层预测 | 王静怡 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0202 | 预测徐佳慧的流失风险有多高 | 徐佳慧 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| ami_brain_2000:BQ0205 | 朱静怡的客户价值分层预测 | 朱静怡 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_unique |
| agent_650:frontdesk-030 | 张美丽的预约是几点，做什么项目 | 张美丽 | 澄清 ID | 澄清 ID | 通过 | customer_entity_not_found |

若运行时唯一性与 Gold 分类不一致，本验收失败并要求重分题目；不得把同名/不存在实体记为 SQL 失败，也不得把未按稳定 ID 过滤的全店聚合记为通过。
