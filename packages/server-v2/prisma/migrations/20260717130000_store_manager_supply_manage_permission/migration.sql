UPDATE "Role"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(
    "permissions" || ARRAY['core:supply:manage']::text[]
  ) AS permission
  ORDER BY permission
)
WHERE "key" = 'store_manager'
  AND "status" = 'active';
