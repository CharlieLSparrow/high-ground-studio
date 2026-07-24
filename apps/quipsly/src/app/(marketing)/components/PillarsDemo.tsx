import Image from "next/image";
import { FolderHeart, Clapperboard, Globe2 } from "lucide-react";

export function PillarsDemo() {
  return (
    <section className="w-full py-24 bg-[#FAF9F6]">
      <div className="container px-4 md:px-6 mx-auto max-w-7xl">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-16">
          <div className="inline-block rounded-lg bg-[#f0e6d2] px-3 py-1 text-sm text-[#8c552e] font-semibold font-mono tracking-wide">
            Your Creative Lifecycle
          </div>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl text-[#3d2618] font-serif">
            Build in the Nest. Produce in the Studio. Broadcast from the Tower.
          </h2>
          <p className="max-w-[900px] text-[#5e4b3c] md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed font-sans">
            Quipsly is the complete operating system for creators who want to claim the high ground in their industry.
          </p>
        </div>

        <div className="space-y-24">
          {/* 1. Quipsly Nest */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f0e8] text-[#3d5a3d]">
                <FolderHeart className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold text-[#3d2618] font-serif">
                Quipsly Nest
              </h3>
              <p className="text-lg font-semibold text-[#8c552e] font-mono tracking-wide">
                Capture • Curate • Cultivate
              </p>
              <p className="text-[#5e4b3c] text-lg leading-relaxed font-sans">
                The messy, beautiful beginning of your best work. The Nest is a private sanctuary for every midnight inspiration, recorded brainstorming call, and raw podcast file. Dump your scattered thoughts here, and work alongside your Quipsly Assistants to help you tag, organize, and weave them into meaningful connections. They don't do the thinking for you; they fetch context, suggest links, and help you curate your chaos until you're ready to grow your ideas.
              </p>
            </div>
            <div className="relative group rounded-2xl overflow-hidden border border-[#e6dfd1] shadow-xl bg-white aspect-square lg:aspect-video flex items-center justify-center">
              <Image
                src="/marketing/quipsly_nest_mockup.png"
                alt="Quipsly Nest UI Mockup"
                fill
                className="object-cover hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>

          {/* 2. Quipsly Studio */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative group rounded-2xl overflow-hidden border border-[#e6dfd1] shadow-xl bg-white aspect-square lg:aspect-video flex items-center justify-center order-last lg:order-first">
              <Image
                src="/marketing/quipsly_studio_mockup.png"
                alt="Quipsly Studio UI Mockup"
                fill
                className="object-cover hover:scale-105 transition-transform duration-700"
              />
            </div>
            <div className="space-y-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0e6d2] text-[#8c552e]">
                <Clapperboard className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold text-[#3d2618] font-serif">
                Quipsly Studio
              </h3>
              <p className="text-lg font-semibold text-[#8c552e] font-mono tracking-wide">
                Create • Captivate • Integrate
              </p>
              <p className="text-[#5e4b3c] text-lg leading-relaxed font-sans">
                Turn raw research into finished art. When it's time to focus, move your ideas into the Studio. Whether you are cutting a podcast timeline, drafting a living manuscript, or weaving a visual Scroll Story, the Studio provides a calm, focused environment to shape your work without ever losing the thread of your original inspiration.
              </p>
            </div>
          </div>

          {/* 3. Quipsly Tower */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6f0fa] text-[#2c5282]">
                <Globe2 className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold text-[#3d2618] font-serif">
                Quipsly Tower
              </h3>
              <p className="text-lg font-semibold text-[#8c552e] font-mono tracking-wide">
                Publish • Analyze • Monetize
              </p>
              <p className="text-[#5e4b3c] text-lg leading-relaxed font-sans">
                Find clarity on the High Ground. Publishing shouldn't feel like a chaotic sprint across ten different platforms. The Tower gives you a peaceful, panoramic view of your entire creative ecosystem. Smoothly share your finished work with your Patreon supporters, podcast listeners, and readers from one quiet place. See how your audience responds, manage your revenue gracefully, and watch your community grow from a position of absolute clarity.
              </p>
            </div>
            <div className="relative group rounded-2xl overflow-hidden border border-[#e6dfd1] shadow-xl bg-white aspect-square lg:aspect-video flex items-center justify-center">
              <Image
                src="/marketing/quipsly_tower_mockup.png"
                alt="Quipsly Tower UI Mockup"
                fill
                className="object-cover hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
