import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { configuredMediaBucketName, gcsUri, mediaVaultObjectPath, publicObjectUrl } from './MediaVaultConfig';
import type { CalmLocalEngineError } from './LocalEngineErrors';
import { calmError, classifyNestError, classifyNetworkFetchError, classifyStorageError } from './LocalEngineErrors';

type RegistrationInput = Record<string, any>;

export type EpisodeMediaRegistrationResult = {
  ok: boolean;
  source: 'gcs-and-nest' | 'gcs-only' | 'nest-only' | 'held';
  assetId?: string;
  spineAudioSet?: boolean;
  spineAudioAssetId?: string;
  bucketName?: string;
  rawGcsUri?: string;
  proxyGcsUri?: string;
  thumbnailGcsUri?: string;
  rawUrl?: string;
  proxyUrl?: string;
  thumbnailUrl?: string;
  registeredAt?: string;
  warnings: string[];
  error?: string;
  errorCode?: string;
  errorDetail?: string;
  recoverable?: boolean;
};

function applyCalmError(registration: EpisodeMediaRegistrationResult, calm: CalmLocalEngineError) {
  registration.ok = false;
  registration.error = calm.error;
  registration.errorCode = calm.errorCode;
  registration.errorDetail = calm.errorDetail;
  registration.recoverable = calm.recoverable;
  return registration;
}

function safeSegment(value: string, fallback = 'media') {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function createStorageClient() {
  const { Storage } = require('@google-cloud/storage');

  try {
    return new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'high-ground-odyssey' });
  } catch {
    const { OAuth2Client } = require('google-auth-library');
    const token = execSync('gcloud auth print-access-token').toString().trim();
    const authClient = new OAuth2Client();
    authClient.setCredentials({ access_token: token });
    return new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'high-ground-odyssey', authClient });
  }
}

async function uploadIfPresent(bucket: any, bucketName: string, sourcePath: string | undefined, objectName: string | undefined, label: string, required = false) {
  if (!sourcePath || !objectName) return undefined;
  if (!fs.existsSync(sourcePath)) {
    if (!required) return undefined;
    throw Object.assign(new Error(`${label} file was not found.`), {
      calm: calmError('missing-file', `${label} file was not found. Choose the file again or reconnect the drive it lives on.`, sourcePath),
    });
  }

  try {
    await bucket.upload(sourcePath, {
      destination: objectName,
      resumable: true,
      metadata: {
        cacheControl: 'private, max-age=3600',
      },
    });
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      calm: classifyStorageError(error),
    });
  }

  return {
    gcsUri: gcsUri(bucketName, objectName),
    url: publicObjectUrl(bucketName, objectName),
  };
}

function routeToImportEndpoint(nestBaseURL: string) {
  const fallback = 'https://nest.quipsly.com';
  const input = nestBaseURL && nestBaseURL.trim() ? nestBaseURL.trim() : fallback;
  const url = new URL(input);
  url.pathname = '/api/episode-production/import-media';
  url.search = '';
  return url;
}

