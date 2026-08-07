-- A derivative is only valid as retained evidence when its durable producing
-- job still exists. The job may outlive project cleanup, but it cannot be
-- removed out from under an immutable derivative receipt.
ALTER TABLE "StudioMediaDerivative"
  ADD CONSTRAINT "StudioMediaDerivative_workflowJobId_fkey"
  FOREIGN KEY ("workflowJobId") REFERENCES "StudioWorkflowJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
