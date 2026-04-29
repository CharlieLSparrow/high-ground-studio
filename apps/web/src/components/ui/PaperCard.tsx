export default function PaperCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[32px] border border-[rgba(37,28,20,0.1)] bg-[rgba(245,236,223,0.98)] px-8 py-12 text-[#1d1712] shadow-[0_24px_60px_rgba(25,18,12,0.16)] md:px-12 ${className}`}
    >
      {children}
    </div>
  );
}
