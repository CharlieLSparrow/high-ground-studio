export function StatPanel({
  items,
}: {
  readonly items: readonly {
    readonly label: string;
    readonly value: string | number;
  }[];
}) {
  return (
    <div className="mini-stat-grid">
      {items.map((item) => (
        <div className="mini-stat" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
