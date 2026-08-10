export function StatusPill({ value }: { value?: string | null }) {
  const label = value || "unknown";
  const classKey = label.replaceAll(" ", "_").toLowerCase();

  return (
    <span className={`pill pill--${classKey}`}>
      {label.replaceAll("_", " ")}
    </span>
  );
}
