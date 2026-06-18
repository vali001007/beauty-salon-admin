CREATE TABLE "TerminalConversation" (
  "id" SERIAL NOT NULL,
  "deviceId" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "operatorId" INTEGER,
  "date" DATE NOT NULL,
  "messages" JSONB NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),

  CONSTRAINT "TerminalConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerminalConversation_deviceId_role_date_key"
  ON "TerminalConversation"("deviceId", "role", "date");

CREATE INDEX "TerminalConversation_storeId_date_idx"
  ON "TerminalConversation"("storeId", "date");

CREATE INDEX "TerminalConversation_deviceId_date_idx"
  ON "TerminalConversation"("deviceId", "date");

CREATE INDEX "TerminalConversation_operatorId_date_idx"
  ON "TerminalConversation"("operatorId", "date");

ALTER TABLE "TerminalConversation"
  ADD CONSTRAINT "TerminalConversation_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalConversation"
  ADD CONSTRAINT "TerminalConversation_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
