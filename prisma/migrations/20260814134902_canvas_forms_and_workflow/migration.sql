-- CreateEnum
CREATE TYPE "StudioTagUICategory" AS ENUM ('TASK', 'NOTE', 'IDEA', 'DECISION', 'ASSET');

-- CreateEnum
CREATE TYPE "InstitutionalWorkflowState" AS ENUM ('DRAFT', 'SUBMITTED', 'AUDITING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CanvasFormFieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "StudioNestChatMessage" ADD COLUMN     "linkedGoalId" TEXT;

-- AlterTable
ALTER TABLE "StudioStoryBoardSection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StudioTag" ADD COLUMN     "hexColor" TEXT,
ADD COLUMN     "iconName" TEXT,
ADD COLUMN     "uiCategory" "StudioTagUICategory";

-- CreateTable
CREATE TABLE "StudioNLEProject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fps" INTEGER NOT NULL DEFAULT 60,
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNLEProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNLETrack" (
    "id" TEXT NOT NULL,
    "nleProjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trackType" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isSoloed" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNLETrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNLEClip" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "startFrame" INTEGER NOT NULL,
    "durationFrames" INTEGER NOT NULL,
    "trimStartFrame" INTEGER NOT NULL DEFAULT 0,
    "speedMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "colorHex" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNLEClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioWorkflowStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hexColor" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioWorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasForm" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasFormField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CanvasFormFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CanvasFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasFormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "state" "InstitutionalWorkflowState" NOT NULL DEFAULT 'SUBMITTED',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioWorkflowStage_projectId_order_idx" ON "StudioWorkflowStage"("projectId", "order");

-- CreateIndex
CREATE INDEX "CanvasFormField_formId_order_idx" ON "CanvasFormField"("formId", "order");

-- RenameForeignKey
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt" RENAME CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_episodeProductionId_f" TO "StudioEpisodeProgramDeliveryReviewReceipt_episodeProductio_fkey";

-- RenameForeignKey
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt" RENAME CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_promotionReceiptId_fk" TO "StudioEpisodeProgramDeliveryReviewReceipt_promotionReceipt_fkey";

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "StudioWorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNestChatMessage" ADD CONSTRAINT "StudioNestChatMessage_linkedGoalId_fkey" FOREIGN KEY ("linkedGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNLEProject" ADD CONSTRAINT "StudioNLEProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNLETrack" ADD CONSTRAINT "StudioNLETrack_nleProjectId_fkey" FOREIGN KEY ("nleProjectId") REFERENCES "StudioNLEProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNLEClip" ADD CONSTRAINT "StudioNLEClip_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StudioNLETrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioWorkflowStage" ADD CONSTRAINT "StudioWorkflowStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasForm" ADD CONSTRAINT "CanvasForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasFormField" ADD CONSTRAINT "CanvasFormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CanvasForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasFormSubmission" ADD CONSTRAINT "CanvasFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CanvasForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasFormSubmission" ADD CONSTRAINT "CanvasFormSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CallExpectedSource_participant_status_idx" RENAME TO "CallExpectedSource_participantId_status_idx";

-- RenameIndex
ALTER INDEX "CallExpectedSource_room_kind_client_idx" RENAME TO "CallExpectedSource_roomId_sourceKind_expectedClientKind_idx";

-- RenameIndex
ALTER INDEX "CallExpectedSource_room_status_role_idx" RENAME TO "CallExpectedSource_roomId_status_retentionRole_idx";

-- RenameIndex
ALTER INDEX "CallExpectedSourceRevision_actor_created_idx" RENAME TO "CallExpectedSourceRevision_actorUserId_createdAt_idx";

-- RenameIndex
ALTER INDEX "CallExpectedSourceRevision_expectation_created_idx" RENAME TO "CallExpectedSourceRevision_expectationId_createdAt_idx";

-- RenameIndex
ALTER INDEX "CallExpectedSourceRevision_expectation_revision_key" RENAME TO "CallExpectedSourceRevision_expectationId_revision_key";

-- RenameIndex
ALTER INDEX "CallExpectedSourceRevision_room_created_idx" RENAME TO "CallExpectedSourceRevision_roomId_createdAt_idx";

-- RenameIndex
ALTER INDEX "StudioExternalMediaLibrary_projectId_provider_externalRootId_ke" RENAME TO "StudioExternalMediaLibrary_projectId_provider_externalRootI_key";

-- RenameIndex
ALTER INDEX "StudioExternalMediaLibraryOperation_libraryId_actorUserId_clien" RENAME TO "StudioExternalMediaLibraryOperation_libraryId_actorUserId_c_key";

-- RenameIndex
ALTER INDEX "StudioExternalMediaReferenceOperation_referenceId_actorUserId_c" RENAME TO "StudioExternalMediaReferenceOperation_referenceId_actorUser_key";

-- RenameIndex
ALTER INDEX "StudioMediaProviderConnectionOperation_actorUserId_createdAt_id" RENAME TO "StudioMediaProviderConnectionOperation_actorUserId_createdA_idx";

-- RenameIndex
ALTER INDEX "StudioMediaProviderConnectionOperation_connectionId_actorUserId" RENAME TO "StudioMediaProviderConnectionOperation_connectionId_actorUs_key";

-- RenameIndex
ALTER INDEX "StudioMediaProviderConnectionOperation_connectionId_revision_ke" RENAME TO "StudioMediaProviderConnectionOperation_connectionId_revisio_key";

-- RenameIndex
ALTER INDEX "StudioMediaSourceReplica_custodianNodeId_storageScopeId_status_" RENAME TO "StudioMediaSourceReplica_custodianNodeId_storageScopeId_sta_idx";

-- RenameIndex
ALTER INDEX "StudioMediaSourceReplica_sourceRevisionId_storageProvider_stora" RENAME TO "StudioMediaSourceReplica_sourceRevisionId_storageProvider_s_key";

-- RenameIndex
ALTER INDEX "StudioMediaSourceSet_projectId_createdByUserId_clientRequestId_" RENAME TO "StudioMediaSourceSet_projectId_createdByUserId_clientReques_key";

-- RenameIndex
ALTER INDEX "StudioSourceCollectionOperation_collectionId_actorUserId_client" RENAME TO "StudioSourceCollectionOperation_collectionId_actorUserId_cl_key";

-- RenameIndex
ALTER INDEX "StudioStoryBoardSectionOperation_section_actor_request_key" RENAME TO "StudioStoryBoardSectionOperation_sectionId_actorUserId_clie_key";

-- RenameIndex
ALTER INDEX "StudioTranscriptTerminologyCandidate_decidedByUserId_decidedAt_" RENAME TO "StudioTranscriptTerminologyCandidate_decidedByUserId_decide_idx";

-- RenameIndex
ALTER INDEX "StudioTranscriptTerminologyCandidate_projectId_sourceCorrection" RENAME TO "StudioTranscriptTerminologyCandidate_projectId_sourceCorrec_key";

-- RenameIndex
ALTER INDEX "StudioTranscriptTerminologyCandidate_projectId_status_createdAt" RENAME TO "StudioTranscriptTerminologyCandidate_projectId_status_creat_idx";

-- RenameIndex
ALTER INDEX "StudioTranscriptTerminologyCandidate_sourceTranscriptJobId_stat" RENAME TO "StudioTranscriptTerminologyCandidate_sourceTranscriptJobId__idx";

-- RenameIndex
ALTER INDEX "StudioTranscriptTerminologyTerm_projectId_status_priority_updat" RENAME TO "StudioTranscriptTerminologyTerm_projectId_status_priority_u_idx";
