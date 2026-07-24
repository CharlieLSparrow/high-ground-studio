import React from "react";
import { render, screen } from "@testing-library/react";

import {
  createOutputCapabilityPlan,
  createOutputPacketSkeleton,
  OUTPUT_CATALOG_STAGE_LABELS,
  QUIPSLY_OUTPUT_CATALOG,
  QUIPSLY_OUTPUT_CATALOG_BOUNDARY,
} from "@high-ground/quipsly-domain/output-catalog";

import OutputDetailPage from "./[outputId]/page";
import OutputsPage from "./page";

describe("output capability catalog truth boundary", () => {
  it("renders the catalog as definitions and links current evidence to operational lanes", () => {
    render(<OutputsPage />);

    expect(screen.getByText("Capability roadmap · definition only")).toBeInTheDocument();
    expect(
      screen.getByText(/No card on this page is a produced artifact, persisted packet, publication receipt/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Catalog definitions by roadmap horizon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the Publishing runway/i })).toHaveAttribute(
      "href",
      "/publishing",
    );
    expect(screen.getByRole("link", { name: /Private HGO publish queue/i })).toHaveAttribute(
      "href",
      "https://app.highgroundodyssey.com/team/hgo-publish-queue",
    );

    expect(screen.queryByText(/^Live$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Beta ready$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Current focus$/i)).not.toBeInTheDocument();
  });

  it("keeps detail pages inside the same definition/evidence boundary", async () => {
    const page = await OutputDetailPage({
      params: Promise.resolve({ outputId: "hgo-episode-page" }),
    });
    render(page);

    expect(screen.getByText("Definition boundary")).toBeInTheDocument();
    expect(screen.getByText(/This page is not a produced artifact, persisted packet/i)).toBeInTheDocument();
    expect(screen.getByText("Static catalog definition")).toBeInTheDocument();
    expect(screen.getAllByText("Evidence not checked").length).toBeGreaterThan(0);
    expect(screen.getByText("Intended destinations · not connection proof")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the Publishing runway/i })).toHaveAttribute(
      "href",
      "/publishing",
    );

    expect(screen.queryByText(/^Readiness$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Live$/i)).not.toBeInTheDocument();
  });

  it("models design maturity without runtime or publication status fields", () => {
    expect(QUIPSLY_OUTPUT_CATALOG_BOUNDARY).toMatchObject({
      provesProducedArtifact: false,
      provesPersistedPacket: false,
      provesPublication: false,
      provesProviderConnection: false,
      provesServiceHealth: false,
    });

    for (const output of QUIPSLY_OUTPUT_CATALOG) {
      expect(output).not.toHaveProperty("status");
      expect(output).not.toHaveProperty("priority");
      expect(OUTPUT_CATALOG_STAGE_LABELS[output.catalogStage]).not.toMatch(
        /^(live|beta ready|published|connected|available)$/i,
      );

      const plan = createOutputCapabilityPlan(output);
      expect(plan.definitionSummary).not.toMatch(/working public path|production infrastructure/i);
      expect(plan.requiredInputs.every((input) => input.evidenceState === "not-checked")).toBe(true);

      const skeleton = createOutputPacketSkeleton(output, new Date("2026-07-18T00:00:00.000Z"));
      expect(skeleton.provenance).not.toHaveProperty("status");
      expect(skeleton.provenance.note).toMatch(/not a published artifact/i);
    }
  });
});
