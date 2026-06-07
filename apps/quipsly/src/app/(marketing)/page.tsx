"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Leaf, BookOpen, Heart, Sparkles, Wand2, FileText, HelpCircle, Map, Lock, Check, Video, Mic, Shield, Share2, Gift, Bookmark, Film, MessageSquare, ImageIcon } from "lucide-react";
import { signIn } from "next-auth/react";
import {
  getGeneratedQuipslyArt,
  getGeneratedQuipslyArtByRole,
} from "@high-ground/quipsly-domain/generated-art";

export default function QuipslyLandingPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const brandMascot = {
    src: "/brand-quipsly-icon-source.png",
    alt: "Quipsly researcher mascot with a magnifying glass.",
  };
  const heroArt = getGeneratedQuipslyArt("curious-librarian");
  const scribeArt = getGeneratedQuipslyArt("tiny-scribe");
  const podcastArt = getGeneratedQuipslyArt("podcast-producers");
  const quoteArt = getGeneratedQuipslyArt("quip-lore-curators");
  const generatedShowcase = [
    heroArt,
    ...getGeneratedQuipslyArtByRole("generator").slice(0, 5),
    podcastArt,
    quoteArt,
  ];

  const handlePatreonSignIn = async () => {
    setStatus("loading");
    try {
      await signIn("patreon", { callbackUrl: "/welcome" });
    } catch (err) {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#f6efe6] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 overflow-x-hidden relative">

      {/* Soft parchment texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-20 mix-blend-multiply"
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#f6efe6]/90 backdrop-blur-md border-b border-[#e8d0b5]/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-sans">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-2xl border border-[#e8d0b5] bg-[#fffaf1] shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={44} height={44} className="h-full w-full object-cover" priority />
            </div>
            <span className="font-black text-2xl tracking-tight text-[#3d2618] font-serif">Quipsly</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium text-[#8c552e]">
             <a href="#features" className="hover:text-[#4a2e1c] transition-colors">How We Help</a>
             <a href="/quipslys" className="hover:text-[#4a2e1c] transition-colors">Meet the Quipslys</a>
             <a href="#foundry" className="hover:text-[#4a2e1c] transition-colors">Art Foundry</a>
             <a href="#manifesto" className="hover:text-[#4a2e1c] transition-colors">Our Philosophy</a>
             <a href="#pricing" className="hover:text-[#4a2e1c] transition-colors">Hire a Quipsly</a>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://nest.quipsly.com/projects"
              className="text-sm font-bold text-[#a96735] hover:text-[#4a2e1c] transition-colors hidden sm:block"
            >
              Return to Nest
            </a>
            <a
              href="#waitlist"
              className="text-sm font-bold bg-[#a96735] hover:bg-[#8c552e] text-[#fdf5eb] px-5 py-2.5 rounded-xl transition-all shadow-sm"
            >
              Get Access
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-16 px-6 relative z-10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">

          <div className="space-y-8 relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fdf5eb] text-[#a96735] text-xs font-bold uppercase tracking-widest border border-[#e8d0b5] font-sans shadow-sm">
              <Leaf className="w-3 h-3" />
              Tiny Keepers of Meaning
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#3d2618] leading-[1.1]">
              A creative OS for<br/><span className="text-3xl md:text-5xl text-[#a96735] font-serif block mt-4">writers, researchers, and publishers.</span>
            </h1>

            <p className="text-lg md:text-xl text-[#8c552e] leading-relaxed max-w-lg font-sans">
              Quipsly is a living workspace for manuscripts, research, media production, and publishing. Build one Nest for the work, then let your Quipslys collect examples, organize sources, prepare packets, and keep the scary systems work from swallowing the creative work.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 font-sans" id="waitlist">
              <button
                onClick={handlePatreonSignIn}
                disabled={status === "loading"}
                className="bg-[#a96735] text-[#fdf5eb] px-8 py-4 rounded-xl font-bold hover:bg-[#8c552e] transition-colors disabled:opacity-50 flex items-center gap-3 whitespace-nowrap shadow-sm text-lg"
              >
                <Lock className="w-5 h-5 fill-current opacity-70" />
                {status === "loading" ? "Authenticating..." : "Sign in with Patreon"}
              </button>
              <a
                href="https://patreon.com/HighGroundOdyssey"
                target="_blank"
                rel="noreferrer"
                className="bg-transparent border border-[#a96735] text-[#a96735] px-6 py-4 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm text-lg"
              >
                Join the $10 Tier
              </a>
            </div>
            <p className="text-xs text-[#a96735] font-medium font-sans italic">"Every quote has a home. Every story has a keeper."</p>
          </div>

          <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000">
            {/* Soft backdrop */}
            <div className="absolute inset-0 bg-[#fdf5eb] rounded-[2rem] blur-2xl transform rotate-3 scale-105" />

            <div className="relative bg-white p-3 rounded-[2rem] border border-[#e8d0b5] shadow-xl rotate-2 hover:rotate-0 transition-transform duration-700">
              <div className="bg-[#fffaf1] rounded-xl overflow-hidden border border-[#e8d0b5]/50 relative">
                <Image
                  src={brandMascot.src}
                  alt={brandMascot.alt}
                  width={800}
                  height={600}
                  className="w-full h-auto object-cover opacity-95 hover:opacity-100 transition-opacity"
                  priority
                />
              </div>
            </div>

            {/* Whimsical scattered elements */}
            <div className="absolute -bottom-8 -left-8 bg-white p-3 rounded-full border border-[#e8d0b5] shadow-lg rotate-[-12deg] animate-bounce" style={{animationDuration: '3s'}}>
               <Sparkles className="w-6 h-6 text-[#c98b52]" />
            </div>
            <div className="absolute -top-6 -right-6 bg-white p-3 rounded-full border border-[#e8d0b5] shadow-lg rotate-[15deg] animate-pulse delay-150">
               <BookOpen className="w-6 h-6 text-[#c98b52]" />
            </div>
          </div>
        </div>

        {/* The Problem Manifesto */}
        <div id="manifesto" className="max-w-4xl mx-auto mt-32 text-center space-y-8 relative z-10 bg-[#fdf5eb] p-12 rounded-[3rem] border border-[#e8d0b5] shadow-sm">
          <div className="inline-block p-4 bg-white rounded-full mb-4 border border-[#e8d0b5] shadow-sm rotate-3">
             <Heart className="w-8 h-8 text-[#a96735] fill-[#a96735]/20" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">Curing Systems Anxiety.</h2>
          <p className="text-xl text-[#8c552e] leading-relaxed font-sans">
            Most Generative AI wants to do the human part of creativity—like writing your novel or designing your art—while leaving you to do all the tedious admin work. <strong>We think that's exactly backwards.</strong>
          </p>
          <p className="text-xl text-[#8c552e] leading-relaxed font-sans">
            Quipslys are built to cure <em>Systems Anxiety</em>. We love doing the heavy lifting, the deep digging, and the administrative organizing. We gather and organize the knowledge so you can create the wisdom. We are your golden-retriever research assistants—here to handle the citations, the lore bibles, and the tedious busywork so you can do what humans do best: write, dream, and create.
          </p>
          <div className="pt-4 font-sans">
            <a href="/philosophy/systems-anxiety" className="inline-flex items-center justify-center font-bold text-[#a96735] hover:text-[#8c552e] underline underline-offset-4 transition-colors">
              Read our full thesis on Systems Anxiety &rarr;
            </a>
          </div>
        </div>

        {/* Generated Quipsly Field Guide */}
        <section id="foundry" className="max-w-7xl mx-auto mt-32 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d0b5] bg-[#fdf5eb] px-4 py-1.5 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
              <Wand2 className="h-3.5 w-3.5" />
              Quipsly Image Foundry
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-[#3d2618] tracking-tight">
              Generate the helper you need for the work in front of you.
            </h2>
            <p className="font-sans text-lg leading-8 text-[#8c552e]">
              Quipslys are visual companions as much as software agents. The same system that tracks your sources, scripts, and publishing packets can also keep a reusable character library: librarians for research, scribes for writing, producers for podcasts, and little quote curators for QuipLore.
            </p>
            <div className="grid gap-3 font-sans text-sm text-[#8c552e] sm:grid-cols-2">
              {[
                "Save the prompt seed with every useful character.",
                "Reuse approved art across Quipsly, QuipLore, and High Ground Odyssey.",
                "Keep the style warm, helpful, and source-aware.",
                "Generate variants on demand instead of rebuilding brand art from scratch.",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-[#e8d0b5] bg-white/80 p-4 shadow-sm">
                  <Check className="mb-2 h-4 w-4 text-[#617c4d]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {generatedShowcase.map((item, index) => (
              <div
                key={item.id}
                className={`group overflow-hidden rounded-[1.5rem] border border-[#e8d0b5] bg-white p-2 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${
                  index % 3 === 0 ? "sm:translate-y-6" : ""
                }`}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={260}
                  height={260}
                  className="aspect-square w-full rounded-[1.15rem] object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="px-2 py-3 font-sans">
                  <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-[#a96735]">{item.role}</p>
                  <p className="mt-1 truncate text-sm font-bold text-[#3d2618]">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Narrative Grid */}
        <div id="features" className="max-w-7xl mx-auto mt-32">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">How can we help today?</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
               Instead of wrestling with complicated software, just tell us what you're researching. We'll scurry around the margins of your manuscript gathering references, drawing pictures, and organizing your thoughts into a beautiful nest.
             </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#fae0b8]/30 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-[#fdf5eb] flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Video className="w-7 h-7 text-[#a96735]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">YouTube & Video Prep.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Import your raw clips, and we'll help you find the best moments. We'll sync them with your episode manuscript and help you map out edit markers so you can cut faster in Premiere or Final Cut.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#617c4d]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Mic className="w-7 h-7 text-[#617c4d]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">Publishing Packets.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Write your show notes in one living manuscript. We'll help tag chapters, organize audio clips, and prepare the text metadata you need for a smooth publishing session.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#dc982f]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <BookOpen className="w-7 h-7 text-[#dc982f]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">Enthusiastic Researchers.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Need a historical quote or a specific stat? We'll scour your archives and imported sources to find perfect examples and context, always returning with verified sources and exact citations.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#617c4d]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Shield className="w-7 h-7 text-[#617c4d]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">You always hold the pen.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                We are librarians first and co-drafters when invited. We can draft options, rewrite passages, and format references, but nothing becomes your final content until you inspect, edit, and approve it.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#7d5b86]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <FileText className="w-7 h-7 text-[#7d5b86]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">Study Documents.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Create source-first study documents by importing books, course pages, and articles. Layer your own highlights, notes, and analysis over the source material without destroying the original text.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#c96b1c]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Map className="w-7 h-7 text-[#c96b1c]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">Living Manuscripts.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Whether you're writing a book, an article, or a script, work in a living manuscript. Tag chapters, filter by lenses, and prepare your work for publishing—all within a unified, beautiful document.
              </p>
            </div>
          </div>
        </div>

        {/* Unified Platform Pitch */}
        <div className="max-w-7xl mx-auto mt-32 bg-[#3d2618] text-[#fdf5eb] rounded-[3rem] p-12 lg:p-16 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#a96735]/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#c96b1c]/20 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto text-center mb-16 space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[#fdf5eb]">One source. Many outputs.</h2>
            <p className="text-lg md:text-xl text-[#e8d0b5] font-sans leading-relaxed">
              Tired of copying your manuscript into five different tools just to publish an episode? Write, research, and organize your core ideas once in your Nest. Your Quipsly will then help you prepare that single source of truth into native formats across all your channels.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 gap-6 font-sans">
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <Mic className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Podcast Episode Pages</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <Video className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">YouTube, Reels & Shorts</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <Film className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Social Clips & GIFs</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <MessageSquare className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Quote Cards & Feeds</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <FileText className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Articles & Blog Posts</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <BookOpen className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Courses & Mobile Lessons</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <Bookmark className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Books & Kindle Prep</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <Gift className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Patreon Packages</span>
            </div>
            <div className="bg-[#4a2e1c]/50 border border-[#a96735]/30 p-6 rounded-2xl flex flex-col items-center text-center gap-3 hover:bg-[#a96735]/20 transition-colors">
              <ImageIcon className="w-8 h-8 text-[#f4dab0]" />
              <span className="font-bold text-sm">Scroll Stories & Comics</span>
            </div>
          </div>
        </div>

        {/* Meet the Quipslys */}
        <div id="quipslys" className="max-w-7xl mx-auto mt-32 py-16 border-y border-[#e8d0b5]/50 relative z-10">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">Meet the Quipslys.</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
               Not every Quipsly is the same! We are a diverse civilization of little keeper-birds, each with our own personalities, feather patterns, and specialties. Here are a few friends you might meet.
             </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
             {[
                {
                  image: brandMascot.src,
                  alt: brandMascot.alt,
                  name: "The Researcher",
                  copy: "Magnifying glass first, conclusions later. Finds examples, citations, and hidden connective tissue.",
                },
                {
                  image: scribeArt.src,
                  alt: scribeArt.alt,
                  name: "The Scribe",
                  copy: "Helps draft, revise, summarize, and reshape work while keeping every change inspectable.",
                },
                {
                  image: podcastArt.src,
                  alt: podcastArt.alt,
                  name: "The Producer",
                  copy: "Keeps scripts, clips, recording notes, and publishing packets pointed at the same episode.",
                },
                {
                  image: quoteArt.src,
                  alt: quoteArt.alt,
                  name: "The Curator",
                  copy: "Builds quote collections, attribution notes, source trails, and reusable wisdom cards.",
                },
             ].map((quipsly) => (
                <div key={quipsly.name} className="bg-white p-6 rounded-[2rem] border border-[#e8d0b5] shadow-sm text-center group hover:border-[#c98b52] transition-colors">
                  <div className="w-24 h-24 mx-auto bg-[#fdf5eb] rounded-full flex items-center justify-center mb-4 relative overflow-hidden group-hover:scale-105 transition-transform border border-[#e8d0b5]">
                    <Image src={quipsly.image} width={96} height={96} alt={quipsly.alt} className="h-full w-full object-cover" />
                  </div>
                  <h4 className="font-bold text-[#3d2618] text-lg">{quipsly.name}</h4>
                  <p className="text-xs text-[#8c552e] mt-2 font-sans">{quipsly.copy}</p>
                </div>
             ))}
          </div>
        </div>

        {/* Playful Pricing / Adoption Section */}
        <div id="pricing" className="max-w-5xl mx-auto mt-32 text-center relative z-10">
          <div className="mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">Beta Access via Patreon.</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
              Quipsly is currently in a private Beta. Rather than standard software subscriptions, we bundle full access as a perk for active paid High Ground Odyssey Patreon supporters so we can build alongside our community.
             </p>
             <p className="text-sm font-bold text-[#a96735] max-w-xl mx-auto bg-[#fdf5eb] p-4 rounded-xl border border-[#e8d0b5] shadow-sm font-sans">
               <strong>Note:</strong> Any active paid Patreon tier qualifies. You won't be charged separately for Quipsly, but it may take a few minutes for your Patreon status to sync and unlock your workspace after you sign in.
             </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
             <div className="bg-white border border-[#e8d0b5] rounded-[2rem] p-8 shadow-sm flex flex-col">
                <h3 className="font-bold text-[#3d2618] text-xl">The Reader</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">Free</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">For listeners and readers who want to save quotes from our episodes into their personal nest.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Access to QuipLore</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Build up to 3 Nests</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Basic Study Documents</li>
                </ul>
                <button
                  onClick={handlePatreonSignIn}
                  disabled={status === "loading"}
                  className="w-full mt-8 bg-[#fdf5eb] text-[#a96735] border border-[#e8d0b5] py-3 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors font-sans flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4 fill-current opacity-70" /> Sign In
                </button>
             </div>

             <div className="bg-[#fffaf1] border-2 border-[#a96735] rounded-[2rem] p-8 shadow-xl flex flex-col relative transform md:-translate-y-4">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#a96735] text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider font-sans">
                  Full Beta Access
                </div>
                <h3 className="font-bold text-[#3d2618] text-xl">The Creator Marginalia</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">$10</span><span className="text-[#8c552e] font-sans">/mo</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">For writers, creators, and students who need active AI agent assistance.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> The Manuscript Desk</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Unlimited Nests & Imports</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> AI Research Assistants</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> HGO Publishing Integration</li>
                </ul>
                <a
                  href="https://patreon.com/HighGroundOdyssey"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full mt-8 bg-[#a96735] text-white py-3 rounded-xl font-bold hover:bg-[#8c552e] transition-colors font-sans flex items-center justify-center text-center"
                >
                  Join the $10 Tier
                </a>
             </div>

             <div className="bg-white border border-[#e8d0b5] rounded-[2rem] p-8 shadow-sm flex flex-col">
                <h3 className="font-bold text-[#3d2618] text-xl">The Entire Aviary</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">$50</span><span className="text-[#8c552e] font-sans">/mo</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">For studios and frequent publishers that require deep lore logic and heavier compute.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> All Creator Marginalia Features</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Video Edit Prep Assistant</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Early Access to New Agents</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Advanced Storyboarding</li>
                </ul>
                <a
                  href="https://patreon.com/HighGroundOdyssey"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full mt-8 bg-[#fdf5eb] text-[#a96735] border border-[#e8d0b5] py-3 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors font-sans flex items-center justify-center text-center"
                >
                  Join the $50 Tier
                </a>
             </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-32 relative z-10 mb-20">
           <h2 className="text-3xl font-bold text-[#3d2618] tracking-tight text-center mb-12">Letters we get often</h2>
           <div className="space-y-4">
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> Does Quipsly write for me?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   Yes, when you ask it to. A Quipsly can draft rough options, rewrite a section, or pull a sourced quote, but it will not silently replace your work or pretend a draft is final. We believe AI should cure administrative anxiety and help you shape ideas without stealing the pen.
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> How does the video editor workflow help?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   While we don't render the final video for you, we help you prepare for the cut. You can import raw clips, and your Quipsly will help you track the best moments, sync them to your script, and outline edit markers to speed up your process in Premiere or Final Cut.
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> Can I use it for podcasts?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   Absolutely! You can write your show notes in one living manuscript. A Quipsly can help tag chapters, organize audio clip markers, and keep your recording sessions perfectly on track before you move to final editing.
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> Can I use it for academic or research projects?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   Yes, that's what we do best! If you need a historical quote or a specific stat, we'll scour the archives to find perfect examples. We always return with verified sources and exact citations—we despise fake internet quotes!
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> What does "Human Approval" mean?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   It means you are completely in control. Every suggestion, quote retrieval, or format change a Quipsly makes is fully inspectable, approvable, and completely reversible. Nothing goes into your manuscript without you saying yes.
                 </p>
              </div>
           </div>
        </div>

        {/* The Final Co-pilot Pitch */}
        <div className="max-w-7xl mx-auto mt-32 bg-[#fffaf1] rounded-[3rem] border border-[#e8d0b5] p-12 shadow-md overflow-hidden relative flex flex-col md:flex-row items-center gap-12">
           <div className="md:w-1/2 space-y-6 z-10">
              <h3 className="text-4xl font-bold text-[#3d2618] leading-tight">Every creator deserves a tiny research department.</h3>
              <p className="text-lg text-[#8c552e] font-sans">
                You do the dreaming, and we'll do the organizing. Quipsly gives you the warm, friendly tools used by industry professionals to build robust media empires, powered by little keepers who genuinely care about your work.
              </p>
              <p className="text-sm font-bold text-[#a96735] uppercase tracking-wider font-sans">
                Included in High Ground Odyssey's $10+ Tiers
              </p>
              <div className="mt-8 font-sans flex flex-wrap gap-4">
                <button onClick={handlePatreonSignIn} className="bg-[#a96735] text-[#fdf5eb] px-8 py-4 rounded-xl font-bold hover:bg-[#8c552e] transition-colors shadow-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 fill-current opacity-70" /> Sign in with Patreon
                </button>
                <a href="https://patreon.com/HighGroundOdyssey" target="_blank" rel="noreferrer" className="bg-transparent text-[#a96735] border border-[#a96735] px-8 py-4 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors shadow-sm flex items-center gap-2">
                  Upgrade Tier
                </a>
              </div>
           </div>
           <div className="md:w-1/2 relative z-10 flex justify-center">
              <div className="p-4 bg-white rounded-3xl border border-[#e8d0b5] shadow-lg rotate-2 hover:rotate-0 transition-transform">
                <Image
                  src={podcastArt.src}
                  alt={podcastArt.alt}
                  width={400}
                  height={400}
                  className="w-full h-auto mix-blend-multiply rounded-xl"
                />
              </div>
           </div>

           {/* Warm glowing background elements */}
           <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-[#fae0b8]/30 rounded-full blur-3xl pointer-events-none" />
           <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#fdf5eb]/50 rounded-full blur-3xl pointer-events-none" />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e8d0b5] py-12 mt-20 bg-[#fffaf1]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-[#8c552e] text-sm font-medium font-sans">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 overflow-hidden rounded-xl border border-[#e8d0b5] bg-white shadow-sm">
              <Image src="/quipsly-app-icon.png" alt="Quipsly" width={32} height={32} className="h-full w-full object-cover" />
            </span>
            <span className="font-bold text-[#3d2618] font-serif text-xl tracking-wide">Quipsly</span>
          </div>
          <p className="italic text-[#a96735]">"Collect words. Build wisdom."</p>
          <div className="flex items-center gap-6">
            <a href="https://quiplore.com" className="hover:text-[#4a2e1c] transition-colors">Visit QuipLore</a>
            <a href="https://nest.quipsly.com/projects" className="text-[#a96735] hover:text-[#4a2e1c] font-bold transition-colors">Your Nest</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
