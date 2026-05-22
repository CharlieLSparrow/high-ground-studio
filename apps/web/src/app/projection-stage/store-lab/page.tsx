import StoreLabProjectionStageClient from "./StoreLabProjectionStageClient";

export const metadata = {
  title: "Staged Artifact Store Lab | High Ground Odyssey",
  description:
    "Browser-session HGO staged artifact store lifecycle simulator with no persistence.",
};

export default function ProjectionStageStoreLabPage() {
  return <StoreLabProjectionStageClient />;
}
