-- CVs deleted by the person stay as hidden rows so free/plan CV usage cannot be reset by deleting.
ALTER TABLE "CvDocument" ADD COLUMN "deletedAt" TIMESTAMP(3);
