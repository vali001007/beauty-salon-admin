-- Run only after card-master-deduplication.ts has removed historical duplicates.
CREATE UNIQUE INDEX "Card_store_scope_normalized_name_key"
ON "Card" (
  (COALESCE("storeId", 0)),
  (lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')))
);
