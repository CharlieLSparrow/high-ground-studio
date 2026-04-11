import { site } from "@/lib/site";
import AuthButtons from "@/components/site/AuthButtons";

export default function HeroSection() {
  return (
    <section className="relative flex h-[70vh] min-h-[500px] w-full flex-col items-center justify-center overflow-hidden bg-[rgba(10,21,24,0.8)] px-6 text-center">
      {/* Background Video (will show up once you add a bg-video.mp4 to your public folder!) */}
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 mix-blend-overlay"
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>

      <div className="relative z-10 max-w-[780px]">
        <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white md:text-7xl">
          Join the Odyssey
        </h1>
        <p className="mb-10 text-lg leading-relaxed text-white/90 md:text-xl">
          Sign in to join the community, save your progress, and get early access to new episodes and Homer's coaching scheduler.
        </p>
        <div className="flex justify-center scale-110">
          <AuthButtons />
        </div>
      </div>
    </section>
  );
}