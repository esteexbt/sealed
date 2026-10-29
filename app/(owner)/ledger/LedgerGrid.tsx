"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ValueFormatterParams } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface LedgerRow {
  projectId: string;
  client: string;
  project: string;
  milestone: string;
  amount: number;
  currency: string;
  status: string;
  due: string;
  paidOn: string;
  captureId: string;
  reminders: number;
  files: number;
}

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  headerFontWeight: 650,
  foregroundColor: "#1a2238",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f5f7f9",
  borderColor: "#d6dbe4",
  rowHoverColor: "#f2f4f7",
  accentColor: "#a8142c",
  borderRadius: 6,
  wrapperBorderRadius: 10,
  spacing: 7,
  fontSize: 14,
});

const shortDate = (p: { value?: string | null }) =>
  p.value ? new Date(p.value + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

const STATUS_CLASS: Record<string, string> = {
  Paid: "status-paid",
  "Awaiting payment": "status-awaiting_payment",
  Overdue: "status-overdue",
  Refunded: "status-refunded",
};

export function LedgerGrid({ rows, collected, pending }: { rows: LedgerRow[]; collected: number; pending: number }) {
  const router = useRouter();
  const [quick, setQuick] = useState("");
  const currency = rows[0]?.currency || "USD";
  const fmt = (n: number, c = currency) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

  const cols = useMemo<ColDef<LedgerRow>[]>(
    () => [
      { field: "client", filter: true, flex: 1, minWidth: 130 },
      { field: "project", filter: true, flex: 1.3, minWidth: 140 },
      { field: "milestone", flex: 1.2, minWidth: 150 },
      {
        field: "amount",
        type: "rightAligned",
        width: 110,
        valueFormatter: (p: ValueFormatterParams<LedgerRow, number>) => (p.value == null ? "" : fmt(p.value, p.data?.currency)),
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        width: 160,
        filter: true,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: (p: { value: string }) => <span className={`status ${STATUS_CLASS[p.value] || "status-draft"}`}>{p.value}</span>,
      },
      { field: "due", headerName: "Due", width: 100, sort: "asc", valueFormatter: shortDate },
      { field: "paidOn", headerName: "Paid on", width: 100, valueFormatter: shortDate },
      { field: "captureId", headerName: "PayPal capture", width: 170 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency],
  );

  if (!rows.length) return <p className="muted">Nothing here yet. Create a project and its milestones appear in the ledger.</p>;

  return (
    <div className="ledger-body">
      <div className="ledger-bar">
        <p>
          <strong className="amount">{fmt(collected)}</strong> <span className="muted">collected</span>
          <span className="ledger-sep" aria-hidden />
          <strong className="amount" style={{ color: "var(--wax)" }}>{fmt(pending)}</strong> <span className="muted">still sealed</span>
        </p>
        <input className="input ledger-search" type="search" placeholder="Search clients, projects, captures" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Search the ledger" />
      </div>
      <div className="ledger-grid">
        <AgGridReact<LedgerRow>
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          quickFilterText={quick}
          defaultColDef={{ sortable: true, resizable: true }}
          domLayout="autoHeight"
          rowHeight={46}
          pagination={rows.length > 25}
          paginationPageSize={25}
          onRowDoubleClicked={(e) => e.data && router.push(`/projects/${e.data.projectId}`)}
        />
      </div>
      <p className="tiny muted">Double-click a row to open its project.</p>
    </div>
  );
}
