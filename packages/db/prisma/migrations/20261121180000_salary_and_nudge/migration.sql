-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingNudgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER;

