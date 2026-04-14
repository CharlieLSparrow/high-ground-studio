type GlassPanelProps = {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
};

export default function GlassPanel({
  children,
  className = "",
  glow = false,
}: GlassPanelProps) {
  return (
    <div
      className={[
        // Deep cinematic background with a blur. 
        // We use void-light mixed with transparency for that premium lens feel.
        "rounded-[28px] border bg-void-light/40 backdrop-blur-[12px] transition-all duration-300",
        // The glow prop toggles between our two standard cinematic shadows
        glow 
          ? "border-flare/20 shadow-glass-glow" 
          : "border-white/5 shadow-glass",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}