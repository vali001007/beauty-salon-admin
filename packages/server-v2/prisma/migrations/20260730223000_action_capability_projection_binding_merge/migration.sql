CREATE OR REPLACE FUNCTION business_definition_capability_bindings(
  definition_kind TEXT,
  definition_payload JSONB
)
RETURNS JSONB AS $$
  SELECT business_definition_unique_string_array(
    CASE
      WHEN definition_kind = 'action' THEN
        CASE
          WHEN jsonb_typeof(definition_payload#>'{bindings,capability}') = 'array'
            THEN definition_payload#>'{bindings,capability}'
          ELSE '[]'::JSONB
        END
        || COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(btrim(binding_value->>'capabilityKey')) ORDER BY binding_order)
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(definition_payload->'capabilityBindings') = 'array'
                  THEN definition_payload->'capabilityBindings'
                ELSE '[]'::JSONB
              END
            ) WITH ORDINALITY AS bindings(binding_value, binding_order)
            WHERE COALESCE((binding_value->>'enabled')::BOOLEAN, true)
              AND NULLIF(btrim(binding_value->>'capabilityKey'), '') IS NOT NULL
          ),
          '[]'::JSONB
        )
      ELSE definition_payload#>'{bindings,capability}'
    END
  );
$$ LANGUAGE SQL IMMUTABLE;

DO $$
DECLARE
  bindings JSONB;
BEGIN
  bindings := business_definition_capability_bindings(
    'action',
    '{"bindings":{"capability":["legacy_action"]},"capabilityBindings":[{"capabilityKey":"purchase_order_draft","enabled":true},{"capabilityKey":"disabled_action","enabled":false}]}'::JSONB
  );
  IF bindings IS DISTINCT FROM '["legacy_action","purchase_order_draft"]'::JSONB THEN
    RAISE EXCEPTION 'action capability projection binding merge helper is invalid';
  END IF;
END;
$$;
