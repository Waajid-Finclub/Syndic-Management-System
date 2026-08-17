"use client";

/**
 * Invoice detail — the full breakdown behind one charge.
 *
 * Line items are shown in full rather than summarised. A service charge is
 * apportioned by share, and the only way a co-owner can check that it was
 * apportioned correctly is to see what it is made of.
 *
 * The PDF is fetched through the API client rather than linked, so it carries
 * the session cookie and reports a failure as a message rather than as a
 * broken tab.
 */

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, Download, FileText, TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/resident/sheet";
import {
  Card,
  DefRow,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  Status,
  formatDay,
  rs,
} from "@/components/resident/ui";
import { api, downloadFile } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { Invoice } from "@/lib/resident/types";

export default function InvoiceDetailScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data, loading, error, setData, stale } = useResidentApi<{ invoice: Invoice }>(
    `/api/resident/finance/invoices/${params.id}`,
  );
  const invoice = data?.invoice;

  const download = useAction(async () => {
    await downloadFile(
      `/api/resident/finance/invoices/${params.id}/pdf`,
      `${invoice?.reference ?? "invoice"}.pdf`,
    );
  });

  const dispute = useAction(async () => {
    const payload = await api<{ invoice: Invoice }>(
      `/api/resident/finance/invoices/${params.id}/dispute`,
      { method: "POST", body: { reason } },
    );
    setData(payload);
    setDisputeOpen(false);
    setReason("");
  });

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        action={invoice ? <Status value={invoice.display_status} /> : undefined}
        back="/app/finance"
        title="Invoice"
      />

      {loading && !invoice ? <ScreenSkeleton rows={3} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {error && !invoice ? (
        <Empty icon={TriangleAlert} title="Invoice not available">
          {error}
        </Empty>
      ) : null}

      {invoice ? (
        <>
          <Card accent>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="r-mono r-muted" style={{ fontSize: 10 }}>
                  {invoice.reference}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{invoice.title}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="r-label">Due</div>
                <div
                  className={invoice.is_overdue ? "text-er" : ""}
                  style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}
                >
                  {formatDay(invoice.due_date)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg)" }}>
              <div className="r-label" style={{ marginBottom: 6 }}>
                Line items
              </div>
              {(invoice.lines ?? []).map((line) => (
                <div
                  key={line.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "7px 0",
                    borderBottom: "1px solid var(--clg)",
                    fontSize: 12,
                  }}
                >
                  <span className="text-mt">{line.description}</span>
                  <span className="r-mono" style={{ flexShrink: 0, fontWeight: 600 }}>
                    {rs(line.amount)}
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
                <span style={{ fontSize: 16, fontWeight: 700 }} className="r-mono">
                  {rs(invoice.total_amount)}
                </span>
              </div>

              {invoice.amount_paid > 0 ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 4,
                      fontSize: 12,
                    }}
                  >
                    <span className="text-mt">Paid</span>
                    <span className="r-mono text-ok">{rs(invoice.amount_paid)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>Balance</span>
                    <span className={`r-mono ${invoice.balance > 0 ? "text-er" : "text-ok"}`}>
                      {rs(invoice.balance)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="r-label" style={{ marginBottom: 8 }}>
              Details
            </div>
            <DefRow label="Issued">{formatDay(invoice.issue_date)}</DefRow>
            <DefRow label="Period">{invoice.period_label ?? "—"}</DefRow>
            <DefRow label="Unit">{invoice.unit_label ?? "—"}</DefRow>
          </Card>

          <Card>
            <div className="r-label" style={{ marginBottom: 8 }}>
              Payment history
            </div>
            {invoice.payments && invoice.payments.length > 0 ? (
              invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--clg)",
                  }}
                >
                  <span className="r-row__mark tint-ok">
                    <CircleCheck size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {payment.method_label ?? "Payment"}
                    </div>
                    <div className="r-mono r-muted" style={{ fontSize: 10 }}>
                      {payment.reference} · {formatDay(payment.paid_at)}
                    </div>
                  </div>
                  <span className="r-mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                    {rs(payment.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="r-muted" style={{ padding: "4px 0" }}>
                No payments have been allocated to this invoice.
              </p>
            )}
          </Card>

          {invoice.status === "disputed" ? (
            <Notice icon={TriangleAlert} tone="warn">
              This invoice is under dispute. Your syndic manager has your note and will respond.
              {invoice.dispute_reason ? (
                <div style={{ marginTop: 6, fontStyle: "italic" }}>“{invoice.dispute_reason}”</div>
              ) : null}
            </Notice>
          ) : null}

          {download.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {download.error}
            </Notice>
          ) : null}

          <div className="r-btn-row">
            <button
              className="r-btn"
              disabled={download.pending || !online}
              onClick={() => void download.run()}
              type="button"
            >
              <Download size={15} />
              {download.pending ? "Preparing…" : "PDF"}
            </button>
            {invoice.balance > 0 ? (
              <button
                className="r-btn r-btn--accent"
                onClick={() => router.push("/app/finance/pay")}
                type="button"
              >
                Pay {rs(invoice.balance)}
              </button>
            ) : null}
          </div>

          {invoice.balance > 0 && invoice.status !== "disputed" ? (
            <button
              className="r-btn r-btn--danger r-btn--block r-btn--sm"
              onClick={() => setDisputeOpen(true)}
              style={{ marginTop: 8 }}
              type="button"
            >
              <TriangleAlert size={14} />
              Dispute this invoice
            </button>
          ) : null}

          <Sheet
            onClose={() => setDisputeOpen(false)}
            open={disputeOpen}
            subtitle="Your syndic manager will be notified and the invoice held while it is reviewed."
            title="Dispute this invoice"
          >
            {dispute.error ? (
              <Notice icon={TriangleAlert} tone="er">
                {dispute.error}
              </Notice>
            ) : null}

            <div className="r-field">
              <label className="r-field__label">What is being disputed?</label>
              <div className="r-input">
                <textarea
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain which charge is wrong and why."
                  value={reason}
                />
              </div>
            </div>

            <div className="r-btn-row" style={{ marginTop: 0 }}>
              <button className="r-btn" onClick={() => setDisputeOpen(false)} type="button">
                Cancel
              </button>
              <button
                className="r-btn r-btn--danger"
                disabled={dispute.pending || reason.trim().length < 5}
                onClick={() => void dispute.run()}
                type="button"
              >
                {dispute.pending ? "Sending…" : "Raise dispute"}
              </button>
            </div>
          </Sheet>
        </>
      ) : null}

      {!invoice && !loading && !error ? (
        <Empty icon={FileText} title="Invoice not found" />
      ) : null}
    </div>
  );
}
