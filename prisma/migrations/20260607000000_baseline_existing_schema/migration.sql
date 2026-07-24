-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('OWNER', 'TEAM_SCHEDULER', 'COACH', 'CLIENT', 'NETWORK_PASS');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentLocationType" AS ENUM ('VIDEO', 'PHONE', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('EMAIL', 'PHONE_CALL', 'TEXT');

-- CreateEnum
CREATE TYPE "CoachingRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'SCHEDULED', 'CLOSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "WeeklyCommitmentStatus" AS ENUM ('ACTIVE', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StoryDraftStatus" AS ENUM ('ROUGH', 'NEEDS_HOMER_REVIEW', 'NEEDS_CHUCK_REVIEW', 'APPROVED_FOR_PROMOTION', 'PROMOTED', 'PARKED');

-- CreateEnum
CREATE TYPE "StudioProjectionStatus" AS ENUM ('private', 'draft', 'review', 'approved', 'published', 'not_public', 'projection_not_approved');

-- CreateEnum
CREATE TYPE "StudioTagCategory" AS ENUM ('meaning', 'structure', 'source', 'projection', 'review', 'production_breakdown');

-- CreateEnum
CREATE TYPE "StudioKnowledgeNodeType" AS ENUM ('principle', 'story', 'quote', 'question', 'projection_candidate', 'source_note', 'production_element');

