import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, "..");

const samples = [
  // AI Hub Posts
  {
    target: "ai-hub",
    slug: "the-architecture-of-autonomous-coding-agents",
    title: "The Architecture of Autonomous Coding Agents",
    subtitle: "Decision loops, tool-calling constraints, and contextual state recovery",
    description: "Exploring decision loops, tool-calling constraints, and contextual state recovery mechanisms in agentic AI frameworks.",
    category: "Agentic Systems",
    author: "Charlie",
    readTime: "8 min read",
    tags: ["AI Agents", "Agentic Architecture", "LLMs"],
    body: `# The Architecture of Autonomous Coding Agents

Autonomous coding agents represent a fundamental shift in how software is developed. Instead of serving as static autocompletion tools, these systems reason, plan, execute, and verify operations autonomously.

## The Decision Loop

At the core of any agent is the **Reasoning-Action loop** (often styled as ReAct or similar paradigms). The agent:
1. **Observes** the current workspace state (logs, compiler errors, file structure).
2. **Thinks** to form an optimal plan or hypothesis.
3. **Acts** by calling specialized tools (viewing a file, modifying a file, running a shell command).

This loop continues until the goal is accomplished or progress is blocked.

## Tool-Calling Constraints

To ensure reliability, autonomous agents operate within tight boundaries:
- **Context Sandboxing:** Restricting shell executions to safe workspace roots.
- **Deterministic Formats:** Forcing structured JSON outputs for tools.
- **Safety Checkpoints:** Requiring human review for high-impact operations like publishing or database migrations.

## Contextual State Recovery

Because LLM context windows are finite, agents must implement robust compression. When a conversation is compacted:
- Important architectural agreements must be preserved.
- Unfinished tasks must be clearly tracked in a state ledger.
- System prompts must be updated with current sprint progress.

This ensures continuity across execution turn compactions without context bloat.`
  },
  {
    target: "ai-hub",
    slug: "understanding-multimodal-llm-inference",
    title: "Understanding Multimodal LLM Inference",
    subtitle: "How next-generation models process complex spatial data and diagrams",
    description: "How next-generation models process complex spatial data, diagram projections, and text-based layouts concurrently.",
    category: "Deep Learning",
    author: "Charlie",
    readTime: "12 min read",
    tags: ["Deep Learning", "Multimodal", "Neural Networks"],
    body: `# Understanding Multimodal LLM Inference

Modern Large Language Models have evolved beyond text. They can now ingest, process, and reason over visual media, diagrams, layouts, and charts concurrently with text instructions.

## Joint Visual-Text Embeddings

Unlike early systems that ran optical character recognition (OCR) first, modern multimodal architectures utilize unified embedding spaces.
1. **Vision Encoder:** A specialized model (e.g. ViT or SigLIP) splits the input image into spatial patches.
2. **Projection Layer:** A projection matrix translates these visual features into tokens matching the LLM's text vocabulary dimension.
3. **Sequence Concat:** The text token embeddings and visual token embeddings are concatenated as a single sequence.

This unified representation allows the transformer core to apply self-attention across both text instructions and visual patches simultaneously.

## Applications in UI Engineering

This visual capability makes multimodal models excellent partners for design QA:
- **Visual Auditing:** Comparing mockup screenshots with actual frontends to catch alignment shifts.
- **A11y Checks:** Inspecting layouts for contrast violations and unlabeled interactive targets.
- **Diagram Translation:** Reading architectural diagrams (like Mermaid flowcharts) and generating executable code templates directly.`
  },
  {
    target: "ai-hub",
    slug: "context-windows-and-retrieval-augmented-generation",
    title: "Context Windows and Retrieval-Augmented Generation",
    subtitle: "Analyzing retrieval latency, chunking density, and vector models",
    description: "Analyzing retrieval latency, chunking density, and vector score models for extremely large enterprise codebases.",
    category: "Retrieval (RAG)",
    author: "Charlie",
    readTime: "10 min read",
    tags: ["RAG", "Vector Search", "Context Windows"],
    body: `# Context Windows and Retrieval-Augmented Generation

As LLM context windows scale to millions of tokens, developers face a critical choice: should they load everything into the prompt context, or continue to use Retrieval-Augmented Generation (RAG)?

## The Context Cost Curve

While loading large documents directly into the prompt reduces the need for complex retrieval pipelines, it introduces significant downsides:
- **Latency Scaling:** Attention compute scales quadratically $O(N^2)$ or linearly $O(N)$ with sequence length, leading to high time-to-first-token.
- **Financial Cost:** Standard API providers charge per token; loading massive codebases for every trivial query quickly becomes cost-prohibitive.
- **Lost in the Middle:** Models still experience reduced retrieval accuracy in the middle of extremely long contexts.

## Optimal Hybrid Architecture

The most successful enterprise engineering systems leverage a hybrid layout:
1. **Semantic Indexing:** A fast vector database indexes all files with sensible overlap (e.g., class-level chunking).
2. **Dense Retrieval:** A lightweight retriever extracts the top 20–30 relevant snippets based on semantic cosine similarity.
3. **Cross-Encoder Reranking:** A secondary reranker computes precise pairwise relevance scores to narrow down the context.
4. **Context Injection:** Injecting only the highest-scoring snippets into the active LLM context.

This maintains low latency, preserves high precision, and optimizes compute costs.`
  },

  // Photography Hub Posts
  {
    target: "photography-hub",
    slug: "mastering-natural-light-in-portraiture",
    title: "Mastering Natural Light in Portraiture",
    subtitle: "Reading shadows, identifying golden hours, and placing reflectors",
    description: "How to read dynamic shadows, identify the golden hour windows, and position reflectors for clean catches.",
    category: "Lighting Technique",
    author: "Charlie",
    readTime: "6 min read",
    tags: ["Natural Light", "Portraits", "Exposure"],
    body: `# Mastering Natural Light in Portraiture

Natural light is one of the most powerful tools available to a portrait photographer. Unlike studio strobes, ambient daylight is constantly evolving in color temperature, intensity, and direction.

## The Art of Reading Shadows

Exposure is not just about measuring light; it is about choosing where the shadows fall. Shadows define structure, depth, and emotional tone:
- **Rembrandt Lighting:** Positioning the subject relative to the sun so that a small triangle of light illuminates the shadow cheek.
- **Butterfly Lighting:** Placing the sun directly behind the camera but high up, casting a butterfly-shaped shadow under the subject's nose.
- **Split Lighting:** Having the sun directly to the side, dividing the face into half light and half shadow for a high-contrast, dramatic look.

## Golden Hour Calibration

The golden hour (the period shortly after sunrise or before sunset) offers soft, diffused, warm light due to the sun's low angle in the sky:
- **Backlighting (Rim Light):** Placing the sun behind the subject to create a beautiful, glowing halo in their hair.
- **Frontal Warmth:** Facing the subject directly into the sun for a soft, low-contrast, highly flattering glow.

## Passive Fill Reflectors

To balance high-contrast sunlight without active strobes, a five-in-one reflector is essential:
- **White Reflective Panel:** Reflects a soft, neutral fill to open up dark shadows under the eyes.
- **Silver Panel:** Reflects a crisp, punchy light, ideal for overcast days when ambient light is too flat.
- **Gold Panel:** Adds an editorial warmth, best used sparingly during cool overcast windows.`
  },
  {
    target: "photography-hub",
    slug: "the-ultimate-prime-lens-guide",
    title: "The Ultimate Prime Lens Guide: 35mm vs 50mm vs 85mm",
    subtitle: "Spatial compression, aperture capabilities, and perspective distortion",
    description: "Breakdowns of focal lengths, spatial compression, and when to pick each prime for maximum sharpness.",
    category: "Gear Reviews",
    author: "Charlie",
    readTime: "9 min read",
    tags: ["Lenses", "Prime Lenses", "Gear Guides"],
    body: `# The Ultimate Prime Lens Guide: 35mm vs 50mm vs 85mm

While modern zoom lenses offer excellent versatility, prime lenses remain the gold standard for sharpness, low-light performance, and depth-of-field control. Let's compare the three most iconic prime focal lengths.

## 35mm: The Storyteller's Eye

The 35mm focal length offers a moderately wide perspective, closely mimicking human peripheral vision.
- **Perspective:** Minimal barrel distortion; captures the subject along with their environment.
- **Best Use Cases:** Environmental portraits, street photography, documentary work, and wedding reporting.
- **Aesthetic:** High depth-of-field even at wide apertures, keeping background details recognizable yet beautifully separated.

## 50mm: The Nifty Fifty

The 50mm is the most natural focal length, presenting zero perspective compression or distortion.
- **Perspective:** Extremely natural spatial relationships; what you see is what you get.
- **Best Use Cases:** General street portraits, lifestyle photography, and standard studio work.
- **Aesthetic:** Excellent balance of subject separation and background scale.

## 85mm: The Portrait Specialist

The 85mm focal length is engineered specifically for flattering human portraiture.
- **Perspective:** Subtle spatial compression that pulls the background closer and slims facial features.
- **Best Use Cases:** Close-up portraits, headshots, and fashion editorial work.
- **Aesthetic:** Razor-thin depth-of-field, rendering backgrounds into buttery, unrecognizable bokeh (circles of light).`
  },

  // Video Hub Posts
  {
    target: "video-hub",
    slug: "color-grading-in-davinci-resolve",
    title: "Color Grading in DaVinci Resolve: The Node Flow Manual",
    subtitle: "Structuring serial, parallel, and layer nodes for clean skin tones",
    description: "How to structure serial, parallel, and layer nodes for clean skin tones and consistent spatial exposure.",
    category: "Color Science",
    author: "Charlie",
    readTime: "10 min read",
    tags: ["DaVinci Resolve", "Color Grading", "Post Production"],
    body: `# Color Grading in DaVinci Resolve: The Node Flow Manual

Color grading is the process of defining the visual mood and consistency of your footage. In DaVinci Resolve, this is accomplished through a powerful, non-destructive node-based pipeline.

## Designing a Logical Node Tree

To ensure consistency and ease of revision, you must construct a standardized node flow. A recommended professional node tree includes:

\`\`\`
[Node 01: Exposure] -> [Node 02: Contrast/Pivot] -> [Node 03: Balance]
                                  |
                                  v
[Node 05: Color Space Transform] <--- [Node 04: Skin Tones (Parallel)]
\`\`\`

### 1. Exposure and Primaries
The first node should always be reserved for fundamental exposure adjustments (Luma lift, gamma, gain). This establishes your base signal.

### 2. Contrast and Pivot
Adjusting contrast on a separate node allows you to set the overall black and white boundaries, pivoting to control where the midpoint sits.

### 3. Temperature and Balance
Use the primary wheels to correct color casts, ensuring neutral grays and whites are balanced before applying creative lookup tables (LUTs).

### 4. Special Isolations (Parallel Nodes)
Parallel nodes allow you to perform selective secondary adjustments—such as sharpening skin tones or adjusting high-saturated greens—without one adjustment bleeding into the other.

## Color Space Transforms (CST)

Always grade in a wide working space (like DaVinci Wide Gamut/Intermediate) and use a Color Space Transform node at the very end of your tree to convert to your final display target (typically Rec.709 for web and YouTube). This preserves maximum dynamic range during adjustments.`
  },
  {
    target: "video-hub",
    slug: "pacing-and-retaining-attention-in-short-form-video",
    title: "Pacing and Retaining Attention in Short-Form Video",
    subtitle: "Jump cuts, pattern interrupts, and semantic sound design keys",
    description: "A frame-by-frame structural breakdown of jump cuts, pattern interrupts, and semantic sound design keys.",
    category: "Editing & Pacing",
    author: "Charlie",
    readTime: "7 min read",
    tags: ["Video Editing", "Shorts", "Social Media"],
    body: `# Pacing and Retaining Attention in Short-Form Video

With the rise of TikTok, YouTube Shorts, and Instagram Reels, the first three seconds of a video have become the ultimate battleground for viewer retention. Editing is no longer just about joining clips; it is about managing cognitive engagement.

## The Hook: First 3 Seconds

A successful hook must deliver immediate visual and auditory value:
- **The Visual Hook:** An action sequence, dynamic graphic, or unexpected perspective (e.g. action cam reframing) in the very first frame.
- **The Verbal Hook:** A compelling, high-stakes question or thesis statement. Avoid long introductions; state the value immediately.

## Pattern Interrupts

To prevent the viewer's brain from filtering out your content, you must introduce a visual or audio shift every **2.5 to 3 seconds**:
- **Zoom Jumps:** Punching in 10-15% on the same shot to simulate a camera move.
- **B-Roll & Graphics:** Cutting to clean, contextual visuals or floating text overlays.
- **Sound Effects:** Utilizing whooshes, risers, and pop sounds to emphasize visual transitions.

## Semantic Sound Design

Sound design is 50% of the viewing experience. While background music sets the emotional energy, selective sound effects direct attention. Keep Foley sounds aligned with the pacing of your dialogue to elevate production quality without cluttering the master track.`
  }
];

function generate() {
  const tmpDir = path.join(monorepoRoot, "scripts/_tmp_packets");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  console.log(`Generating ${samples.length} sample packets...`);
  
  for (const sample of samples) {
    const packetPath = path.join(tmpDir, `${sample.target}-${sample.slug}.json`);
    fs.writeFileSync(packetPath, JSON.stringify(sample, null, 2), "utf-8");
    
    console.log(`Created temporary packet: ${packetPath}`);
    
    // Invoke publish-packet.mjs
    const cmd = `node scripts/publish-packet.mjs scripts/_tmp_packets/${sample.target}-${sample.slug}.json`;
    console.log(`Executing: ${cmd}`);
    
    try {
      const output = execSync(cmd, { cwd: monorepoRoot, encoding: "utf-8" });
      console.log(output);
    } catch (err) {
      console.error(`Failed to publish: ${sample.slug}`, err);
    }
  }

  // Cleanup
  console.log("Cleaning up temporary packet files...");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Starter content population complete!");
}

generate();
