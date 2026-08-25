ALTER TABLE "ServiceOffering"
ADD COLUMN "publicBookingEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ServiceOffering_publicBookingEnabled_isActive_idx"
ON "ServiceOffering"("publicBookingEnabled", "isActive");
