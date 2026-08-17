"use client";

/**
 * Statement of account.
 *
 * A ledger does not compress well onto a 393px screen, and abbreviating it
 * would defeat the point — this is the document a co-owner takes to a bank or
 * an accountant. So the table keeps all six columns and scrolls horizontally
 * inside its own container while the page itself does not.
 */

import { useState } from "react";
import { Download, Receipt, TriangleAlert } from "lucide-react";
import {
  Card,
  Chips,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  formatShortDay,
  rs,
} from "@/components/resident/ui";
import { downloadFile } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import { useResident } from "@/lib/resident/session";
import type { Statement } from "@/lib/resident/types";

const PERIODS = [
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
];

export default function StatementScreen() {
  const online = useOnline();
  const { unit } = useResident();
  const [period, setPeriod] = useState("3m");

  const { data, loading, error, stale } = useResidentApi<{ statement: Statement }>(
    `/api/resident/finance/statement?period=${period}`,
  );
  const statement = data?.statement;

  const download = useAction(async () => {
    await downloadFile(
      `/api/resident/finance/statement/pdf?period=${period}`,
      `statement-${unit?.label ?? "unit"}-${period}.pdf`,
    );
  });

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        back="/app/finance"
        subtitle={unit ? `Unit ${unit.label}` : null}
        title="Statement of account"
      />

      <Chips onChange={setPeriod} options={PERIODS} value={period} />

      {stale ? <StaleDataNotice /> : null}

      {loading && !statement ? <ScreenSkeleton rows={3} /> : null}

      {error && !statement ? (
        <Empty icon={TriangleAlert} title="Could not load the statement">
          {error}
        </Empty>
      ) : null}

      {statement ? (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="r-label">Opening balance</div>
                <div className="r-mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
                  {rs(statement.opening_balance)}
                </div>
                <div className="r-muted" style={{ fontSize: 10.5 }}>
                  {formatShortDay(statement.start_date)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="r-label">Closing balance</div>
                <div
                  className={`r-mono ${statement.closing_balance > 0 ? "text-er" : "text-ok"}`}
                  style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}
                >
                  {rs(statement.closing_balance)}
                </div>
                <div className="r-muted" style={{ fontSize: 10.5 }}>
                  {formatShortDay(statement.end_date)}
                </div>
              </div>
            </div>
          </Card>

          {statement.rows.length === 0 ? (
            <Empty icon={Receipt} title="No movements">
              Nothing was charged or paid in this period.
            </Empty>
          ) : (
            <div className="r-table-scroll">
              <table className="r-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map((row, index) => (
                    <tr key={`${row.reference}-${index}`}>
                      <td>{formatShortDay(row.date)}</td>
                      <td className="r-mono" style={{ fontSize: 10 }}>
                        {row.reference}
                      </td>
                      <td>{row.description}</td>
                      <td className="num r-mono text-er">{row.debit ? rs(row.debit) : ""}</td>
                      <td className="num r-mono text-ok">{row.credit ? rs(row.credit) : ""}</td>
                      <td className="num r-mono" style={{ fontWeight: 600 }}>
                        {rs(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {download.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {download.error}
            </Notice>
          ) : null}

          <button
            className="r-btn r-btn--block"
            disabled={download.pending || !online}
            onClick={() => void download.run()}
            style={{ marginTop: 12 }}
            type="button"
          >
            <Download size={15} />
            {download.pending ? "Preparing…" : "Download PDF"}
          </button>
        </>
      ) : null}
    </div>
  );
}
