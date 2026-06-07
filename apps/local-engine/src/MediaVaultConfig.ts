export function configuredMediaBucketName() {
  return process.env.QUIPSLY_MEDIA_BUCKET
    || process.env.GCS_BUCKET_NAME
    || process.env.NEXT_PUBLIC_GCS_BUCKET
    || 'high-ground-raw-footage';
}

export function mediaVaultObjectPath(kind: 'raw' | 'proxy' | 'thumb', projectSlug: string, episodeSlug: string, assetId: string, filename: string) {
  const root = kind === 'thumb' ? 'thumbnail' : kind;
  return `media-vault/${root}/${projectSlug}/${episodeSlug}/${assetId}/${filename}`;
}

export function gcsUri(bucketName: string, objectName: string) {
  return `gs://${bucketName}/${objectName}`;
}

export function publicObjectUrl(bucketName: string, objectName: string) {
  return `https://storage.googleapis.com/${bucketName}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
}
