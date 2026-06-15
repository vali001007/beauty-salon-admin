-- Bind management users to beautician profiles for Ami Aura Lite self-scoped terminal views.
ALTER TABLE "Beautician" ADD COLUMN "userId" INTEGER;

CREATE INDEX "Beautician_userId_idx" ON "Beautician"("userId");

CREATE UNIQUE INDEX "Beautician_storeId_userId_key" ON "Beautician"("storeId", "userId");

ALTER TABLE "Beautician"
  ADD CONSTRAINT "Beautician_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
