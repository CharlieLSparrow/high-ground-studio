import type { Metadata } from "next";
import { Database, KeyRound, ShieldCheck, Waypoints } from "lucide-react";
import { ApiExplorerClient } from "@/components/ApiExplorerClient";
import { AppShell } from "@/components/AppShell";
import { StatPanel } from "@/components/StatPanel";
import {
  apiEndpoints,
  people,
  quipslyAssetSheets,
  quotes,
  sourceWorks,
} from "@high-ground/quipsly-domain/seed";

export const metadata: Metadata = {
  title: "Quipsly API Explorer",
  description:
    "Prototype explorer for the source-aware Quipsly quote, story, asset, merch, and stream API.",
};

export default function ApiExplorerPage() {
  const gatewayGroups = new Set(apiEndpoints.map((endpoint) => endpoint.group));
  const getEndpoints = apiEndpoints.filter((endpoint) => endpoint.method === "GET");

  return (
    <AppShell>
      <div className="page-head api-page-head">
        <span className="section-label">
          <Database size={14} aria-hidden="true" />
          Quipsly API
        </span>
        <h1>Gateway-ready quote intelligence.</h1>
        <p>
          Explore the API shape behind Quote Passports, QuipStream, story trails,
          merch readiness, and Quipsly visual assets. The live runner defaults to
          the local standalone API server on port 3004.
        </p>
      </div>

      <div className="api-hero-grid">
        <section className="panel">
          <span className="section-label">
            <ShieldCheck size={14} aria-hidden="true" />
            Source-first product surface
          </span>
          <h2 className="panel-title">The API returns projections, not loose text.</h2>
          <p className="panel-copy">
            Quote cards, stories, merch concepts, and character assets all keep
            review state and source context close to the user-facing output.
          </p>
        </section>

        <section className="panel">
          <span className="section-label">
            <Waypoints size={14} aria-hidden="true" />
            Gateway candidate
          </span>
          <h2 className="panel-title">OpenAPI is already part of the app.</h2>
          <p className="panel-copy">
            The prototype exposes an OpenAPI route so Apigee, API Gateway, API
            docs, SDK generation, and partner onboarding have a concrete target.
          </p>
        </section>

        <section className="panel">
          <span className="section-label">
            <KeyRound size={14} aria-hidden="true" />
            Seed surface
          </span>
          <StatPanel
            items={[
              { label: "Endpoints", value: apiEndpoints.length },
              { label: "GET routes", value: getEndpoints.length },
              { label: "Groups", value: gatewayGroups.size },
              { label: "Assets", value: quipslyAssetSheets.length },
              { label: "Quotes", value: quotes.length },
              { label: "People", value: people.length },
              { label: "Sources", value: sourceWorks.length },
              { label: "Spec", value: "3.1" },
            ]}
          />
        </section>
      </div>

      <ApiExplorerClient endpoints={apiEndpoints} />
    </AppShell>
  );
}
