ALTER TABLE "Product"
  ADD COLUMN "specQuantity" DECIMAL(65,30),
  ADD COLUMN "specUnit" TEXT,
  ADD COLUMN "packageUnit" TEXT;

UPDATE "Product"
SET
  "packageUnit" = COALESCE(NULLIF(TRIM("unit"), ''), '件'),
  "specQuantity" = CASE
    WHEN "spec" ~ '^[[:space:]]*[0-9]+(\.[0-9]+)?' THEN (regexp_match("spec", '^[[:space:]]*([0-9]+(\.[0-9]+)?)'))[1]::DECIMAL
    ELSE NULL
  END,
  "specUnit" = CASE
    WHEN "spec" ~ '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*[^0-9[:space:]/]+' THEN (regexp_match("spec", '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*([^0-9[:space:]/]+)'))[2]
    ELSE NULLIF(TRIM("unit"), '')
  END
WHERE "deletedAt" IS NULL;
