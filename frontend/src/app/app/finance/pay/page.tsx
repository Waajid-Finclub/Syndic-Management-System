"use client";

/**
 * Payment.
 *
 * The amount is not editable. It is the sum of what is outstanding, computed
 * server-side from the ledger and re-derived there when the payment posts — a
 * client-supplied figure would be a number the account never agreed to.
 *
 * Offline the button is disabled rather than queued. A payment replayed hours
 * later against a balance that has since moved is worse than one that plainly
 * did not happen.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Banknote,
  CircleCheck,
  CreditCard,
  Lock,
  MessageSquare,
  Smartphone,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import {
  Balance,
  Card,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  formatShortDay,
  rs,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { AccountSummary, Invoice, Payment, PaymentMethod } from "@/lib/resident/types";

export default function PayScreen() {
  const router = useRouter();
  const online = useOnline();

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const summary = useResidentApi<{ account: AccountSummary; open_invoices: Invoice[] }>(
    "/api/resident/finance/summary",
  );
  const methods = useResidentApi<{ payment_methods: PaymentMethod[] }>(
    "/api/resident/finance/payment-methods",
  );

  // Derived rather than synced into state by an effect: until the resident
  // picks one, the selection *is* the default method.
  const available = methods.data?.payment_methods ?? [];
  const methodId =
    chosenId ?? available.find((method) => method.is_default)?.id ?? available[0]?.id ?? null;

  const pay = useAction(async () => {
    const payload = await api<{ payment: Payment; account: AccountSummary }>(
      "/api/resident/finance/payments",
      { method: "POST", body: { method_id: methodId } },
    );
    setReceipt(payload.payment);
  });

  const account = summary.data?.account;
  const invoices = summary.data?.open_invoices ?? [];

  if (receipt) {
    return <Receipt payment={receipt} onDone={() => router.replace("/app/finance")} />;
  }

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/finance" title="Pay service charges" />

      {summary.loading && !account ? <ScreenSkeleton rows={3} /> : null}
      {summary.stale || methods.stale ? <StaleDataNotice /> : null}

      {account && account.outstanding <= 0 ? (
        <Empty
          action={
            <button
              className="r-btn r-btn--sm"
              onClick={() => router.replace("/app/finance")}
              type="button"
            >
              Back to finances
            </button>
          }
          icon={CircleCheck}
          title="Nothing outstanding"
        >
          Your account is settled. There is nothing to pay right now.
        </Empty>
      ) : null}

      {account && account.outstanding > 0 ? (
        <>
          <Card accent>
            <div style={{ textAlign: "center" }}>
              <div className="r-label">Amount to pay</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Balance amount={account.outstanding} />
              </div>
              <div className="r-muted">
                {invoices.length} outstanding invoice{invoices.length === 1 ? "" : "s"}
              </div>
            </div>
          </Card>

          <div className="r-label" style={{ marginBottom: 7 }}>
            Payment method
          </div>
          {(methods.data?.payment_methods ?? []).map((method) => {
            const Icon = iconFor(method.method_type);
            const selected = method.id === methodId;
            return (
              <button
                className={`r-choice ${selected ? "is-selected" : ""}`}
                key={method.id}
                onClick={() => setChosenId(method.id)}
                type="button"
              >
                <span className="r-row__mark tint-neutral">
                  <Icon size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="r-row__title">{method.label}</span>
                  <span className="r-row__sub">{method.detail}</span>
                </span>
                <span className="r-choice__radio">
                  {selected ? <span className="r-choice__dot" /> : null}
                </span>
              </button>
            );
          })}

          <Card>
            <div className="r-label" style={{ marginBottom: 8 }}>
              Breakdown
            </div>
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--clg)",
                  fontSize: 12,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="text-mt">{invoice.title}</span>
                  {invoice.is_overdue ? (
                    <span className="r-muted" style={{ display: "block", fontSize: 10 }}>
                      Overdue since {formatShortDay(invoice.due_date)}
                    </span>
                  ) : null}
                </span>
                <span className="r-mono" style={{ fontWeight: 600, flexShrink: 0 }}>
                  {rs(invoice.balance)}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                paddingTop: 11,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
              <span className="r-mono" style={{ fontSize: 16, fontWeight: 700 }}>
                {rs(account.outstanding)}
              </span>
            </div>
          </Card>

          {pay.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {pay.error}
            </Notice>
          ) : null}

          {online ? null : (
            <Notice icon={WifiOff} tone="warn">
              You are offline. Payments are not queued — reconnect and try again.
            </Notice>
          )}

          <div className="r-actionbar">
            <button
              className="r-btn r-btn--accent r-btn--block"
              disabled={pay.pending || !methodId || !online}
              onClick={() => void pay.run()}
              type="button"
            >
              <Lock size={15} />
              {pay.pending ? "Processing…" : `Confirm payment — ${rs(account.outstanding)}`}
            </button>
            <div
              className="r-muted"
              style={{ marginTop: 8, textAlign: "center", fontSize: 10.5 }}
            >
              A receipt is sent by WhatsApp · Card details are never stored on this device
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Receipt({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  return (
    <div className="r-screen r-screen--plain">
      <div style={{ textAlign: "center", padding: "36px 0 20px" }}>
        <span className="r-row__mark tint-ok" style={{ width: 60, height: 60, borderRadius: 20, margin: "0 auto" }}>
          <CircleCheck size={28} />
        </span>
        <div style={{ fontSize: 19, fontWeight: 700, marginTop: 14, letterSpacing: "-0.02em" }}>
          Payment confirmed
        </div>
        <div className="r-muted" style={{ marginTop: 3 }}>
          {rs(payment.amount)} · {payment.method_label}
        </div>
      </div>

      <Card>
        <div className="r-label" style={{ marginBottom: 8 }}>
          Allocated to
        </div>
        {(payment.allocations ?? []).map((allocation) => (
          <div
            key={allocation.invoice_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "7px 0",
              borderBottom: "1px solid var(--clg)",
              fontSize: 12,
            }}
          >
            <span className="text-mt">{allocation.invoice_title}</span>
            <span className="r-mono" style={{ fontWeight: 600 }}>
              {rs(allocation.amount)}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 12 }}>
          <span className="text-mt">Reference</span>
          <span className="r-mono">{payment.reference}</span>
        </div>
      </Card>

      <Notice icon={MessageSquare} tone="ok">
        A receipt has been sent to your registered WhatsApp number.
      </Notice>

      <button className="r-btn r-btn--primary r-btn--block" onClick={onDone} type="button">
        Done
      </button>
    </div>
  );
}

function iconFor(type: PaymentMethod["method_type"]) {
  if (type === "bank") return Banknote;
  if (type === "wallet") return Smartphone;
  return CreditCard;
}
