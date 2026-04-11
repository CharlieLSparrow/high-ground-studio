import { site } from "@/lib/site";

export default function HeroSection() {
  return (
    <section className="h-screen w-full bg-black/30 backdrop-blur-sm">
      <video className="w-full h-full object-cover" autoPlay muted loop>
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>

      <div className="max-w-[780px] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6">
        <p className="mb-0 mt-5 max-w-[700px] text-[clamp(1.04rem,2vw,1.18rem)] leading-8 text-[rgba(245,239,230,0.92)]">
          High Ground Odyssey is a podcast and storytelling project about leadership, legacy, family, and the lessons hidden inside ordinary life. Start with the opening episodes below.
        </p>
      </div>
    </section>
  );
}
