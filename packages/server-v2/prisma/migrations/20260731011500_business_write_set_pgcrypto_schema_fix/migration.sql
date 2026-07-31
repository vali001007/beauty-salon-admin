CREATE OR REPLACE FUNCTION public."ami_business_write_set_capture_row"()
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
    CASE
      WHEN before_row IS NULL THEN NULL
      ELSE encode(extensions.digest(before_row::TEXT, 'sha256'::TEXT), 'hex')
    END,
    CASE
      WHEN after_row IS NULL THEN NULL
      ELSE encode(extensions.digest(after_row::TEXT, 'sha256'::TEXT), 'hex')
    END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
