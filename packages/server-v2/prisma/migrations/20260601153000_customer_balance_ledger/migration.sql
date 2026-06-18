-- Add customer stored-value ledger for Ami Aura Lite recharge flows.
CREATE TABLE "CustomerBalanceAccount" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "cashBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "giftBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBalanceAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerBalanceTransaction" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "transactionNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "giftAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashBalanceBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashBalanceAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "giftBalanceBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "giftBalanceAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBalanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerBalanceAccount_customerId_storeId_key" ON "CustomerBalanceAccount"("customerId", "storeId");
CREATE INDEX "CustomerBalanceAccount_storeId_idx" ON "CustomerBalanceAccount"("storeId");
CREATE INDEX "CustomerBalanceAccount_status_idx" ON "CustomerBalanceAccount"("status");

CREATE UNIQUE INDEX "CustomerBalanceTransaction_transactionNo_key" ON "CustomerBalanceTransaction"("transactionNo");
CREATE INDEX "CustomerBalanceTransaction_customerId_createdAt_idx" ON "CustomerBalanceTransaction"("customerId", "createdAt");
CREATE INDEX "CustomerBalanceTransaction_storeId_createdAt_idx" ON "CustomerBalanceTransaction"("storeId", "createdAt");
CREATE INDEX "CustomerBalanceTransaction_orderId_idx" ON "CustomerBalanceTransaction"("orderId");
CREATE INDEX "CustomerBalanceTransaction_type_idx" ON "CustomerBalanceTransaction"("type");

ALTER TABLE "CustomerBalanceAccount" ADD CONSTRAINT "CustomerBalanceAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBalanceAccount" ADD CONSTRAINT "CustomerBalanceAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerBalanceTransaction" ADD CONSTRAINT "CustomerBalanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerBalanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBalanceTransaction" ADD CONSTRAINT "CustomerBalanceTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBalanceTransaction" ADD CONSTRAINT "CustomerBalanceTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerBalanceTransaction" ADD CONSTRAINT "CustomerBalanceTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
