-- Trigram similarity for duplicate detection (docs/ingestion-spec.md section 9)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "lastBatchAt" TIMESTAMP(3),
ADD COLUMN     "overseasOk" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'telegram',
    "handle" TEXT,
    "tgChannelId" BIGINT,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "websiteDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier" INTEGER NOT NULL DEFAULT 1,
    "trust" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "linkPriority" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageId" BIGINT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPost" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "text" TEXT NOT NULL,
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "pageUrl" TEXT,
    "pageText" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "company" TEXT,
    "companyKey" TEXT,
    "professionId" TEXT,
    "functionId" TEXT,
    "fieldOfStudyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "educationLevel" TEXT,
    "experienceMin" INTEGER,
    "experienceMax" INTEGER,
    "employmentType" TEXT,
    "workMode" TEXT,
    "locationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationRaw" TEXT,
    "isOverseas" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "positions" INTEGER,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryRaw" TEXT,
    "genderReq" TEXT NOT NULL DEFAULT 'any',
    "deadline" TIMESTAMP(3),
    "deadlineRaw" TEXT,
    "summary" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applyMethod" TEXT NOT NULL,
    "applyUrl" TEXT,
    "applyEmail" TEXT,
    "applyTelegram" TEXT,
    "applyPhone" TEXT,
    "applyNotes" TEXT,
    "primarySourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSighting" (
    "jobId" TEXT NOT NULL,
    "rawPostId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFirst" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobSighting_pkey" PRIMARY KEY ("jobId","rawPostId")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "tgMessageId" BIGINT,
    "clickedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionLog" (
    "id" TEXT NOT NULL,
    "rawPostId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_handle_key" ON "Source"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Source_tgChannelId_key" ON "Source"("tgChannelId");

-- CreateIndex
CREATE INDEX "RawPost_textHash_idx" ON "RawPost"("textHash");

-- CreateIndex
CREATE INDEX "RawPost_status_createdAt_idx" ON "RawPost"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawPost_sourceId_messageId_key" ON "RawPost"("sourceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_status_firstSeenAt_idx" ON "Job"("status", "firstSeenAt");

-- CreateIndex
CREATE INDEX "Job_professionId_status_idx" ON "Job"("professionId", "status");

-- CreateIndex
CREATE INDEX "Job_functionId_status_idx" ON "Job"("functionId", "status");

-- CreateIndex
CREATE INDEX "Job_companyKey_deadline_idx" ON "Job"("companyKey", "deadline");

-- CreateIndex
CREATE INDEX "JobSighting_rawPostId_idx" ON "JobSighting"("rawPostId");

-- CreateIndex
CREATE INDEX "Delivery_status_scheduledFor_idx" ON "Delivery"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_userId_jobId_key" ON "Delivery"("userId", "jobId");

-- CreateIndex
CREATE INDEX "ExtractionLog_createdAt_idx" ON "ExtractionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RawPost" ADD CONSTRAINT "RawPost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSighting" ADD CONSTRAINT "JobSighting_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSighting" ADD CONSTRAINT "JobSighting_rawPostId_fkey" FOREIGN KEY ("rawPostId") REFERENCES "RawPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Fast similarity lookups on job summaries (dedup when a repost names no company)
CREATE INDEX "Job_summary_trgm_idx" ON "Job" USING GIN ("summary" gin_trgm_ops);
