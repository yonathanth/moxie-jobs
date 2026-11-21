-- CreateTable
CREATE TABLE "TermMapping" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermMapping_kind_hits_idx" ON "TermMapping"("kind", "hits");

-- CreateIndex
CREATE UNIQUE INDEX "TermMapping_kind_term_key" ON "TermMapping"("kind", "term");

