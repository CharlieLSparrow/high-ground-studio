import { cookies } from "next/headers";

import {
  ALL_LAYOUT_VARIANTS,
  getLayoutVariantFromCookieStore,
} from "@/lib/layout-variant";

import LayoutVariantSwitcherClient from "./LayoutVariantSwitcherClient";

export default async function LayoutVariantSwitcher({
  isTeam,
}: {
  isTeam: boolean;
}) {
  if (!isTeam) {
    return null;
  }

  const cookieStore = await cookies();
  const currentVariant = getLayoutVariantFromCookieStore(cookieStore, true);

  return (
    <LayoutVariantSwitcherClient
      currentVariant={currentVariant}
      allowedVariants={[...ALL_LAYOUT_VARIANTS]}
    />
  );
}
