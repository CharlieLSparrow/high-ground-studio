-- The v1 receipt could pair a proxy asset's byte count with the checksum of
-- the original behind it. Preserve the prior receipt for audit, but withdraw
-- the exact-byte claim. v2 requires a checksum and size from the attachment
-- output/direct registration for the same StudioMediaAsset.
UPDATE "StudioMediaSourceRevision"
SET
  "contentSha256" = NULL,
  "verifiedAt" = NULL,
  "sourceState" = 'identity-unverified',
  "verificationJson" = jsonb_build_object(
    'schema', 'quipsly-media-source-verification-invalidated-v1',
    'state', 'identity-unverified',
    'claim', 'The earlier receipt did not prove this exact asset byte identity. Exact-source execution remains held.',
    'priorReceipt', "verificationJson"
  )
WHERE "verificationJson"->>'schema' = 'quipsly-media-source-verification-v1';
