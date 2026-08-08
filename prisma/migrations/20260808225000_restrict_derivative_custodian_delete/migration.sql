-- A derivative with local custody cannot survive deletion of its executor
-- while retaining a meaningful storage scope. Require explicit artifact
-- migration or removal before an executor node can be deleted.
ALTER TABLE "StudioMediaDerivative"
  DROP CONSTRAINT "StudioMediaDerivative_custodianNodeId_fkey";

ALTER TABLE "StudioMediaDerivative"
  ADD CONSTRAINT "StudioMediaDerivative_custodianNodeId_fkey"
  FOREIGN KEY ("custodianNodeId") REFERENCES "AgentNode"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
