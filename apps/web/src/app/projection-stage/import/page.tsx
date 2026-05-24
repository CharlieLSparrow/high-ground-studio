import ImportProjectionStageClient from "./ImportProjectionStageClient";

export const metadata = {
  title: "Import Projection Review | High Ground Odyssey",
  description:
    "Browser-first staged review route for Studio HGO projection JSON drafts before private team storage.",
};

export default function ProjectionStageImportPage() {
  return <ImportProjectionStageClient />;
}
