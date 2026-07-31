CREATE OR REPLACE FUNCTION business_definition_canonical_jsonb(input_value JSONB)
RETURNS TEXT AS $$
DECLARE
  result_value TEXT;
BEGIN
  CASE jsonb_typeof(input_value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(
        string_agg(
          to_jsonb(entry_key)::TEXT || ':' || business_definition_canonical_jsonb(entry_value),
          ','
          ORDER BY entry_key COLLATE "C"
        ),
        ''
      ) || '}'
      INTO result_value
      FROM jsonb_each(input_value) AS entries(entry_key, entry_value);
      RETURN result_value;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(
        string_agg(business_definition_canonical_jsonb(entry_value), ',' ORDER BY entry_order),
        ''
      ) || ']'
      INTO result_value
      FROM jsonb_array_elements(input_value) WITH ORDINALITY AS entries(entry_value, entry_order);
      RETURN result_value;
    ELSE
      RETURN input_value::TEXT;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

DO $$
DECLARE
  mixed_case_hash TEXT;
BEGIN
  mixed_case_hash := encode(
    digest(
      business_definition_canonical_jsonb(
        '{"effectKind":"reservation_cancellation","effectiveAtPolicy":"mutation_receipt_committed_at","effectivenessPolicy":"observed_state_transition_and_transactional_receipt"}'::JSONB
      ),
      'sha256'
    ),
    'hex'
  );
  IF mixed_case_hash <> 'c877c79e05cdafe177a67efd79034c3f96d3a82f6d4301bb9f3f72490ba91eab' THEN
    RAISE EXCEPTION 'business definition canonical JSON mixed-case hash implementation mismatch';
  END IF;
END;
$$;
