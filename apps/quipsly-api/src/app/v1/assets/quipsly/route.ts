import { jsonOk } from "@/lib/api";
import {
  pageCompanions,
  quipslyAssetSheets,
} from "@high-ground/quipsly-domain/seed";

export function GET() {
  return jsonOk({
    sheets: quipslyAssetSheets,
    pageCompanions,
  });
}
