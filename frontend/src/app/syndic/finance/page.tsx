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
  FileText,
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
import { compactMoney, formatDate, money, number } from "@/lib/format";
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

type Tab = "collections" | "cashflow" | "invoices" | "payments" | "runs" | "documents";

type CashFlowResponse = {
  as_of: string | null;
  current_balance: number | null;
  unmatched_count: number;
  source: string;
  months: { period: string; inflow: number; outflow: number; net: number; closing_balance: number | null }[];
};

type FinancialDocumentRow = {
  id: number;
  document_type: string;
  reference: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  issued_at: string | null;
  unit_label: string | null;
};

type ExpenseDocumentRow = {
  id: number;
  expense_date: string | null;
  description: string;
  amount: number;
  vendor_name: string | null;
  account: { name: string } | null;
};

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
  const requestedTab = params.get("tab");
  const initialTab: Tab = requestedTab === "arrears" || !["collections", "cashflow", "invoices", "payments", "runs", "documents"].includes(requestedTab ?? "")
    ? "collections"
    : requestedTab as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);
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
    tab === "collections" ? "/api/syndic/finance/arrears" : null,
  );
  const cashFlow = useSyndicApi<CashFlowResponse>(
    tab === "cashflow" ? "/api/syndic/finance/cash-flow" : null,
  );
  const documents = useSyndicApi<{ documents: FinancialDocumentRow[] }>(
    tab === "documents" ? "/api/syndic/finance/documents" : null,
  );
  const documentInvoices = useSyndicApi<{ invoices: InvoiceRow[] }>(
    tab === "documents" ? "/api/syndic/finance/invoices" : null,
  );
  const documentPayments = useSyndicApi<{ payments: PaymentRow[] }>(
    tab === "documents" ? "/api/syndic/finance/payments" : null,
  );
  const documentExpenses = useSyndicApi<{ expenses: ExpenseDocumentRow[] }>(
    tab === "documents" ? "/api/syndic/finance/expenses" : null,
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

  const filteredPayments = useMemo(() => {
    const rows = payments.data?.payments ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.reference, row.unit_label, row.payer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [payments.data, query]);

  const filteredArrears = useMemo(() => {
    const rows = arrears.data?.arrears ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.unit_label, ...row.owners.flatMap((owner) => [owner.name, owner.email])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [arrears.data, query]);

  async function reloadAll() {
    await summary.reload();
    if (tab === "invoices") await invoices.reload();
    if (tab === "payments") await payments.reload();
    if (tab === "collections") await arrears.reload();
    if (tab === "documents") await documents.reload();
  }

  return (
    <SyndicShell
      onSearch={setQuery}
      searchPlaceholder={tab === "collections" ? "Search units in the collection queue..." : "Search charges, receipts or units..."}
      searchValue={query}
    >
      <PageHeader
        title="Receivables & billing"
        subtitle="Raise charges, confirm receipts and keep overdue co-owner accounts moving."
        action={
          <div className="page__actions">
            {canExport(permissions, "finance") ? (
              <button
                className="btn btn-secondary"
                onClick={() => downloadFile("/api/syndic/finance/export/arrears", "arrears.csv")}
                type="button"
              >
                <Download size={13} />
                Export collection queue
              </button>
            ) : null}
            {mayCreate ? (
              <>
                <button className="btn btn-secondary" onClick={() => setReceipting(true)} type="button">
                  <Receipt size={13} />
                  Record receipt
                </button>
                <button className="btn btn-primary" onClick={() => setInvoicing(true)} type="button">
                  <Plus size={13} />
                  New charge
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
        <div className="kpi-grid kpi-grid--compact">
          <StatCard
            icon={AlertTriangle}
            label="Overdue to action"
            sub={`${number(totals.overdue_invoices)} invoice${totals.overdue_invoices === 1 ? "" : "s"} past due`}
            tone="text-[var(--er)]"
            value={compactMoney(totals.overdue)}
          />
          <StatCard
            icon={Banknote}
            label="Open balance"
            sub={`${number(totals.open_invoices)} charge${totals.open_invoices === 1 ? "" : "s"} still to collect`}
            value={compactMoney(totals.outstanding)}
          />
          <StatCard
            icon={Check}
            label="Receipts this month"
            sub="Confirmed payments recorded this month"
            value={compactMoney(totals.collected_this_month)}
          />
        </div>
      ) : null}

      {totals?.overdue ? (
        <div className="notice notice--warn">
          <AlertTriangle size={15} />
          <div>
            <div className="notice__title">Collection work needs attention</div>
            <div className="notice__sub">{number(totals.overdue_invoices)} overdue invoices total {money(totals.overdue)}. Start from the oldest balances in the collection queue.</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab("collections")} type="button">Open queue</button>
        </div>
      ) : null}

      <Tabs
        active={tab}
        items={[
          { key: "collections", label: "Collection queue", count: totals?.overdue_invoices },
          { key: "cashflow", label: "Cash flow" },
          { key: "invoices", label: "Debit" },
          { key: "payments", label: "Credit" },
          { key: "runs", label: "Billing cycles", count: summary.data?.runs.length },
          ...(canExport(permissions, "finance") ? [{ key: "documents", label: "Financial documents" }] : []),
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
          rows={filteredPayments}
        />
      ) : null}

      {tab === "collections" ? (
        <ArrearsTable
          loading={arrears.loading}
          mayRemind={canEdit(permissions, "finance")}
          onReminded={(count) => setBanner(`Reminders sent to ${count} co-owner(s).`)}
          rows={filteredArrears}
          total={arrears.data?.total ?? 0}
        />
      ) : null}

      {tab === "runs" ? (
        <RunsTable
          mayCancel={canDelete(permissions, "finance")}
          mayCreate={mayCreate}
          onChanged={reloadAll}
          onRun={() => setRunning(true)}
          rows={summary.data?.runs ?? []}
        />
      ) : null}

      {tab === "documents" ? (
        <FinancialDocuments
          documents={documents.data?.documents ?? []}
          expenses={documentExpenses.data?.expenses ?? []}
          invoices={documentInvoices.data?.invoices ?? []}
          loading={documents.loading || documentInvoices.loading || documentPayments.loading || documentExpenses.loading}
          onIssued={async (reference) => {
            setBanner(`Financial document ${reference} issued and saved.`);
            await documents.reload();
          }}
          payments={documentPayments.data?.payments ?? []}
          units={units.data?.units ?? []}
        />
      ) : null}

      {tab === "cashflow" ? <CashFlowPanel data={cashFlow.data} loading={cashFlow.loading} /> : null}
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

// --- Cash flow --------------------------------------------------------------

function CashFlowPanel({ data, loading }: { data?: CashFlowResponse; loading: boolean }) {
  const months = data?.months ?? [];
  const max = Math.max(...months.flatMap((month) => [month.inflow, month.outflow]), 1);
  const periodLabel = (period: string) => new Intl.DateTimeFormat("en-MU", {
    month: "short", year: "numeric",
  }).format(new Date(`${period}-01T00:00:00`));
  const latest = months[months.length - 1];

  return (
    <Section
      subtitle={data?.as_of ? `Actual bank movement through ${formatDate(data.as_of)} — not a forecast.` : "Actual cash movement from reconciled bank lines."}
      title="Cash flow"
    >
      {!data ? <EmptyState message={loading ? "Loading cash flow..." : "No imported bank movement is available yet."} /> : <>
        <div className="kpi-grid kpi-grid--compact">
          <StatCard icon={Banknote} label="Latest bank balance" sub={data.as_of ? `Bank position at ${formatDate(data.as_of)}` : "No bank balance supplied"} value={data.current_balance === null ? "-" : money(data.current_balance)} />
          <StatCard icon={Check} label="Cash in (latest month)" sub={latest ? periodLabel(latest.period) : "No monthly data"} value={latest ? money(latest.inflow) : "-"} />
          <StatCard icon={AlertTriangle} label="Cash out (latest month)" sub={latest ? `Net ${money(latest.net)}` : "No monthly data"} tone={latest && latest.net < 0 ? "text-[var(--er)]" : undefined} value={latest ? money(latest.outflow) : "-"} />
        </div>

        {months.length ? <>
          <div className="cash-flow-legend"><span><i className="cash-flow-legend__in" />Cash in</span><span><i className="cash-flow-legend__out" />Cash out</span></div>
          <div className="cash-flow-chart" aria-label="Monthly cash in and cash out">
            {months.map((month) => <div className="cash-flow-chart__month" key={month.period} title={`${periodLabel(month.period)}: in ${money(month.inflow)}, out ${money(month.outflow)}, net ${money(month.net)}`}>
              <div className="cash-flow-chart__bars">
                <span className="cash-flow-chart__bar cash-flow-chart__bar--in" style={{ height: `${Math.max((month.inflow / max) * 100, month.inflow ? 4 : 0)}%` }} />
                <span className="cash-flow-chart__bar cash-flow-chart__bar--out" style={{ height: `${Math.max((month.outflow / max) * 100, month.outflow ? 4 : 0)}%` }} />
              </div>
              <span className="cash-flow-chart__label">{periodLabel(month.period).split(" ")[0]}</span>
            </div>)}
          </div>
          <div className="cash-flow-foot"><span>{data.source}</span><span>{data.unmatched_count} bank line{data.unmatched_count === 1 ? "" : "s"} still need matching</span></div>
        </> : null}
        {data.unmatched_count ? <div className="notice notice--warn mt-4"><AlertTriangle size={15} /><div><div className="notice__title">Cash picture is not fully reconciled</div><div className="notice__sub">{data.unmatched_count} imported bank lines are still unmatched. Resolve these before treating the chart as a close-ready position.</div></div></div> : null}
      </>}
    </Section>
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
            Add one-off charge
          </button>
        ) : null
      }
      subtitle={`${rows.length} charge${rows.length === 1 ? "" : "s"} on the live receivables watchlist`}
      title="Charges"
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
            Add one-off charge
          </button>
        </>
      }
      icon={<Receipt size={17} />}
      onClose={onClose}
      subtitle="A levy, repair recharge or booking fee. The charge stays on the unit watchlist until it is paid."
      title="Add one-off charge"
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
      <Section subtitle={`${rows.length} confirmed receipt${rows.length === 1 ? "" : "s"} with its invoice allocation`} title="Receipts">
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
            Confirm receipt
          </button>
        </>
      }
      icon={<Receipt size={17} />}
      onClose={onClose}
      subtitle="Allocates the receipt to the oldest charges first, preserving a clear audit trail."
      title="Confirm receipt"
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
      subtitle={`${money(total)} outstanding across ${rows.length} unit${rows.length === 1 ? "" : "s"}; work the oldest balances first.`}
      title="Collection queue"
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
  mayCreate,
  onChanged,
  onRun,
  rows,
}: {
  mayCancel: boolean;
  mayCreate: boolean;
  onChanged: () => Promise<void>;
  onRun: () => void;
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
    <Section
      action={mayCreate ? <button className="btn btn-primary btn-sm" onClick={onRun} type="button"><Play size={12} />Prepare billing cycle</button> : null}
      subtitle="Prepare and review each cycle before it creates charges; newest first."
      title="Billing cycles"
    >
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
        <EmptyState message="No billing cycle has been issued yet" />
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
            Review charges
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !preview || !preview.rows.length || blocked}
            onClick={commit}
            type="button"
          >
            <Play size={13} />
            Confirm & issue {preview ? number(preview.rows.length) : ""} charges
          </button>
        </>
      }
      icon={<Play size={17} />}
      onClose={onClose}
      subtitle="Step 1: prepare the period. Step 2: review every charge. Step 3: confirm issue."
      title="Prepare billing cycle"
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
          <div className="notice notice--info">
            <Check size={15} />
            <div>
              <div className="notice__title">Charges are still a draft</div>
              <div className="notice__sub">Check the units, amounts and due date below. Nothing is posted until you confirm.</div>
            </div>
          </div>
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

