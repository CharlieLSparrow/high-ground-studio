import { jsonOk } from "@/lib/api";
import { apiEndpoints } from "@high-ground/quipsly-domain/seed";

export function GET() {
  return jsonOk({
    name: "Quipsly API",
    version: "v0.1-prototype",
    description:
      "Source-aware quote, passport, person, Lorelist, and QuipStream prototype API.",
    endpoints: apiEndpoints,
  });
}
