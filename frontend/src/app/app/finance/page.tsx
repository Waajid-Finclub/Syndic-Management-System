"use client";

/**
 * Finance — the account: what is owed, what has been charged, what was paid.
 *
 * Invoices, payments and charging sessions are one stream rather than three
 * tabs, because a resident reconciling their account thinks in dates, not in
 * record types. The filter chips narrow that stream instead of splitting it.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CreditCard,
  FileText,
  Receipt,
  SquareParking,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Balance,
  Card,
  Chips,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  Status,
  formatShortDay,
  rs,
  rsCompact,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import { useResident } from "@/lib/resident/session";
import type { AccountSummary, Invoice, Transaction } from "@/lib/resident/types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "service_charges", label: "Charges" },
  { key: "payments", label: "Payments" },
  { key: "ev", label: "EV charging" },
];

export default function FinanceScreen() {
  const router = useRouter();
  const { unit } = useResident();
  const [filter, setFilter] = useState("all");

  const summary = useResidentApi<{ account: AccountSummary; open_invoices: Invoice[] }>(
    "/api/resident/finance/summary",
  );
  const activity = useResidentApi<{ transactions: Transaction[] }>(
    `/api/resident/finance/transactions?filter=${filter}`,
  );

  const account = summary.data?.account;

  return (
    <div className="r-screen">
      <ScreenHeader
        action={
          <button
            className="r-btn r-btn--sm"
            onClick={() => router.push("/app/finance/statement")}
            type="button"
          >
            <Receipt size={14} />
            Statement
          </button>
        }
        subtitle={
          unit
            ? `Unit ${unit.label} · share ${unit.share_value.toLocaleString("en-GB")} / ${unit.total_shares.toLocaleString("en-GB")}`
            : null
        }
        title="My finances"
      />

      {summary.loading && !account ? <ScreenSkeleton rows={5} /> : null}
      {summary.stale || activity.stale ? <StaleDataNotice /> : null}

      {account ? (
        <>
          <Card accent>
            <div className="r-label">Account balance</div>
            <Balance
              amount={account.outstanding}
              tone={account.outstanding <= 0 ? "clear" : account.is_overdue ? "due" : "neutral"}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {account.outstanding <= 0 ? (
                <span className="pill pill--paid">Settled</span>
              ) : account.is_overdue ? (
                <>
                  <span className="pill pill--overdue">Overdue</span>
                  <span className="r-muted">since {formatShortDay(account.overdue_since)}</span>
                </>
              ) : (
                <>
                  <span className="pill pill--issued">Due</span>
                  <span className="r-muted">{formatShortDay(account.next_due_date)}</span>
                </>
              )}
            </div>
          </Card>

          <div className="r-stat-strip">
            <div className="r-stat">
              <div className="r-stat__value text-ok">{rsCompact(account.paid_ytd)}</div>
              <div className="r-stat__label">Paid YTD</div>
            </div>
            <div className="r-stat">
              <div className={`r-stat__value ${account.outstanding > 0 ? "text-er" : ""}`}>
                {rsCompact(account.outstanding)}
              </div>
              <div className="r-stat__label">Outstanding</div>
            </div>
            <div className="r-stat">
              <div className="r-stat__value">{rsCompact(account.ev_this_month)}</div>
              <div className="r-stat__label">EV this month</div>
            </div>
            <div className="r-stat">
              <div className={`r-stat__value ${account.credit > 0 ? "text-ok" : "text-mt"}`}>
                {rsCompact(account.credit)}
              </div>
              <div className="r-stat__label">Credit</div>
            </div>
          </div>

          <Chips onChange={setFilter} options={FILTERS} value={filter} />

          {activity.data && activity.data.transactions.length === 0 ? (
            <Empty icon={Wallet} title="Nothing to show">
              No entries match this filter.
            </Empty>
          ) : null}

          {activity.data && activity.data.transactions.length > 0 ? (
            <div className="r-list">
              {activity.data.transactions.map((entry) => (
                <TransactionRow
                  entry={entry}
                  key={`${entry.kind}-${entry.id}`}
                  onOpen={() =>
                    entry.kind === "invoice"
                      ? router.push(`/app/finance/invoices/${entry.id}`)
                      : entry.kind === "ev_session"
                        ? router.push("/app/assets/ev")
                        : undefined
                  }
                />
              ))}
            </div>
          ) : null}

          {account.outstanding > 0 ? (
            <div className="r-actionbar">
              <button
                className="r-btn r-btn--accent r-btn--block"
                onClick={() => router.push("/app/finance/pay")}
                type="button"
              >
                <CreditCard size={16} />
                Pay {rs(account.outstanding)}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {summary.error && !account ? (
        <Empty icon={TriangleAlert} title="Could not load your account">
          {summary.error}
        </Empty>
      ) : null}
    </div>
  );
}

function TransactionRow({ entry, onOpen }: { entry: Transaction; onOpen: () => void }) {
  const credit = entry.amount > 0;
  const { icon: Icon, tone } = presentation(entry);
  const interactive = entry.kind !== "payment";

  const content = (
    <>
      <span className={`r-row__mark ${tone}`}>
        <Icon size={15} />
      </span>
      <span className="r-row__body">
        <span className="r-row__title">{entry.description}</span>
        <span className="r-row__sub r-mono">
          {entry.reference} · {formatShortDay(entry.occurred_on)}
        </span>
      </span>
      <span className="r-row__end">
        <span className={`r-row__amount ${credit ? "text-ok" : ""}`}>
          {credit ? "+" : ""}
          {rs(entry.amount)}
        </span>
        <Status value={entry.status} />
      </span>
    </>
  );

  if (!interactive) {
    return <div className="r-row">{content}</div>;
  }

  return (
    <button className="r-row" onClick={onOpen} type="button">
      {content}
    </button>
  );
}

function presentation(entry: Transaction) {
  if (entry.kind === "payment") return { icon: CreditCard, tone: "tint-ok" };
  if (entry.kind === "ev_session") return { icon: Zap, tone: "tint-tl" };
  if (entry.invoice_type === "parking") return { icon: SquareParking, tone: "tint-blu" };
  if (entry.invoice_type === "ev_charging") return { icon: Zap, tone: "tint-tl" };
  return { icon: FileText, tone: "tint-wn" };
}