// --- Financial documents ----------------------------------------------------

const FINANCIAL_DOCUMENT_TYPES = [
  { key: "statement", label: "Co-owner statement", hint: "Statement of account for one unit" },
  { key: "receipt", label: "Payment receipt", hint: "Receipt for a recorded payment" },
  { key: "expense_voucher", label: "Expense voucher", hint: "Payment evidence for an expense" },
  { key: "levy_notice", label: "Special levy notice", hint: "Call for funds for a special levy" },
  { key: "monthly_report", label: "Monthly financial report", hint: "Income, expenses and collection summary" },
  { key: "bank_reconciliation", label: "Bank reconciliation", hint: "Matched and outstanding bank lines" },
  { key: "budget_actual", label: "Budget versus actual", hint: "Approved budget compared with spend" },
  { key: "agm_pack", label: "AGM financial pack", hint: "Management pack for the annual meeting" },
] as const;

type FinancialDocumentType = (typeof FINANCIAL_DOCUMENT_TYPES)[number]["key"];

type FinancialDocumentPreview = {
  title: string;
  reference_label: string;
  period: string | null;
  summary: [string, string][];
};

function FinancialDocuments({ documents, expenses, invoices, loading, onIssued, payments, units }: {
  documents: FinancialDocumentRow[];
  expenses: ExpenseDocumentRow[];
  invoices: InvoiceRow[];
  loading: boolean;
  onIssued: (reference: string) => Promise<void>;
  payments: PaymentRow[];
  units: UnitsResponse["units"];
}) {
  const [issuing, setIssuing] = useState(false);
  return <>
    <Section action={<button className="btn btn-primary" onClick={() => setIssuing(true)} type="button"><FileText size={13} />Generate document</button>} subtitle="Issued documents are immutable snapshots, ready to download as PDF." title="Financial documents">
      {documents.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Reference</th><th>Document</th><th>Unit</th><th>Issued</th><th /></tr></thead><tbody>
        {documents.map((document) => <tr key={document.id}><td className="mono bold">{document.reference}</td><td><div className="bold">{document.title}</div><div className="color-mt">{document.document_type.replaceAll("_", " ")}</div></td><td>{document.unit_label ?? "Building-wide"}</td><td>{formatDate(document.issued_at)}</td><td className="right"><button className="btn btn-secondary btn-sm" onClick={() => downloadFile(`/api/syndic/finance/documents/${document.id}/pdf`, `${document.reference}.pdf`)} type="button"><Download size={12} />PDF</button></td></tr>)}
      </tbody></table></div> : <EmptyState message={loading ? "Loading financial documents..." : "No financial documents have been issued yet."} />}
    </Section>
    {issuing ? <FinancialDocumentModal expenses={expenses} invoices={invoices} onClose={() => setIssuing(false)} onDone={async (reference) => { setIssuing(false); await onIssued(reference); }} payments={payments} units={units} /> : null}
  </>;
}

