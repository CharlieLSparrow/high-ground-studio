import React from "react";
import Link from "next/link";
import { Feather, ArrowLeft, Heart } from "lucide-react";

export default function SystemsAnxietyPage() {
  return (
    <div className="min-h-screen bg-[#f6efe6] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 overflow-x-hidden relative">
      {/* Soft parchment texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-20 mix-blend-multiply"
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#f6efe6]/90 backdrop-blur-md border-b border-[#e8d0b5]/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between font-sans">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 flex items-center justify-center">
              <Feather className="w-6 h-6 text-[#a96735]" />
            </div>
            <span className="font-black text-2xl tracking-tight text-[#3d2618] font-serif">Quipsly</span>
          </Link>
          <div className="flex items-center gap-4">
             <Link href="/" className="text-sm font-bold text-[#a96735] hover:text-[#4a2e1c] transition-colors flex items-center gap-2">
               <ArrowLeft className="w-4 h-4" /> Back to Home
             </Link>
          </div>
        </div>
      </nav>

      {/* Article Content */}
      <main className="pt-32 pb-24 px-6 relative z-10">
        <article className="max-w-3xl mx-auto bg-white border border-[#e8d0b5] rounded-[3rem] p-10 md:p-16 shadow-sm">

          <div className="mb-12 text-center">
             <div className="inline-block p-4 bg-[#fdf5eb] rounded-full mb-6 border border-[#e8d0b5] rotate-3">
               <Heart className="w-8 h-8 text-[#a96735] fill-[#a96735]/20" />
             </div>
             <h1 className="text-4xl md:text-5xl font-bold text-[#3d2618] tracking-tight leading-tight mb-6">
               Curing Systems Anxiety: Why AI Should Do The Admin (So You Can Do The Dreaming)
             </h1>
             <p className="text-[#a96735] font-sans font-bold uppercase tracking-widest text-sm">
               A small thesis by Charlie
             </p>
          </div>

          <div className="prose prose-lg prose-amber mx-auto text-[#8c552e] font-sans leading-relaxed space-y-6">
            <p className="text-xl leading-relaxed text-[#3d2618] font-serif">
              There is a particular kind of modern weariness that doesn't come from chopping wood or walking long distances. It comes from staring at a blinking cursor while twelve different productivity apps subtly suggest that you are failing at life.
            </p>

            <p>
              We call this <strong>Systems Anxiety</strong>.
            </p>

            <p>
              It is the creeping suspicion that you spend more time designing the perfect filing system for your ideas than you do actually having ideas. It's the moment you realize you've color-coded your manuscript's character tags in three different databases, but you haven't written a single word of dialogue since Tuesday.
            </p>

            <p>
              It is the heavy, administrative tax levied upon modern creativity.
            </p>

            <p>
              Currently, the technology industry often treats Artificial Intelligence like a magic text box. Ask, receive, copy, paste, repeat. That can be wonderful. Sometimes you really do want the machine to write the messy first draft, generate the painting, or compose the sonnet in three seconds flat. But what happens next? What if you want to understand the draft, reshape it, cite it, map its structure, turn it into a podcast, build a course from it, or make the thing truly yours? Too often the human author, academic, or creator is still left to organize the file folders, format the bibliography, update the spreadsheets, and debug the database.
            </p>

            <div className="my-10 p-8 bg-[#fdf5eb] rounded-2xl border-l-4 border-[#a96735]">
              <p className="text-xl font-serif text-[#3d2618] italic m-0">
                "If you pause for a moment to consider this arrangement, you might notice that it is completely, gloriously backwards."
              </p>
            </div>

            <p>
              Humans are quite good at dreaming. We are naturally prone to flights of fancy, to connecting the smell of rain on hot pavement to a feeling we had in 1994, and to telling stories about it. We are, historically speaking, somewhat less good at alphabetizing index cards, maintaining unbroken streaks in habit-tracking apps, or remembering exactly which digital notebook contains the brilliant thought we had in the shower.
            </p>

            <p>
              This is where the Quipslys come in.
            </p>

            <p>
              A Quipsly does not want to write your novel. A Quipsly would find the emotional vulnerability of writing a novel frankly terrifying. What a Quipsly <em>does</em> want to do—with the sort of fervent, unblinking enthusiasm usually reserved for golden retrievers spotting a tennis ball—is organize your index cards.
            </p>

            <p>
              Quipslys exist to cure Systems Anxiety. They are your loyal, indefatigable research assistants. They want to scurry around the margins of your work, fetching references, tracking down the exact page number of that quote you half-remember, and sketching the storyboards for your script so you can visualize the shot before you ever pick up a camera.
            </p>

            <p className="font-bold text-[#3d2618] text-xl">
              They want to gather the knowledge, so that you are free to create the wisdom.
            </p>

            <p>
              Because ultimately, creativity shouldn't feel like a data-entry job. It should feel like flying. And if you have a flock of tiny, loyal birds carrying all your heavy baggage below you... well, it's a lot easier to get off the ground.
            </p>
          </div>

        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e8d0b5] py-12 bg-[#fffaf1]/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-[#8c552e] text-sm font-medium font-sans">
          <div className="flex items-center gap-2">
            <Feather className="w-5 h-5 text-[#a96735]" />
            <span className="font-bold text-[#3d2618] font-serif text-xl tracking-wide">Quipsly</span>
          </div>
          <p className="italic text-[#a96735]">"Collect words. Build wisdom."</p>
          <div className="flex items-center gap-6">
            <Link href="https://quiplore.com" className="hover:text-[#4a2e1c] transition-colors">Visit QuipLore</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
