import fs from "node:fs";
import path from "node:path";

type Episode = {
  slug: string;
  title?: string;
  introVideo?: string;
  thumbnail?: string;
};

function readEpisodes(): Episode[] {
  const rendersDir = path.join(process.cwd(), "public", "renders");
  if (!fs.existsSync(rendersDir)) return [];

  const slugs = fs.readdirSync(rendersDir).filter((s) => !s.startsWith("."));
  const episodes: Episode[] = [];

  for (const slug of slugs) {
    const epDir = path.join(rendersDir, slug);
    const metaPath = path.join(epDir, "metadata.json");

    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")); } catch {}
    }

    episodes.push({
      slug,
      title: meta.title || slug,
      introVideo: meta.introVideo || `/renders/${slug}/intro-web.mp4`,
      thumbnail: meta.thumbnail || (fs.existsSync(path.join(epDir, "thumb.jpg")) ? `/renders/${slug}/thumb.jpg` : undefined),
    });
  }

  // Sort by slug
  return episodes.sort((a, b) => a.slug.localeCompare(b.slug));
}

export default function Home() {
  const episodes = readEpisodes();

  return (
    <main style={{ padding: 32, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>High Ground Odyssey</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        This page lists episodes based on what exists in <code>apps/web/public/renders</code>.
        Render locally, then copy assets in and deploy.
      </p>

      {episodes.length === 0 ? (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #333", borderRadius: 12 }}>
          <p style={{ margin: 0 }}>
            No renders found yet. Add a folder like <code>public/renders/episode-001</code> with an <code>intro-web.mp4</code>
            (and optionally <code>metadata.json</code>).
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 24, display: "grid", gap: 18 }}>
          {episodes.map((ep) => (
            <section key={ep.slug} style={{ padding: 16, border: "1px solid #222", borderRadius: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{ep.title}</h2>
              <p style={{ opacity: 0.7, marginTop: 6, marginBottom: 12 }}>{ep.slug}</p>
              <video
                src={ep.introVideo}
                controls
                style={{ width: "100%", borderRadius: 12, background: "#000" }}
                preload="metadata"
              />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
