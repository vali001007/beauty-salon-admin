ALTER TABLE "IndustryServiceTemplate"
  ADD COLUMN IF NOT EXISTS "careCycleWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "treatmentCourseTimes" INTEGER;
