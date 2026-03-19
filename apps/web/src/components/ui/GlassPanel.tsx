export default function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[30px] border border-white/10 bg-[rgba(10,21,24,0.34)] shadow-[0_28px_60px_rgba(0,0,0,0.22)] backdrop-blur-[10px] ${className}`}
    >
      {children}
    </div>
  );
}