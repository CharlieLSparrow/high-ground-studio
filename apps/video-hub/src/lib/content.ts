import fs from "node:fs";
import path from "node:path";

export interface Post {
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  category: string;
  date: string;
  readTime: string;
  author: string;
  tags: string[];
  content: string;
}

export function getPostBySlug(slug: string): Post | null {
  try {
    const filePath = path.join(process.cwd(), "src/content", `${slug}.mdx`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Robust frontmatter extractor
    const match = fileContent.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      return null;
    }

    const [, yamlStr, bodyStr] = match;
    const metadata: Record<string, any> = {};

    yamlStr.split("\n").forEach((line) => {
      const colIndex = line.indexOf(":");
      if (colIndex !== -1) {
        const key = line.slice(0, colIndex).trim();
        let value = line.slice(colIndex + 1).trim();

        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        metadata[key] = value;
      }
    });

    // Simple robust tag array parser for the YAML string lists
    const tags: string[] = [];
    let isParsingTags = false;
    yamlStr.split("\n").forEach((line) => {
      if (line.startsWith("tags:") || line.startsWith("scopes:")) {
        isParsingTags = true;
        const inlineArray = line.slice(line.indexOf(":") + 1).trim();
        if (inlineArray.startsWith("[") && inlineArray.endsWith("]")) {
          inlineArray.slice(1, -1).split(",").forEach(t => {
            const trimmed = t.trim().replace(/^['"]|['"]$/g, "");
            if (trimmed) tags.push(trimmed);
          });
          isParsingTags = false;
        }
      } else if (isParsingTags) {
        if (line.startsWith("  - ") || line.startsWith("    - ")) {
          const val = line.replace(/^\s*-\s*/, "").trim().replace(/^['"]|['"]$/g, "");
          if (val) tags.push(val);
        } else if (line.indexOf(":") !== -1) {
          isParsingTags = false;
        }
      }
    });

    return {
      slug,
      title: metadata.title || "Untitled Post",
      subtitle: metadata.subtitle || "",
      description: metadata.description || "",
      category: metadata.category || "General",
      date: metadata.date || new Date().toLocaleDateString(),
      readTime: metadata.readTime || "5 min read",
      author: metadata.author || "Charlie",
      tags,
      content: bodyStr.trim(),
    };
  } catch (err) {
    console.error(`Error parsing MDX for slug ${slug}:`, err);
    return null;
  }
}

export function getAllPosts(): Post[] {
  try {
    const contentDir = path.join(process.cwd(), "src/content");
    if (!fs.existsSync(contentDir)) {
      return [];
    }

    const files = fs.readdirSync(contentDir).filter((file) => file.endsWith(".mdx"));
    return files
      .map((file) => {
        const slug = file.replace(/\.mdx$/, "");
        return getPostBySlug(slug);
      })
      .filter((post): post is Post => post !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (err) {
    console.error("Error reading content directory:", err);
    return [];
  }
}

export function markdownToHtml(markdown: string, accentColor: "teal" | "amber" | "rose" = "rose"): string {
  let html = markdown
    // Escape standard brackets to prevent browser parsing errors
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Accent styling mappings
  const accentClasses = {
    teal: {
      h3: "text-teal-400 font-mono tracking-wide mt-6 mb-3",
      h2: "text-2xl font-bold mt-8 mb-4 text-teal-300 border-b border-slate-800 pb-2 font-mono",
      code: "bg-slate-900 text-teal-400 px-1.5 py-0.5 rounded font-mono text-sm",
      quote: "border-l-4 border-teal-500 bg-teal-950/20 px-4 py-3 my-4 italic text-slate-350 rounded-r",
      bullet: "list-disc ml-6 my-2 text-slate-300",
    },
    amber: {
      h3: "text-amber-400 font-serif tracking-wide mt-6 mb-3",
      h2: "text-2xl font-bold mt-8 mb-4 text-amber-300 border-b border-stone-800 pb-2 font-serif",
      code: "bg-stone-900 text-amber-400 px-1.5 py-0.5 rounded font-mono text-sm",
      quote: "border-l-4 border-amber-400 bg-amber-950/20 px-4 py-3 my-4 italic text-stone-350 rounded-r",
      bullet: "list-disc ml-6 my-2 text-stone-300",
    },
    rose: {
      h3: "text-rose-400 font-sans tracking-wide mt-6 mb-3 uppercase font-semibold",
      h2: "text-2xl font-bold mt-8 mb-4 text-rose-300 border-b border-zinc-800 pb-2 uppercase tracking-wide",
      code: "bg-zinc-900 text-rose-400 px-1.5 py-0.5 rounded font-mono text-sm",
      quote: "border-l-4 border-rose-500 bg-rose-950/20 px-4 py-3 my-4 italic text-zinc-350 rounded-r",
      bullet: "list-disc ml-6 my-2 text-zinc-300",
    }
  }[accentColor];

  // Headings
  html = html.replace(/^### (.*$)/gim, `<h3 class="${accentClasses.h3}">$1</h3>`);
  html = html.replace(/^## (.*$)/gim, `<h2 class="${accentClasses.h2}">$1</h2>`);
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold mt-10 mb-6 text-zinc-100">$1</h1>');

  // Bold / Strong
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-zinc-200">$1</strong>');
  
  // Inline Code
  html = html.replace(/`(.*?)`/g, `<code class="${accentClasses.code}">$1</code>`);

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, `<blockquote class="${accentClasses.quote}">$1</blockquote>`);

  // Bullet Lists
  html = html.replace(/^\- (.*$)/gim, `<li class="${accentClasses.bullet}">$1</li>`);

  // Split and format paragraphs
  const lines = html.split(/\n/);
  const formattedLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (inList) {
        formattedLines.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (line.startsWith("<li")) {
      if (!inList) {
        formattedLines.push('<ul class="space-y-1 my-4">');
        inList = true;
      }
      formattedLines.push(line);
    } else {
      if (inList) {
        formattedLines.push("</ul>");
        inList = false;
      }

      if (line.startsWith("<h") || line.startsWith("<blockquote") || line.startsWith("---")) {
        formattedLines.push(line);
      } else {
        formattedLines.push(`<p class="leading-relaxed mb-4 text-zinc-300">${line}</p>`);
      }
    }
  }

  if (inList) {
    formattedLines.push("</ul>");
  }

  return formattedLines.join("\n");
}
