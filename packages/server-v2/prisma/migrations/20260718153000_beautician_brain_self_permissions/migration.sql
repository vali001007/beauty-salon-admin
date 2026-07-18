UPDATE "Role"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(
    "permissions" || ARRAY[
      'core:brain:use',
      'core:brain:beautician-view',
      'core:store:reservations'
    ]::text[]
  ) AS permission
  ORDER BY permission
)
WHERE "key" = 'beautician'
  AND "status" = 'active';
