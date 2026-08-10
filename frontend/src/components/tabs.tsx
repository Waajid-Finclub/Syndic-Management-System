"use client";

export type TabItem = {
  key: string;
  label: string;
  count?: number;
};

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div aria-label="Filter" className="tabs" role="tablist">
      {items.map((item) => (
        <button
          aria-selected={active === item.key}
          className={`tab ${active === item.key ? "is-active" : ""}`}
          key={item.key}
          onClick={() => onChange(item.key)}
          role="tab"
          type="button"
        >
          {item.label}
          {item.count === undefined ? "" : ` (${item.count})`}
        </button>
      ))}
    </div>
  );
}
