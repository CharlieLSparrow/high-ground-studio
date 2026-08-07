export const GOOGLE_DRIVE_MEDIA_PACKAGE_PLAN_SCHEMA =
  "quipsly-google-drive-media-package-plan-v1" as const;
export const GOOGLE_DRIVE_MEDIA_LIBRARY_PLAN_SCHEMA =
  "quipsly-google-drive-media-library-plan-v1" as const;

export type GoogleDriveFolderMediaItem = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: string | null;
  headRevisionId: string | null;
  md5Checksum: string | null;
  resourceKey: string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  driveId: string | null;
  canDownload: boolean;
  canCopy: boolean;
  canReadRevisions: boolean;
};

export type GoogleDriveMediaPackageMember = GoogleDriveFolderMediaItem & {
  role: "primary-original" | "browse-proxy";
  channel: string;
};

export type GoogleDriveMediaPackageSegment = {
  key: string;
  captureKey: string;
  displayName: string;
  capturedAt: string;
  segment: string;
  status:
    | "ready-to-attach"
    | "held-incomplete"
    | "held-syncing"
    | "held-restricted"
    | "held-ambiguous";
  reasons: string[];
  members: GoogleDriveMediaPackageMember[];
  totalSizeBytes: string;
};

export type GoogleDriveMediaPackagePlan = {
  schema: typeof GOOGLE_DRIVE_MEDIA_PACKAGE_PLAN_SCHEMA;
  folder: {
    id: string;
    name: string;
    captureBatchKey: string;
    expectedSegments: string[];
  };
  status: "ready" | "partial" | "empty";
  segments: GoogleDriveMediaPackageSegment[];
  unrecognizedFiles: GoogleDriveFolderMediaItem[];
  totalFiles: number;
  totalSizeBytes: string;
  readySegmentCount: number;
  heldSegmentCount: number;
};

export type GoogleDriveMediaLibraryPlan = {
  schema: typeof GOOGLE_DRIVE_MEDIA_LIBRARY_PLAN_SCHEMA;
  root: { id: string; name: string };
  status: "ready" | "partial" | "empty";
  batches: GoogleDriveMediaPackagePlan[];
  totalFiles: number;
  totalSizeBytes: string;
  readySegmentCount: number;
  heldSegmentCount: number;
};

const CAPTURE_FOLDER = /^VID_(\d{8})_(\d{6})_00_(\d{3})_(\d{3})-Original$/i;
const CAPTURE_FILE = /^(VID|LRV)_(\d{8})_(\d{6})_(\d{2})_(\d{3})\.(insv|lrv)$/i;

