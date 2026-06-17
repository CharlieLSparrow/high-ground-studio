import { AppShell } from "@/components/AppShell";
import { LorelistCuratorExperience } from "@/components/LorelistCuratorExperience";

export const metadata = {
  title: "Lorelist Builder - QuipLore",
};

export default function LorelistBuilderPage() {
  return (
    <AppShell>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Lorelist Builder</h1>
        <p>Curate your saved quotes into a publishable collection.</p>
      </div>
      <LorelistCuratorExperience />
    </AppShell>
  );
}
