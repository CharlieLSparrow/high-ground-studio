export default function PaperCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-void/5 bg-paper px-[30px] py-10 text-void shadow-glass ${className}`}
    >
      {children}
    </div>
  );
}