function byteCount(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

function captureInstant(date: string, time: string) {
  const value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`;
  return Number.isFinite(Date.parse(value)) ? value : new Date(0).toISOString();
}

function expectedSegments(folderName: string) {
  const match = folderName.match(CAPTURE_FOLDER);
  if (!match) return [];
  const start = Number(match[3]);
  const end = Number(match[4]);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    end < start ||
    end - start > 999
  )
    return [];
  return Array.from({ length: end - start + 1 }, (_, index) =>
    String(start + index).padStart(3, "0"),
  );
}

function packageStatus(members: GoogleDriveMediaPackageMember[]) {
  const originals = members.filter(
    (member) => member.role === "primary-original",
  );
  const browse = members.filter((member) => member.role === "browse-proxy");
  const reasons: string[] = [];
  if (!originals.length) reasons.push("The exact INSV original is missing.");
  if (!browse.length) reasons.push("The LRV browsing companion is missing.");
  if (browse.length > 1)
    reasons.push("More than one LRV browsing companion matches this segment.");
  if (members.some((member) => byteCount(member.sizeBytes) === 0n))
    reasons.push("At least one file is empty or still syncing.");
  if (members.some((member) => !member.canDownload))
    reasons.push(
      "At least one file is not downloadable by the connected account.",
    );

  const status =
    originals.length === 0 || browse.length === 0
      ? "held-incomplete"
      : browse.length > 1
        ? "held-ambiguous"
        : members.some((member) => byteCount(member.sizeBytes) === 0n)
          ? "held-syncing"
          : members.some((member) => !member.canDownload)
            ? "held-restricted"
            : "ready-to-attach";
  return { status, reasons } as const;
}

export function planGoogleDriveMediaFolder(input: {
  folderId: string;
  folderName: string;
  files: GoogleDriveFolderMediaItem[];
}): GoogleDriveMediaPackagePlan {
  const groups = new Map<
    string,
    {
      date: string;
      time: string;
      segment: string;
      members: GoogleDriveMediaPackageMember[];
    }
  >();
  const unrecognizedFiles: GoogleDriveFolderMediaItem[] = [];
  for (const file of input.files) {
    const match = file.name.match(CAPTURE_FILE);
    const prefix = match?.[1]?.toUpperCase();
    const extension = match?.[6]?.toLowerCase();
    if (
      !match ||
      (prefix === "VID" && extension !== "insv") ||
      (prefix === "LRV" && extension !== "lrv")
    ) {
      unrecognizedFiles.push(file);
      continue;
    }
    const [, , date, time, channel, segment] = match;
    const key = `${date}_${time}_${segment}`;
    const group = groups.get(key) ?? { date, time, segment, members: [] };
    group.members.push({
      ...file,
      channel,
      role: prefix === "LRV" ? "browse-proxy" : "primary-original",
    });
    groups.set(key, group);
  }

  const folderExpectedSegments = expectedSegments(input.folderName);
  const folderMatch = input.folderName.match(CAPTURE_FOLDER);
  if (folderMatch) {
    const [, date, time] = folderMatch;
    for (const segment of folderExpectedSegments) {
      const key = `${date}_${time}_${segment}`;
      if (!groups.has(key))
        groups.set(key, { date, time, segment, members: [] });
    }
  }

  const segments = [...groups.values()]
    .map((group): GoogleDriveMediaPackageSegment => {
      const members = [...group.members].sort(
        (left, right) =>
          left.role.localeCompare(right.role) ||
          left.channel.localeCompare(right.channel) ||
          left.name.localeCompare(right.name),
      );
      const readiness = packageStatus(members);
      const capturedAt = captureInstant(group.date, group.time);
      return {
        key: `${group.date}_${group.time}_${group.segment}`,
        captureKey: `VID_${group.date}_${group.time}_${group.segment}`,
        displayName: `${capturedAt.slice(0, 10)} ${capturedAt.slice(11, 19)} · segment ${group.segment}`,
        capturedAt,
        segment: group.segment,
        status: readiness.status,
        reasons: readiness.reasons,
        members,
        totalSizeBytes: members
          .reduce((total, member) => total + byteCount(member.sizeBytes), 0n)
          .toString(),
      };
    })
    .sort(
      (left, right) =>
        left.capturedAt.localeCompare(right.capturedAt) ||
        left.segment.localeCompare(right.segment),
    );
  const readySegmentCount = segments.filter(
    (segment) => segment.status === "ready-to-attach",
  ).length;
  const heldSegmentCount = segments.length - readySegmentCount;
  const totalSizeBytes = input.files
    .reduce((total, file) => total + byteCount(file.sizeBytes), 0n)
    .toString();
  return {
    schema: GOOGLE_DRIVE_MEDIA_PACKAGE_PLAN_SCHEMA,
    folder: {
      id: input.folderId,
      name: input.folderName,
      captureBatchKey: folderMatch
        ? `VID_${folderMatch[1]}_${folderMatch[2]}`
        : `drive-folder:${input.folderId}`,
      expectedSegments: folderExpectedSegments,
    },
    status:
      segments.length === 0
        ? "empty"
        : heldSegmentCount === 0
          ? "ready"
          : "partial",
    segments,
    unrecognizedFiles: unrecognizedFiles.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    totalFiles: input.files.length,
    totalSizeBytes,
    readySegmentCount,
    heldSegmentCount,
  };
}

export function planGoogleDriveMediaLibrary(input: {
  rootFolderId: string;
  rootFolderName: string;
  batches: GoogleDriveMediaPackagePlan[];
}): GoogleDriveMediaLibraryPlan {
  const readySegmentCount = input.batches.reduce(
    (total, batch) => total + batch.readySegmentCount,
    0,
  );
  const heldSegmentCount = input.batches.reduce(
    (total, batch) => total + batch.heldSegmentCount,
    0,
  );
  const totalFiles = input.batches.reduce(
    (total, batch) => total + batch.totalFiles,
    0,
  );
  const totalSizeBytes = input.batches
    .reduce((total, batch) => total + BigInt(batch.totalSizeBytes), 0n)
    .toString();
  return {
    schema: GOOGLE_DRIVE_MEDIA_LIBRARY_PLAN_SCHEMA,
    root: { id: input.rootFolderId, name: input.rootFolderName },
    status:
      readySegmentCount + heldSegmentCount === 0
        ? "empty"
        : heldSegmentCount === 0
          ? "ready"
          : "partial",
    batches: [...input.batches].sort((left, right) =>
      left.folder.name.localeCompare(right.folder.name),
    ),
    totalFiles,
    totalSizeBytes,
    readySegmentCount,
    heldSegmentCount,
  };
}
