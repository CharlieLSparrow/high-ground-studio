export default function PaperCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[32px] border border-void/5 bg-paper px-8 py-12 text-void shadow-glass md:px-12 ${className}`}
    >
      {children}
    </div>
  );
}