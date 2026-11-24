-- CreateTable
CREATE TABLE "PromoLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "ref" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoLog_userId_kind_sentAt_idx" ON "PromoLog"("userId", "kind", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoLog_userId_slot_key" ON "PromoLog"("userId", "slot");

-- AddForeignKey
ALTER TABLE "PromoLog" ADD CONSTRAINT "PromoLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