async function registerWithNest(input: RegistrationInput, registration: EpisodeMediaRegistrationResult) {
  const sourceUrl = registration.proxyUrl || registration.rawUrl || registration.rawGcsUri;
  if (!sourceUrl) {
    registration.warnings.push('No uploaded source URL was available for Nest registration.');
    return applyCalmError(registration, calmError('missing-file', 'No uploaded media URL was available for Nest registration. The file was held for review.', 'sourceUrl missing'));
  }

  try {
    const localMetadata = buildLocalMetadata(input, registration);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const nestSessionToken = typeof input.nestSessionToken === 'string' ? input.nestSessionToken.trim() : '';
    if (nestSessionToken) headers.Authorization = `Bearer ${nestSessionToken}`;

    const response = await fetch(routeToImportEndpoint(String(input.nestBaseURL ?? '')), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectSlug: input.projectSlug,
        episodeSlug: input.episodeSlug,
        sourceUrl,
        originalName: input.displayName || path.basename(String(input.path ?? 'media')),
        importRole: input.role,
        kind: input.proxy?.kind || (input.probe?.hasVideo ? 'video' : input.probe?.hasAudio ? 'audio' : 'unknown'),
        localMetadata,
        recordingSyncMetadata: localMetadata.recordingSyncMetadata,
      }),
    });

    const responseText = await response.text();
    const data = responseText ? (() => {
      try {
        return JSON.parse(responseText);
      } catch {
        return {};
      }
    })() : {};
    if (!response.ok || data?.ok === false) {
      const calm = classifyNestError(response.status, data?.error || responseText || response.statusText);
      registration.warnings.push(`Nest registration returned ${response.status}: ${data?.error || response.statusText}`);
      return applyCalmError(registration, calm);
    }

    const assetId = data?.asset?.id || data?.assetId || data?.sourceId;
    if (!assetId) {
      registration.warnings.push('Nest registration succeeded but did not return an asset id.');
      return applyCalmError(registration, calmError('nest-unavailable', 'Nest accepted the request but did not return an asset id. The file was held for review instead of pretending it is attached.', JSON.stringify(data)));
    }

    registration.assetId = assetId;
    registration.registeredAt = new Date().toISOString();
    await maybeSetSpineAudio(input, registration, sourceUrl);
    return registration;
  } catch (error: any) {
    const calm = classifyNetworkFetchError(error);
    registration.warnings.push(`Nest registration skipped: ${error?.message || error}`);
    return applyCalmError(registration, calm);
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function optionalString(value: unknown) {
  const string = typeof value === 'string' ? value.trim() : '';
  return string || undefined;
}

function optionalNumber(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function deriveEndFromStart(start: string | undefined, durationSeconds: number | undefined) {
  if (!start || !durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  const timestamp = Date.parse(start);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp + durationSeconds * 1000).toISOString();
}

function buildRecordingSyncMetadata(input: RegistrationInput) {
  const raw = {
    ...asRecord(input.recordingSyncMetadata),
    ...asRecord(input.localMetadata?.recordingSyncMetadata),
    ...asRecord(input.localMetadata?.recordingSync),
  };
  const durationSeconds = optionalNumber(raw.durationSeconds) ?? optionalNumber(input.proxy?.durationSeconds) ?? optionalNumber(input.probe?.durationSeconds);
  const recordedStartAt = optionalString(raw.recordedStartAt);
  const recordedEndAt = optionalString(raw.recordedEndAt) ?? deriveEndFromStart(recordedStartAt, durationSeconds);
  const metadata: Record<string, unknown> = {
    importJobId: optionalString(input.id),
    recordedStartAt,
    recordedEndAt,
    deviceLabel: optionalString(raw.deviceLabel),
    sourceDeviceClockNotes: optionalString(raw.sourceDeviceClockNotes),
    segmentOrder: optionalNumber(raw.segmentOrder),
    takeOrder: optionalNumber(raw.takeOrder),
    sourceFileCreatedAt: optionalString(raw.sourceFileCreatedAt),
    sourceFileModifiedAt: optionalString(raw.sourceFileModifiedAt),
    durationSeconds,
    fingerprint: optionalString(input.proxy?.fingerprint),
    homeNestSlug: optionalString(input.homeNestSlug),
    queuedAt: optionalString(input.queuedAt),
  };

  Object.keys(metadata).forEach((key) => metadata[key] === undefined && delete metadata[key]);
  return Object.keys(metadata).length ? metadata : undefined;
}

function buildLocalMetadata(input: RegistrationInput, registration: EpisodeMediaRegistrationResult) {
  const recordingSyncMetadata = buildRecordingSyncMetadata(input);
  const metadata: Record<string, unknown> = {
    rawPath: input.proxy?.rawPath || input.path,
    proxyPath: input.proxy?.proxyPath,
    thumbnailPath: input.proxy?.thumbnailPath,
    durationSeconds: input.proxy?.durationSeconds || input.probe?.durationSeconds,
    fingerprint: input.proxy?.fingerprint,
    homeNestSlug: input.homeNestSlug,
    rawGcsUri: registration.rawGcsUri,
    proxyGcsUri: registration.proxyGcsUri,
    thumbnailGcsUri: registration.thumbnailGcsUri,
    recordingSyncMetadata,
  };

  Object.keys(metadata).forEach((key) => metadata[key] === undefined && delete metadata[key]);
  return metadata;
}

async function maybeSetSpineAudio(input: RegistrationInput, registration: EpisodeMediaRegistrationResult, sourceUrl: string) {
  if (input.role !== 'spine-audio') return;

  const hasAudio = Boolean(input.probe?.hasAudio) || input.proxy?.kind === 'audio';
  if (!hasAudio) {
    registration.warnings.push('This file was marked as spine audio, but the probe did not confirm an audio stream. Spine was not changed.');
    return;
  }

  if (!registration.assetId) {
    registration.warnings.push('Nest registration did not return an asset id, so spine audio could not be set yet.');
    return;
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const nestSessionToken = typeof input.nestSessionToken === 'string' ? input.nestSessionToken.trim() : '';
    if (nestSessionToken) headers.Authorization = `Bearer ${nestSessionToken}`;

    const response = await fetch(routeToImportEndpoint(String(input.nestBaseURL ?? '')), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        action: 'set-spine-audio',
        projectSlug: input.projectSlug,
        episodeSlug: input.episodeSlug,
        spineAudioAssetId: registration.assetId,
        spineAudioSource: sourceUrl,
        spineAudioLabel: input.displayName || registration.assetId,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      registration.warnings.push(`Spine audio update returned ${response.status}: ${data?.error || response.statusText}`);
      return;
    }

    registration.spineAudioSet = true;
    registration.spineAudioAssetId = registration.assetId;
  } catch (error: any) {
    registration.warnings.push(`Spine audio update skipped: ${error?.message || error}`);
  }
}

export async function uploadAndRegisterEpisodeMedia(input: RegistrationInput): Promise<EpisodeMediaRegistrationResult> {
  const warnings: string[] = [];
  const bucketName = configuredMediaBucketName();
  const projectSlug = safeSegment(input.projectSlug, 'project');
  const episodeSlug = safeSegment(input.episodeSlug, 'episode');
  const assetId = safeSegment(input.id || input.proxy?.fingerprint || `${Date.now()}`, 'asset');
  const rawPath = String(input.proxy?.rawPath || input.path || '');
  const rawName = safeSegment(path.basename(rawPath), 'raw-media');
  const proxyPath = input.proxy?.proxyPath ? String(input.proxy.proxyPath) : undefined;
  const thumbnailPath = input.proxy?.thumbnailPath ? String(input.proxy.thumbnailPath) : undefined;

  const registration: EpisodeMediaRegistrationResult = {
    ok: false,
    source: 'held',
    bucketName,
    warnings,
  };

  if (!rawPath || !fs.existsSync(rawPath)) {
    return {
      ...registration,
      error: 'Raw source file was not found. Reconnect the drive or choose the file again.',
    };
  }

  try {
    const storage = createStorageClient();
    const bucket = storage.bucket(bucketName);
    const rawObjectName = mediaVaultObjectPath('raw', projectSlug, episodeSlug, assetId, rawName);
    const proxyObjectName = proxyPath ? mediaVaultObjectPath('proxy', projectSlug, episodeSlug, assetId, safeSegment(path.basename(proxyPath), 'proxy.mp4')) : undefined;
    const thumbObjectName = thumbnailPath ? mediaVaultObjectPath('thumb', projectSlug, episodeSlug, assetId, safeSegment(path.basename(thumbnailPath), 'thumb.jpg')) : undefined;

    const rawUpload = await uploadIfPresent(bucket, bucketName, rawPath, rawObjectName, 'Raw source', true);
    const proxyUpload = await uploadIfPresent(bucket, bucketName, proxyPath, proxyObjectName, 'Proxy', false);
    const thumbUpload = await uploadIfPresent(bucket, bucketName, thumbnailPath, thumbObjectName, 'Thumbnail', false);

    registration.rawGcsUri = rawUpload?.gcsUri;
    registration.rawUrl = rawUpload?.url;
    registration.proxyGcsUri = proxyUpload?.gcsUri;
    registration.proxyUrl = proxyUpload?.url;
    registration.thumbnailGcsUri = thumbUpload?.gcsUri;
    registration.thumbnailUrl = thumbUpload?.url;

    if (!rawUpload) {
      warnings.push('Raw file upload did not produce a GCS object.');
    }

    await registerWithNest(input, registration);

    if (registration.errorCode) {
      registration.ok = false;
      registration.source = registration.rawGcsUri ? 'gcs-only' : 'held';
      registration.registeredAt = registration.registeredAt || new Date().toISOString();
      return registration;
    }

    registration.ok = Boolean(registration.rawGcsUri && registration.assetId);
    registration.source = registration.assetId ? 'gcs-and-nest' : 'held';
    registration.registeredAt = registration.registeredAt || new Date().toISOString();
    return registration;
  } catch (error: any) {
    const calm = error?.calm ?? classifyStorageError(error);
    return {
      ...registration,
      ...calm,
    };
  }
}
