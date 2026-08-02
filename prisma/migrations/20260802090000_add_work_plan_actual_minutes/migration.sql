ALTER TABLE "WorkPlanBlock"
ADD COLUMN "actualMinutes" INTEGER;

ALTER TABLE "WorkPlanBlock"
ADD CONSTRAINT "WorkPlanBlock_actualMinutes_check"
CHECK ("actualMinutes" IS NULL OR ("actualMinutes" >= 1 AND "actualMinutes" <= 1440));
