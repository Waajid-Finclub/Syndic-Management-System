import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  tone = "text-[var(--cr)]",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  /** Percentage change; positive renders green, negative red. */
  trend?: number | null;
  tone?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__top">
        <div className="kpi-card__label">{label}</div>
        {trend === null || trend === undefined ? (
          <div className={`kpi-card__icon ${tone}`}>
            <Icon size={14} />
          </div>
        ) : (
          <span className={`kpi-card__trend ${trend < 0 ? "kpi-card__trend--down" : ""}`}>
            {trend < 0 ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <div className="kpi-card__body">
        <div className="kpi-card__value">{value}</div>
        {sub ? <div className="kpi-card__sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  center = false,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  center?: boolean;
  tone?: string;
}) {
  return (
    <div className={`metric-tile ${center ? "metric-tile--center" : ""}`}>
      <div className="metric-tile__label">{label}</div>
      <div className="metric-tile__value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub ? <div className="metric-tile__sub">{sub}</div> : null}
    </div>
  );
}
