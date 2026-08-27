import type { AppRole } from "@prisma/client";

export type QuipslyStaffCapability =
  | "USER_ADMIN"
  | "SUPPORT_OPERATIONS"
  | "PRODUCT_ANALYTICS";

export const ALL_STAFF_CAPABILITIES: readonly QuipslyStaffCapability[] = [
  "USER_ADMIN",
  "SUPPORT_OPERATIONS",
  "PRODUCT_ANALYTICS",
];

export function staffCapabilitiesForRoles(
  roles: readonly AppRole[],
): QuipslyStaffCapability[] {
  const capabilities = new Set<QuipslyStaffCapability>();
  if (roles.includes("OWNER")) {
    ALL_STAFF_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  }
  if (roles.includes("SUPPORT_AGENT")) capabilities.add("SUPPORT_OPERATIONS");
  if (roles.includes("PRODUCT_ANALYST")) capabilities.add("PRODUCT_ANALYTICS");
  return [...capabilities];
}
