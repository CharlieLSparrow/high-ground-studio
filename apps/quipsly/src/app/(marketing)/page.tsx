"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Feather, Leaf, BookOpen, Heart, Sparkles, Wand2, TreePine, FileText, Send, HelpCircle, Map, Lock, Star, ChevronDown, Check } from "lucide-react";

export default function QuipslyLandingPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "We tucked your name safely in our nest!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "A gust of wind blew the letter away. Try again?");
      }
    } catch (err) {
      setStatus("error");
      setMessage("A gust of wind blew the letter away. Try again?");
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
            <div className="w-10 h-10 flex items-center justify-center">
              <Feather className="w-6 h-6 text-[#a96735]" />
            </div>
            <span className="font-black text-2xl tracking-tight text-[#3d2618] font-serif">Quipsly</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium text-[#8c552e]">
             <a href="#features" className="hover:text-[#4a2e1c] transition-colors">How We Help</a>
             <a href="#flock" className="hover:text-[#4a2e1c] transition-colors">Meet the Flock</a>
             <a href="#manifesto" className="hover:text-[#4a2e1c] transition-colors">Our Philosophy</a>
             <a href="#pricing" className="hover:text-[#4a2e1c] transition-colors">Hire a Quipsly</a>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href="https://nest.quipsly.com" 
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
              Hello there! <br/>We're here to help you build your nest.
            </h1>
            
            <p className="text-lg md:text-xl text-[#8c552e] leading-relaxed max-w-lg font-sans">
              We are the Quipslys—a flock of curious, loyal little birds. We know you have so many wonderful ideas, stories, and words worth keeping. We'd love to organize them for you and help bring your creative projects to life!
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 font-sans" id="waitlist">
              {status === "success" ? (
                <div className="bg-[#fdf5eb] border border-[#c98b52] rounded-2xl p-4 flex items-center gap-4 animate-in fade-in zoom-in duration-300 w-full max-w-md shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-[#fae0b8] flex items-center justify-center text-[#8c552e] shrink-0">
                    <Heart className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#3d2618]">We kept your name safe!</h3>
                    <p className="text-[#8c552e] text-xs">A Quipsly will visit with your invite soon.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2 p-1.5 bg-white border border-[#e8d0b5] rounded-2xl focus-within:border-[#c98b52] focus-within:ring-2 focus-within:ring-[#fdf5eb] transition-all shadow-sm">
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Where should we send our letters?..." 
                    className="flex-1 bg-transparent border-none text-[#4a2e1c] px-4 py-3 focus:outline-none focus:ring-0 placeholder:text-[#c98b52]/60 text-sm"
                  />
                  <button 
                    disabled={status === "loading"}
                    type="submit"
                    className="bg-[#a96735] text-[#fdf5eb] px-6 py-3 rounded-xl font-bold hover:bg-[#8c552e] transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap text-sm shadow-sm"
                  >
                    {status === "loading" ? "Flying..." : "Invite us over"}
                  </button>
                </form>
              )}
            </div>
            <p className="text-xs text-[#a96735] font-medium font-sans italic">"Every quote has a home. Every story has a keeper."</p>
          </div>

          <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000">
            {/* Soft backdrop */}
            <div className="absolute inset-0 bg-[#fdf5eb] rounded-[2rem] blur-2xl transform rotate-3 scale-105" />
            
            <div className="relative bg-white p-3 rounded-[2rem] border border-[#e8d0b5] shadow-xl rotate-2 hover:rotate-0 transition-transform duration-700">
              <div className="bg-[#fffaf1] rounded-xl overflow-hidden border border-[#e8d0b5]/50 relative">
                <Image 
                  src="/images/examples/quipsly-character-states-brainstorm.png" 
                  alt="A flock of helpful Quipslys" 
                  width={800} 
                  height={600} 
                  className="w-full h-auto object-cover opacity-95 hover:opacity-100 transition-opacity mix-blend-multiply"
                  priority
                />
              </div>
            </div>
            
            {/* Whimsical scattered elements */}
            <div className="absolute -bottom-8 -left-8 bg-white p-3 rounded-full border border-[#e8d0b5] shadow-lg rotate-[-12deg] animate-bounce" style={{animationDuration: '3s'}}>
               <Feather className="w-6 h-6 text-[#c98b52]" />
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
          <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">We believe in a meaning layer.</h2>
          <p className="text-xl text-[#8c552e] leading-relaxed font-sans">
            The internet is loud. It's full of neon dopamine cannons and aggressive gamification that makes you feel bad if you miss a day. <strong>We don't like that.</strong>
          </p>
          <p className="text-xl text-[#8c552e] leading-relaxed font-sans">
            We built Quipsly to be a quiet, cozy place. A living archive of human wisdom where words are treated with respect, sources are rigorously verified, and your private creativity is treated like a fragile egg in a safe nest. We are your golden-retriever librarians—here to help, never to push.
          </p>
        </div>

        {/* Feature Narrative Grid */}
        <div id="features" className="max-w-7xl mx-auto mt-32">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">How can we help today?</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
               Instead of wrestling with complicated software, just tell us what you're working on. We'll scurry around the margins gathering references, drawing pictures, and organizing your thoughts into a beautiful nest.
             </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#fae0b8]/30 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-[#fdf5eb] flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Wand2 className="w-7 h-7 text-[#a96735]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll sketch your storyboards.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Give us your script, and we'll happily draw up vivid shot lists and cinematic frame previews. We love imagining the pictures that go with your words before you even pick up a camera.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#617c4d]/5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <TreePine className="w-7 h-7 text-[#617c4d]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll tend your Manuscript Desk.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Write seamlessly while we sit on the edge of your desk, holding your character bibles and world lore. We'll make sure every reference is exactly where you need it, when you need it.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#dc982f]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Send className="w-7 h-7 text-[#dc982f]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll deliver your messages.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Let us fly your marketing campaigns to the world. We can simulate audience personas, design custom funnels, and test your email sequences so your message always lands safely.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#617c4d]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Map className="w-7 h-7 text-[#617c4d]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll organize your Lorelists.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                You can build sequences of quotes around a theme, mood, or book. We'll weave them into beautiful "Nests" or "Lorelists" that feel like a curated playlist of human wisdom.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#7d5b86]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Lock className="w-7 h-7 text-[#7d5b86]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll verify your sources.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                We despise fake internet quotes! Before we add a quote to the public QuipLore archive, we rigorously track down the exact page, episode, and speaker so you can trust every word.
              </p>
            </div>

            <div className="bg-[#fffaf1] border border-[#e8d0b5] p-8 rounded-[2rem] hover:shadow-xl hover:-translate-y-2 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#c96b1c]/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 border border-[#e8d0b5] relative z-10 shadow-sm">
                <Star className="w-7 h-7 text-[#c96b1c]" />
              </div>
              <h3 className="text-2xl font-bold text-[#3d2618] mb-3 relative z-10">We'll craft your Quip Cards.</h3>
              <p className="text-[#8c552e] leading-relaxed text-sm font-sans relative z-10">
                Want to share a favorite sentence on social media? We'll hand-press beautiful shareable cards with full attribution, making sure the author's legacy is respected.
              </p>
            </div>
          </div>
        </div>

        {/* Meet the Flock */}
        <div id="flock" className="max-w-7xl mx-auto mt-32 py-16 border-y border-[#e8d0b5]/50 relative z-10">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">Meet the Flock.</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
               Not every Quipsly is the same! We are a diverse civilization of little keeper-birds, each with our own personalities, feather patterns, and specialties. Here are a few friends you might meet.
             </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
             <div className="bg-white p-6 rounded-[2rem] border border-[#e8d0b5] shadow-sm text-center group hover:border-[#c98b52] transition-colors">
                <div className="w-24 h-24 mx-auto bg-[#fdf5eb] rounded-full flex items-center justify-center mb-4 relative overflow-hidden group-hover:scale-105 transition-transform">
                   <Image src="/images/examples/quipsly-auto-trace-simple.svg" width={64} height={64} alt="The Librarian" className="relative z-10" />
                </div>
                <h4 className="font-bold text-[#3d2618] text-lg">The Librarian</h4>
                <p className="text-xs text-[#8c552e] mt-2 font-sans">Quiet, diligent, and obsessive about citing the exact page number of every quote.</p>
             </div>
             
             <div className="bg-white p-6 rounded-[2rem] border border-[#e8d0b5] shadow-sm text-center group hover:border-[#c98b52] transition-colors">
                <div className="w-24 h-24 mx-auto bg-[#617c4d]/10 rounded-full flex items-center justify-center mb-4 relative overflow-hidden group-hover:scale-105 transition-transform">
                   <Image src="/images/examples/quipsly-auto-trace-simple.svg" width={64} height={64} alt="The Storyboarder" className="relative z-10 opacity-90" style={{filter: 'hue-rotate(-45deg)'}} />
                </div>
                <h4 className="font-bold text-[#3d2618] text-lg">The Artist</h4>
                <p className="text-xs text-[#8c552e] mt-2 font-sans">Usually covered in ink. Loves translating your script into vivid visual frames.</p>
             </div>

             <div className="bg-white p-6 rounded-[2rem] border border-[#e8d0b5] shadow-sm text-center group hover:border-[#c98b52] transition-colors">
                <div className="w-24 h-24 mx-auto bg-[#dc982f]/10 rounded-full flex items-center justify-center mb-4 relative overflow-hidden group-hover:scale-105 transition-transform">
                   <Image src="/images/examples/quipsly-auto-trace-simple.svg" width={64} height={64} alt="The Messenger" className="relative z-10 opacity-90" style={{filter: 'hue-rotate(45deg)'}} />
                </div>
                <h4 className="font-bold text-[#3d2618] text-lg">The Messenger</h4>
                <p className="text-xs text-[#8c552e] mt-2 font-sans">Wears a tiny leather satchel. Delivers your marketing campaigns safely across the web.</p>
             </div>

             <div className="bg-white p-6 rounded-[2rem] border border-[#e8d0b5] shadow-sm text-center group hover:border-[#c98b52] transition-colors">
                <div className="w-24 h-24 mx-auto bg-[#7d5b86]/10 rounded-full flex items-center justify-center mb-4 relative overflow-hidden group-hover:scale-105 transition-transform">
                   <Image src="/images/examples/quipsly-auto-trace-simple.svg" width={64} height={64} alt="The Sleeper" className="relative z-10 opacity-80" />
                </div>
                <h4 className="font-bold text-[#3d2618] text-lg">The Night Watch</h4>
                <p className="text-xs text-[#8c552e] mt-2 font-sans">Monitors your background rendering tasks while you sleep. Loves a tiny lantern.</p>
             </div>
          </div>
        </div>

        {/* Playful Pricing / Adoption Section */}
        <div id="pricing" className="max-w-5xl mx-auto mt-32 text-center relative z-10">
          <div className="mb-16 space-y-4">
             <h2 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight">Hire your own flock.</h2>
             <p className="text-lg text-[#8c552e] max-w-2xl mx-auto font-sans">
               Whether you're a solo writer building your first nest, or an entire studio that needs a massive flock of researchers, we have a plan for you. (Seed and twigs not included).
             </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
             <div className="bg-white border border-[#e8d0b5] rounded-[2rem] p-8 shadow-sm flex flex-col">
                <h3 className="font-bold text-[#3d2618] text-xl">A Single Quipsly</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">Free</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">Perfect for curious readers who want to save quotes to their personal nest.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Access to QuipLore</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Build up to 5 Nests</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Basic Quip Cards</li>
                </ul>
                <button className="w-full mt-8 bg-[#fdf5eb] text-[#a96735] border border-[#e8d0b5] py-3 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors font-sans">
                  Start Reading
                </button>
             </div>

             <div className="bg-[#fffaf1] border-2 border-[#a96735] rounded-[2rem] p-8 shadow-xl flex flex-col relative transform md:-translate-y-4">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#a96735] text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider font-sans">
                  Most Popular
                </div>
                <h3 className="font-bold text-[#3d2618] text-xl">A Small Flock</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">$12</span><span className="text-[#8c552e] font-sans">/mo</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">For writers, creators, and marketers who need active AI agent assistance.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> The Manuscript Desk</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Unlimited Nests</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Basic AI Storyboarding</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Campaign Sandbox</li>
                </ul>
                <button className="w-full mt-8 bg-[#a96735] text-white py-3 rounded-xl font-bold hover:bg-[#8c552e] transition-colors font-sans">
                  Hire the Flock
                </button>
             </div>

             <div className="bg-white border border-[#e8d0b5] rounded-[2rem] p-8 shadow-sm flex flex-col">
                <h3 className="font-bold text-[#3d2618] text-xl">The Entire Aviary</h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-[#3d2618]">$49</span><span className="text-[#8c552e] font-sans">/mo</span>
                </div>
                <p className="text-sm text-[#8c552e] font-sans mb-6">For media empires and studios that require heavy compute and deep lore logic.</p>
                <ul className="space-y-3 text-sm text-[#8c552e] font-sans flex-1">
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Advanced AI Storyboarding</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Uncapped Agent Workflows</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Private Knowledge Graphs</li>
                   <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#617c4d]" /> Priority Support</li>
                </ul>
                <button className="w-full mt-8 bg-[#fdf5eb] text-[#a96735] border border-[#e8d0b5] py-3 rounded-xl font-bold hover:bg-[#fae0b8] transition-colors font-sans">
                  Go Enterprise
                </button>
             </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-32 relative z-10 mb-20">
           <h2 className="text-3xl font-bold text-[#3d2618] tracking-tight text-center mb-12">Letters we get often</h2>
           <div className="space-y-4">
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> What exactly is a Quipsly?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   We are a species of helpful little keeper-birds! We collect tiny fragments of human wisdom, verified quotes, and big ideas, and organize them so they're never lost. Sometimes we also help you write scripts and draw storyboards!
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> What's the difference between Quipsly and QuipLore?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   <strong>QuipLore</strong> is our massive public library—the verified quote archive where we store the best words in the world for everyone to read. <strong>Quipsly.com</strong> (here!) is where you hire us to be your private AI Agents to work on your own secret projects in your Nest.
                 </p>
              </div>
              <div className="bg-white border border-[#e8d0b5] rounded-2xl p-6 shadow-sm">
                 <h4 className="font-bold text-[#3d2618] flex items-center gap-3">
                   <HelpCircle className="w-5 h-5 text-[#a96735]" /> Are my private Nests safe?
                 </h4>
                 <p className="mt-3 text-sm text-[#8c552e] font-sans leading-relaxed">
                   Absolutely! We guard private nests with our lives. We will never share your private stories, marketing funnels, or secret storyboards with the public QuipLore archive without your explicit permission.
                 </p>
              </div>
           </div>
        </div>
        
        {/* The Final Co-pilot Pitch */}
        <div className="max-w-7xl mx-auto mt-32 bg-[#fffaf1] rounded-[3rem] border border-[#e8d0b5] p-12 shadow-md overflow-hidden relative flex flex-col md:flex-row items-center gap-12">
           <div className="md:w-1/2 space-y-6 z-10">
              <h3 className="text-4xl font-bold text-[#3d2618] leading-tight">Every creator deserves a flock.</h3>
              <p className="text-lg text-[#8c552e] font-sans">
                You do the dreaming, and we'll do the organizing. Quipsly gives you the warm, friendly tools used by industry professionals to build robust media empires, powered by little keepers who genuinely care about your work.
              </p>
              <div className="mt-8 font-sans">
                <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="bg-[#a96735] text-[#fdf5eb] px-8 py-4 rounded-xl font-bold hover:bg-[#8c552e] transition-colors shadow-sm flex items-center gap-2">
                  <Heart className="w-4 h-4 fill-current" /> Let's build something together
                </button>
              </div>
           </div>
           <div className="md:w-1/2 relative z-10 flex justify-center">
              <div className="p-4 bg-white rounded-3xl border border-[#e8d0b5] shadow-lg rotate-2 hover:rotate-0 transition-transform">
                <Image 
                  src="/images/examples/quipsly-character-model-sheet.png" 
                  alt="A helpful Quipsly offering a quote" 
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
            <Feather className="w-5 h-5 text-[#a96735]" />
            <span className="font-bold text-[#3d2618] font-serif text-xl tracking-wide">Quipsly</span>
          </div>
          <p className="italic text-[#a96735]">"Collect words. Build wisdom."</p>
          <div className="flex items-center gap-6">
            <a href="https://quiplore.com" className="hover:text-[#4a2e1c] transition-colors">Visit QuipLore</a>
            <a href="https://nest.quipsly.com" className="text-[#a96735] hover:text-[#4a2e1c] font-bold transition-colors">Your Nest</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
