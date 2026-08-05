-- One Session is one recording take. Every independently retained source
-- (browser, iPhone, camera import, or recorder import) binds to this stable
-- UUID while keeping its own immutable capture and upload identities.
ALTER TABLE "CallRoom"
ADD COLUMN "captureGroupId" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "CallRoom_captureGroupId_key"
ON "CallRoom"("captureGroupId");
