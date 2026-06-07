export type LocalEngineErrorCode =
  | 'missing-file'
  | 'selected-folder'
  | 'unsupported-codec'
  | 'ffmpeg-missing'
  | 'ffprobe-missing'
  | 'media-probe-failed'
  | 'proxy-generation-failed'
  | 'upload-auth-missing'
  | 'bucket-permission-denied'
  | 'bucket-not-found'
  | 'network-offline'
  | 'nest-auth-required'
  | 'nest-permission-denied'
  | 'nest-unavailable'
  | 'unknown-local-engine-error';

export type CalmLocalEngineError = {
  errorCode: LocalEngineErrorCode;
  error: string;
  errorDetail?: string;
  recoverable: boolean;
};

export function calmError(errorCode: LocalEngineErrorCode, error: string, errorDetail?: string, recoverable = true): CalmLocalEngineError {
  return {
    errorCode,
    error,
    ...(errorDetail ? { errorDetail: String(errorDetail).slice(0, 1200) } : {}),
    recoverable,
  };
}

export function errorText(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const value = error as Record<string, any>;
  return String(value.stderr || value.stdout || value.message || value.details || value.code || error);
}

export function classifyMediaToolError(error: unknown, fallback: LocalEngineErrorCode = 'media-probe-failed') {
  const text = errorText(error);
  const lower = text.toLowerCase();

  if (lower.includes('enoent') || lower.includes('not found') || lower.includes('no such file')) {
    return calmError('ffmpeg-missing', 'FFmpeg/ffprobe is not available. Install the media tools or configure FFPROBE_PATH/FFMPEG_PATH, then retry.', text);
  }

  if (lower.includes('invalid data found') || lower.includes('moov atom not found') || lower.includes('could not find codec') || lower.includes('unsupported codec')) {
    return calmError('unsupported-codec', 'Quipsly could not read this media codec yet. Try opening/exporting the file from the camera app first, or convert it to MP4/MOV/WAV and retry.', text);
  }

  if (lower.includes('permission denied') || lower.includes('operation not permitted')) {
    return calmError(fallback, 'Quipsly could not read this file because macOS denied access. Move it into a normal folder or choose it again from the file picker.', text);
  }

  return calmError(fallback, 'Quipsly could not read this media file yet. The file was held safely; nothing was deleted or changed.', text);
}

export function classifyStorageError(error: unknown) {
  const text = errorText(error);
  const lower = text.toLowerCase();
  const status = Number((error as any)?.code || (error as any)?.status || (error as any)?.response?.status);

  if (status === 401 || lower.includes('could not load the default credentials') || lower.includes('application default credentials') || lower.includes('invalid_grant')) {
    return calmError('upload-auth-missing', 'Google upload authentication is missing or expired. Sign in with gcloud or configure service-account credentials, then retry.', text);
  }

  if (status === 403 || lower.includes('permission') || lower.includes('forbidden')) {
    return calmError('bucket-permission-denied', 'Google accepted the account, but it does not have permission to write to the media bucket.', text);
  }

  if (status === 404 || lower.includes('bucket') && lower.includes('not found')) {
    return calmError('bucket-not-found', 'The configured media bucket was not found. Check QUIPSLY_MEDIA_BUCKET or GCS_BUCKET_NAME.', text);
  }

  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('etimedout') || lower.includes('network') || lower.includes('socket hang up')) {
    return calmError('network-offline', 'Network upload failed. Check your connection and retry; the local file was not changed.', text);
  }

  return calmError('unknown-local-engine-error', 'The upload failed safely. The local file was not changed.', text);
}

export function classifyNestError(status: number, bodyText = '') {
  const lower = bodyText.toLowerCase();

  if (status === 401 || lower.includes('sign in') || lower.includes('unauthorized')) {
    return calmError('nest-auth-required', 'Nest needs you to sign in before it can register this media. Open Nest, sign in, then retry.', bodyText);
  }

  if (status === 403 || lower.includes('forbidden')) {
    return calmError('nest-permission-denied', 'Nest says this account does not have permission to import media for that project.', bodyText);
  }

  if (status >= 500) {
    return calmError('nest-unavailable', 'Nest had a server problem while registering this media. The upload may be safe, but registration was held for review.', bodyText);
  }

  return calmError('nest-unavailable', `Nest registration returned HTTP ${status}. The file was held for review.`, bodyText);
}

export function classifyNetworkFetchError(error: unknown) {
  const text = errorText(error);
  const lower = text.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('etimedout') || lower.includes('network')) {
    return calmError('network-offline', 'Nest could not be reached. Check the network connection and retry; the local file was not changed.', text);
  }

  return calmError('nest-unavailable', 'Nest registration failed safely. The file was held for review.', text);
}
