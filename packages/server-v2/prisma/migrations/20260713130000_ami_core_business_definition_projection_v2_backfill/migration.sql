DO $$
DECLARE
  item RECORD;
  normalized_aliases JSONB;
  searchable_terms JSONB;
  capability_bindings JSONB;
  executor_bindings JSONB;
  projection_data JSONB;
  projection_payload JSONB;
  projection_fingerprint TEXT;
BEGIN
  FOR item IN
    SELECT
      p."id" AS projection_id,
      p."definitionVersionId",
      p."targetType"::TEXT AS target_type,
      p."targetKey",
      p."definitionKey",
      p."definitionVersion",
      p."definitionFingerprint",
      p."sourceFingerprint",
      p."readOnly",
      d."kind"::TEXT AS definition_kind,
      d."domain",
      d."name",
      d."ownerType",
      d."ownerId",
      v."payload" AS definition_payload,
      v."canonicalQueryRef",
      v."fixtureSetKey",
      v."timezone",
      v."storeScope",
      v."validationStatus"::TEXT AS validation_status,
      v."validationReport",
      (SELECT COUNT(*)::INTEGER FROM "business_definition_evidence" e WHERE e."versionId" = v."id") AS evidence_count
    FROM "business_definition_projection" p
    INNER JOIN "business_definition_version" v ON v."id" = p."definitionVersionId"
    INNER JOIN "business_definition" d ON d."id" = v."definitionId"
    WHERE COALESCE(p."payload"->>'projectionSchemaVersion', '') <> '2.0'
    ORDER BY p."id"
  LOOP
    normalized_aliases := business_definition_unique_string_array(item.definition_payload->'aliases');
    searchable_terms := business_definition_unique_string_array(jsonb_build_array(item.name) || normalized_aliases);
    capability_bindings := business_definition_unique_string_array(item.definition_payload#>'{bindings,capability}');
    executor_bindings := business_definition_unique_string_array(item.definition_payload#>'{bindings,executor}');

    CASE item.target_type
      WHEN 'intent_semantic_index' THEN
        projection_data := jsonb_build_object(
          'definitionKind', item.definition_kind,
          'domain', item.domain,
          'name', item.name,
          'aliases', normalized_aliases,
          'searchableTerms', searchable_terms,
          'semanticKey', item."definitionKey"
        );
        IF item.definition_kind IN ('entity', 'relation', 'dimension') THEN
          projection_data := projection_data || jsonb_build_object('runtimeDefinition', item.definition_payload);
        END IF;
      WHEN 'capability_semantic_view' THEN
        projection_data := jsonb_build_object(
          'definitionKind', item.definition_kind,
          'domain', item.domain,
          'name', item.name,
          'capabilities', CASE
            WHEN jsonb_typeof(item.definition_payload->'capabilities') = 'array'
              THEN item.definition_payload->'capabilities'
            ELSE '[]'::JSONB
          END,
          'capabilityBindings', capability_bindings,
          'executorBindings', executor_bindings,
          'semanticContribution',
            jsonb_build_object(
              'aliases', normalized_aliases,
              'permissionPolicies', CASE
                WHEN jsonb_typeof(item.definition_payload->'permissionPolicies') = 'array'
                  THEN item.definition_payload->'permissionPolicies'
                ELSE '[]'::JSONB
              END
            ) || CASE
              WHEN NULLIF(btrim(item.definition_payload->>'description'), '') IS NOT NULL
                THEN jsonb_build_object('description', btrim(item.definition_payload->>'description'))
              ELSE '{}'::JSONB
            END
        );
      WHEN 'metric_query_view' THEN
        projection_data := jsonb_build_object(
          'definitionKind', item.definition_kind,
          'domain', item.domain,
          'name', item.name,
          'applicable', item.definition_kind = 'metric',
          'canonicalQueryRef', item."canonicalQueryRef",
          'fixtureSetKey', item."fixtureSetKey",
          'timezone', item.timezone,
          'storeScope', item."storeScope"
        );
        IF item.definition_kind = 'metric' THEN
          projection_data := projection_data || jsonb_build_object('runtimeDefinition', item.definition_payload);
        ELSE
          projection_data := projection_data || jsonb_build_object(
            'unsupportedReason', 'definition_kind_not_metric'
          );
        END IF;
      WHEN 'ui_definition_view' THEN
        projection_data := jsonb_build_object(
          'definitionKind', item.definition_kind,
          'domain', item.domain,
          'name', item.name,
          'aliases', normalized_aliases,
          'summary', CASE
            WHEN item.definition_kind = 'metric' THEN
              item.name || '：' || COALESCE(
                NULLIF(btrim(item.definition_payload#>>'{measure,aggregation}'), ''),
                '未声明聚合'
              ) || '，数据来源 ' || COALESCE(
                NULLIF(business_definition_join_string_array(item.definition_payload->'sourceModels', '、'), ''),
                '未声明'
              )
            ELSE item.name || '：' || item.domain || ' 域 ' || item.definition_kind || ' 定义'
          END,
          'owner', jsonb_build_object('type', item."ownerType", 'id', item."ownerId"),
          'validation', jsonb_build_object('status', item.validation_status, 'report', item."validationReport"),
          'evidenceCount', item.evidence_count,
          'readOnly', true
        );
      WHEN 'eval_case_projection' THEN
        projection_data := jsonb_build_object(
          'definitionKind', item.definition_kind,
          'domain', item.domain,
          'name', item.name,
          'cases', business_definition_eval_cases(
            item."definitionKey",
            item."definitionVersion",
            item.definition_kind,
            item.domain,
            searchable_terms
          )
        );
      ELSE
        RAISE EXCEPTION 'business definition projection type is unsupported: %', item.target_type;
    END CASE;

    projection_payload := jsonb_build_object(
      'projectionSchemaVersion', '2.0',
      'preview', false,
      'projectionType', item.target_type,
      'definitionRef', jsonb_build_object(
        'definitionKey', item."definitionKey",
        'definitionVersion', item."definitionVersion",
        'definitionFingerprint', item."definitionFingerprint",
        'sourceFingerprint', item."sourceFingerprint"
      ),
      'data', projection_data
    );
    projection_fingerprint := encode(
      digest(
        business_definition_canonical_jsonb(
          jsonb_build_object(
            'targetType', item.target_type,
            'targetKey', item."targetKey",
            'definitionVersionId', item."definitionVersionId",
            'definitionRef', jsonb_build_object(
              'definitionKey', item."definitionKey",
              'definitionVersion', item."definitionVersion",
              'definitionFingerprint', item."definitionFingerprint",
              'sourceFingerprint', item."sourceFingerprint"
            ),
            'payload', projection_payload,
            'readOnly', item."readOnly"
          )
        ),
        'sha256'
      ),
      'hex'
    );

    UPDATE "business_definition_projection"
    SET
      "payload" = projection_payload,
      "projectionFingerprint" = projection_fingerprint,
      "generatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = item.projection_id;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM "business_definition_projection"
    WHERE COALESCE("payload"->>'projectionSchemaVersion', '') <> '2.0'
  ) THEN
    RAISE EXCEPTION 'business definition projection V1 backfill is incomplete';
  END IF;
END;
$$;
