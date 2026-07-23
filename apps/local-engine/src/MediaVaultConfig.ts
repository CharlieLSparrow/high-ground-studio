export function configuredMediaBucketName() {
  return process.env.QUIPSLY_MEDIA_BUCKET
    || process.env.GCS_BUCKET_NAME
    || process.env.NEXT_PUBLIC_GCS_BUCKET
    || 'high-ground-odyssey-media';
}

export function sanitizeMediaVaultPathPart(value: string, fallback = 'media') {
  const safe = String(value || '')
    .trim()
    .replaceAll('..', '')
    .replaceAll('/', '_')
    .replaceAll('\\', '_')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

  return safe || fallback;
}

export function mediaVaultObjectPath(kind: 'raw' | 'proxy' | 'thumb', projectSlug: string, episodeSlug: string, assetId: string, filename: string) {
  return [
    'media-vault',
    kind,
    sanitizeMediaVaultPathPart(projectSlug, 'project'),
    sanitizeMediaVaultPathPart(episodeSlug, 'episode'),
    sanitizeMediaVaultPathPart(assetId, 'asset'),
    sanitizeMediaVaultPathPart(filename, kind === 'thumb' ? 'thumb.jpg' : kind === 'proxy' ? 'proxy.mp4' : 'raw-media'),
  ].join('/');
}

export function gcsUri(bucketName: string, objectName: string) {
  return `gs://${bucketName}/${objectName}`;
}

export function publicObjectUrl(bucketName: string, objectName: string) {
  return `https://storage.googleapis.com/${bucketName}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
}
