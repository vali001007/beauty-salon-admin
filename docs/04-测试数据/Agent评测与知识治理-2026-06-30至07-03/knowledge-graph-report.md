# Agent V2 知识图谱生成报告

生成时间：2026-07-06 05:45:42 Asia/Shanghai
Schema Hash：4bfded76b07c9724f4a406e01b5114f3f66cd3088e9f1e2bd75b1e13b15808e7
门禁状态：通过

## 图谱规模

- 节点总数：3702
- 边总数：4268
- 业务对象：16
- 数据模型：135
- Active 能力：36
- 权限码：79
- 人工覆盖：0（同义词 0，排除关系 0，已采纳 0，跳过 0，冲突 0）

### 节点分布

- Field：2221
- Capability：738
- Word：489
- DataModel：135
- PermissionCode：79
- BusinessObject：16
- Domain：13
- ActionIntent：11

### 边分布

- HAS_FIELD：2221
- REQUIRES_PERM：654
- FK_RELATION：420
- TRIGGERS：326
- COMPOSED_OF：292
- SUPPORTS_ACTION：145
- SYNONYM_OF：92
- EXCLUDES：66
- BELONGS_TO：52

## 人工覆盖合并

- 无人工覆盖

## 阻断项

- 无

## 提醒项

- [business_object_model_missing_in_prisma] 业务对象声明模型未出现在 Prisma：预约 声明了 CheckInRecord，但当前 schema.prisma 未找到该模型。 建议：确认模型是否已迁移、是否为外部数据源，必要时改为 evidenceSourceModels 或治理说明。
- [business_object_model_missing_in_prisma] 业务对象声明模型未出现在 Prisma：排班 声明了 BeauticianSchedule，但当前 schema.prisma 未找到该模型。 建议：确认模型是否已迁移、是否为外部数据源，必要时改为 evidenceSourceModels 或治理说明。
- [business_object_model_missing_in_prisma] 业务对象声明模型未出现在 Prisma：财务指标 声明了 OperationCost，但当前 schema.prisma 未找到该模型。 建议：确认模型是否已迁移、是否为外部数据源，必要时改为 evidenceSourceModels 或治理说明。
- [business_object_model_missing_in_prisma] 业务对象声明模型未出现在 Prisma：经营概览 声明了 Order，但当前 schema.prisma 未找到该模型。 建议：确认模型是否已迁移、是否为外部数据源，必要时改为 evidenceSourceModels 或治理说明。

## 产物

- generated TS：packages/server-v2/src/agent-v2/knowledge-graph/generated/knowledge-graph.generated.ts
- JSON：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph.json
- 报告：docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/knowledge-graph-report.md
