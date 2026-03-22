type CharlieAsideProps = {
  children: React.ReactNode;
  title?: string;
};

export default function CharlieAside({
  children,
  title = "Charlie Aside",
}: CharlieAsideProps) {
  return (
    <aside className="my-8 rounded-[24px] border border-[rgba(255,122,24,0.14)] bg-[rgba(255,244,232,0.8)] px-6 py-6 shadow-[0_16px_30px_rgba(0,0,0,0.05)]">
      <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(180,102,24,0.92)]">
        {title}
      </div>

      <div className="text-[1rem] leading-8 text-[rgba(35,35,35,0.82)]">
        {children}
      </div>
    </aside>
  );
}