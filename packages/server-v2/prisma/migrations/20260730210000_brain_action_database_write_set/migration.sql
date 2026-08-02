CREATE TABLE "business_database_write_set" (
  "id" UUID NOT NULL,
  "storeId" INTEGER NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "databaseTransactionId" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'collecting',
  "coverageBoundary" TEXT NOT NULL,
  "monitorTableCount" INTEGER NOT NULL,
  "monitorFingerprint" VARCHAR(64) NOT NULL,
  "entryCount" INTEGER NOT NULL DEFAULT 0,
  "writeSetFingerprint" VARCHAR(64),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  CONSTRAINT "business_database_write_set_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_database_write_set_entry" (
  "id" BIGSERIAL NOT NULL,
  "writeSetId" UUID NOT NULL,
  "databaseTransactionId" BIGINT NOT NULL,
  "modelName" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "rowIdentity" JSONB NOT NULL,
  "changedFields" JSONB NOT NULL,
  "beforeStateFingerprint" VARCHAR(64),
  "afterStateFingerprint" VARCHAR(64),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_database_write_set_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_database_write_set_storeId_capabilityKey_idempotencyKey_key"
ON "business_database_write_set"("storeId", "capabilityKey", "idempotencyKey");

CREATE INDEX "business_database_write_set_storeId_startedAt_idx"
ON "business_database_write_set"("storeId", "startedAt");

CREATE INDEX "business_database_write_set_entry_writeSetId_id_idx"
ON "business_database_write_set_entry"("writeSetId", "id");

CREATE INDEX "business_database_write_set_entry_modelName_operation_occurredAt_idx"
ON "business_database_write_set_entry"("modelName", "operation", "occurredAt");

ALTER TABLE "business_database_write_set_entry"
ADD CONSTRAINT "business_database_write_set_entry_writeSetId_fkey"
FOREIGN KEY ("writeSetId") REFERENCES "business_database_write_set"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ami_business_write_set_capture_row"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  context_text TEXT;
  context_value JSONB;
  current_row JSONB;
  before_row JSONB;
  after_row JSONB;
  changed_fields JSONB;
  row_identity JSONB;
  write_set_id UUID;
  write_set_status TEXT;
BEGIN
  context_text := current_setting('ami.business_write_set_context', true);
  IF context_text IS NULL OR btrim(context_text) = '' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  BEGIN
    context_value := context_text::JSONB;
    write_set_id := (context_value ->> 'writeSetId')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'business_database_write_set_context_invalid';
  END;

  IF context_value ->> 'schemaVersion' <> '1.0' OR write_set_id IS NULL THEN
    RAISE EXCEPTION 'business_database_write_set_context_invalid';
  END IF;

  SELECT "status"
  INTO write_set_status
  FROM public."business_database_write_set"
  WHERE "id" = write_set_id
    AND "databaseTransactionId" = txid_current();

  IF write_set_status IS DISTINCT FROM 'collecting' THEN
    RAISE EXCEPTION 'business_database_write_set_not_collecting';
  END IF;

  before_row := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  after_row := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  current_row := COALESCE(after_row, before_row, '{}'::JSONB);

  SELECT COALESCE(jsonb_agg(field_name ORDER BY field_name), '[]'::JSONB)
  INTO changed_fields
  FROM (
    SELECT field_name
    FROM (
      SELECT jsonb_object_keys(COALESCE(before_row, '{}'::JSONB)) AS field_name
      UNION
      SELECT jsonb_object_keys(COALESCE(after_row, '{}'::JSONB)) AS field_name
    ) fields
    WHERE before_row -> field_name IS DISTINCT FROM after_row -> field_name
  ) changed;

  row_identity := jsonb_strip_nulls(jsonb_build_object(
    'id', current_row -> 'id',
    'storeId', current_row -> 'storeId',
    'customerId', current_row -> 'customerId',
    'reservationId', current_row -> 'reservationId',
    'orderNo', current_row -> 'orderNo'
  ));

  INSERT INTO public."business_database_write_set_entry" (
    "writeSetId",
    "databaseTransactionId",
    "modelName",
    "tableName",
    "operation",
    "rowIdentity",
    "changedFields",
    "beforeStateFingerprint",
    "afterStateFingerprint"
  ) VALUES (
    write_set_id,
    txid_current(),
    TG_ARGV[0],
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    row_identity,
    changed_fields,
    CASE WHEN before_row IS NULL THEN NULL ELSE encode(digest(before_row::TEXT, 'sha256'), 'hex') END,
    CASE WHEN after_row IS NULL THEN NULL ELSE encode(digest(after_row::TEXT, 'sha256'), 'hex') END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "ami_refresh_business_write_set_triggers"()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target RECORD;
  model_name TEXT;
BEGIN
  FOR target IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN (
        '_prisma_migrations',
        'business_database_write_set',
        'business_database_write_set_entry'
      )
    ORDER BY table_name
  LOOP
    model_name := CASE target.table_name
      WHEN 'business_mutation_receipt' THEN 'BusinessMutationReceipt'
      ELSE target.table_name
    END;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      'ami_business_write_set_capture_row',
      target.table_schema,
      target.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.%I(%L)',
      'ami_business_write_set_capture_row',
      target.table_schema,
      target.table_name,
      'ami_business_write_set_capture_row',
      model_name
    );
  END LOOP;
END;
$$;

SELECT "ami_refresh_business_write_set_triggers"();

REVOKE ALL ON FUNCTION "ami_business_write_set_capture_row"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "ami_refresh_business_write_set_triggers"() FROM PUBLIC;
