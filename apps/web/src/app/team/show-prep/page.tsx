import ShowPrepFiltersClient from "./ShowPrepFiltersClient";

import {
  getShowPrepCandidates,
  getShowPrepPackets,
  toShowPrepCandidateSummary,
  toShowPrepPacketSummary,
} from "@/lib/server/show-prep";

export default async function ShowPrepIndexPage() {
  const [packets, candidates] = await Promise.all([
    getShowPrepPackets(),
    getShowPrepCandidates(),
  ]);

  return (
    <ShowPrepFiltersClient
      packets={packets.map(toShowPrepPacketSummary)}
      candidates={candidates.map(toShowPrepCandidateSummary)}
    />
  );
}
