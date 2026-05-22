import ImportProjectionStageClient from "./ImportProjectionStageClient";

export const metadata = {
  title: "Import Projection Review | High Ground Odyssey",
  description:
    "No-persistence staged review route for pasted Studio HGO projection JSON drafts.",
};

export default function ProjectionStageImportPage() {
  return <ImportProjectionStageClient />;
}