-- CreateEnum
CREATE TYPE "StudioManuscriptKind" AS ENUM ('WORKING', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "StudioProjectAccessRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "StudioProjectAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "QuipslyNodeType" AS ENUM ('PERSON', 'QUOTE', 'THEME', 'SOURCE_WORK', 'EVIDENCE', 'LORELIST');

-- CreateEnum
CREATE TYPE "QuipslyEdgeType" AS ENUM ('QUOTED_BY', 'APPEARS_IN', 'SUPPORTED_BY', 'HAS_THEME', 'CONTAINS', 'RELATED_TO', 'VARIANT_OF');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "FeedbackTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackTicketType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'GENERAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "StoryEntityType" AS ENUM ('CHARACTER', 'SETTING', 'SCENE', 'RELATIONSHIP', 'TIMELINE_EVENT', 'THEME_MOTIF', 'COMIC_ACT', 'COMIC_PANEL', 'BEAT');

-- CreateEnum
CREATE TYPE "StoryBibleActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNDONE');

-- CreateEnum
CREATE TYPE "StoryBibleActionType" AS ENUM ('PROPOSE_ENTITY', 'PROPOSE_ENTITY_UPDATE', 'PROPOSE_RELATIONSHIP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "primaryEmail" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "firebaseUid" TEXT,
    "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
    "announcementsOptIn" BOOLEAN NOT NULL DEFAULT false,
    "welcomeCompletedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AppRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNativeAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "callbackScheme" TEXT NOT NULL,
    "state" TEXT,
    "deviceLabel" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "StudioNativeAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNativeDeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "refreshTokenHash" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "StudioNativeDeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "billingIntervalMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingFeature" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'tool',
    "clientSummary" TEXT NOT NULL,
    "coachSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingFeatureGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "visibility" TEXT NOT NULL DEFAULT 'client_and_coach',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingFeatureGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "tagsJson" JSONB NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubSocialInteraction" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "parentPostId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "content" TEXT NOT NULL,
    "repliedTo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubSocialInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCommitment" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "weekStartsAt" TIMESTAMP(3) NOT NULL,
    "commitmentOne" TEXT NOT NULL,
    "commitmentTwo" TEXT,
    "commitmentThree" TEXT,
    "supportNeeded" TEXT,
    "progressNotes" TEXT,
    "status" "WeeklyCommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "coachNotes" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "coachUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "locationType" "AppointmentLocationType" NOT NULL DEFAULT 'VIDEO',
    "locationDetails" TEXT,
    "notes" TEXT,
    "clientNotes" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingRequest" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "preferredContactMethod" "ContactPreference" NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "availabilityNotes" TEXT,
    "coachingGoals" TEXT NOT NULL,
    "contactConsent" BOOLEAN NOT NULL,
    "status" "CoachingRequestStatus" NOT NULL DEFAULT 'NEW',
    "assignedCoachUserId" TEXT,
    "convertedAppointmentId" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySupportRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "preferredContactMethod" "ContactPreference" NOT NULL,
    "supportType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "CompanySupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubProviderConnection" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerKind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "accountId" TEXT,
    "accountName" TEXT,
    "avatarUrl" TEXT,
    "accountLabel" TEXT,
    "capabilitiesJson" JSONB NOT NULL,
    "requiredEnvJson" JSONB NOT NULL,
    "configuredEnvJson" JSONB NOT NULL,
    "missingEnvJson" JSONB NOT NULL,
    "setupUrl" TEXT,
    "setupNotes" TEXT,
    "healthStatus" TEXT NOT NULL DEFAULT 'not_checked',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubProviderEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalEventId" TEXT,
    "idempotencyKey" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "processingStatus" TEXT NOT NULL DEFAULT 'received',
    "payloadHash" TEXT,
    "payloadSummaryJson" JSONB NOT NULL,
    "errorMessage" TEXT,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubProviderSyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "providerKey" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payloadJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "requestedByEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubProviderSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubCatalogItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "fulfillmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubOffer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "checkoutMode" TEXT NOT NULL DEFAULT 'external_link',
    "summary" TEXT,
    "externalUrl" TEXT,
    "providerConnectionId" TEXT,
    "catalogItemRefsJson" JSONB NOT NULL,
    "priceRefsJson" JSONB NOT NULL,
    "entitlementRefsJson" JSONB NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubCart" (
    "id" TEXT NOT NULL,
    "cartKey" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lineItemsJson" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sourceCartId" TEXT,
    "ownerUserId" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lineItemsJson" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "checkoutMode" TEXT NOT NULL DEFAULT 'provider_checkout',
    "providerConnectionId" TEXT,
    "externalCheckoutUrl" TEXT,
    "providerRefsJson" JSONB NOT NULL,
    "placedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubFulfillmentJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "providerConnectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "lineItemsJson" JSONB NOT NULL,
    "providerRefsJson" JSONB NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubFulfillmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubSeoBrief" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentKind" TEXT NOT NULL DEFAULT 'episode_page',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetPath" TEXT,
    "targetUrl" TEXT,
    "primaryKeyword" TEXT,
    "secondaryKeywordsJson" JSONB NOT NULL,
    "searchIntent" TEXT,
    "audience" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "structuredDataType" TEXT,
    "checklistJson" JSONB NOT NULL,
    "notes" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubSeoBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'site',
    "contentPath" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metricsJson" JSONB NOT NULL,
    "notes" TEXT,
    "capturedByEmail" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubMonetizationPlacement" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "placementType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "targetPath" TEXT,
    "providerKey" TEXT,
    "displayName" TEXT NOT NULL,
    "destinationUrl" TEXT,
    "disclosureText" TEXT,
    "callToAction" TEXT,
    "metadataJson" JSONB NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubMonetizationPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldHubMonetizationResearchNote" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectProfile" TEXT NOT NULL,
    "monetizationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'research',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePublisher" TEXT,
    "sourceDate" TEXT,
    "sourceAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "takeawaysJson" JSONB NOT NULL,
    "recommendedUse" TEXT,
    "risksJson" JSONB NOT NULL,
    "nextActionsJson" JSONB NOT NULL,
    "tagsJson" JSONB NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldHubMonetizationResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryDraft" (
    "id" TEXT NOT NULL,
    "storyCandidateId" TEXT NOT NULL,
    "storyCandidateTitle" TEXT,
    "sourceBlockId" TEXT NOT NULL,
    "episodeKey" TEXT,
    "episodeNumber" INTEGER,
    "arrangementKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "notes" TEXT,
    "supportNotes" TEXT,
    "status" "StoryDraftStatus" NOT NULL DEFAULT 'ROUGH',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "promotedAt" TIMESTAMP(3),
    "promotedBlockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioWorkspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerLabel" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceLabel" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "manuscriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioProjectAccessGrant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StudioProjectAccessRole" NOT NULL DEFAULT 'VIEWER',
    "status" "StudioProjectAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioProjectAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourcePath" TEXT,
    "projectionStatus" "StudioProjectionStatus" NOT NULL DEFAULT 'private',
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioEpisodeProduction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "boundaryLabel" TEXT NOT NULL,
    "boundaryKind" TEXT NOT NULL DEFAULT 'episode',
    "boundaryStartBlockId" TEXT,
    "boundaryEndBlockId" TEXT,
    "boundaryStartOrder" INTEGER,
    "boundaryEndOrder" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recordingRoomJson" JSONB,
    "timelineJson" JSONB,
    "transcriptJson" JSONB,
    "productionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioEpisodeProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNestInvite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StudioProjectAccessRole" NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT,
    "invitedByEmail" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNestInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssetAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdByEmail" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssetAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssetVariant" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "sizeBytes" BIGINT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssetVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssetProcessingJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestedByEmail" TEXT,
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "resultJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssetProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioSourceUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "assetId" TEXT,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourcePath" TEXT,
    "author" TEXT,
    "capturedAt" TIMESTAMP(3),
    "immutableText" TEXT,
    "editableNotes" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioSourceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDocumentOperation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "groupId" TEXT,
    "actorEmail" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'human',
    "operationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioDocumentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioProductionRoom" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'episode',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "spineAssetId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioProductionRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioTimelineVersion" (
    "id" TEXT NOT NULL,
    "productionRoomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "timelineJson" JSONB NOT NULL DEFAULT '{}',
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioTimelineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioOutputPacket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "productionRoomId" TEXT,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "packetJson" JSONB NOT NULL DEFAULT '{}',
    "lineageJson" JSONB NOT NULL DEFAULT '{}',
    "createdByEmail" TEXT,
    "approvedByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioOutputPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioPublishAttempt" (
    "id" TEXT NOT NULL,
    "outputPacketId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestJson" JSONB NOT NULL DEFAULT '{}',
    "resultJson" JSONB,
    "error" TEXT,
    "requestedByEmail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioPublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioPublishedArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "outputPacketId" TEXT,
    "destination" TEXT NOT NULL,
    "externalId" TEXT,
    "publicUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioPublishedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioWorkflowJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT,
    "productionRoomId" TEXT,
    "outputPacketId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "source" TEXT NOT NULL DEFAULT 'app',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "resultJson" JSONB,
    "error" TEXT,
    "requestedByEmail" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioWorkflowJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioVideoSource" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSourceId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioVideoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioManuscript" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceFileName" TEXT,
    "kind" "StudioManuscriptKind" NOT NULL DEFAULT 'WORKING',
    "lastSnapshotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "StudioManuscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioManuscriptSnapshot" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "sourceFileName" TEXT,
    "draftJson" JSONB NOT NULL,
    "contentHash" TEXT,
    "clientUpdatedAt" TIMESTAMP(3),
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "blockCount" INTEGER NOT NULL DEFAULT 0,
    "structureCount" INTEGER NOT NULL DEFAULT 0,
    "citedQuoteCount" INTEGER NOT NULL DEFAULT 0,
    "quoteReviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioManuscriptSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioManuscriptCollaborationRoom" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seedSnapshotId" TEXT,
    "seededAt" TIMESTAMP(3),
    "seededByEmail" TEXT,
    "lastCheckpointSnapshotId" TEXT,
    "ydocState" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioManuscriptCollaborationRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioContentWorkspaceSnapshot" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "workspaceJson" JSONB NOT NULL,
    "contentHash" TEXT,
    "projectCount" INTEGER NOT NULL DEFAULT 0,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "readyCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioContentWorkspaceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioContentProject" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "localProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "projectJson" JSONB NOT NULL,
    "handoffJson" JSONB NOT NULL,
    "productionPacketJson" JSONB,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioContentProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HgoStagedProjectionArtifact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "artifactVersion" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "projectionId" TEXT NOT NULL,
    "projectionSlug" TEXT NOT NULL,
    "projectionTitle" TEXT NOT NULL,
    "projectionStatus" TEXT NOT NULL,
    "projectionVisibility" TEXT NOT NULL,
    "sourceBridgeVersion" TEXT,
    "artifactStatus" TEXT NOT NULL,
    "recommendedNextAction" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "promotionReadiness" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "artifactJson" JSONB NOT NULL,
    "artifactSummaryJson" JSONB NOT NULL,
    "eventLogJson" JSONB NOT NULL,
    "blockerCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "containsRealContent" TEXT NOT NULL DEFAULT 'unknown',
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HgoStagedProjectionArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HgoEpisodePublishCandidate" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sourceStagedArtifactId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceArtifactId" TEXT NOT NULL,
    "sourceArtifactHash" TEXT NOT NULL,
    "projectionId" TEXT NOT NULL,
    "projectionSlug" TEXT NOT NULL,
    "projectionTitle" TEXT NOT NULL,
    "proposedRoute" TEXT NOT NULL,
    "readinessState" TEXT NOT NULL,
    "candidateStatus" TEXT NOT NULL DEFAULT 'private-review',
    "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
    "packetJson" JSONB NOT NULL,
    "reviewBriefJson" JSONB NOT NULL,
    "draftPacketJson" JSONB NOT NULL,
    "frontmatterJson" JSONB NOT NULL,
    "mdxDraft" TEXT NOT NULL,
    "blockerCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "containsRealContent" TEXT NOT NULL DEFAULT 'unknown',
    "note" TEXT,
    "createdByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HgoEpisodePublishCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDocumentBlock" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourcePath" TEXT,
    "externalId" TEXT,
    "projectionStatus" "StudioProjectionStatus" NOT NULL DEFAULT 'private',
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "archivedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDocumentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioViewDefinition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'review',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "displaySettings" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioViewDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" "StudioTagCategory" NOT NULL DEFAULT 'meaning',
    "nodeType" "StudioKnowledgeNodeType" NOT NULL DEFAULT 'source_note',
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioTaggedSpan" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "selectedText" TEXT NOT NULL,
    "documentStableId" TEXT NOT NULL,
    "documentTitleSnapshot" TEXT NOT NULL,
    "blockStableId" TEXT NOT NULL,
    "blockTitleSnapshot" TEXT,
    "sourceLabel" TEXT,
    "sourcePath" TEXT,
    "sourceExternalId" TEXT,
    "projectionStatus" "StudioProjectionStatus" NOT NULL DEFAULT 'private',
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioTaggedSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioKnowledgeNode" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "taggedSpanId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagLabel" TEXT NOT NULL,
    "tagCategory" "StudioTagCategory" NOT NULL,
    "nodeType" "StudioKnowledgeNodeType" NOT NULL DEFAULT 'source_note',
    "sourceText" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "projectionStatus" "StudioProjectionStatus" NOT NULL DEFAULT 'projection_not_approved',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "documentStableId" TEXT NOT NULL,
    "documentTitleSnapshot" TEXT NOT NULL,
    "blockStableId" TEXT NOT NULL,
    "blockTitleSnapshot" TEXT,
    "spanStartOffset" INTEGER NOT NULL,
    "spanEndOffset" INTEGER NOT NULL,
    "sourceLabel" TEXT,
    "sourcePath" TEXT,
    "createdByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioKnowledgeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snippet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "highlightedText" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipslyNode" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nodeType" "QuipslyNodeType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipslyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreEdge" (
    "id" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "edgeType" "QuipslyEdgeType" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipStreamSession" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entrySurface" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipStreamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipStreamEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quoteId" TEXT,
    "mode" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dwellMs" INTEGER,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuipStreamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionTelemetry" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "retentionRate" DOUBLE PRECISION NOT NULL,
    "cohortId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastEpisode" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "audioSizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "episodeType" TEXT NOT NULL DEFAULT 'full',
    "season" INTEGER,
    "episodeNumber" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodcastEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastDownloadLog" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "city" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodcastDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "analyticsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioMediaAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "rawAssetId" TEXT,
    "cloudProvider" TEXT NOT NULL DEFAULT 'gcs',
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "duration" DOUBLE PRECISION,
    "resolution" TEXT,
    "fps" DOUBLE PRECISION,
    "thumbnailUrl" TEXT,
    "mediaBinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBin" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioMediaTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#8c6b4a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMediaTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaClip" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "inTimecode" DOUBLE PRECISION NOT NULL,
    "outTimecode" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentNode" (
    "id" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "capabilities" JSONB NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipslyAgent" (
    "id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "currentTask" TEXT,
    "assignedProjectId" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipslyAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "outputJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingFunnel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goalType" TEXT NOT NULL DEFAULT 'lead_generation',
    "targetValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelStep" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expectedConvRate" DOUBLE PRECISION,
    "actualConvRate" DOUBLE PRECISION,
    "views" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPersona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarImageUrl" TEXT,
    "demographics" TEXT NOT NULL,
    "psychographics" TEXT NOT NULL,
    "painPointsJson" JSONB NOT NULL,
    "desiresJson" JSONB NOT NULL,
    "objectionsJson" JSONB NOT NULL,
    "contentPillarsJson" JSONB NOT NULL,
    "sourceDataJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneNumber" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "timeOfDay" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stripOrder" INTEGER NOT NULL DEFAULT 0,
    "shootDayId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShootDay" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShootDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryboardShot" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "shotNumber" TEXT NOT NULL,
    "imageUrl" TEXT,
    "action" TEXT NOT NULL,
    "dialogue" TEXT,
    "cameraInfo" TEXT NOT NULL,
    "vfxNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryboardShot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personaId" TEXT,
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "subheadline" TEXT,
    "ctaText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "slug" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "landingPageId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'subscribed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personaId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "emailsJson" JSONB NOT NULL,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" "FeedbackTicketType" NOT NULL,
    "status" "FeedbackTicketStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventName" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stripeProductId" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceUniverse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceUniverse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceSeries" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceBook" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bookNumber" INTEGER NOT NULL,
    "tropesJson" JSONB NOT NULL DEFAULT '[]',
    "leadsJson" JSONB NOT NULL DEFAULT '[]',
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceFaction" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ideology" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceFaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceCharacter" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "factionId" TEXT,
    "name" TEXT NOT NULL,
    "aliasesJson" JSONB NOT NULL DEFAULT '[]',
    "physicalDescription" TEXT,
    "personality" TEXT,
    "backstory" TEXT,
    "species" TEXT,
    "archetype" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomanceScene" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomanceScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryEntity" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "projectId" TEXT NOT NULL,
    "type" "StoryEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryEntityMention" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryEntityMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBibleAction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" "StoryBibleActionType" NOT NULL,
    "status" "StoryBibleActionStatus" NOT NULL DEFAULT 'PENDING',
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "explanation" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryBibleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBibleLedger" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "oldStatus" "StoryBibleActionStatus",
    "newStatus" "StoryBibleActionStatus" NOT NULL,
    "comments" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryBibleLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementLedger" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEmail" TEXT,
    "proposedTier" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerStatus" TEXT,
    "eventId" TEXT,
    "membershipId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntitlementLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalEmbedding" (
    "id" TEXT NOT NULL,
    "sourceOrigin" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioStoryboard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioStoryboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioStoryboardFrame" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "frameNumber" TEXT NOT NULL,
    "imageUrl" TEXT,
    "action" TEXT NOT NULL,
    "dialogue" TEXT,
    "cameraInfo" TEXT NOT NULL DEFAULT 'Static',
    "shotSize" TEXT NOT NULL DEFAULT 'Medium Shot',
    "lens" TEXT,
    "cameraMovement" TEXT,
    "mediaClipId" TEXT,
    "estimatedDuration" INTEGER,
    "vfxNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioStoryboardFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNestChatThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT NOT NULL DEFAULT 'Nest Chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNestChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioNestChatMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorEmail" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "gifUrl" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioNestChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssistantSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssistantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssistantMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contextJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssistantLedger" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioAssistantLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioAssistantAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "explanation" TEXT,
    "riskLevel" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioAssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrollInteraction" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "panelId" TEXT,
    "userId" TEXT,
    "interactionType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrollInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioScrollExperience" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storyboardId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioScrollExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioScrollSection" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioScrollSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioScrollPanelRef" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "frameId" TEXT,
    "externalId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioScrollPanelRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreAuthor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreWork" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "isbn" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreQuote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workId" TEXT,
    "authorId" TEXT,
    "sourceId" TEXT,
    "text" TEXT NOT NULL,
    "context" TEXT,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreCitation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sourceId" TEXT,
    "locator" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreUserAnnotation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreUserAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreTheme" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "themeId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipLoreCollection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipLoreCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuipslyNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "folderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuipslyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StudioMediaAssetToStudioProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StudioMediaAssetToStudioProject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_StudioMediaAssetToStudioMediaTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StudioMediaAssetToStudioMediaTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MediaClipToStudioMediaTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MediaClipToStudioMediaTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_MediaClipToStudioTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MediaClipToStudioTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_QuoteTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_QuoteTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_QuoteCollections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_QuoteCollections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_primaryEmail_key" ON "User"("primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");

-- CreateIndex
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "StudioNativeAuthCode_codeHash_key" ON "StudioNativeAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "StudioNativeAuthCode_userId_expiresAt_idx" ON "StudioNativeAuthCode"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "StudioNativeAuthCode_expiresAt_idx" ON "StudioNativeAuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioNativeDeviceSession_refreshTokenHash_key" ON "StudioNativeDeviceSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "StudioNativeDeviceSession_userId_revokedAt_idx" ON "StudioNativeDeviceSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "StudioNativeDeviceSession_expiresAt_idx" ON "StudioNativeDeviceSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_planId_idx" ON "Membership"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingFeature_featureKey_key" ON "CoachingFeature"("featureKey");

-- CreateIndex
CREATE INDEX "CoachingFeature_category_status_idx" ON "CoachingFeature"("category", "status");

-- CreateIndex
CREATE INDEX "CoachingFeature_status_sortOrder_idx" ON "CoachingFeature"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "CoachingFeatureGrant_featureId_status_idx" ON "CoachingFeatureGrant"("featureId", "status");

-- CreateIndex
CREATE INDEX "CoachingFeatureGrant_userId_status_idx" ON "CoachingFeatureGrant"("userId", "status");

-- CreateIndex
CREATE INDEX "CoachingFeatureGrant_source_status_idx" ON "CoachingFeatureGrant"("source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingFeatureGrant_userId_featureId_key" ON "CoachingFeatureGrant"("userId", "featureId");

-- CreateIndex
CREATE INDEX "StudioAsset_createdAt_idx" ON "StudioAsset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubSocialInteraction_externalId_key" ON "WorldHubSocialInteraction"("externalId");

-- CreateIndex
CREATE INDEX "WorldHubSocialInteraction_platform_interactionType_idx" ON "WorldHubSocialInteraction"("platform", "interactionType");

-- CreateIndex
CREATE INDEX "WorldHubSocialInteraction_createdAt_idx" ON "WorldHubSocialInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "WeeklyCommitment_clientUserId_status_weekStartsAt_idx" ON "WeeklyCommitment"("clientUserId", "status", "weekStartsAt");

-- CreateIndex
CREATE INDEX "WeeklyCommitment_status_updatedAt_idx" ON "WeeklyCommitment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WeeklyCommitment_reviewedByUserId_idx" ON "WeeklyCommitment"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCommitment_clientUserId_weekStartsAt_key" ON "WeeklyCommitment"("clientUserId", "weekStartsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_googleEventId_key" ON "Appointment"("googleEventId");

-- CreateIndex
CREATE INDEX "Appointment_clientUserId_scheduledStart_idx" ON "Appointment"("clientUserId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_coachUserId_scheduledStart_idx" ON "Appointment"("coachUserId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_status_scheduledStart_idx" ON "Appointment"("status", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingRequest_convertedAppointmentId_key" ON "CoachingRequest"("convertedAppointmentId");

-- CreateIndex
CREATE INDEX "CoachingRequest_clientUserId_createdAt_idx" ON "CoachingRequest"("clientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingRequest_status_createdAt_idx" ON "CoachingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingRequest_assignedCoachUserId_status_idx" ON "CoachingRequest"("assignedCoachUserId", "status");

-- CreateIndex
CREATE INDEX "CompanySupportRequest_createdAt_idx" ON "CompanySupportRequest"("createdAt");

-- CreateIndex
CREATE INDEX "CompanySupportRequest_supportType_createdAt_idx" ON "CompanySupportRequest"("supportType", "createdAt");

-- CreateIndex
CREATE INDEX "CompanySupportRequest_userId_createdAt_idx" ON "CompanySupportRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubProviderConnection_providerKey_key" ON "WorldHubProviderConnection"("providerKey");

-- CreateIndex
CREATE INDEX "WorldHubProviderConnection_providerKind_status_idx" ON "WorldHubProviderConnection"("providerKind", "status");

-- CreateIndex
CREATE INDEX "WorldHubProviderConnection_status_updatedAt_idx" ON "WorldHubProviderConnection"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubProviderEvent_connectionId_receivedAt_idx" ON "WorldHubProviderEvent"("connectionId", "receivedAt");

-- CreateIndex
CREATE INDEX "WorldHubProviderEvent_processingStatus_receivedAt_idx" ON "WorldHubProviderEvent"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubProviderEvent_connectionId_idempotencyKey_key" ON "WorldHubProviderEvent"("connectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorldHubProviderSyncJob_providerKey_status_requestedAt_idx" ON "WorldHubProviderSyncJob"("providerKey", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "WorldHubProviderSyncJob_subjectType_subjectId_idx" ON "WorldHubProviderSyncJob"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "WorldHubProviderSyncJob_status_scheduledAt_idx" ON "WorldHubProviderSyncJob"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubCatalogItem_slug_key" ON "WorldHubCatalogItem"("slug");

-- CreateIndex
CREATE INDEX "WorldHubCatalogItem_kind_status_idx" ON "WorldHubCatalogItem"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubOffer_slug_key" ON "WorldHubOffer"("slug");

-- CreateIndex
CREATE INDEX "WorldHubOffer_kind_status_idx" ON "WorldHubOffer"("kind", "status");

-- CreateIndex
CREATE INDEX "WorldHubOffer_providerConnectionId_status_idx" ON "WorldHubOffer"("providerConnectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubCart_cartKey_key" ON "WorldHubCart"("cartKey");

-- CreateIndex
CREATE INDEX "WorldHubCart_ownerUserId_updatedAt_idx" ON "WorldHubCart"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubCart_email_updatedAt_idx" ON "WorldHubCart"("email", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubCart_status_updatedAt_idx" ON "WorldHubCart"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubOrder_orderNumber_key" ON "WorldHubOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "WorldHubOrder_ownerUserId_updatedAt_idx" ON "WorldHubOrder"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubOrder_email_updatedAt_idx" ON "WorldHubOrder"("email", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubOrder_status_updatedAt_idx" ON "WorldHubOrder"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubOrder_providerConnectionId_updatedAt_idx" ON "WorldHubOrder"("providerConnectionId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubFulfillmentJob_orderId_status_idx" ON "WorldHubFulfillmentJob"("orderId", "status");

-- CreateIndex
CREATE INDEX "WorldHubFulfillmentJob_providerConnectionId_status_idx" ON "WorldHubFulfillmentJob"("providerConnectionId", "status");

-- CreateIndex
CREATE INDEX "WorldHubFulfillmentJob_status_queuedAt_idx" ON "WorldHubFulfillmentJob"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubSeoBrief_slug_key" ON "WorldHubSeoBrief"("slug");

-- CreateIndex
CREATE INDEX "WorldHubSeoBrief_contentKind_status_idx" ON "WorldHubSeoBrief"("contentKind", "status");

-- CreateIndex
CREATE INDEX "WorldHubSeoBrief_status_updatedAt_idx" ON "WorldHubSeoBrief"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubSeoBrief_targetPath_idx" ON "WorldHubSeoBrief"("targetPath");

-- CreateIndex
CREATE INDEX "WorldHubAnalyticsSnapshot_source_capturedAt_idx" ON "WorldHubAnalyticsSnapshot"("source", "capturedAt");

-- CreateIndex
CREATE INDEX "WorldHubAnalyticsSnapshot_channel_capturedAt_idx" ON "WorldHubAnalyticsSnapshot"("channel", "capturedAt");

-- CreateIndex
CREATE INDEX "WorldHubAnalyticsSnapshot_contentPath_capturedAt_idx" ON "WorldHubAnalyticsSnapshot"("contentPath", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubMonetizationPlacement_slug_key" ON "WorldHubMonetizationPlacement"("slug");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationPlacement_placementType_status_idx" ON "WorldHubMonetizationPlacement"("placementType", "status");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationPlacement_targetPath_status_idx" ON "WorldHubMonetizationPlacement"("targetPath", "status");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationPlacement_providerKey_status_idx" ON "WorldHubMonetizationPlacement"("providerKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorldHubMonetizationResearchNote_slug_key" ON "WorldHubMonetizationResearchNote"("slug");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationResearchNote_monetizationType_status_idx" ON "WorldHubMonetizationResearchNote"("monetizationType", "status");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationResearchNote_projectProfile_updatedAt_idx" ON "WorldHubMonetizationResearchNote"("projectProfile", "updatedAt");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationResearchNote_sourcePublisher_idx" ON "WorldHubMonetizationResearchNote"("sourcePublisher");

-- CreateIndex
CREATE INDEX "WorldHubMonetizationResearchNote_status_updatedAt_idx" ON "WorldHubMonetizationResearchNote"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StoryDraft_storyCandidateId_status_idx" ON "StoryDraft"("storyCandidateId", "status");

-- CreateIndex
CREATE INDEX "StoryDraft_sourceBlockId_status_idx" ON "StoryDraft"("sourceBlockId", "status");

-- CreateIndex
CREATE INDEX "StoryDraft_episodeKey_status_idx" ON "StoryDraft"("episodeKey", "status");

-- CreateIndex
CREATE INDEX "StoryDraft_createdByUserId_createdAt_idx" ON "StoryDraft"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioWorkspace_slug_key" ON "StudioWorkspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StudioProject_manuscriptId_key" ON "StudioProject"("manuscriptId");

-- CreateIndex
CREATE INDEX "StudioProject_workspaceId_idx" ON "StudioProject"("workspaceId");

-- CreateIndex
CREATE INDEX "StudioProject_manuscriptId_idx" ON "StudioProject"("manuscriptId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioProject_workspaceId_slug_key" ON "StudioProject"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "StudioProjectAccessGrant_email_status_idx" ON "StudioProjectAccessGrant"("email", "status");

-- CreateIndex
CREATE INDEX "StudioProjectAccessGrant_projectId_status_idx" ON "StudioProjectAccessGrant"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioProjectAccessGrant_projectId_email_key" ON "StudioProjectAccessGrant"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StudioDocument_stableId_key" ON "StudioDocument"("stableId");

-- CreateIndex
CREATE INDEX "StudioDocument_projectId_stableId_idx" ON "StudioDocument"("projectId", "stableId");

-- CreateIndex
CREATE INDEX "StudioDocument_projectId_projectionStatus_idx" ON "StudioDocument"("projectId", "projectionStatus");

-- CreateIndex
CREATE INDEX "StudioEpisodeProduction_documentId_idx" ON "StudioEpisodeProduction"("documentId");

-- CreateIndex
CREATE INDEX "StudioEpisodeProduction_projectId_boundaryKind_idx" ON "StudioEpisodeProduction"("projectId", "boundaryKind");

-- CreateIndex
CREATE INDEX "StudioEpisodeProduction_projectId_status_updatedAt_idx" ON "StudioEpisodeProduction"("projectId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioEpisodeProduction_projectId_slug_key" ON "StudioEpisodeProduction"("projectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StudioNestInvite_tokenHash_key" ON "StudioNestInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StudioNestInvite_email_status_idx" ON "StudioNestInvite"("email", "status");

-- CreateIndex
CREATE INDEX "StudioNestInvite_projectId_status_idx" ON "StudioNestInvite"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioNestInvite_projectId_email_key" ON "StudioNestInvite"("projectId", "email");

-- CreateIndex
CREATE INDEX "StudioAssetAttachment_assetId_idx" ON "StudioAssetAttachment"("assetId");

-- CreateIndex
CREATE INDEX "StudioAssetAttachment_projectId_role_idx" ON "StudioAssetAttachment"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "StudioAssetAttachment_projectId_assetId_key" ON "StudioAssetAttachment"("projectId", "assetId");

-- CreateIndex
CREATE INDEX "StudioAssetVariant_assetId_kind_idx" ON "StudioAssetVariant"("assetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "StudioAssetVariant_assetId_kind_url_key" ON "StudioAssetVariant"("assetId", "kind", "url");

-- CreateIndex
CREATE INDEX "StudioAssetProcessingJob_assetId_status_createdAt_idx" ON "StudioAssetProcessingJob"("assetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudioAssetProcessingJob_projectId_status_idx" ON "StudioAssetProcessingJob"("projectId", "status");

-- CreateIndex
CREATE INDEX "StudioAssetProcessingJob_type_status_idx" ON "StudioAssetProcessingJob"("type", "status");

-- CreateIndex
CREATE INDEX "StudioSourceUnit_projectId_kind_idx" ON "StudioSourceUnit"("projectId", "kind");

-- CreateIndex
CREATE INDEX "StudioSourceUnit_documentId_idx" ON "StudioSourceUnit"("documentId");

-- CreateIndex
CREATE INDEX "StudioSourceUnit_assetId_idx" ON "StudioSourceUnit"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioSourceUnit_projectId_slug_key" ON "StudioSourceUnit"("projectId", "slug");

-- CreateIndex
CREATE INDEX "StudioDocumentOperation_documentId_createdAt_idx" ON "StudioDocumentOperation"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioDocumentOperation_projectId_groupId_idx" ON "StudioDocumentOperation"("projectId", "groupId");

-- CreateIndex
CREATE INDEX "StudioDocumentOperation_actorEmail_createdAt_idx" ON "StudioDocumentOperation"("actorEmail", "createdAt");

-- CreateIndex
CREATE INDEX "StudioProductionRoom_documentId_idx" ON "StudioProductionRoom"("documentId");

-- CreateIndex
CREATE INDEX "StudioProductionRoom_projectId_kind_status_idx" ON "StudioProductionRoom"("projectId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioProductionRoom_projectId_slug_key" ON "StudioProductionRoom"("projectId", "slug");

-- CreateIndex
CREATE INDEX "StudioTimelineVersion_productionRoomId_createdAt_idx" ON "StudioTimelineVersion"("productionRoomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioTimelineVersion_productionRoomId_version_key" ON "StudioTimelineVersion"("productionRoomId", "version");

-- CreateIndex
CREATE INDEX "StudioOutputPacket_projectId_kind_status_idx" ON "StudioOutputPacket"("projectId", "kind", "status");

-- CreateIndex
CREATE INDEX "StudioOutputPacket_documentId_idx" ON "StudioOutputPacket"("documentId");

-- CreateIndex
CREATE INDEX "StudioOutputPacket_productionRoomId_idx" ON "StudioOutputPacket"("productionRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioOutputPacket_projectId_slug_key" ON "StudioOutputPacket"("projectId", "slug");

-- CreateIndex
CREATE INDEX "StudioPublishAttempt_outputPacketId_destination_status_idx" ON "StudioPublishAttempt"("outputPacketId", "destination", "status");

-- CreateIndex
CREATE INDEX "StudioPublishAttempt_destination_status_createdAt_idx" ON "StudioPublishAttempt"("destination", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudioPublishedArtifact_projectId_destination_status_idx" ON "StudioPublishedArtifact"("projectId", "destination", "status");

-- CreateIndex
CREATE INDEX "StudioPublishedArtifact_outputPacketId_idx" ON "StudioPublishedArtifact"("outputPacketId");

-- CreateIndex
CREATE INDEX "StudioPublishedArtifact_destination_externalId_idx" ON "StudioPublishedArtifact"("destination", "externalId");

-- CreateIndex
CREATE INDEX "StudioWorkflowJob_projectId_status_createdAt_idx" ON "StudioWorkflowJob"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudioWorkflowJob_assetId_status_idx" ON "StudioWorkflowJob"("assetId", "status");

-- CreateIndex
CREATE INDEX "StudioWorkflowJob_productionRoomId_status_idx" ON "StudioWorkflowJob"("productionRoomId", "status");

-- CreateIndex
CREATE INDEX "StudioWorkflowJob_outputPacketId_status_idx" ON "StudioWorkflowJob"("outputPacketId", "status");

-- CreateIndex
CREATE INDEX "StudioWorkflowJob_type_status_idx" ON "StudioWorkflowJob"("type", "status");

-- CreateIndex
CREATE INDEX "StudioVideoSource_provider_idx" ON "StudioVideoSource"("provider");

-- CreateIndex
CREATE INDEX "StudioVideoSource_providerSourceId_idx" ON "StudioVideoSource"("providerSourceId");

-- CreateIndex
CREATE INDEX "StudioManuscript_ownerEmail_updatedAt_idx" ON "StudioManuscript"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioManuscript_ownerEmail_kind_updatedAt_idx" ON "StudioManuscript"("ownerEmail", "kind", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioManuscript_ownerEmail_lastSnapshotAt_idx" ON "StudioManuscript"("ownerEmail", "lastSnapshotAt");

-- CreateIndex
CREATE INDEX "StudioManuscriptSnapshot_ownerEmail_updatedAt_idx" ON "StudioManuscriptSnapshot"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioManuscriptSnapshot_ownerEmail_createdAt_idx" ON "StudioManuscriptSnapshot"("ownerEmail", "createdAt");

-- CreateIndex
CREATE INDEX "StudioManuscriptSnapshot_ownerEmail_manuscriptId_updatedAt_idx" ON "StudioManuscriptSnapshot"("ownerEmail", "manuscriptId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioManuscriptSnapshot_manuscriptId_updatedAt_idx" ON "StudioManuscriptSnapshot"("manuscriptId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioManuscriptCollaborationRoom_roomName_key" ON "StudioManuscriptCollaborationRoom"("roomName");

-- CreateIndex
CREATE INDEX "StudioManuscriptCollaborationRoom_updatedAt_idx" ON "StudioManuscriptCollaborationRoom"("updatedAt");

-- CreateIndex
CREATE INDEX "StudioManuscriptCollaborationRoom_seedSnapshotId_idx" ON "StudioManuscriptCollaborationRoom"("seedSnapshotId");

-- CreateIndex
CREATE INDEX "StudioManuscriptCollaborationRoom_lastCheckpointSnapshotId_idx" ON "StudioManuscriptCollaborationRoom"("lastCheckpointSnapshotId");

-- CreateIndex
CREATE INDEX "StudioContentWorkspaceSnapshot_ownerEmail_updatedAt_idx" ON "StudioContentWorkspaceSnapshot"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioContentWorkspaceSnapshot_ownerEmail_createdAt_idx" ON "StudioContentWorkspaceSnapshot"("ownerEmail", "createdAt");

-- CreateIndex
CREATE INDEX "StudioContentProject_ownerEmail_updatedAt_idx" ON "StudioContentProject"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioContentProject_ownerEmail_kind_updatedAt_idx" ON "StudioContentProject"("ownerEmail", "kind", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioContentProject_ownerEmail_status_updatedAt_idx" ON "StudioContentProject"("ownerEmail", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioContentProject_ownerEmail_localProjectId_key" ON "StudioContentProject"("ownerEmail", "localProjectId");

-- CreateIndex
CREATE INDEX "HgoStagedProjectionArtifact_ownerEmail_updatedAt_idx" ON "HgoStagedProjectionArtifact"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoStagedProjectionArtifact_ownerEmail_archivedAt_updatedAt_idx" ON "HgoStagedProjectionArtifact"("ownerEmail", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoStagedProjectionArtifact_ownerEmail_projectionSlug_updat_idx" ON "HgoStagedProjectionArtifact"("ownerEmail", "projectionSlug", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoStagedProjectionArtifact_ownerEmail_reviewStatus_updated_idx" ON "HgoStagedProjectionArtifact"("ownerEmail", "reviewStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoStagedProjectionArtifact_artifactId_idx" ON "HgoStagedProjectionArtifact"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "HgoStagedProjectionArtifact_ownerEmail_artifactHash_key" ON "HgoStagedProjectionArtifact"("ownerEmail", "artifactHash");

-- CreateIndex
CREATE UNIQUE INDEX "HgoStagedProjectionArtifact_ownerEmail_recordId_key" ON "HgoStagedProjectionArtifact"("ownerEmail", "recordId");

-- CreateIndex
CREATE INDEX "HgoEpisodePublishCandidate_ownerEmail_updatedAt_idx" ON "HgoEpisodePublishCandidate"("ownerEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoEpisodePublishCandidate_ownerEmail_candidateStatus_updat_idx" ON "HgoEpisodePublishCandidate"("ownerEmail", "candidateStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "HgoEpisodePublishCandidate_ownerEmail_proposedRoute_idx" ON "HgoEpisodePublishCandidate"("ownerEmail", "proposedRoute");

-- CreateIndex
CREATE INDEX "HgoEpisodePublishCandidate_sourceStagedArtifactId_idx" ON "HgoEpisodePublishCandidate"("sourceStagedArtifactId");

-- CreateIndex
CREATE INDEX "HgoEpisodePublishCandidate_projectionSlug_idx" ON "HgoEpisodePublishCandidate"("projectionSlug");

-- CreateIndex
CREATE UNIQUE INDEX "HgoEpisodePublishCandidate_ownerEmail_candidateId_key" ON "HgoEpisodePublishCandidate"("ownerEmail", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "HgoEpisodePublishCandidate_ownerEmail_sourceRecordId_key" ON "HgoEpisodePublishCandidate"("ownerEmail", "sourceRecordId");

-- CreateIndex
CREATE INDEX "StudioDocumentBlock_documentId_order_idx" ON "StudioDocumentBlock"("documentId", "order");

-- CreateIndex
CREATE INDEX "StudioDocumentBlock_documentId_archivedAt_order_idx" ON "StudioDocumentBlock"("documentId", "archivedAt", "order");

-- CreateIndex
CREATE INDEX "StudioDocumentBlock_externalId_idx" ON "StudioDocumentBlock"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioDocumentBlock_documentId_stableId_key" ON "StudioDocumentBlock"("documentId", "stableId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioDocumentBlock_documentId_order_key" ON "StudioDocumentBlock"("documentId", "order");

-- CreateIndex
CREATE INDEX "StudioViewDefinition_projectId_idx" ON "StudioViewDefinition"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioViewDefinition_projectId_name_key" ON "StudioViewDefinition"("projectId", "name");

-- CreateIndex
CREATE INDEX "StudioTag_projectId_category_idx" ON "StudioTag"("projectId", "category");

-- CreateIndex
CREATE INDEX "StudioTag_projectId_isActive_idx" ON "StudioTag"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StudioTag_projectId_slug_key" ON "StudioTag"("projectId", "slug");

-- CreateIndex
CREATE INDEX "StudioTaggedSpan_documentId_blockId_idx" ON "StudioTaggedSpan"("documentId", "blockId");

-- CreateIndex
CREATE INDEX "StudioTaggedSpan_tagId_idx" ON "StudioTaggedSpan"("tagId");

-- CreateIndex
CREATE INDEX "StudioTaggedSpan_projectionStatus_createdAt_idx" ON "StudioTaggedSpan"("projectionStatus", "createdAt");

-- CreateIndex
CREATE INDEX "StudioTaggedSpan_documentStableId_blockStableId_idx" ON "StudioTaggedSpan"("documentStableId", "blockStableId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioTaggedSpan_blockId_tagId_startOffset_endOffset_key" ON "StudioTaggedSpan"("blockId", "tagId", "startOffset", "endOffset");

-- CreateIndex
CREATE UNIQUE INDEX "StudioKnowledgeNode_externalId_key" ON "StudioKnowledgeNode"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioKnowledgeNode_taggedSpanId_key" ON "StudioKnowledgeNode"("taggedSpanId");

-- CreateIndex
CREATE INDEX "StudioKnowledgeNode_projectId_projectionStatus_idx" ON "StudioKnowledgeNode"("projectId", "projectionStatus");

-- CreateIndex
CREATE INDEX "StudioKnowledgeNode_tagId_idx" ON "StudioKnowledgeNode"("tagId");

-- CreateIndex
CREATE INDEX "StudioKnowledgeNode_documentId_blockId_idx" ON "StudioKnowledgeNode"("documentId", "blockId");

-- CreateIndex
CREATE INDEX "StudioKnowledgeNode_reviewStatus_createdAt_idx" ON "StudioKnowledgeNode"("reviewStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_userId_isPublic_idx" ON "Collection"("userId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_userId_slug_key" ON "Collection"("userId", "slug");

-- CreateIndex
CREATE INDEX "Snippet_userId_createdAt_idx" ON "Snippet"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Snippet_collectionId_idx" ON "Snippet"("collectionId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "Bookmark"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_collectionId_idx" ON "Bookmark"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_url_key" ON "Bookmark"("userId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "QuipslyNode_slug_key" ON "QuipslyNode"("slug");

-- CreateIndex
CREATE INDEX "QuipslyNode_nodeType_status_idx" ON "QuipslyNode"("nodeType", "status");

-- CreateIndex
CREATE INDEX "QuipslyNode_status_updatedAt_idx" ON "QuipslyNode"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "QuipLoreEdge_targetNodeId_edgeType_idx" ON "QuipLoreEdge"("targetNodeId", "edgeType");

-- CreateIndex
CREATE UNIQUE INDEX "QuipLoreEdge_sourceNodeId_targetNodeId_edgeType_key" ON "QuipLoreEdge"("sourceNodeId", "targetNodeId", "edgeType");

-- CreateIndex
CREATE INDEX "QuipStreamSession_userId_startedAt_idx" ON "QuipStreamSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "QuipStreamEvent_sessionId_occurredAt_idx" ON "QuipStreamEvent"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "QuipStreamEvent_quoteId_type_idx" ON "QuipStreamEvent"("quoteId", "type");

-- CreateIndex
CREATE INDEX "RetentionTelemetry_videoId_idx" ON "RetentionTelemetry"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "PodcastEpisode_slug_key" ON "PodcastEpisode"("slug");

-- CreateIndex
CREATE INDEX "PodcastDownloadLog_episodeId_idx" ON "PodcastDownloadLog"("episodeId");

-- CreateIndex
CREATE INDEX "PodcastDownloadLog_timestamp_idx" ON "PodcastDownloadLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_handle_key" ON "SocialAccount"("platform", "handle");

-- CreateIndex
CREATE INDEX "SocialPost_accountId_idx" ON "SocialPost"("accountId");

-- CreateIndex
CREATE INDEX "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "StudioMediaAsset_createdAt_idx" ON "StudioMediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "StudioMediaAsset_mediaBinId_idx" ON "StudioMediaAsset"("mediaBinId");

-- CreateIndex
CREATE INDEX "StudioMediaAsset_isGlobal_idx" ON "StudioMediaAsset"("isGlobal");

-- CreateIndex
CREATE INDEX "MediaBin_projectId_idx" ON "MediaBin"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMediaTag_slug_key" ON "StudioMediaTag"("slug");

-- CreateIndex
CREATE INDEX "StudioMediaTag_slug_idx" ON "StudioMediaTag"("slug");

-- CreateIndex
CREATE INDEX "MediaClip_mediaAssetId_idx" ON "MediaClip"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentNode_hostName_key" ON "AgentNode"("hostName");

-- CreateIndex
CREATE INDEX "QuipslyAgent_designation_status_idx" ON "QuipslyAgent"("designation", "status");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "MarketingFunnel_userId_status_idx" ON "MarketingFunnel"("userId", "status");

-- CreateIndex
CREATE INDEX "FunnelStep_funnelId_stepOrder_idx" ON "FunnelStep"("funnelId", "stepOrder");

-- CreateIndex
CREATE INDEX "MarketingPersona_userId_status_idx" ON "MarketingPersona"("userId", "status");

-- CreateIndex
CREATE INDEX "Scene_projectId_sortOrder_idx" ON "Scene"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Scene_projectId_stripOrder_idx" ON "Scene"("projectId", "stripOrder");

-- CreateIndex
CREATE INDEX "ShootDay_projectId_sortOrder_idx" ON "ShootDay"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "StoryboardShot_sceneId_sortOrder_idx" ON "StoryboardShot"("sceneId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "LandingPage_userId_status_idx" ON "LandingPage"("userId", "status");

-- CreateIndex
CREATE INDEX "LandingPage_organizationId_idx" ON "LandingPage"("organizationId");

-- CreateIndex
CREATE INDEX "MarketingLead_userId_email_idx" ON "MarketingLead"("userId", "email");

-- CreateIndex
CREATE INDEX "MarketingLead_landingPageId_idx" ON "MarketingLead"("landingPageId");

-- CreateIndex
CREATE INDEX "MarketingLead_organizationId_idx" ON "MarketingLead"("organizationId");

-- CreateIndex
CREATE INDEX "EmailSequence_userId_status_idx" ON "EmailSequence"("userId", "status");

-- CreateIndex
CREATE INDEX "EmailSequence_organizationId_idx" ON "EmailSequence"("organizationId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_userId_status_idx" ON "MarketingCampaign"("userId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_organizationId_idx" ON "MarketingCampaign"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "FeedbackTicket_userId_idx" ON "FeedbackTicket"("userId");

-- CreateIndex
CREATE INDEX "FeedbackTicket_organizationId_idx" ON "FeedbackTicket"("organizationId");

-- CreateIndex
CREATE INDEX "FeedbackTicket_status_idx" ON "FeedbackTicket"("status");

-- CreateIndex
CREATE INDEX "UserEvent_userId_idx" ON "UserEvent"("userId");

-- CreateIndex
CREATE INDEX "UserEvent_organizationId_idx" ON "UserEvent"("organizationId");

-- CreateIndex
CREATE INDEX "UserEvent_eventName_idx" ON "UserEvent"("eventName");

-- CreateIndex
CREATE INDEX "UserEvent_createdAt_idx" ON "UserEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_stripeProductId_key" ON "SubscriptionPlan"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "RomanceUniverse_name_key" ON "RomanceUniverse"("name");

-- CreateIndex
CREATE INDEX "RomanceSeries_universeId_idx" ON "RomanceSeries"("universeId");

-- CreateIndex
CREATE INDEX "RomanceBook_seriesId_idx" ON "RomanceBook"("seriesId");

-- CreateIndex
CREATE INDEX "RomanceFaction_universeId_idx" ON "RomanceFaction"("universeId");

-- CreateIndex
CREATE INDEX "RomanceCharacter_universeId_idx" ON "RomanceCharacter"("universeId");

-- CreateIndex
CREATE INDEX "RomanceCharacter_factionId_idx" ON "RomanceCharacter"("factionId");

-- CreateIndex
CREATE INDEX "RomanceScene_bookId_idx" ON "RomanceScene"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSubscriber_email_key" ON "WaitlistSubscriber"("email");

-- CreateIndex
CREATE INDEX "WaitlistSubscriber_email_idx" ON "WaitlistSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_slug_key" ON "KnowledgeCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_categoryId_idx" ON "KnowledgeArticle"("categoryId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_slug_idx" ON "KnowledgeArticle"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoryEntity_externalId_key" ON "StoryEntity"("externalId");

-- CreateIndex
CREATE INDEX "StoryEntity_projectId_type_idx" ON "StoryEntity"("projectId", "type");

-- CreateIndex
CREATE INDEX "StoryEntityMention_entityId_idx" ON "StoryEntityMention"("entityId");

-- CreateIndex
CREATE INDEX "StoryEntityMention_documentId_blockId_idx" ON "StoryEntityMention"("documentId", "blockId");

-- CreateIndex
CREATE INDEX "StoryBibleAction_projectId_status_idx" ON "StoryBibleAction"("projectId", "status");

-- CreateIndex
CREATE INDEX "StoryBibleLedger_actionId_createdAt_idx" ON "StoryBibleLedger"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "EntitlementLedger_status_createdAt_idx" ON "EntitlementLedger"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RetrievalEmbedding_projectId_idx" ON "RetrievalEmbedding"("projectId");

-- CreateIndex
CREATE INDEX "StudioStoryboard_projectId_idx" ON "StudioStoryboard"("projectId");

-- CreateIndex
CREATE INDEX "StudioStoryboardFrame_storyboardId_sortOrder_idx" ON "StudioStoryboardFrame"("storyboardId", "sortOrder");

-- CreateIndex
CREATE INDEX "StudioNestChatThread_projectId_updatedAt_idx" ON "StudioNestChatThread"("projectId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioNestChatThread_projectId_key_key" ON "StudioNestChatThread"("projectId", "key");

-- CreateIndex
CREATE INDEX "StudioNestChatMessage_projectId_createdAt_idx" ON "StudioNestChatMessage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioNestChatMessage_threadId_createdAt_idx" ON "StudioNestChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioAssistantSession_projectId_status_idx" ON "StudioAssistantSession"("projectId", "status");

-- CreateIndex
CREATE INDEX "StudioAssistantMessage_sessionId_createdAt_idx" ON "StudioAssistantMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioAssistantLedger_actionId_idx" ON "StudioAssistantLedger"("actionId");

-- CreateIndex
CREATE INDEX "StudioAssistantAction_sessionId_createdAt_idx" ON "StudioAssistantAction"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrollInteraction_experienceId_panelId_idx" ON "ScrollInteraction"("experienceId", "panelId");

-- CreateIndex
CREATE INDEX "ScrollInteraction_interactionType_idx" ON "ScrollInteraction"("interactionType");

-- CreateIndex
CREATE INDEX "StudioScrollExperience_projectId_idx" ON "StudioScrollExperience"("projectId");

-- CreateIndex
CREATE INDEX "StudioScrollExperience_storyboardId_idx" ON "StudioScrollExperience"("storyboardId");

-- CreateIndex
CREATE INDEX "StudioScrollSection_experienceId_sortOrder_idx" ON "StudioScrollSection"("experienceId", "sortOrder");

-- CreateIndex
CREATE INDEX "StudioScrollPanelRef_sectionId_sortOrder_idx" ON "StudioScrollPanelRef"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "StudioScrollPanelRef_frameId_idx" ON "StudioScrollPanelRef"("frameId");

-- CreateIndex
CREATE INDEX "QuipLoreAuthor_projectId_idx" ON "QuipLoreAuthor"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreWork_projectId_idx" ON "QuipLoreWork"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreSource_projectId_idx" ON "QuipLoreSource"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreQuote_projectId_idx" ON "QuipLoreQuote"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreCitation_projectId_idx" ON "QuipLoreCitation"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreCitation_quoteId_idx" ON "QuipLoreCitation"("quoteId");

-- CreateIndex
CREATE INDEX "QuipLoreUserAnnotation_projectId_idx" ON "QuipLoreUserAnnotation"("projectId");

-- CreateIndex
CREATE INDEX "QuipLoreUserAnnotation_quoteId_idx" ON "QuipLoreUserAnnotation"("quoteId");

-- CreateIndex
CREATE INDEX "QuipLoreTheme_projectId_idx" ON "QuipLoreTheme"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "QuipLoreTag_projectId_name_key" ON "QuipLoreTag"("projectId", "name");

-- CreateIndex
CREATE INDEX "QuipLoreCollection_projectId_idx" ON "QuipLoreCollection"("projectId");

-- CreateIndex
CREATE INDEX "QuipslyNote_userId_idx" ON "QuipslyNote"("userId");

-- CreateIndex
CREATE INDEX "QuipslyNote_updatedAt_idx" ON "QuipslyNote"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "_StudioMediaAssetToStudioProject_B_index" ON "_StudioMediaAssetToStudioProject"("B");

-- CreateIndex
CREATE INDEX "_StudioMediaAssetToStudioMediaTag_B_index" ON "_StudioMediaAssetToStudioMediaTag"("B");

-- CreateIndex
CREATE INDEX "_MediaClipToStudioMediaTag_B_index" ON "_MediaClipToStudioMediaTag"("B");

-- CreateIndex
CREATE INDEX "_MediaClipToStudioTag_B_index" ON "_MediaClipToStudioTag"("B");

-- CreateIndex
CREATE INDEX "_QuoteTags_B_index" ON "_QuoteTags"("B");

-- CreateIndex
CREATE INDEX "_QuoteCollections_B_index" ON "_QuoteCollections"("B");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNativeAuthCode" ADD CONSTRAINT "StudioNativeAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNativeDeviceSession" ADD CONSTRAINT "StudioNativeDeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingFeatureGrant" ADD CONSTRAINT "CoachingFeatureGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingFeatureGrant" ADD CONSTRAINT "CoachingFeatureGrant_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "CoachingFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingFeatureGrant" ADD CONSTRAINT "CoachingFeatureGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCommitment" ADD CONSTRAINT "WeeklyCommitment_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCommitment" ADD CONSTRAINT "WeeklyCommitment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingRequest" ADD CONSTRAINT "CoachingRequest_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingRequest" ADD CONSTRAINT "CoachingRequest_assignedCoachUserId_fkey" FOREIGN KEY ("assignedCoachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingRequest" ADD CONSTRAINT "CoachingRequest_convertedAppointmentId_fkey" FOREIGN KEY ("convertedAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySupportRequest" ADD CONSTRAINT "CompanySupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubProviderEvent" ADD CONSTRAINT "WorldHubProviderEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WorldHubProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubProviderSyncJob" ADD CONSTRAINT "WorldHubProviderSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WorldHubProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubOffer" ADD CONSTRAINT "WorldHubOffer_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "WorldHubProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubOrder" ADD CONSTRAINT "WorldHubOrder_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "WorldHubProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubFulfillmentJob" ADD CONSTRAINT "WorldHubFulfillmentJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorldHubOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldHubFulfillmentJob" ADD CONSTRAINT "WorldHubFulfillmentJob_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "WorldHubProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryDraft" ADD CONSTRAINT "StoryDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryDraft" ADD CONSTRAINT "StoryDraft_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryDraft" ADD CONSTRAINT "StoryDraft_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProject" ADD CONSTRAINT "StudioProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "StudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProject" ADD CONSTRAINT "StudioProject_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "StudioManuscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProjectAccessGrant" ADD CONSTRAINT "StudioProjectAccessGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProjectAccessGrant" ADD CONSTRAINT "StudioProjectAccessGrant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioEpisodeProduction" ADD CONSTRAINT "StudioEpisodeProduction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioEpisodeProduction" ADD CONSTRAINT "StudioEpisodeProduction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNestInvite" ADD CONSTRAINT "StudioNestInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssetAttachment" ADD CONSTRAINT "StudioAssetAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssetAttachment" ADD CONSTRAINT "StudioAssetAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssetVariant" ADD CONSTRAINT "StudioAssetVariant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssetProcessingJob" ADD CONSTRAINT "StudioAssetProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssetProcessingJob" ADD CONSTRAINT "StudioAssetProcessingJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSourceUnit" ADD CONSTRAINT "StudioSourceUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSourceUnit" ADD CONSTRAINT "StudioSourceUnit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSourceUnit" ADD CONSTRAINT "StudioSourceUnit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocumentOperation" ADD CONSTRAINT "StudioDocumentOperation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocumentOperation" ADD CONSTRAINT "StudioDocumentOperation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProductionRoom" ADD CONSTRAINT "StudioProductionRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioProductionRoom" ADD CONSTRAINT "StudioProductionRoom_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTimelineVersion" ADD CONSTRAINT "StudioTimelineVersion_productionRoomId_fkey" FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioOutputPacket" ADD CONSTRAINT "StudioOutputPacket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioOutputPacket" ADD CONSTRAINT "StudioOutputPacket_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioOutputPacket" ADD CONSTRAINT "StudioOutputPacket_productionRoomId_fkey" FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioPublishAttempt" ADD CONSTRAINT "StudioPublishAttempt_outputPacketId_fkey" FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioPublishedArtifact" ADD CONSTRAINT "StudioPublishedArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioPublishedArtifact" ADD CONSTRAINT "StudioPublishedArtifact_outputPacketId_fkey" FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioWorkflowJob" ADD CONSTRAINT "StudioWorkflowJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioWorkflowJob" ADD CONSTRAINT "StudioWorkflowJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioWorkflowJob" ADD CONSTRAINT "StudioWorkflowJob_productionRoomId_fkey" FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioWorkflowJob" ADD CONSTRAINT "StudioWorkflowJob_outputPacketId_fkey" FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioManuscriptSnapshot" ADD CONSTRAINT "StudioManuscriptSnapshot_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "StudioManuscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HgoEpisodePublishCandidate" ADD CONSTRAINT "HgoEpisodePublishCandidate_sourceStagedArtifactId_fkey" FOREIGN KEY ("sourceStagedArtifactId") REFERENCES "HgoStagedProjectionArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocumentBlock" ADD CONSTRAINT "StudioDocumentBlock_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioViewDefinition" ADD CONSTRAINT "StudioViewDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTag" ADD CONSTRAINT "StudioTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTaggedSpan" ADD CONSTRAINT "StudioTaggedSpan_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTaggedSpan" ADD CONSTRAINT "StudioTaggedSpan_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "StudioDocumentBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTaggedSpan" ADD CONSTRAINT "StudioTaggedSpan_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioKnowledgeNode" ADD CONSTRAINT "StudioKnowledgeNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioKnowledgeNode" ADD CONSTRAINT "StudioKnowledgeNode_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioKnowledgeNode" ADD CONSTRAINT "StudioKnowledgeNode_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "StudioDocumentBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioKnowledgeNode" ADD CONSTRAINT "StudioKnowledgeNode_taggedSpanId_fkey" FOREIGN KEY ("taggedSpanId") REFERENCES "StudioTaggedSpan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioKnowledgeNode" ADD CONSTRAINT "StudioKnowledgeNode_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreEdge" ADD CONSTRAINT "QuipLoreEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "QuipslyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreEdge" ADD CONSTRAINT "QuipLoreEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "QuipslyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipStreamSession" ADD CONSTRAINT "QuipStreamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipStreamEvent" ADD CONSTRAINT "QuipStreamEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuipStreamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodcastDownloadLog" ADD CONSTRAINT "PodcastDownloadLog_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "PodcastEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMediaAsset" ADD CONSTRAINT "StudioMediaAsset_mediaBinId_fkey" FOREIGN KEY ("mediaBinId") REFERENCES "MediaBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBin" ADD CONSTRAINT "MediaBin_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaClip" ADD CONSTRAINT "MediaClip_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingFunnel" ADD CONSTRAINT "MarketingFunnel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelStep" ADD CONSTRAINT "FunnelStep_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "MarketingFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPersona" ADD CONSTRAINT "MarketingPersona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_shootDayId_fkey" FOREIGN KEY ("shootDayId") REFERENCES "ShootDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShootDay" ADD CONSTRAINT "ShootDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryboardShot" ADD CONSTRAINT "StoryboardShot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicket" ADD CONSTRAINT "FeedbackTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicket" ADD CONSTRAINT "FeedbackTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceSeries" ADD CONSTRAINT "RomanceSeries_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "RomanceUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceBook" ADD CONSTRAINT "RomanceBook_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "RomanceSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceFaction" ADD CONSTRAINT "RomanceFaction_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "RomanceUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceCharacter" ADD CONSTRAINT "RomanceCharacter_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "RomanceUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceCharacter" ADD CONSTRAINT "RomanceCharacter_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "RomanceFaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomanceScene" ADD CONSTRAINT "RomanceScene_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "RomanceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntity" ADD CONSTRAINT "StoryEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntityMention" ADD CONSTRAINT "StoryEntityMention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "StoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBibleAction" ADD CONSTRAINT "StoryBibleAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBibleLedger" ADD CONSTRAINT "StoryBibleLedger_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "StoryBibleAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementLedger" ADD CONSTRAINT "EntitlementLedger_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WorldHubProviderEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementLedger" ADD CONSTRAINT "EntitlementLedger_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioStoryboard" ADD CONSTRAINT "StudioStoryboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioStoryboardFrame" ADD CONSTRAINT "StudioStoryboardFrame_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "StudioStoryboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNestChatThread" ADD CONSTRAINT "StudioNestChatThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNestChatMessage" ADD CONSTRAINT "StudioNestChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioNestChatMessage" ADD CONSTRAINT "StudioNestChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "StudioNestChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssistantMessage" ADD CONSTRAINT "StudioAssistantMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudioAssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssistantLedger" ADD CONSTRAINT "StudioAssistantLedger_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "StudioAssistantAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioAssistantAction" ADD CONSTRAINT "StudioAssistantAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudioAssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScrollExperience" ADD CONSTRAINT "StudioScrollExperience_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScrollExperience" ADD CONSTRAINT "StudioScrollExperience_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "StudioStoryboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScrollSection" ADD CONSTRAINT "StudioScrollSection_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "StudioScrollExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScrollPanelRef" ADD CONSTRAINT "StudioScrollPanelRef_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "StudioScrollSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScrollPanelRef" ADD CONSTRAINT "StudioScrollPanelRef_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "StudioStoryboardFrame"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreAuthor" ADD CONSTRAINT "QuipLoreAuthor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreWork" ADD CONSTRAINT "QuipLoreWork_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreWork" ADD CONSTRAINT "QuipLoreWork_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "QuipLoreAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreSource" ADD CONSTRAINT "QuipLoreSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreSource" ADD CONSTRAINT "QuipLoreSource_workId_fkey" FOREIGN KEY ("workId") REFERENCES "QuipLoreWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreQuote" ADD CONSTRAINT "QuipLoreQuote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreQuote" ADD CONSTRAINT "QuipLoreQuote_workId_fkey" FOREIGN KEY ("workId") REFERENCES "QuipLoreWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreQuote" ADD CONSTRAINT "QuipLoreQuote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "QuipLoreAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreQuote" ADD CONSTRAINT "QuipLoreQuote_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuipLoreSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreCitation" ADD CONSTRAINT "QuipLoreCitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreCitation" ADD CONSTRAINT "QuipLoreCitation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuipLoreQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreCitation" ADD CONSTRAINT "QuipLoreCitation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuipLoreSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreUserAnnotation" ADD CONSTRAINT "QuipLoreUserAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreUserAnnotation" ADD CONSTRAINT "QuipLoreUserAnnotation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuipLoreQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreTheme" ADD CONSTRAINT "QuipLoreTheme_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreTag" ADD CONSTRAINT "QuipLoreTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreTag" ADD CONSTRAINT "QuipLoreTag_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "QuipLoreTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipLoreCollection" ADD CONSTRAINT "QuipLoreCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuipslyNote" ADD CONSTRAINT "QuipslyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudioMediaAssetToStudioProject" ADD CONSTRAINT "_StudioMediaAssetToStudioProject_A_fkey" FOREIGN KEY ("A") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudioMediaAssetToStudioProject" ADD CONSTRAINT "_StudioMediaAssetToStudioProject_B_fkey" FOREIGN KEY ("B") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudioMediaAssetToStudioMediaTag" ADD CONSTRAINT "_StudioMediaAssetToStudioMediaTag_A_fkey" FOREIGN KEY ("A") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StudioMediaAssetToStudioMediaTag" ADD CONSTRAINT "_StudioMediaAssetToStudioMediaTag_B_fkey" FOREIGN KEY ("B") REFERENCES "StudioMediaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaClipToStudioMediaTag" ADD CONSTRAINT "_MediaClipToStudioMediaTag_A_fkey" FOREIGN KEY ("A") REFERENCES "MediaClip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaClipToStudioMediaTag" ADD CONSTRAINT "_MediaClipToStudioMediaTag_B_fkey" FOREIGN KEY ("B") REFERENCES "StudioMediaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaClipToStudioTag" ADD CONSTRAINT "_MediaClipToStudioTag_A_fkey" FOREIGN KEY ("A") REFERENCES "MediaClip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MediaClipToStudioTag" ADD CONSTRAINT "_MediaClipToStudioTag_B_fkey" FOREIGN KEY ("B") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuoteTags" ADD CONSTRAINT "_QuoteTags_A_fkey" FOREIGN KEY ("A") REFERENCES "QuipLoreQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuoteTags" ADD CONSTRAINT "_QuoteTags_B_fkey" FOREIGN KEY ("B") REFERENCES "QuipLoreTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuoteCollections" ADD CONSTRAINT "_QuoteCollections_A_fkey" FOREIGN KEY ("A") REFERENCES "QuipLoreCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuoteCollections" ADD CONSTRAINT "_QuoteCollections_B_fkey" FOREIGN KEY ("B") REFERENCES "QuipLoreQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
