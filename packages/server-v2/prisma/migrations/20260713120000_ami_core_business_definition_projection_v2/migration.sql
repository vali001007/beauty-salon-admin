CREATE OR REPLACE FUNCTION business_definition_unique_string_array(input_value JSONB)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(normalized_value) ORDER BY first_ordinal), '[]'::JSONB)
  FROM (
    SELECT btrim(item_value) AS normalized_value, MIN(item_ordinal) AS first_ordinal
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(input_value) = 'array' THEN input_value ELSE '[]'::JSONB END
    ) WITH ORDINALITY AS items(item_value, item_ordinal)
    WHERE btrim(item_value) <> ''
    GROUP BY btrim(item_value)
  ) normalized;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION business_definition_join_string_array(input_value JSONB, delimiter_value TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(string_agg(item_value, delimiter_value ORDER BY item_ordinal), '')
  FROM jsonb_array_elements_text(
    business_definition_unique_string_array(input_value)
  ) WITH ORDINALITY AS items(item_value, item_ordinal);
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION business_definition_eval_cases(
  definition_key_value TEXT,
  definition_version_value INTEGER,
  definition_kind_value TEXT,
  definition_domain_value TEXT,
  terms_value JSONB
)
RETURNS JSONB AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'caseKey', definition_key_value || '@' || definition_version_value::TEXT || ':' || item_ordinal::TEXT,
        'input', item_value,
        'expectedDefinitionKey', definition_key_value,
        'expectedKind', definition_kind_value,
        'expectedDomain', definition_domain_value
      )
      ORDER BY item_ordinal
    ),
    '[]'::JSONB
  )
  FROM jsonb_array_elements_text(
    business_definition_unique_string_array(terms_value)
  ) WITH ORDINALITY AS items(item_value, item_ordinal);
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_business_definition_projection_lineage()
RETURNS TRIGGER AS $$
DECLARE
  parent_definition_id INTEGER;
  parent_definition_key TEXT;
  parent_kind TEXT;
  parent_domain TEXT;
  parent_name TEXT;
  parent_owner_type TEXT;
  parent_owner_id TEXT;
  parent_definition_version INTEGER;
  parent_schema_version TEXT;
  parent_fingerprint TEXT;
  parent_source_fingerprint TEXT;
  parent_lifecycle_status TEXT;
  parent_validation_status TEXT;
  parent_validation_report JSONB;
  parent_timezone TEXT;
  parent_store_scope JSONB;
  parent_canonical_query_ref TEXT;
  parent_fixture_set_key TEXT;
  parent_payload JSONB;
  parent_evidence_count INTEGER;
  normalized_aliases JSONB;
  searchable_terms JSONB;
  capability_bindings JSONB;
  executor_bindings JSONB;
  expected_projection_data JSONB;
  expected_projection_payload JSONB;
  computed_projection_fingerprint TEXT;
