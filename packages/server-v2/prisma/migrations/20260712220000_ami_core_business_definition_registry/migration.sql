CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "BusinessDefinitionKind" AS ENUM (
  'entity',
  'field',
  'relation',
  'metric',
  'dimension',
  'status_dictionary',
  'time_policy',
  'query_definition'
);

CREATE TYPE "BusinessDefinitionStatus" AS ENUM ('active', 'archived');
CREATE TYPE "BusinessDefinitionLifecycleStatus" AS ENUM ('candidate', 'draft', 'validated', 'published');
CREATE TYPE "BusinessDefinitionValidationStatus" AS ENUM ('pending', 'passed', 'failed');
CREATE TYPE "BusinessDefinitionFixtureArtifactStatus" AS ENUM ('active', 'archived');
CREATE TYPE "BusinessDefinitionProjectionType" AS ENUM (
  'intent_semantic_index',
  'capability_semantic_view',
  'metric_query_view',
  'ui_definition_view',
  'eval_case_projection'
);

CREATE TABLE "business_definition" (
  "id" SERIAL NOT NULL,
  "definitionKey" TEXT NOT NULL,
  "kind" "BusinessDefinitionKind" NOT NULL,
  "domain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT,
  "status" "BusinessDefinitionStatus" NOT NULL DEFAULT 'active',
  "currentPublishedVersionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_definition_version" (
  "id" SERIAL NOT NULL,
  "definitionId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
  "payload" JSONB NOT NULL,
  "lifecycleStatus" "BusinessDefinitionLifecycleStatus" NOT NULL DEFAULT 'draft',
  "fingerprint" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "validationStatus" "BusinessDefinitionValidationStatus" NOT NULL DEFAULT 'pending',
  "validationReport" JSONB,
  "canonicalQueryRef" TEXT,
  "fixtureSetKey" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "storeScope" JSONB NOT NULL,
  "createdBy" INTEGER NOT NULL,
  "validatedBy" INTEGER,
  "validatedAt" TIMESTAMP(3),
  "publishedBy" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_definition_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_definition_version_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_definition_version_source_fingerprint_check" CHECK ("sourceFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "business_definition_evidence" (
  "id" SERIAL NOT NULL,
  "versionId" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "sourceSymbol" TEXT,
  "lineStart" INTEGER,
  "lineEnd" INTEGER,
  "evidenceKind" TEXT NOT NULL,
  "evidenceFingerprint" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "conflictGroup" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_definition_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_definition_evidence_fingerprint_check" CHECK ("evidenceFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_definition_evidence_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "business_definition_evidence_lines_check" CHECK (
    ("lineStart" IS NULL OR "lineStart" > 0)
    AND ("lineEnd" IS NULL OR "lineEnd" > 0)
    AND ("lineStart" IS NULL OR "lineEnd" IS NULL OR "lineEnd" >= "lineStart")
  )
);

CREATE TABLE "business_definition_projection" (
  "id" SERIAL NOT NULL,
  "definitionVersionId" INTEGER NOT NULL,
  "targetType" "BusinessDefinitionProjectionType" NOT NULL,
  "targetKey" TEXT NOT NULL,
  "definitionKey" TEXT NOT NULL,
  "definitionVersion" INTEGER NOT NULL,
  "definitionFingerprint" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "projectionFingerprint" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "business_definition_projection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_definition_projection_read_only_check" CHECK ("readOnly" = true),
  CONSTRAINT "business_definition_projection_fingerprint_check" CHECK ("projectionFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_definition_projection_definition_fingerprint_check" CHECK ("definitionFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_definition_projection_source_fingerprint_check" CHECK ("sourceFingerprint" ~ '^[0-9a-f]{64}$')
);

-- Prisma model: BusinessDefinitionFixtureArtifact
CREATE TABLE "business_definition_fixture_artifact" (
  "id" SERIAL NOT NULL,
  "fixtureSetKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "BusinessDefinitionFixtureArtifactStatus" NOT NULL DEFAULT 'active',
  "payload" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_definition_fixture_artifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_definition_fixture_artifact_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_definition_fixture_artifact_version_check" CHECK ("version" > 0),
  CONSTRAINT "business_definition_fixture_artifact_status_check" CHECK ("status"::TEXT IN ('active', 'archived'))
);

CREATE UNIQUE INDEX "business_definition_kind_definitionKey_key"
  ON "business_definition"("kind", "definitionKey");
CREATE UNIQUE INDEX "business_definition_currentPublishedVersionId_key"
  ON "business_definition"("currentPublishedVersionId");
CREATE INDEX "business_definition_domain_kind_status_idx"
  ON "business_definition"("domain", "kind", "status");

CREATE UNIQUE INDEX "business_definition_version_definitionId_version_key"
  ON "business_definition_version"("definitionId", "version");
CREATE UNIQUE INDEX "business_definition_version_definitionId_fingerprint_key"
  ON "business_definition_version"("definitionId", "fingerprint");
CREATE INDEX "business_definition_version_lifecycleStatus_validationStatus_idx"
  ON "business_definition_version"("lifecycleStatus", "validationStatus");
CREATE INDEX "business_definition_version_sourceFingerprint_idx"
  ON "business_definition_version"("sourceFingerprint");

CREATE UNIQUE INDEX "business_definition_evidence_versionId_evidenceFingerprint_key"
  ON "business_definition_evidence"("versionId", "evidenceFingerprint");
CREATE INDEX "business_definition_evidence_sourceType_sourcePath_idx"
  ON "business_definition_evidence"("sourceType", "sourcePath");
CREATE INDEX "business_definition_evidence_conflictGroup_idx"
  ON "business_definition_evidence"("conflictGroup");

CREATE UNIQUE INDEX "business_definition_projection_definitionVersionId_targetType_targetKey_key"
  ON "business_definition_projection"("definitionVersionId", "targetType", "targetKey");
CREATE INDEX "business_definition_projection_targetType_targetKey_idx"
  ON "business_definition_projection"("targetType", "targetKey");
CREATE INDEX "business_definition_projection_definitionKey_definitionVersion_idx"
  ON "business_definition_projection"("definitionKey", "definitionVersion");
CREATE INDEX "business_definition_projection_projectionFingerprint_idx"
  ON "business_definition_projection"("projectionFingerprint");

CREATE UNIQUE INDEX "business_definition_fixture_artifact_fixtureSetKey_version_key"
  ON "business_definition_fixture_artifact"("fixtureSetKey", "version");
CREATE INDEX "business_definition_fixture_artifact_fixtureSetKey_status_version_idx"
  ON "business_definition_fixture_artifact"("fixtureSetKey", "status", "version");
CREATE INDEX "business_definition_fixture_artifact_fingerprint_idx"
  ON "business_definition_fixture_artifact"("fingerprint");

ALTER TABLE "business_definition_version"
  ADD CONSTRAINT "business_definition_version_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "business_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_definition"
  ADD CONSTRAINT "business_definition_currentPublishedVersionId_fkey"
  FOREIGN KEY ("currentPublishedVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_definition_evidence"
  ADD CONSTRAINT "business_definition_evidence_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "business_definition_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_definition_projection"
  ADD CONSTRAINT "business_definition_projection_definitionVersionId_fkey"
  FOREIGN KEY ("definitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brain_ontology_entity"
  ADD COLUMN "businessDefinitionVersionId" INTEGER,
  ADD COLUMN "definitionFingerprint" TEXT,
  ADD COLUMN "projectedAt" TIMESTAMP(3),
  ADD COLUMN "projectionStatus" TEXT;

ALTER TABLE "brain_ontology_relation"
  ADD COLUMN "businessDefinitionVersionId" INTEGER,
  ADD COLUMN "definitionFingerprint" TEXT,
  ADD COLUMN "projectedAt" TIMESTAMP(3),
  ADD COLUMN "projectionStatus" TEXT;

ALTER TABLE "brain_metric"
  ADD COLUMN "businessDefinitionVersionId" INTEGER,
  ADD COLUMN "definitionFingerprint" TEXT,
  ADD COLUMN "projectedAt" TIMESTAMP(3),
  ADD COLUMN "projectionStatus" TEXT;

ALTER TABLE "brain_dimension"
  ADD COLUMN "businessDefinitionVersionId" INTEGER,
  ADD COLUMN "definitionFingerprint" TEXT,
  ADD COLUMN "projectedAt" TIMESTAMP(3),
  ADD COLUMN "projectionStatus" TEXT;

ALTER TABLE "brain_eval_case"
  ADD COLUMN "businessDefinitionVersionId" INTEGER,
  ADD COLUMN "definitionFingerprint" TEXT,
  ADD COLUMN "generatedByProjection" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "brain_ontology_entity_businessDefinitionVersionId_idx" ON "brain_ontology_entity"("businessDefinitionVersionId");
CREATE INDEX "brain_ontology_relation_businessDefinitionVersionId_idx" ON "brain_ontology_relation"("businessDefinitionVersionId");
CREATE INDEX "brain_metric_businessDefinitionVersionId_idx" ON "brain_metric"("businessDefinitionVersionId");
CREATE INDEX "brain_dimension_businessDefinitionVersionId_idx" ON "brain_dimension"("businessDefinitionVersionId");
CREATE INDEX "brain_eval_case_businessDefinitionVersionId_idx" ON "brain_eval_case"("businessDefinitionVersionId");

ALTER TABLE "brain_ontology_entity"
  ADD CONSTRAINT "brain_ontology_entity_businessDefinitionVersionId_fkey"
  FOREIGN KEY ("businessDefinitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brain_ontology_relation"
  ADD CONSTRAINT "brain_ontology_relation_businessDefinitionVersionId_fkey"
  FOREIGN KEY ("businessDefinitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brain_metric"
  ADD CONSTRAINT "brain_metric_businessDefinitionVersionId_fkey"
  FOREIGN KEY ("businessDefinitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brain_dimension"
  ADD CONSTRAINT "brain_dimension_businessDefinitionVersionId_fkey"
  FOREIGN KEY ("businessDefinitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brain_eval_case"
  ADD CONSTRAINT "brain_eval_case_businessDefinitionVersionId_fkey"
  FOREIGN KEY ("businessDefinitionVersionId") REFERENCES "business_definition_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_published_business_definition_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."lifecycleStatus" = 'published' THEN
    RAISE EXCEPTION 'published business definition versions are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_definition_version_immutable_after_publish"
BEFORE UPDATE OR DELETE ON "business_definition_version"
FOR EACH ROW EXECUTE FUNCTION prevent_published_business_definition_version_mutation();

CREATE OR REPLACE FUNCTION prevent_published_business_definition_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM "business_definition_version" v
    WHERE v."id" = NEW."versionId" AND v."lifecycleStatus" = 'published'
  ) THEN
    RAISE EXCEPTION 'published business definition evidence is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    EXISTS (
      SELECT 1 FROM "business_definition_version" v
      WHERE v."id" = OLD."versionId" AND v."lifecycleStatus" = 'published'
    ) OR EXISTS (
      SELECT 1 FROM "business_definition_version" v
      WHERE v."id" = NEW."versionId" AND v."lifecycleStatus" = 'published'
    )
  ) THEN
    RAISE EXCEPTION 'published business definition evidence is immutable';
  END IF;
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "business_definition_version" v
    WHERE v."id" = OLD."versionId" AND v."lifecycleStatus" = 'published'
  ) THEN
    RAISE EXCEPTION 'published business definition evidence is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_definition_evidence_immutable_after_publish"
BEFORE INSERT OR UPDATE OR DELETE ON "business_definition_evidence"
FOR EACH ROW EXECUTE FUNCTION prevent_published_business_definition_evidence_mutation();

CREATE OR REPLACE FUNCTION business_definition_canonical_jsonb(input_value JSONB)
RETURNS TEXT AS $$
DECLARE
  result_value TEXT;
BEGIN
  CASE jsonb_typeof(input_value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(
        string_agg(to_jsonb(entry_key)::TEXT || ':' || business_definition_canonical_jsonb(entry_value), ',' ORDER BY entry_key),
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
  fixed_vector_hash TEXT;
BEGIN
  fixed_vector_hash := encode(
    digest(
      business_definition_canonical_jsonb(
        '{"targetType":"metric_query_view","targetKey":"metric.product_sales_quantity@3","definitionVersionId":21,"definitionRef":{"definitionKey":"metric.product_sales_quantity","definitionVersion":3,"definitionFingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"payload":{"a":1,"nested":{"x":"y"}},"readOnly":true}'::JSONB
      ),
      'sha256'
    ),
    'hex'
  );
  IF fixed_vector_hash <> '40463f5eb396409acd68dfffa61c6665e65d7bebafa2fa1a0e91245a96dfc463' THEN
    RAISE EXCEPTION 'business definition canonical JSON hash implementation mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_business_definition_projection_lineage()
RETURNS TRIGGER AS $$
DECLARE
  parent_definition_key TEXT;
  parent_kind TEXT;
  parent_domain TEXT;
  parent_name TEXT;
  parent_definition_version INTEGER;
  parent_schema_version TEXT;
  parent_fingerprint TEXT;
  parent_source_fingerprint TEXT;
  parent_lifecycle_status TEXT;
  parent_timezone TEXT;
  parent_store_scope JSONB;
  parent_canonical_query_ref TEXT;
  parent_fixture_set_key TEXT;
  parent_payload JSONB;
  expected_projection_payload JSONB;
  computed_projection_fingerprint TEXT;
BEGIN
  SELECT
    d."definitionKey",
    d."kind"::TEXT,
    d."domain",
    d."name",
    v."version",
    v."schemaVersion",
    v."fingerprint",
    v."sourceFingerprint",
    v."lifecycleStatus"::TEXT,
    v."timezone",
    v."storeScope",
    v."canonicalQueryRef",
    v."fixtureSetKey",
    v."payload"
  INTO
    parent_definition_key,
    parent_kind,
    parent_domain,
    parent_name,
    parent_definition_version,
    parent_schema_version,
    parent_fingerprint,
    parent_source_fingerprint,
    parent_lifecycle_status,
    parent_timezone,
    parent_store_scope,
    parent_canonical_query_ref,
    parent_fixture_set_key,
    parent_payload
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

CREATE TRIGGER "business_definition_projection_lineage_guard"
BEFORE INSERT OR UPDATE ON "business_definition_projection"
FOR EACH ROW EXECUTE FUNCTION validate_business_definition_projection_lineage();

CREATE OR REPLACE FUNCTION prevent_active_business_definition_fixture_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'active' THEN
    RAISE EXCEPTION 'active business definition fixture artifacts are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_definition_fixture_artifact_immutable"
BEFORE UPDATE OR DELETE ON "business_definition_fixture_artifact"
FOR EACH ROW EXECUTE FUNCTION prevent_active_business_definition_fixture_mutation();

CREATE OR REPLACE FUNCTION prevent_business_definition_projection_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."readOnly" = true THEN
    RAISE EXCEPTION 'business definition projections are read only';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_definition_projection_immutable"
BEFORE UPDATE OR DELETE ON "business_definition_projection"
FOR EACH ROW EXECUTE FUNCTION prevent_business_definition_projection_mutation();

CREATE OR REPLACE FUNCTION validate_current_business_definition_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."currentPublishedVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "business_definition_version" v
    WHERE v."id" = NEW."currentPublishedVersionId"
      AND v."definitionId" = NEW."id"
      AND v."lifecycleStatus" = 'published'
  ) THEN
    RAISE EXCEPTION 'current published version must be a published version of the same definition';
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD."currentPublishedVersionId" IS NOT NULL
    AND NEW."currentPublishedVersionId" IS NOT NULL
    AND OLD."currentPublishedVersionId" <> NEW."currentPublishedVersionId"
    AND (
      SELECT "version" FROM "business_definition_version" WHERE "id" = NEW."currentPublishedVersionId"
    ) <= (
      SELECT "version" FROM "business_definition_version" WHERE "id" = OLD."currentPublishedVersionId"
    )
  THEN
    RAISE EXCEPTION 'current published business definition version must increase';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "business_definition_current_version_guard"
BEFORE INSERT OR UPDATE OF "currentPublishedVersionId" ON "business_definition"
FOR EACH ROW EXECUTE FUNCTION validate_current_business_definition_version();
