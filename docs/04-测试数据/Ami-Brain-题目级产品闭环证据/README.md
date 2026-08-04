# Ami Brain 题目级产品闭环证据

本目录保存冻结 2000 题之外、准备标记为 `current_release_test` 的新增题或语义变化题的真实数据核对证据。

## 准入要求

每道题必须单独保存可复核证据，并在 `ami-brain-supplemental-question-registry-v1.json` 的 `review.dataEvidence` 中登记：

- `path`：本目录下的证据文件路径。
- `anchor`：证据文件中稳定且唯一的定位文本。
- `questionChecksum`：完整题目合同 checksum。
- `auditSnapshotChecksum`：当前批准的 `ami-brain-product-loop-data-facts-v1.json` 数据快照 checksum。
- `storeId`：实际核对门店；当前批准开发门店为 6。
- `requiredDataModels`：回答该题真正需要的模型集合，必须与 review 中的声明完全一致。

证据正文至少应记录：原始问题、管理入口与路由、正式接口、只读查询条件、关联关系、实际结果或明确空结果、核对时间和复核人。仅记录“某张表有数据”不能证明跨表关系、指定项目、指定员工、指定时间或归因事实存在。

## 建议文件结构

```json
{
  "schemaVersion": "ami-brain-question-data-evidence/v1",
  "caseId": "BQxxxx",
  "anchor": "BQxxxx-data-evidence-v1",
  "question": "完整测试题",
  "questionChecksum": "64位SHA-256",
  "databaseHost": "批准的开发库主机",
  "storeId": 6,
  "auditSnapshotChecksum": "当前数据快照checksum",
  "requiredDataModels": ["ModelA", "ModelB"],
  "readOnlyChecks": [
    {
      "purpose": "说明该查询证明什么",
      "scope": "storeId=6及题目时间范围",
      "resultSummary": "实际记录数、关联交集或明确空结果"
    }
  ],
  "reviewedBy": "复核人",
  "reviewedAt": "ISO时间"
}
```

`next_iteration_feature` 继续使用产品决策证据记录缺失项；`evidence_review_required` 不需要伪造本目录证据，补证完成前保持不可执行。
