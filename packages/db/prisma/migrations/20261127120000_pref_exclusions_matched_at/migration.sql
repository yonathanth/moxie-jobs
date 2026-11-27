-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "excludedProfessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "matchedAt" TIMESTAMP(3);

-- Existing preferences were matched long ago: don't show them as "still matching".
UPDATE "UserPreferences" SET "matchedAt" = "updatedAt";
