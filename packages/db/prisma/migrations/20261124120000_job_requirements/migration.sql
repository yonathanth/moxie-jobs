-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[];
