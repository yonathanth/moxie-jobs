-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cvDocumentId" TEXT;

-- CreateTable
CREATE TABLE "CvDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "jobId" TEXT,
    "baseCvId" TEXT,
    "templateId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "charge" TEXT NOT NULL,
    "lockedProduct" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "jobAnalysis" JSONB,
    "questions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvDocument_userId_createdAt_idx" ON "CvDocument"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CvDocument" ADD CONSTRAINT "CvDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

