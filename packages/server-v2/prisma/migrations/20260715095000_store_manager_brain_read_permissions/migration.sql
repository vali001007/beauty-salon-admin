UPDATE "Role"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(
    "permissions" || ARRAY[
      'core:finance:view',
      'core:project-order-profit:view',
      'core:beautician-performance:view'
    ]::text[]
  ) AS permission
  ORDER BY permission
)
WHERE "key" = 'store_manager';
