# Agent 知识治理日报

生成时间：2026-07-02T11:34:01.292Z

## 总览

- 门禁状态：通过
- 阻断项：0
- 提醒项：0
- P0 通过率：100%
- P0 失败数：0
- BusinessObjectCatalog 缺口：0
- 字段中文名缺口：0
- SkillRegistry 暴露缺口：0
- Eval 覆盖缺口：0
- legacy fallback 命中：0

## Agent 能力缺口

- 无

## 业务字典候选

- 无

## Eval 失败 Top

- 无

## Legacy Fallback

- 运行态统计：可用
- 扫描运行数：191
- fallback 运行数：0

### Top Reason

- 无

### 废弃候选

- business_query_capability_missing: latest=0, previous=0, action=move_to_deprecated_candidate
- business_query_capability_not_implemented: latest=0, previous=0, action=move_to_deprecated_candidate
- business_query_role_not_allowed: latest=0, previous=0, action=move_to_deprecated_candidate
- business_task_preparser_no_executable_plan: latest=0, previous=0, action=move_to_deprecated_candidate
- business_task_preparser_unavailable: latest=0, previous=0, action=move_to_deprecated_candidate
- capability_confidence_below_threshold: latest=0, previous=0, action=move_to_deprecated_candidate
- capability_not_found: latest=0, previous=0, action=move_to_deprecated_candidate
- legacy_fallback: latest=0, previous=0, action=move_to_deprecated_candidate
- legacy_rule_fallback: latest=0, previous=0, action=move_to_deprecated_candidate
- required_entity_not_resolved: latest=0, previous=0, action=move_to_deprecated_candidate

## Review Checklist

- 确认 P0 阻断项为 0；如不为 0，先修复再发布。
- 按 P1 优先级确认 BusinessObjectCatalog 与字段中文名候选。
- 补齐 SkillRegistry 暴露缺口和 Eval 覆盖缺口。
- 复核前端页面候选是否需要 Agent 能力入口。
- 复核 legacy fallback 废弃候选，确认无保留价值后进入清理计划。
- 本窗口暂无新增业务字典候选。
- 本窗口暂无新增 Agent 能力缺口。
