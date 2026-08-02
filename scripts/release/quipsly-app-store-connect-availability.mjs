const UNRELEASED_AVAILABILITY_STATUSES = new Set([
  "AVAILABLE_FOR_SALE_UNRELEASED_APP",
  "CANNOT_SELL",
]);

export function territoryIdForAvailability(resource) {
  const relationshipData = resource?.relationships?.territory?.data;
  if (relationshipData?.id) return relationshipData.id;
  if (typeof resource?.id !== "string") return "";
  try {
    const decoded = JSON.parse(Buffer.from(resource.id, "base64url").toString("utf8"));
    return typeof decoded?.t === "string" ? decoded.t : resource.id;
  } catch {
    return resource.id;
  }
}

export function summarizeTerritoryAvailability({
  availabilityDocument,
  territoryAvailabilitiesDocument,
}) {
  const resources = territoryAvailabilitiesDocument?.data
    || (availabilityDocument?.included || []).filter(
      (resource) => resource.type === "territoryAvailabilities",
    );
  const rows = resources.map((resource) => ({
    id: territoryIdForAvailability(resource),
    available: resource.attributes?.available === true,
    contentStatuses: [...(resource.attributes?.contentStatuses || [])].sort(),
  }));
  const reportedTerritoryCount = availabilityDocument?.data?.relationships
    ?.territoryAvailabilities?.meta?.paging?.total ?? rows.length;
  const availableRows = rows.filter((entry) => entry.available);
  const blockingContentStatuses = [...new Set(availableRows.flatMap((entry) => {
    const unreleased = entry.contentStatuses.includes(
      "AVAILABLE_FOR_SALE_UNRELEASED_APP",
    );
    return entry.contentStatuses.filter((status) => {
      if (status === "AVAILABLE") return false;
      return !(unreleased && UNRELEASED_AVAILABILITY_STATUSES.has(status));
    });
  }))].sort();
  return {
    rows,
    reportedTerritoryCount,
    readTerritoryCount: rows.length,
    inventoryComplete: Boolean(availabilityDocument?.data)
      && rows.length === reportedTerritoryCount,
    availableTerritoryIds: availableRows.map((entry) => entry.id).sort(),
    blockingContentStatuses,
    traderStatusBlockers: blockingContentStatuses.filter(
      (status) => status.startsWith("TRADER_STATUS_"),
    ),
  };
}
