export type ExistingEpisodeProductionIdentity = {
  title: string;
  boundaryLabel: string;
  boundaryKind: string;
  boundaryStartBlockId: string | null;
  boundaryEndBlockId: string | null;
  boundaryStartOrder: number | null;
  boundaryEndOrder: number | null;
};

export type EpisodeProductionEnsureIdentity = {
  title: string;
  boundaryLabel: string;
  boundaryKind: string;
  boundaryStartBlockId?: string;
  boundaryEndBlockId?: string;
  boundaryStartOrder?: number;
  boundaryEndOrder?: number;
};

type EpisodeProductionEnsurePatch =
  Partial<EpisodeProductionEnsureIdentity>;

export function planExistingEpisodeProductionEnsure(
  existing: ExistingEpisodeProductionIdentity,
  requested: EpisodeProductionEnsureIdentity,
): EpisodeProductionEnsurePatch | null {
  const patch: EpisodeProductionEnsurePatch = {};

  if (existing.title !== requested.title) {
    patch.title = requested.title;
  }
  if (
    existing.boundaryLabel
      !== requested.boundaryLabel
  ) {
    patch.boundaryLabel =
      requested.boundaryLabel;
  }
  if (
    existing.boundaryKind
      !== requested.boundaryKind
  ) {
    patch.boundaryKind =
      requested.boundaryKind;
  }

  if (
    requested.boundaryStartBlockId
      !== undefined
    && existing.boundaryStartBlockId
      !== requested.boundaryStartBlockId
  ) {
    patch.boundaryStartBlockId =
      requested.boundaryStartBlockId;
  }
  if (
    requested.boundaryEndBlockId
      !== undefined
    && existing.boundaryEndBlockId
      !== requested.boundaryEndBlockId
  ) {
    patch.boundaryEndBlockId =
      requested.boundaryEndBlockId;
  }
  if (
    requested.boundaryStartOrder
      !== undefined
    && existing.boundaryStartOrder
      !== requested.boundaryStartOrder
  ) {
    patch.boundaryStartOrder =
      requested.boundaryStartOrder;
  }
  if (
    requested.boundaryEndOrder
      !== undefined
    && existing.boundaryEndOrder
      !== requested.boundaryEndOrder
  ) {
    patch.boundaryEndOrder =
      requested.boundaryEndOrder;
  }

  return Object.keys(patch).length
    ? patch
    : null;
}
