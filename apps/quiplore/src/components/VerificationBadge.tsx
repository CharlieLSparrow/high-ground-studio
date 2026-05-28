import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  ShieldQuestion,
} from "lucide-react";
import {
  verificationLabels,
  verificationTone,
  type VerificationStatus,
} from "@high-ground/quipsly-domain";

export function VerificationBadge({
  status,
}: {
  readonly status: VerificationStatus;
}) {
  const tone = verificationTone[status];
  const label = verificationLabels[status];
  const Icon =
    tone === "solid"
      ? BadgeCheck
      : tone === "danger"
        ? AlertTriangle
        : tone === "warning"
          ? ShieldQuestion
          : CircleDashed;

  return (
    <span className={`chip verification-badge ${tone}`} title={label}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
