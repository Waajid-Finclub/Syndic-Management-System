"use client";

/**
 * Billing and payments for one development.
 *
 * The billing run is the centrepiece and is deliberately two-step: preview,
 * then commit. A run bills every unit in the building at once, and the manager
 * should see the exact per-unit figures — and their total — before that goes
 * out. The preview and the commit share one server-side planner, so the numbers
 * shown are the numbers raised.
 */

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Check,
  Download,
  Loader2,
  Play,
  Plus,
  Receipt,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { Tabs } from "@/components/tabs";
import { api, downloadFile } from "@/lib/api";
import { compactMoney, formatDate, money, number, percent } from "@/lib/format";
import { canCreate, canDelete, canEdit, canExport, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type {
  ArrearsRow,
  BillingPreview,
  BillingRun,
  FinanceSummary,
  InvoiceRow,
  PaymentRow,
  UnitsResponse,
} from "@/lib/syndic/types";

type Tab = "invoices" | "payments" | "arrears" | "runs";

export default function FinancePage() {
  return (
    <Suspense fallback={<SyndicShell><div className="loading-line" /></SyndicShell>}>
      <FinanceScreen />
    </Suspense>
  );
}

function FinanceScreen() {
  const params = useSearchParams();
  const { permissions } = useSyndic();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "invoices");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [receipting, setReceipting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const summary = useSyndicApi<FinanceSummary>("/api/syndic/finance/summary");
  const invoices = useSyndicApi<{ invoices: InvoiceRow[] }>(
    tab === "invoices" ? "/api/syndic/finance/invoices" : null,
  );
  const payments = useSyndicApi<{ payments: PaymentRow[] }>(
    tab === "payments" ? "/api/syndic/finance/payments" : null,
  );
  const arrears = useSyndicApi<{ arrears: ArrearsRow[]; total: number }>(
    tab === "arrears" ? "/api/syndic/finance/arrears" : null,
  );
  const units = useSyndicApi<UnitsResponse>("/api/syndic/registry/units");

  const totals = summary.data?.totals;
  const mayCreate = canCreate(permissions, "finance");

  const filteredInvoices = useMemo(() => {
    const rows = invoices.data?.invoices ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.reference, row.title, row.unit_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [invoices.data, query]);

  async function reloadAll() {
    await summary.reload();
    if (tab === "invoices") await invoices.reload();
    if (tab === "payments") await payments.reload();
    if (tab === "arrears") await arrears.reload();
  }

  return (
    <SyndicShell
      onSearch={setQuery}
      searchPlaceholder="Search invoices, units..."
      searchValue={query}
    >
      <PageHeader
        title="Billing & Payments"
        subtitle="Service charges, receipts and arrears for this development"
        action={
          <div className="page__actions">
            {canExport(permissions, "finance") ? (
              <button
                className="btn btn-secondary"
                onClick={() => downloadFile("/api/syndic/finance/export/arrears", "arrears.csv")}
                type="button"
              >
                <Download size={13} />
                Export arrears
              </button>
            ) : null}
            {mayCreate ? (
              <>
                <button className="btn btn-secondary" onClick={() => setReceipting(true)} type="button">
                  <Receipt size={13} />
                  Record payment
                </button>
                <button className="btn btn-primary" onClick={() => setRunning(true)} type="button">
                  <Play size={13} />
                  Run billing
                </button>
              </>
            ) : null}
          </div>
        }
      />

      {summary.error ? <div className="notice notice--er">{summary.error}</div> : null}
      {banner ? (
        <div className="notice notice--ok">
          <Check size={15} />
          <div>
            <div className="notice__title">Done</div>
            <div className="notice__sub">{banner}</div>
          </div>
        </div>
      ) : null}

      {totals ? (
        <div className="kpi-grid">
          <StatCard
            icon={Banknote}
            label="Billed to date"
            sub={`${number(totals.open_invoices)} invoices still open`}
            value={compactMoney(totals.billed)}
          />
          <StatCard
            icon={Check}
            label="Collected"
            sub={`${compactMoney(totals.collected_this_month)} this month`}
            value={compactMoney(totals.collected)}
          />
          <StatCard
            icon={AlertTriangle}
            label="Overdue"
            sub={`${number(totals.overdue_invoices)} invoices past due`}
            tone="text-[var(--er)]"
            value={compactMoney(totals.overdue)}
          />
          <StatCard
            icon={Receipt}
            label="Collection rate"
            sub="Of everything ever billed"
            value={percent(totals.collection_rate)}
          />
        </div>
      ) : null}

      {summary.data ? <AgingRow buckets={summary.data.aging} /> : null}

      <Tabs
        active={tab}
        items={[
          { key: "invoices", label: "Invoices" },
          { key: "payments", label: "Payments" },
          { key: "arrears", label: "Arrears" },
          { key: "runs", label: "Billing runs", count: summary.data?.runs.length },
        ]}
        onChange={(next) => setTab(next as Tab)}
      />

      {tab === "invoices" ? (
        <InvoicesTable
          loading={invoices.loading}
          mayCreate={mayCreate}
          onCreate={() => setInvoicing(true)}
          rows={filteredInvoices}
        />
      ) : null}

      {tab === "payments" ? (
        <PaymentsTable
          loading={payments.loading}
          mayReverse={canDelete(permissions, "finance")}
          onChanged={reloadAll}
          rows={payments.data?.payments ?? []}
        />
      ) : null}

      {tab === "arrears" ? (
        <ArrearsTable
          loading={arrears.loading}
          mayRemind={canEdit(permissions, "finance")}
          onReminded={(count) => setBanner(`Reminders sent to ${count} co-owner(s).`)}
          rows={arrears.data?.arrears ?? []}
          total={arrears.data?.total ?? 0}
        />
      ) : null}

      {tab === "runs" ? (
        <RunsTable
          mayCancel={canDelete(permissions, "finance")}
          onChanged={reloadAll}
          rows={summary.data?.runs ?? []}
        />
      ) : null}

      {running ? (
        <BillingRunModal
          onClose={() => setRunning(false)}
          onDone={async (message) => {
            setRunning(false);
            setBanner(message);
            await reloadAll();
          }}
        />
      ) : null}

      {receipting ? (
        <ReceiptModal
          onClose={() => setReceipting(false)}
          onDone={async (message) => {
            setReceipting(false);
            setBanner(message);
            await reloadAll();
          }}
          units={units.data?.units ?? []}
        />
      ) : null}

      {invoicing ? (
        <InvoiceModal
          invoiceTypes={summary.data?.invoice_types ?? []}
          onClose={() => setInvoicing(false)}
          onDone={async (message) => {
            setInvoicing(false);
            setBanner(message);
            await reloadAll();
          }}
          units={units.data?.units ?? []}
        />
      ) : null}
    </SyndicShell>
  );
}

function AgingRow({ buckets }: { buckets: FinanceSummary["aging"] }) {
  return (
    <div className="bucket-row">
      {buckets.map((bucket) => (
        <div
          className={`bucket ${
            bucket.key === "d90_plus" || bucket.key === "d61_90"
              ? "bucket--danger"
              : bucket.key === "d31_60" || bucket.key === "d1_30"
                ? "bucket--warn"
                : ""
          }`}
          key={bucket.key}
        >
          <div className="bucket__label">{bucket.label}</div>
          <div className="bucket__value">{compactMoney(bucket.amount)}</div>
          <div className="bucket__sub">
            {number(bucket.count)} invoice{bucket.count === 1 ? "" : "s"}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Invoices ---------------------------------------------------------------

function InvoicesTable({
  loading,
  mayCreate,
  onCreate,
  rows,
}: {
  loading: boolean;
  mayCreate: boolean;
  onCreate: () => void;
  rows: InvoiceRow[];
}) {
  return (
    <Section
      action={
        mayCreate ? (
          <button className="btn btn-secondary btn-sm" onClick={onCreate} type="button">
            <Plus size={12} />
            Raise invoice
          </button>
        ) : null
      }
      subtitle={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
      title="Invoices"
    >
      {rows.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Unit</th>
                <th>Description</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="right">Total</th>
                <th className="right">Paid</th>
                <th className="right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="mono bold">{invoice.reference}</td>
                  <td className="bold color-cr">{invoice.unit_label}</td>
                  <td className="wrap">{invoice.title}</td>
                  <td>{formatDate(invoice.issue_date)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td className="right mono">{money(invoice.total_amount)}</td>
                  <td className="right mono">{money(invoice.amount_paid)}</td>
                  <td className={`right mono ${invoice.balance > 0 ? "bold" : ""}`}>
                    {money(invoice.balance)}
                  </td>
                  <td>
                    <StatusPill value={invoice.display_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          message={
            loading ? "Loading invoices..." : "Nothing has been billed yet — start a billing run"
          }
        />
      )}
    </Section>
  );
}

function InvoiceModal({
  invoiceTypes,
  onClose,
  onDone,
  units,
}: {
  invoiceTypes: { key: string; label: string }[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  units: UnitsResponse["units"];
}) {
  const [unitId, setUnitId] = useState(units[0] ? String(units[0].id) : "");
  const [invoiceType, setInvoiceType] = useState("other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await api<InvoiceRow>("/api/syndic/finance/invoices", {
        method: "POST",
        body: {
          unit_id: Number(unitId),
          title: form.get("title"),
          invoice_type: invoiceType,
          period_label: form.get("period_label"),
          due_date: form.get("due_date") || null,
          lines: [
            {
              description: form.get("description") || form.get("title"),
              quantity: 1,
              unit_rate: form.get("amount"),
            },
          ],
        },
      });
      await onDone(`Invoice ${response.reference} raised.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not raise the invoice");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="invoice-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Raise invoice
          </button>
        </>
      }
      icon={<Receipt size={17} />}
      onClose={onClose}
      subtitle="A one-off charge — a levy, a repair recharge, a booking fee"
      title="Raise an invoice"
      wide
    >
      <form id="invoice-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label">Unit</label>
            <SelectMenu
              ariaLabel="Unit"
              fullWidth
              onChange={setUnitId}
              options={units.map((unit) => ({ value: String(unit.id), label: unit.label }))}
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <SelectMenu
              ariaLabel="Invoice type"
              fullWidth
              onChange={setInvoiceType}
              options={invoiceTypes.map((type) => ({ value: type.key, label: type.label }))}
              shape="field"
              value={invoiceType}
            />
          </div>
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="field" id="title" name="title" placeholder="Roof repair recharge" required />
          </div>
          <div>
            <label className="label" htmlFor="amount">
              Amount
            </label>
            <input className="field" id="amount" min={1} name="amount" step="0.01" type="number" required />
          </div>
          <div>
            <label className="label" htmlFor="period_label">
              Period label
            </label>
            <input className="field" id="period_label" name="period_label" placeholder="March 2026" />
          </div>
          <div>
            <label className="label" htmlFor="due_date">
              Due date
            </label>
            <input className="field" id="due_date" name="due_date" placeholder="YYYY-MM-DD" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="description">
            Line description
          </label>
          <input className="field" id="description" name="description" placeholder="Defaults to the title" />
        </div>
      </form>
    </Modal>
  );
}

// --- Payments ---------------------------------------------------------------

function PaymentsTable({
  loading,
  mayReverse,
  onChanged,
  rows,
}: {
  loading: boolean;
  mayReverse: boolean;
  onChanged: () => Promise<void>;
  rows: PaymentRow[];
}) {
  const [reversing, setReversing] = useState<PaymentRow | null>(null);

  return (
    <>
      <Section subtitle={`${rows.length} receipt${rows.length === 1 ? "" : "s"}`} title="Payments">
        {rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Unit</th>
                  <th>Received</th>
                  <th>Method</th>
                  <th className="right">Amount</th>
                  <th>Allocated to</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={payment.id}>
                    <td className="mono bold">{payment.reference}</td>
                    <td className="bold color-cr">{payment.unit_label}</td>
                    <td>{formatDate(payment.paid_at)}</td>
                    <td>{payment.method_label ?? "-"}</td>
                    <td className="right mono">{money(payment.amount)}</td>
                    <td className="wrap">
                      {payment.allocations.length
                        ? payment.allocations
                            .map((row) => `${row.invoice_reference} (${money(row.amount)})`)
                            .join(", ")
                        : <span className="color-mt">Unallocated credit</span>}
                    </td>
                    <td>
                      <StatusPill value={payment.status} />
                    </td>
                    <td className="right">
                      {mayReverse && payment.status === "confirmed" ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setReversing(payment)}
                          type="button"
                        >
                          <Undo2 size={12} />
                          Reverse
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message={loading ? "Loading payments..." : "No payments recorded yet"} />
        )}
      </Section>

      {reversing ? (
        <ReverseModal
          onClose={() => setReversing(null)}
          onDone={async () => {
            setReversing(null);
            await onChanged();
          }}
          payment={reversing}
        />
      ) : null}
    </>
  );
}

function ReverseModal({
  onClose,
  onDone,
  payment,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
  payment: PaymentRow;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/syndic/finance/payments/${payment.id}/reverse`, {
        method: "POST",
        body: { reason: form.get("reason") },
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reverse the payment");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-danger" disabled={saving} form="reverse-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Undo2 size={13} />}
            Reverse payment
          </button>
        </>
      }
      icon={<Undo2 size={17} />}
      onClose={onClose}
      subtitle={`${payment.reference} — ${money(payment.amount)} against unit ${payment.unit_label}`}
      title="Reverse a payment"
    >
      <form id="reverse-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="notice notice--warn">
          <AlertTriangle size={15} />
          <div>
            <div className="notice__title">The receipt is kept, not deleted</div>
            <div className="notice__sub">
              Its allocations are released and the invoices it settled go back to outstanding.
              The co-owner was shown this receipt, so the row stays visible with the reason
              recorded against it.
            </div>
          </div>
        </div>

        <label className="label mt-4" htmlFor="reason">
          Reason
        </label>
        <input
          className="field"
          id="reason"
          name="reason"
          placeholder="Cheque returned unpaid"
          required
        />
      </form>
    </Modal>
  );
}

function ReceiptModal({
  onClose,
  onDone,
  units,
}: {
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  units: UnitsResponse["units"];
}) {
  // Default to whichever unit owes the most — usually why a receipt is posted.
  const owing = [...units].sort((a, b) => b.balance - a.balance);
  const [unitId, setUnitId] = useState(owing[0] ? String(owing[0].id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = units.find((unit) => String(unit.id) === unitId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ allocated_count: number; unallocated: number }>(
        "/api/syndic/finance/payments",
        {
          method: "POST",
          body: {
            unit_id: Number(unitId),
            amount: form.get("amount"),
            method_label: form.get("method_label"),
            gateway_reference: form.get("gateway_reference"),
            paid_at: form.get("paid_at") || null,
          },
        },
      );
      const extra =
        response.unallocated > 0
          ? ` ${money(response.unallocated)} is held as account credit.`
          : "";
      await onDone(
        `Receipt posted and allocated across ${response.allocated_count} invoice(s).${extra}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="receipt-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Receipt size={13} />}
            Record payment
          </button>
        </>
      }
      icon={<Receipt size={17} />}
      onClose={onClose}
      subtitle="Allocates oldest-due-first, the same way a co-owner's card payment does"
      title="Record a payment"
      wide
    >
      <form id="receipt-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label">Unit</label>
            <SelectMenu
              ariaLabel="Unit"
              fullWidth
              onChange={setUnitId}
              options={owing.map((unit) => ({
                value: String(unit.id),
                label: unit.balance > 0 ? `${unit.label} — owes ${money(unit.balance)}` : unit.label,
              }))}
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label" htmlFor="amount">
              Amount received
            </label>
            <input
              className="field"
              defaultValue={selected && selected.balance > 0 ? selected.balance : ""}
              id="amount"
              min={0.01}
              name="amount"
              step="0.01"
              type="number"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="method_label">
              Method
            </label>
            <input
              className="field"
              defaultValue="Office receipt"
              id="method_label"
              name="method_label"
            />
          </div>
          <div>
            <label className="label" htmlFor="gateway_reference">
              Reference
            </label>
            <input
              className="field"
              id="gateway_reference"
              name="gateway_reference"
              placeholder="Cheque no. / transfer ref"
            />
          </div>
          <div>
            <label className="label" htmlFor="paid_at">
              Date received
            </label>
            <input className="field" id="paid_at" name="paid_at" placeholder="YYYY-MM-DD (today)" />
          </div>
        </div>

        {selected ? (
          <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
            Unit {selected.label} currently owes{" "}
            <strong className="text-[var(--ct)]">{money(selected.balance)}</strong>. Anything paid
            beyond that is held as account credit rather than dropped.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

// --- Arrears ----------------------------------------------------------------

function ArrearsTable({
  loading,
  mayRemind,
  onReminded,
  rows,
  total,
}: {
  loading: boolean;
  mayRemind: boolean;
  onReminded: (count: number) => void;
  rows: ArrearsRow[];
  total: number;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remind() {
    setSending(true);
    setError(null);
    try {
      const response = await api<{ sent: number }>("/api/syndic/finance/arrears/remind", {
        method: "POST",
        body: {},
      });
      onReminded(response.sent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reminders");
    } finally {
      setSending(false);
    }
  }

  return (
    <Section
      action={
        mayRemind && rows.length ? (
          <button className="btn btn-secondary btn-sm" disabled={sending} onClick={remind} type="button">
            {sending ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />}
            Send reminders
          </button>
        ) : null
      }
      subtitle={`${money(total)} outstanding across ${rows.length} unit${rows.length === 1 ? "" : "s"}`}
      title="Arrears"
    >
      {error ? <div className="notice notice--er">{error}</div> : null}

      {rows.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Primary contact</th>
                <th>Email</th>
                <th className="right">Balance</th>
                <th className="right">Overdue</th>
                <th className="right">Days</th>
                <th className="right">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // The primary contact is who the office writes to about the
                // unit; a jointly held unit still has exactly one.
                const primary =
                  row.owners.find((owner) => owner.is_primary_contact) ?? row.owners[0];
                return (
                  <tr key={row.unit_id}>
                    <td className="bold color-cr">{row.unit_label}</td>
                    <td className="wrap">{primary?.name ?? "Unallocated"}</td>
                    <td className="mono">{primary?.email ?? "-"}</td>
                    <td className="right mono">{money(row.balance)}</td>
                    <td className="right mono color-er">
                      {row.overdue > 0 ? money(row.overdue) : "-"}
                    </td>
                    <td className="right">{row.days_overdue || "-"}</td>
                    <td className="right">{number(row.invoice_count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          message={loading ? "Loading arrears..." : "Nothing outstanding — every unit is settled"}
        />
      )}
    </Section>
  );
}

// --- Billing runs -----------------------------------------------------------

function RunsTable({
  mayCancel,
  onChanged,
  rows,
}: {
  mayCancel: boolean;
  onChanged: () => Promise<void>;
  rows: BillingRun[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function cancel(run: BillingRun) {
    setBusy(run.id);
    setError(null);
    try {
      await api(`/api/syndic/finance/billing-runs/${run.id}/cancel`, { method: "POST" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the run");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section subtitle="One row per billing cycle, newest first" title="Billing runs">
      {error ? <div className="notice notice--er">{error}</div> : null}

      {rows.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Basis</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="right">Invoices</th>
                <th className="right">Total</th>
                <th>Run by</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr key={run.id}>
                  <td className="bold color-cr">{run.period_label}</td>
                  <td>{run.basis === "share_value" ? "By shares" : "Per unit charge"}</td>
                  <td>{formatDate(run.issue_date)}</td>
                  <td>{formatDate(run.due_date)}</td>
                  <td className="right">{number(run.invoice_count)}</td>
                  <td className="right mono">{money(run.total_amount)}</td>
                  <td className="wrap">{run.run_by_label ?? "-"}</td>
                  <td>
                    <StatusPill value={run.status} />
                  </td>
                  <td className="right">
                    {mayCancel && run.status === "issued" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === run.id}
                        onClick={() => cancel(run)}
                        type="button"
                      >
                        {busy === run.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <RotateCcw size={12} />
                        )}
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No billing run has been issued yet" />
      )}
    </Section>
  );
}

function BillingRunModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const runs = useSyndicApi<{ next_period: string; basis: FinanceSummary["billing_basis"] }>(
    "/api/syndic/finance/billing-runs",
  );
  const [period, setPeriod] = useState("");
  const [basis, setBasis] = useState("unit_charge");
  const [budget, setBudget] = useState("");
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePeriod = period || runs.data?.next_period || "";

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await api<BillingPreview>("/api/syndic/finance/billing-runs/preview", {
          method: "POST",
          body: { period_month: effectivePeriod, basis, budget_amount: budget || null },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the preview");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ run: BillingRun }>("/api/syndic/finance/billing-runs", {
        method: "POST",
        body: { period_month: effectivePeriod, basis, budget_amount: budget || null },
      });
      await onDone(
        `${response.run.period_label}: ${number(response.run.invoice_count)} invoices raised ` +
          `totalling ${money(response.run.total_amount)}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run billing");
      setBusy(false);
    }
  }

  const blocked = Boolean(preview?.already_run);

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={runPreview} type="button">
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            Preview
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !preview || !preview.rows.length || blocked}
            onClick={commit}
            type="button"
          >
            <Play size={13} />
            Issue {preview ? number(preview.rows.length) : ""} invoices
          </button>
        </>
      }
      icon={<Play size={17} />}
      onClose={onClose}
      subtitle="Preview the per-unit figures before anything is issued"
      title="Run a billing cycle"
      wide
    >
      {error ? <div className="notice notice--er">{error}</div> : null}

      <div className="form-grid">
        <div>
          <label className="label" htmlFor="period">
            Period (YYYY-MM)
          </label>
          <input
            className="field"
            id="period"
            onChange={(event) => {
              setPeriod(event.target.value);
              setPreview(null);
            }}
            placeholder={runs.data?.next_period ?? "2026-03"}
            value={period}
          />
        </div>
        <div>
          <label className="label">Basis</label>
          <SelectMenu
            ariaLabel="Billing basis"
            fullWidth
            onChange={(value) => {
              setBasis(value);
              setPreview(null);
            }}
            options={(runs.data?.basis ?? []).map((entry) => ({
              value: entry.key,
              label: entry.label,
            }))}
            shape="field"
            value={basis}
          />
        </div>
        {basis === "share_value" ? (
          <div>
            <label className="label" htmlFor="budget">
              Budget to apportion
            </label>
            <input
              className="field"
              id="budget"
              min={1}
              onChange={(event) => {
                setBudget(event.target.value);
                setPreview(null);
              }}
              step="0.01"
              type="number"
              value={budget}
            />
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
        {basis === "share_value"
          ? "A development-wide budget split by each unit's share of the 10,000 total."
          : "Each unit's own monthly charge, as set in the Property Registry."}
      </p>

      {blocked ? (
        <div className="notice notice--er mt-4">
          <AlertTriangle size={15} />
          <div>
            <div className="notice__title">
              {preview?.already_run?.period_label} has already been run
            </div>
            <div className="notice__sub">
              {number(preview?.already_run?.invoice_count ?? 0)} invoices were issued on{" "}
              {formatDate(preview?.already_run?.issue_date)}. Cancel that run before billing the
              period again.
            </div>
          </div>
        </div>
      ) : null}

      {preview && !blocked ? (
        <div className="mt-4">
          <div className="metric-strip">
            <div className="metric-tile metric-tile--center">
              <div className="metric-tile__label">Units billed</div>
              <div className="metric-tile__value">{number(preview.rows.length)}</div>
            </div>
            <div className="metric-tile metric-tile--center">
              <div className="metric-tile__label">Total</div>
              <div className="metric-tile__value">{money(preview.total)}</div>
            </div>
            <div className="metric-tile metric-tile--center">
              <div className="metric-tile__label">Issue date</div>
              <div className="metric-tile__value">{formatDate(preview.issue_date)}</div>
            </div>
            <div className="metric-tile metric-tile--center">
              <div className="metric-tile__label">Due date</div>
              <div className="metric-tile__value">{formatDate(preview.due_date)}</div>
            </div>
          </div>

          {preview.rows.length ? (
            <div className="table-wrap mt-4 max-h-64 overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th className="right">Shares</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.unit_id}>
                      <td className="bold color-cr">{row.unit_label}</td>
                      <td className="right mono">{number(row.shares)}</td>
                      <td className="right mono">{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="notice notice--warn mt-4">
              <AlertTriangle size={15} />
              <div>
                <div className="notice__title">No unit would be billed</div>
                <div className="notice__sub">
                  Set a monthly charge on the units in the Property Registry, or switch to
                  apportioning a budget by shares.
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
