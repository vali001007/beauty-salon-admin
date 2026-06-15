DROP INDEX IF EXISTS "TerminalConversation_deviceId_role_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "TerminalConversation_deviceId_operatorId_role_date_key"
  ON "TerminalConversation"("deviceId", "operatorId", "role", "date");
