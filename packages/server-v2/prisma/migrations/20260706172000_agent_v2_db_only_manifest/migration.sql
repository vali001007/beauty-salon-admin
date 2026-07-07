-- Normalize the active Agent V2 scrap-record manifest before Runtime switches to DB-only manifests.
-- Older publish code stringified field policy objects as "[object Object]"; keep this repair idempotent.
UPDATE "agent_capability_manifest_items"
SET "manifestJson" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          "manifestJson",
          '{version}',
          to_jsonb(COALESCE(NULLIF("manifestJson"->>'version', ''), 'v1')),
          true
        ),
        '{sourceApis}',
        COALESCE("manifestJson"->'sourceApis', '[]'::jsonb),
        true
      ),
      '{eventTypes}',
      COALESCE("manifestJson"->'eventTypes', '["scrap_out"]'::jsonb),
      true
    ),
    '{fieldPolicies}',
    jsonb_build_array(
      jsonb_build_object('field', 'movementId', 'label', '流水ID', 'visibility', 'allow', 'reason', '用于定位业务记录'),
      jsonb_build_object('field', 'productName', 'label', '产品名称', 'visibility', 'allow', 'reason', '业务查询核心字段'),
      jsonb_build_object('field', 'scrapQuantityText', 'label', '报废数量', 'visibility', 'allow', 'reason', '业务查询核心字段'),
      jsonb_build_object('field', 'lossAmountText', 'label', '损耗金额', 'visibility', 'allow', 'reason', '库存损耗统计字段'),
      jsonb_build_object('field', 'operatorName', 'label', '操作人', 'visibility', 'allow', 'reason', '当前能力需要展示报废办理人员'),
      jsonb_build_object('field', 'occurredAt', 'label', '发生时间', 'visibility', 'allow', 'reason', '业务查询核心字段'),
      jsonb_build_object('field', 'remark', 'label', '备注', 'visibility', 'mask', 'reason', '可能包含客户或内部说明，默认摘要展示')
    ),
    true
  ),
  '{boundaryNotes}',
  jsonb_build_array(
    '只查 movementType=scrap_out 的已发生库存流水。',
    '不能用临期、过期、低库存风险数据替代已发生报废记录。',
    '该能力来自当前 Agent V2 已启用 Manifest，用于能力中心治理、审核和版本化发布。'
  ),
  true
)
WHERE "capabilityId" = 'inventory.scrap.records.list'
  AND jsonb_typeof("manifestJson"->'fieldPolicies') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text("manifestJson"->'fieldPolicies') AS policy(value)
    WHERE policy.value = '[object Object]'
  );
