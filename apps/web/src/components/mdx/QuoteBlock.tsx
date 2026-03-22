type QuoteBlockProps = {
  children: React.ReactNode;
  attribution?: string;
  id?: string;
  themes?: string[];
};

export default function QuoteBlock({
  children,
  attribution,
  id,
  themes = [],
}: QuoteBlockProps) {
  return (
    <aside
      data-quote-id={id}
      className="my-8 rounded-[24px] border border-[rgba(125,91,52,0.12)] bg-[rgba(255,255,255,0.52)] px-6 py-6 shadow-[0_18px_36px_rgba(0,0,0,0.06)]"
    >
      <blockquote className="m-0 border-l-2 border-[rgba(255,154,61,0.6)] pl-4 text-[1.08rem] italic leading-8 text-[rgba(32,32,32,0.88)]">
        {children}
      </blockquote>

      {attribution ? (
        <div className="mt-4 text-[0.92rem] font-semibold text-[rgba(32,32,32,0.72)]">
          — {attribution}
        </div>
      ) : null}

      {themes.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {themes.map((theme) => (
            <span
              key={theme}
              className="rounded-full border border-[rgba(125,91,52,0.12)] bg-[rgba(255,255,255,0.55)] px-3 py-1 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[rgba(90,66,42,0.82)]"
            >
              {theme}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}