export const LAYOUT_VARIANT_COOKIE = "hgo_layout_variant";

export const ALL_LAYOUT_VARIANTS = [
  "cinematic",
  "editorial",
  "signal",
] as const;

export type LayoutVariant = (typeof ALL_LAYOUT_VARIANTS)[number];

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
};

export function normalizeLayoutVariant(value?: string | null): LayoutVariant {
  switch ((value ?? "").toLowerCase()) {
    case "editorial":
      return "editorial";
    case "signal":
      return "signal";
    default:
      return "cinematic";
  }
}

export function formatLayoutVariantLabel(variant: LayoutVariant): string {
  switch (variant) {
    case "editorial":
      return "Editorial";
    case "signal":
      return "Signal";
    default:
      return "Cinematic";
  }
}

export function getLayoutVariantFromCookieStore(
  cookieStore: CookieStoreLike,
  isTeam: boolean,
): LayoutVariant {
  if (!isTeam) {
    return "cinematic";
  }

  return normalizeLayoutVariant(
    cookieStore.get(LAYOUT_VARIANT_COOKIE)?.value,
  );
}