function FinancialDocumentModal({ expenses, invoices, onClose, onDone, payments, units }: {
  expenses: ExpenseDocumentRow[];
  invoices: InvoiceRow[];
  onClose: () => void;
  onDone: (reference: string) => Promise<void>;
  payments: PaymentRow[];
  units: UnitsResponse["units"];
}) {
  const [kind, setKind] = useState<FinancialDocumentType>("monthly_report");
  const [preview, setPreview] = useState<FinancialDocumentPreview | null>(null);
  const [draftPayload, setDraftPayload] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levies = invoices.filter((invoice) => invoice.invoice_type === "special_levy");
  const selected = FINANCIAL_DOCUMENT_TYPES.find((item) => item.key === kind);
  const requiresSource = (kind === "statement" && !units.length) || (kind === "receipt" && !payments.length) || (kind === "expense_voucher" && !expenses.length) || (kind === "levy_notice" && !levies.length);

  function payloadFrom(form: FormData) {
    const payload: Record<string, unknown> = { document_type: kind };
    if (kind === "statement") {
      payload.unit_id = Number(form.get("unit_id"));
      payload.start = form.get("start");
      payload.end = form.get("end");
    } else if (kind === "receipt") payload.payment_id = Number(form.get("payment_id"));
    else if (kind === "expense_voucher") payload.expense_id = Number(form.get("expense_id"));
    else if (kind === "levy_notice") payload.invoice_id = Number(form.get("invoice_id"));
    else payload.period = form.get("period");
    return payload;
  }

  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = payloadFrom(new FormData(event.currentTarget));
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ preview: FinancialDocumentPreview }>("/api/syndic/finance/documents/preview", {
        method: "POST",
        body: payload,
      });
      setDraftPayload(payload);
      setPreview(response.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the document preview");
    } finally {
      setSaving(false);
    }
  }

  async function issue() {
    if (!draftPayload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ document: FinancialDocumentRow }>("/api/syndic/finance/documents", {
        method: "POST",
        body: draftPayload,
      });
      await onDone(response.document.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the financial document");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={preview ? <>
        <button className="btn btn-secondary" onClick={() => setPreview(null)} type="button">Edit draft</button>
        <button className="btn btn-primary" disabled={saving} onClick={issue} type="button">
          {saving ? <Loader2 className="animate-spin" size={13} /> : <FileText size={13} />}
          Issue immutable PDF
        </button>
      </> : <>
        <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
        <button className="btn btn-primary" disabled={saving || requiresSource} form="financial-document-form" type="submit">
          {saving ? <Loader2 className="animate-spin" size={13} /> : <FileText size={13} />}
          Review draft
        </button>
      </>}
      icon={<FileText size={17} />}
      onClose={onClose}
      subtitle={preview ? "Confirm the data below. Issuing creates the permanent audit snapshot." : "Choose the source and reporting period, then review the live data before issuing."}
      title={preview ? "Review financial document" : "Prepare financial document"}
      wide
    >
      {error ? <div className="notice notice--er">{error}</div> : null}
      {preview ? <DocumentPreview preview={preview} /> : <form id="financial-document-form" onSubmit={review}>
        <div className="form-grid">
          <div>
            <label className="label" htmlFor="financial-document-type">Document</label>
            <select className="field" id="financial-document-type" onChange={(event) => setKind(event.target.value as FinancialDocumentType)} value={kind}>
              {FINANCIAL_DOCUMENT_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>
          <div><label className="label">Purpose</label><div className="field document-purpose">{selected?.hint}</div></div>
        </div>
        {kind === "statement" ? <div className="form-grid mt-4"><div><label className="label" htmlFor="statement-unit">Unit</label><select className="field" defaultValue={units[0]?.id} id="statement-unit" name="unit_id">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></div><div><label className="label" htmlFor="statement-start">From</label><input className="field" defaultValue="2025-01-01" id="statement-start" name="start" type="date" /></div><div><label className="label" htmlFor="statement-end">To</label><input className="field" defaultValue="2025-12-31" id="statement-end" name="end" type="date" /></div></div> : null}
        {kind === "receipt" ? <DocumentSelect id="receipt-payment" label="Recorded payment" name="payment_id" options={payments.map((payment) => ({ value: payment.id, label: `${payment.reference} — ${payment.unit_label} — ${money(payment.amount)}` }))} /> : null}
        {kind === "expense_voucher" ? <DocumentSelect id="voucher-expense" label="Imported expense" name="expense_id" options={expenses.map((expense) => ({ value: expense.id, label: `${formatDate(expense.expense_date)} — ${expense.description} — ${money(expense.amount)}` }))} /> : null}
        {kind === "levy_notice" ? <DocumentSelect id="levy-invoice" label="Special levy invoice" name="invoice_id" options={levies.map((invoice) => ({ value: invoice.id, label: `${invoice.reference} — ${invoice.unit_label} — ${money(invoice.balance)}` }))} /> : null}
        {["monthly_report", "bank_reconciliation", "budget_actual", "agm_pack"].includes(kind) ? <div className="mt-4"><label className="label" htmlFor="report-period">Reporting month</label><input className="field" defaultValue="2025-12" id="report-period" name="period" pattern="[0-9]{4}-[0-9]{2}" placeholder="YYYY-MM" required /></div> : null}
        {requiresSource ? <div className="notice notice--er mt-4">There is no eligible source record for this document type yet.</div> : null}
      </form>}
    </Modal>
  );
}

function DocumentSelect({ id, label, name, options }: { id: string; label: string; name: string; options: { value: number; label: string }[] }) {
  return <div className="mt-4"><label className="label" htmlFor={id}>{label}</label><select className="field" defaultValue={options[0]?.value} id={id} name={name}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function DocumentPreview({ preview }: { preview: FinancialDocumentPreview }) {
  return <div className="document-preview"><div className="document-preview__head"><div><div className="eyebrow">Ready to issue</div><div className="document-preview__title">{preview.title}</div></div><div className="document-preview__period">{preview.period ?? preview.reference_label}</div></div><dl className="document-preview__summary">{preview.summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="notice notice--info mt-4"><FileText size={15} /><div><div className="notice__title">This will become a permanent record</div><div className="notice__sub">The PDF and its source data will be preserved under Financial documents.</div></div></div></div>;
}
