# Ami Brain 沉睡客户唤醒证据链实施报告

生成日期：2026-07-18

## 一、交付结论

`哪些沉睡客户最近有点被唤醒的迹象` 已从明确拒答升级为真实可用回答。实现完全复用现有管理端和后端事实，没有新增业务表、migration 或管理端页面；缺失管理能力继续保留在独立缺口清单。

本轮开发评测发布为 `292`，目标单题真实请求结果为 `usable_exact`，六层门禁全部通过。生产 Business Definition、生产能力和 active release 均未切换。

## 二、业务口径

### 2.1 沉睡基线

满足以下任一条件：

1. 触达时已有高流失/沉睡预测或 `dormant_winback` 客户机会。
2. 客户在阈值前已建档，且触达前 60 天没有实际到店和有效正金额消费。

### 2.2 触达后证据

观察窗口读取每条触达记录的归因配置，当前真实数据默认 30 天：

- 强信号：显式营销归因订单、有效正金额消费或实际到店等确定性行为。
- 中信号：触达后的预约或触达状态已转化，但还没有更强事实。
- 弱信号：点击、打开、回复等互动。
- 非唤醒：仅发送、送达、触达成功或没有后续行为。

时间先后只表明关联。只有 `MarketingAttribution` 记录视为系统显式归因，回答必须披露该因果边界。

## 三、复用的现有事实

| 事实 | 用途 |
| --- | --- |
| `MarketingAutomationTouch` | 触达时间、渠道、状态和互动 |
| `MarketingAttribution` | 显式营销归因订单和收入 |
| `CustomerOpportunity` | 已识别沉睡召回机会 |
| `CustomerPredictionSnapshot` | 触达时流失风险 |
| `Reservation` | 触达后预约和实际到店 |
| `ProductOrder` | 触达前后有效正金额消费 |

所有查询按当前 `storeId` 收口，使用 Prisma 参数化查询；没有使用用户输入拼接 SQL。

## 四、代码与治理交付

- `CustomerLifecycleOntologyService` 新增确定性沉睡唤醒证据汇总和明细。
- `customer_facts` 新增结构化 KPI、名单、证据、限制和 citation 输出。
- 新增 `metric.dormant_reactivation_customer_count` 业务定义候选和 resolver 合同。
- 新增 `customer_reactivation` 查询模板及模型语义指标匹配。
- 精确合同快路径保留名单题 answer shape，不把名单题降级为单值题。
- 题库期望、意图评分和答案评分同步更新。

治理记录：

| 对象 | 标识 | 状态 |
| --- | --- | --- |
| Business Definition | version `137` | `validated_candidate` |
| `customer_facts` | resource `268`, version `22` | productionReady，未生产发布 |
| 共享依赖刷新 | resources `269-286` | 18 项全部 productionReady |
| 评测发布 | release `292` | draft、shadow、evaluationOnly |
| 发布指纹 | `7b1d392c9930f42a10704ae96c69fb0d645005724b32c9a411d3f553838f09fb` | 19 项合同和源码新鲜度均有效 |

release `291` 曾因 18 项共享能力源码指纹过期被门禁拒绝。本轮重新生成受影响候选后创建 release `292`，没有跳过或弱化漂移门禁。

## 五、真实数据结果

门店 6，最近 30 天：

| 指标 | 数值 |
| --- | ---: |
| 有效触达总数 | 3671 |
| 已分析触达 | 3671 |
| 分析截断 | 否 |
| 沉睡候选客户 | 855 |
| 出现唤醒迹象 | 3 |
| 强信号 | 3 |
| 显式归因 | 3 |

目标客户：

| 客户 | 信号 | 显式归因收入 |
| --- | --- | ---: |
| 马语嫣 | 触达归因成交、触达状态已转化、有效消费 | 1600.00 |
| 杨诗涵 | 触达归因成交、触达状态已转化、有效消费 | 628.20 |
| 林伟明 | 触达归因成交、触达状态已转化、有效消费 | 698.00 |

## 六、真实请求评测

评测问题：`哪些沉睡客户最近有点被唤醒的迹象`

| 项目 | 结果 |
| --- | --- |
| 请求链路 | `BrainChatService.createConversation -> sendMessage` |
| evaluation release | `292` |
| 状态 | `usable_exact` |
| 执行路径 | `exact_contract_fast_path` |
| capability | `customer_facts` |
| grounding | `db_skill` |
| 模型 | `gpt-5.6-terra` |
| provider unavailable | 0 |
| 六层门禁 | intent/tool/plan/execution/completion/answer 全部通过 |
| 安全违规 | 权限绕过、跨店、roleHint 绕权、假动作确认均为 0 |

生成评测文件：

- `ami-brain-model-driven-eval-results-2026-07-15.json`
- `ami-brain-model-driven-eval-report-2026-07-15.md`

## 七、验证

- 定向单元测试通过。
- Brain 全量：135 个 suite 通过，1 个跳过；`1700/1701` 测试通过。
- `brain-security-eval-cases.spec.ts` 通过。
- `server-v2` build 通过。
- release `292` catalog validation 通过，issues=0，source freshness valid。

## 八、未纳入本轮

1. 不新增员工试用期管理、导师、阶段评价或转正审批。
2. 不应用客户反馈、等待记录或供应链权限 migration。
3. 不写入业务数据，不激活生产 Business Definition 或生产 release。
4. 不把当前单题通过解释为 650 题整体完成；后续仍需按 50 -> 120 -> 650 运行完整门禁。
