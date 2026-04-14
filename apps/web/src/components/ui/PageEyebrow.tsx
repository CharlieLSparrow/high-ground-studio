export default function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-block rounded-full border border-flare/20 bg-flare/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-flare">
      {children}
    </div>
  );
}