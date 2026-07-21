# Ami Brain 客户等待流失能力代码就绪报告

## 一、结论

“最近有没有客户因为等待时间长而离开”已具备统一事实、前台采集、结构化统计、Brain 专用回答和语义候选生成能力。当前状态是代码就绪，不是生产可用：`customer_waiting_episode` migration 尚未应用，真实门店尚无等待事实数据。

## 二、业务事实闭环

1. 客户签到后自动创建等待记录，记录开始时间、预约、客户、门店、预计等待和操作来源。
2. 前台只需选择“开始服务”或“离店”；离店原因固定为等待过久、时间冲突、个人原因、服务不可用或其他。
3. 系统自动计算实际等待分钟数，保留开始、结束、结果和操作人。
4. Brain 只把 `outcome=left` 且 `leaveReasonCode=wait_too_long` 计为等待流失。
5. 没有等待流失记录时同步披露等待采集覆盖率，避免把未采集误判为没有问题。

## 三、代码与接口

| 对象 | 交付 |
| --- | --- |
| Prisma | `CustomerWaitingEpisode`、状态/结果/原因/分钟一致性约束、活动预约部分唯一索引 |
| API | 开始等待、开始服务、离店、周期分析 |
| 预约链路 | 签到按门店校验并自动开始等待 |
| 管理端 | 预约列表的开始等待、开始服务、离店动作 |
| Brain | `customer_waiting_loss_overview` |
| 业务定义 | `customer_long_wait_departure_count`、`customer_waiting_collection_coverage_rate` |

## 四、自动扫描

- 显式能力扫描：826 个候选，26 个显式能力；新增能力为 draft、issues 0。
- 语义候选扫描：3936 个候选，3522 draft、414 blocked。
- 两项新增等待指标均为 draft，`blockedReasons=[]`。
- 扫描结果仅写入系统临时目录，未发布生产 Business Definition。

## 五、验证

| 验证项 | 结果 |
| --- | --- |
| 等待服务、预约签到集成、migration 测试 | `9/9` 通过 |
| Brain 专用能力 suite | `29/29` 通过 |
| 语义意图、模板、评测期望、resolver | `65/65` 通过 |
| 迁移预检 | `11/11` 通过 |
| Brain 全量测试 | 135 个 suite 通过，1 个跳过；`1698/1699` 测试通过 |
| 后端 build | 通过 |
| Prisma validate | 通过 |
| 管理端应用 typecheck/build | 通过 |
| 数据库写入 | 未执行 |

## 六、数据库状态

真实库只读预检显示三条 migration 均为 `ready`：供应链权限、客户反馈、客户等待事实。等待事实依赖的 `Store`、`Customer`、`Reservation` 均存在，目标表不存在，无建表冲突。

## 七、未完成项

- 未应用 migration，API 不能在当前真实库写入等待事实。
- 未通过真实前台流程采集等待数据。
- 未发布两项 Business Definition。
- 未运行该题的真实 targeted 评测、店长前 50 题和 120 题门禁。
- 没有对历史取消备注做自动回填；这是有意的安全边界，历史原因需要业务核实后再导入。
