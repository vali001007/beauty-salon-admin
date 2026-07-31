CREATE OR REPLACE FUNCTION business_definition_capability_bindings(
  definition_kind TEXT,
  definition_payload JSONB
)
RETURNS JSONB AS $$
  SELECT business_definition_unique_string_array(
    CASE
      WHEN definition_kind = 'action' THEN COALESCE(
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
  function_definition TEXT;
  previous_assignment CONSTANT TEXT := 'capability_bindings := business_definition_unique_string_array(parent_payload#>''{bindings,capability}'');';
  action_assignment CONSTANT TEXT := 'capability_bindings := business_definition_capability_bindings(parent_kind, parent_payload);';
BEGIN
  SELECT pg_get_functiondef('validate_business_definition_projection_lineage()'::regprocedure)
  INTO function_definition;

  IF position(action_assignment IN function_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(previous_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'action capability projection binding upgrade source is unexpected';
  END IF;

  EXECUTE replace(function_definition, previous_assignment, action_assignment);

  SELECT pg_get_functiondef('validate_business_definition_projection_lineage()'::regprocedure)
  INTO function_definition;
  IF position(action_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'action capability projection binding upgrade is incomplete';
  END IF;
END;
$$;

DO $$
DECLARE
  bindings JSONB;
BEGIN
  bindings := business_definition_capability_bindings(
    'action',
    '{"capabilityBindings":[{"capabilityKey":"purchase_order_draft","enabled":true},{"capabilityKey":"disabled_action","enabled":false}]}'::JSONB
  );
  IF bindings IS DISTINCT FROM '["purchase_order_draft"]'::JSONB THEN
    RAISE EXCEPTION 'action capability projection binding helper is invalid';
  END IF;
END;
$$;
