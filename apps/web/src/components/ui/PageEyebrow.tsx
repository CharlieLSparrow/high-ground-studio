export default function PageEyebrow({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 inline-block rounded-full border border-white/12 bg-white/10 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-light)]">
      {children}
    </div>
  );
}