BEGIN
  SELECT
    d."id",
    d."definitionKey",
    d."kind"::TEXT,
    d."domain",
    d."name",
    d."ownerType",
    d."ownerId",
    v."version",
    v."schemaVersion",
    v."fingerprint",
    v."sourceFingerprint",
    v."lifecycleStatus"::TEXT,
    v."validationStatus"::TEXT,
    v."validationReport",
    v."timezone",
    v."storeScope",
    v."canonicalQueryRef",
    v."fixtureSetKey",
    v."payload",
    (SELECT COUNT(*)::INTEGER FROM "business_definition_evidence" e WHERE e."versionId" = v."id")
  INTO
    parent_definition_id,
    parent_definition_key,
    parent_kind,
    parent_domain,
    parent_name,
    parent_owner_type,
    parent_owner_id,
    parent_definition_version,
    parent_schema_version,
    parent_fingerprint,
    parent_source_fingerprint,
    parent_lifecycle_status,
    parent_validation_status,
    parent_validation_report,
    parent_timezone,
    parent_store_scope,
    parent_canonical_query_ref,
    parent_fixture_set_key,
    parent_payload,
    parent_evidence_count
  FROM "business_definition_version" v
  INNER JOIN "business_definition" d ON d."id" = v."definitionId"
  WHERE v."id" = NEW."definitionVersionId";

  IF parent_fingerprint IS NULL THEN
    RAISE EXCEPTION 'business definition projection parent version not found';
  END IF;
  IF NEW."definitionFingerprint" <> parent_fingerprint THEN
    RAISE EXCEPTION 'business definition projection fingerprint does not match parent version';
  END IF;
  IF NEW."sourceFingerprint" <> parent_source_fingerprint THEN
    RAISE EXCEPTION 'business definition projection source fingerprint does not match parent version';
  END IF;
  IF NEW."definitionKey" <> parent_definition_key THEN
    RAISE EXCEPTION 'business definition projection key does not match parent definition';
  END IF;
  IF NEW."definitionVersion" <> parent_definition_version THEN
    RAISE EXCEPTION 'business definition projection version does not match parent version';
  END IF;
  IF TG_OP = 'INSERT' AND parent_lifecycle_status = 'published' THEN
    RAISE EXCEPTION 'published business definition projections are immutable';
  END IF;

  IF NEW."payload"->>'projectionSchemaVersion' = '2.0' THEN
    normalized_aliases := business_definition_unique_string_array(parent_payload->'aliases');
    searchable_terms := business_definition_unique_string_array(jsonb_build_array(parent_name) || normalized_aliases);
    capability_bindings := business_definition_unique_string_array(parent_payload#>'{bindings,capability}');
    executor_bindings := business_definition_unique_string_array(parent_payload#>'{bindings,executor}');

    CASE NEW."targetType"::TEXT
      WHEN 'intent_semantic_index' THEN
        expected_projection_data := jsonb_build_object(
          'definitionKind', parent_kind,
          'domain', parent_domain,
          'name', parent_name,
          'aliases', normalized_aliases,
          'searchableTerms', searchable_terms,
          'semanticKey', parent_definition_key
        );
        IF parent_kind IN ('entity', 'relation', 'dimension') THEN
          expected_projection_data := expected_projection_data || jsonb_build_object('runtimeDefinition', parent_payload);
        END IF;
      WHEN 'capability_semantic_view' THEN
        expected_projection_data := jsonb_build_object(
          'definitionKind', parent_kind,
          'domain', parent_domain,
          'name', parent_name,
          'capabilities', CASE
            WHEN jsonb_typeof(parent_payload->'capabilities') = 'array' THEN parent_payload->'capabilities'
            ELSE '[]'::JSONB
          END,
          'capabilityBindings', capability_bindings,
          'executorBindings', executor_bindings,
          'semanticContribution',
            jsonb_build_object(
              'aliases', normalized_aliases,
              'permissionPolicies', CASE
                WHEN jsonb_typeof(parent_payload->'permissionPolicies') = 'array' THEN parent_payload->'permissionPolicies'
                ELSE '[]'::JSONB
              END
            ) || CASE
              WHEN NULLIF(btrim(parent_payload->>'description'), '') IS NOT NULL
                THEN jsonb_build_object('description', btrim(parent_payload->>'description'))
              ELSE '{}'::JSONB
            END
        );
      WHEN 'metric_query_view' THEN
        expected_projection_data := jsonb_build_object(
          'definitionKind', parent_kind,
          'domain', parent_domain,
          'name', parent_name,
          'applicable', parent_kind = 'metric',
          'canonicalQueryRef', parent_canonical_query_ref,
          'fixtureSetKey', parent_fixture_set_key,
          'timezone', parent_timezone,
          'storeScope', parent_store_scope
        );
        IF parent_kind = 'metric' THEN
          expected_projection_data := expected_projection_data || jsonb_build_object('runtimeDefinition', parent_payload);
        ELSE
          expected_projection_data := expected_projection_data || jsonb_build_object(
            'unsupportedReason', 'definition_kind_not_metric'
          );
        END IF;
      WHEN 'ui_definition_view' THEN
        expected_projection_data := jsonb_build_object(
          'definitionKind', parent_kind,
          'domain', parent_domain,
          'name', parent_name,
          'aliases', normalized_aliases,
          'summary', CASE
            WHEN parent_kind = 'metric' THEN
              parent_name || '：' || COALESCE(NULLIF(btrim(parent_payload#>>'{measure,aggregation}'), ''), '未声明聚合') ||
              '，数据来源 ' || COALESCE(
                NULLIF(business_definition_join_string_array(parent_payload->'sourceModels', '、'), ''),
                '未声明'
              )
            ELSE parent_name || '：' || parent_domain || ' 域 ' || parent_kind || ' 定义'
          END,
          'owner', jsonb_build_object('type', parent_owner_type, 'id', parent_owner_id),
          'validation', jsonb_build_object('status', parent_validation_status, 'report', parent_validation_report),
          'evidenceCount', parent_evidence_count,
          'readOnly', true
        );
      WHEN 'eval_case_projection' THEN
        expected_projection_data := jsonb_build_object(
          'definitionKind', parent_kind,
          'domain', parent_domain,
          'name', parent_name,
          'cases', business_definition_eval_cases(
            parent_definition_key,
            parent_definition_version,
            parent_kind,
            parent_domain,
            searchable_terms
          )
        );
      ELSE
        RAISE EXCEPTION 'business definition projection type is unsupported';
    END CASE;

    expected_projection_payload := jsonb_build_object(
      'projectionSchemaVersion', '2.0',
      'preview', false,
      'projectionType', NEW."targetType"::TEXT,
      'definitionRef', jsonb_build_object(
        'definitionKey', parent_definition_key,
        'definitionVersion', parent_definition_version,
        'definitionFingerprint', parent_fingerprint,
        'sourceFingerprint', parent_source_fingerprint
      ),
      'data', expected_projection_data
    );
  ELSE
    expected_projection_payload := jsonb_build_object(
      'preview', false,
      'projectionType', NEW."targetType"::TEXT,
      'definitionRef', jsonb_build_object(
        'definitionKey', parent_definition_key,
        'definitionVersion', parent_definition_version,
        'definitionFingerprint', parent_fingerprint,
        'sourceFingerprint', parent_source_fingerprint
      ),
      'kind', parent_kind,
      'domain', parent_domain,
      'name', parent_name,
      'schemaVersion', parent_schema_version,
      'timezone', parent_timezone,
      'storeScope', parent_store_scope,
      'canonicalQueryRef', parent_canonical_query_ref,
      'fixtureSetKey', parent_fixture_set_key,
      'definition', parent_payload
    );
  END IF;

  IF NEW."targetKey" IS DISTINCT FROM parent_definition_key || '@' || parent_definition_version::TEXT
    OR NEW."payload" IS DISTINCT FROM expected_projection_payload
  THEN
    RAISE EXCEPTION 'business definition projection payload lineage is invalid';
  END IF;

  computed_projection_fingerprint := encode(
    digest(
      business_definition_canonical_jsonb(
        jsonb_build_object(
          'targetType', NEW."targetType"::TEXT,
          'targetKey', NEW."targetKey",
          'definitionVersionId', NEW."definitionVersionId",
          'definitionRef', jsonb_build_object(
            'definitionKey', NEW."definitionKey",
            'definitionVersion', NEW."definitionVersion",
            'definitionFingerprint', NEW."definitionFingerprint",
            'sourceFingerprint', NEW."sourceFingerprint"
          ),
          'payload', NEW."payload",
          'readOnly', NEW."readOnly"
        )
      ),
      'sha256'
    ),
    'hex'
  );
  IF NEW."projectionFingerprint" <> computed_projection_fingerprint THEN
    RAISE EXCEPTION 'business definition projection fingerprint is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
