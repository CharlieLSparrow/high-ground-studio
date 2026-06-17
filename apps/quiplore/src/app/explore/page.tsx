import { AppShell } from "@/components/AppShell";
import { Compass, Library, Users, Sparkles } from "lucide-react";
import Link from "next/link";
import { themes, people, lorelists } from "@high-ground/quipsly-domain/seed";
import Image from "next/image";

export const metadata = {
  title: "Explore - QuipLore",
};

export default function ExplorePage() {
  return (
    <AppShell>
      <div className="page-head">
        <span className="section-label">
          <Compass size={14} aria-hidden="true" />
          Discovery Hub
        </span>
        <h1>Explore QuipLore</h1>
        <p>Discover verified quotes through curated collections, thematic streams, and notable figures.</p>
      </div>

      <div className="stack" style={{ gap: "3rem", marginTop: "2rem" }}>
        
        {/* Featured Lorelists */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Library size={20} className="text-[#ad6b35]" />
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#4c331b" }}>Featured Collections</h2>
          </div>
          <div className="card-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
            {lorelists.filter(l => l.visibility === "public").map(list => {
              const coverTheme = themes.find(t => t.id === list.coverThemeId) || themes[0];
              return (
                <Link key={list.id} href={`/lorelists/${list.slug}`} className="meta-item hover-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ 
                    height: "80px", 
                    backgroundColor: coverTheme.color || "#e2b17b", 
                    borderRadius: "8px 8px 0 0",
                    opacity: 0.8,
                    marginBottom: "-10px"
                  }} />
                  <div style={{ padding: "1.5rem", backgroundColor: "#fff", border: "1px solid #e2b17b", borderRadius: "12px", flexGrow: 1, position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <strong style={{ fontSize: "1.2rem", color: "#4c331b" }}>{list.title}</strong>
                      <span className="chip" style={{ fontSize: "10px", margin: 0 }}>{list.arcLabel}</span>
                    </div>
                    <p style={{ fontSize: "14px", color: "#ad6b35", marginBottom: "1rem" }}>{list.description}</p>
                    <div style={{ fontSize: "12px", fontWeight: "bold", color: "#8d5a2b" }}>Curated by {list.curatorName}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Themes Grid */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Sparkles size={20} className="text-[#ad6b35]" />
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#4c331b" }}>Browse by Theme</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
            {themes.map(theme => (
              <Link 
                key={theme.id} 
                href={`/stream?mode=by-theme&theme=${theme.slug}`}
                className="panel"
                style={{ 
                  display: "flex", alignItems: "center", justifyContent: "center", 
                  height: "100px", borderLeft: `6px solid ${theme.color || "#ad6b35"}`,
                  textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s"
                }}
              >
                <strong style={{ fontSize: "1.2rem", color: "#4c331b" }}>{theme.label}</strong>
              </Link>
            ))}
          </div>
        </section>

        {/* People Grid */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Users size={20} className="text-[#ad6b35]" />
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#4c331b" }}>Notable Figures</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1.5rem" }}>
            {people.slice(0, 9).map(person => (
              <Link key={person.id} href={`/people/${person.slug}`} className="panel hover-card" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {person.imageUrl ? (
                  <Image 
                    src={person.imageUrl} 
                    alt={person.displayName}
                    width={60}
                    height={60}
                    style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid #e2b17b" }}
                  />
                ) : (
                  <div style={{ 
                    width: "60px", height: "60px", borderRadius: "50%", 
                    backgroundColor: "#fdf1dc", border: "2px solid #e2b17b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", color: "#ad6b35", fontSize: "1.2rem"
                  }}>
                    {person.displayName.charAt(0)}
                  </div>
                )}
                <div>
                  <strong style={{ display: "block", color: "#4c331b" }}>{person.displayName}</strong>
                  <span style={{ fontSize: "12px", color: "#ad6b35" }}>{person.roles.join(", ")}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
