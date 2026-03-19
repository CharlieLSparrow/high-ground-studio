export default function PaperCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-[rgba(32,32,32,0.06)] bg-[var(--paper-strong)] px-[30px] py-10 text-[var(--text-dark)] shadow-[0_24px_70px_rgba(0,0,0,0.16)] ${className}`}
    >
      {children}
    </div>
  );
}