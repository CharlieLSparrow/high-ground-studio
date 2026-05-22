import StudioCollaborationLabClient from "./studio-collaboration-lab-client";

export const metadata = {
  title: "Studio Collaboration Lab | High Ground Studio",
  description:
    "Local-only synthetic manuscript collaboration lab for Studio CRDT testing.",
};

export default function StudioCollaborationLabPage() {
  return <StudioCollaborationLabClient />;
}
