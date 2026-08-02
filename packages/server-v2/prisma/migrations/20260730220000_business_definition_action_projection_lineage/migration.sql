DO $$
DECLARE
  function_definition TEXT;
  previous_condition CONSTANT TEXT := 'parent_kind IN (''entity'', ''relation'', ''dimension'')';
  action_condition CONSTANT TEXT := 'parent_kind IN (''entity'', ''relation'', ''dimension'', ''action'')';
BEGIN
  SELECT pg_get_functiondef('validate_business_definition_projection_lineage()'::regprocedure)
  INTO function_definition;

  IF position(action_condition IN function_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(previous_condition IN function_definition) = 0 THEN
    RAISE EXCEPTION 'business definition projection lineage action upgrade source is unexpected';
  END IF;

  EXECUTE replace(function_definition, previous_condition, action_condition);

  SELECT pg_get_functiondef('validate_business_definition_projection_lineage()'::regprocedure)
  INTO function_definition;
  IF position(action_condition IN function_definition) = 0 THEN
    RAISE EXCEPTION 'business definition projection lineage action upgrade is incomplete';
  END IF;
END;
$$;
