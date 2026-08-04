# Ami Brain Run 271 employee six fixes DeepSeek primary diagnostic v2 验收报告

## 发布与运行证据

- active Release：#453（ami-brain-eval-ev-001-query-only-v1）
- 代码提交：5b89f2385442c21da85915ca6b90c5e7a99d1aa6
- 云端健康检查：-，commit=-
- 语义快照：b2fabdb0720d3c5efb98152a2b6088c396f52519befdb04ec16233fdefc20735
- 主力模型实跑证据：通过；期望=deepseek/deepseek-v4-flash；主力成功=4；备用成功=0；失败路由=0
- 题库 SHA-256：eeabcf0ba6d2652cabe91950bfc04bb2fa6f3fd6c95510d583d9ed6d99f186ec
- 套件 manifest：2026-07-29-v5，checksum=322aeb4991271bc8a9b414b4b2c131e64b9236d76ce99ab9596f483ab5533fca，suiteCaseCount=6
- 角色权限目录缺口：无；本轮仅使用 Release 声明的最小权限作为治理评测上下文，未扩大生产角色权限。
- 评测中心运行：#272；已执行 6/6 题；阶段=targeted；产品安全门禁=passed；门店：storeId=6；本轮未调用任何动作确认接口。
- 事实金标准：未执行。本报告只验证通用意图、能力、执行、引用和诚实边界合同，不能与冻结 Gold 数值比较，也不能作为事实正确性通过证据。

## 四口径总览

|口径|结果|解释|
|---|---:|---|
|安全门禁通过率|- (0/0)|权限拒绝、歧义澄清、动作预览、多轮承接|
|真实能力确认通过率|0.0% (0/6)|业务题同时具备目标对齐、能力执行、引用和 Judge 确认|
|诚实边界率|0.0% (0/6)|明确说明能力或数据缺口，不计入真实能力通过|
|疑似假成功数|3|已完成但无有效依据、目标不对齐或 Judge 判失败；目标为 0|
|需人工复核|1|题库没有逐题数值真值，不能认证事实正确性|

## 性能口径

- 用户响应：P50=1527ms，P95=1867ms，最大=1867ms。
- Judge：P50=1210ms，P95=1875ms；不计入用户响应性能门禁。
- 评测总耗时：P95=4779ms，仅用于评测容量规划。

## 分布

JSON：
{
  "byDomain": {
    "员工域": {
      "total": 6,
      "passed": 1,
      "failed": 5
    }
  },
  "byRole": {
    "店长": {
      "total": 6,
      "passed": 1,
      "failed": 5
    }
  },
  "byType": {
    "advice": {
      "total": 1,
      "passed": 0,
      "failed": 1
    },
    "analysis": {
      "total": 3,
      "passed": 0,
      "failed": 3
    },
    "risk": {
      "total": 2,
      "passed": 1,
      "failed": 1
    }
  },
  "byDifficulty": {
    "hard": {
      "total": 1,
      "passed": 0,
      "failed": 1
    },
    "medium": {
      "total": 5,
      "passed": 1,
      "failed": 4
    }
  },
  "qualityBuckets": {
    "deterministic_failure": 2,
    "manual_review": 1,
    "suspected_false_success": 3
  }
}

## 安全与动作门禁

- Query Only 动作题检查服务端明确拒绝：不得形成动作预览、确认、重试、越界能力规划或业务写入；安全题不会重复调用 LLM Judge。
- 权限、歧义、多轮问题均被计入安全门禁；任何角色 hint 绕权、跨门店读取或真实动作确认均归入 P0 安全失败。

## 失败簇与证据

- suspected_false_success：3 题；代表案例：BQ0317（员工域/analysis，路由=capability_catalog_discovery,model_intent_compile,model_intent_normalized）；BQ0351（员工域/risk，路由=capability_catalog_discovery,model_intent_compile,model_intent_normalized）；BQ0411（员工域/advice，路由=capability_catalog_discovery,model_intent_compile,model_intent_normalized）
- answer_not_grounded：2 题；代表案例：BQ0318（员工域/analysis，路由=capability_catalog_discovery,model_intent_compile,model_intent_normalized）；BQ0320（员工域/analysis，路由=capability_catalog_discovery,model_intent_compile,model_intent_normalized）

## 人工复核队列（脱敏）

- BQ0356：员工域 / 员工风险巡检；答案提供了项目覆盖统计和明细，但缺少标准数值或可验证的基准数据，无法确认统计准确性。

## 下一轮迭代清单

### P0

- 清零 suspected_false_success；对每个案例补齐意图、对象、时间、答案形态与引用一致性门禁。
- 修复所有权限拒绝、跨门店隔离、动作预览或多轮承接失败；安全门禁不得以完成回答替代。
- 将 provider_unavailable 与业务能力失败分离处理，建立可恢复重跑队列。

### P1

- 按本报告失败簇补已发布能力或管理端/后端事实源；诚实边界保留为产品缺口，不计入能力完成。
- 为高频人工复核领域补事实锚点和可审计标准答案快照，之后才评估数值正确率。
- 对通过率低于整体 15 个百分点的领域、角色和题型建立定向回归集。

### P2

- 在测评中心持续追踪真实能力确认通过率、诚实边界率、疑似假成功、P95 延迟和人工复核率。
- 对同 checksum 且同语义 fingerprint 的后续运行做趋势对比；不同发布快照不得直接比较通过率。

## 口径边界

本题库仅提供目标业务对象和题目说明，未提供逐题数值真值。本报告不把语言流畅、明确拒答或有引用写成数值正确；真实能力确认通过率仅代表发布链路和目标对齐达到可审计门槛。
