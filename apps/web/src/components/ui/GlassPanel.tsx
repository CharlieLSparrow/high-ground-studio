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
        "rounded-[28px] border border-white/10 bg-[rgba(10,21,24,0.34)]",
        "backdrop-blur-[10px]",
        glow
          ? "shadow-[0_28px_60px_rgba(0,0,0,0.22)]"
          : "shadow-[0_18px_40px_rgba(0,0,0,0.18)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}