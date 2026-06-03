import { SeriesClient } from "./series-client";
import { getSeriesWithBooks } from "./actions";

export const dynamic = "force-dynamic";

export default async function SeriesBiblePage() {
  const series = await getSeriesWithBooks();
  return <SeriesClient initialSeries={series} />;
}
