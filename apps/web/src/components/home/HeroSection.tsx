import AuthButtons from "@/components/site/AuthButtons";

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center overflow-hidden bg-void px-6 text-center">
      {/* 🎭 THE CINEMATIC BACKDROP */}
      <div className="absolute inset-0 z-0">
        {/* 1. The Image: Put your high-res landscape in /public/hero-bg.jpg 
          2. Mix-Blend: luminosity makes it feel like part of the Teal grade.
        */}
        <div 
          className="h-full w-full animate-slow-pan bg-[url('/hero-bg.jpg')] bg-cover bg-center opacity-30 mix-blend-luminosity"
          aria-hidden="true"
        />
        
        {/* 3. The Radial Spotlight: Keeps the center bright and the edges dark */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-void)_100%)] opacity-90" />
        
        {/* 4. The Bottom Fade: Fades the hero perfectly into the next section */}
        <div className="absolute inset-0 bg-gradient-to-b from-void/40 via-transparent to-void" />
      </div>

      <div className="relative z-10 max-w-[900px]">
        {/* Typography: Tightened tracking and heavy weight for a 'Film Title' feel */}
        <h1 className="mb-6 text-[clamp(3.5rem,9vw,7rem)] font-black leading-[0.88] tracking-[-0.06em] text-subject drop-shadow-2xl">
          JOIN THE <br/>
          <span className="text-flare">ODYSSEY</span>
        </h1>
        
        <p className="mx-auto mb-10 max-w-[620px] text-[clamp(1.1rem,2.2vw,1.4rem)] font-medium leading-relaxed text-subject-muted">
          Sign in to join the community, save your progress, and get early access to 
          new episodes and Homer's coaching scheduler.
        </p>

        <div className="flex justify-center scale-125">
          <AuthButtons />
        </div>
      </div>
      
      {/* Subtle hint of the Flare orange at the very bottom */}
      <div className="absolute bottom-12 h-1 w-12 rounded-full bg-flare/30 blur-sm" />
    </section>
  );
}