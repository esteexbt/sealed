"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/Dialog";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type IRowNode,
  type RowClassRules,
  type ValueFormatterParams,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface LedgerRow {
  projectId: string;
  milestoneId: string;
  client: string;
  clientEmail: string;
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

/** Bottom summary row shares the shape; `kind` marks it so renderers can tell. */
type Row = LedgerRow & { kind?: "total" };

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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "unpaid", label: "Unpaid" },
  { key: "held", label: "Held" },
  { key: "paid", label: "Paid" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const STATUS_CLASS: Record<string, string> = {
  Paid: "status-paid",
  "Awaiting payment": "status-awaiting_payment",
  Overdue: "status-overdue",
  "Held, in review": "status-in_review",
  "Changes requested": "status-changes_requested",
  Refunded: "status-refunded",
  Cancelled: "status-cancelled",
};
const isHeld = (r?: Row) => r?.status === "Held, in review" || r?.status === "Changes requested";

const isOpen = (r?: Row) => r?.status === "Awaiting payment" || r?.status === "Overdue";
const today = () => new Date().toISOString().slice(0, 10);
const daysLate = (r?: Row) =>
  r && r.status === "Overdue" ? Math.floor((Date.parse(today()) - Date.parse(r.due)) / 86400000) : null;
const shortDate = (p: { value?: string | null }) =>
  p.value ? new Date(p.value + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

export function LedgerGrid({ rows }: { rows: LedgerRow[] }) {
  const router = useRouter();
  const api = useRef<GridApi<Row> | null>(null);
  const [quick, setQuick] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const filterRef = useRef<FilterKey>("all");
  const [totals, setTotals] = useState<Row[]>([]);
  const currency = rows[0]?.currency || "USD";
  const fmt = useCallback(
    (n: number, c = currency) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n),
    [currency],
  );

  const dialog = useDialog();
  const say = dialog.notify;

  /** Totals follow whatever is visible: search, chips and column filters all count. */
  const recomputeTotals = useCallback(() => {
    const g = api.current;
    if (!g) return;
    let collected = 0;
    let open = 0;
    let hold = 0;
    let count = 0;
    g.forEachNodeAfterFilter((n) => {
      if (!n.data) return;
      count++;
      if (n.data.status === "Paid") collected += n.data.amount;
      if (isOpen(n.data)) open += n.data.amount;
      if (isHeld(n.data)) hold += n.data.amount;
    });
    const next: Row[] = [
      {
        kind: "total",
        projectId: "",
        milestoneId: "",
        client: `${count} milestone${count === 1 ? "" : "s"}`,
        clientEmail: "",
        project: "",
        milestone: "",
        amount: collected + open + hold,
        currency,
        status: `${fmt(collected)} paid${hold ? `, ${fmt(hold)} held` : ""}, ${fmt(open)} open`,
        due: "",
        paidOn: "",
        captureId: "",
        reminders: 0,
        files: 0,
      },
    ];
    setTotals((prev) => (prev[0] && prev[0].client === next[0].client && prev[0].status === next[0].status && prev[0].amount === next[0].amount ? prev : next));
  }, [currency, fmt]);

  const remind = useCallback(
    async (row: Row, node: IRowNode<Row>) => {
      const res = await fetch(`/api/projects/${row.projectId}/milestones/${row.milestoneId}/remind`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return say(json.error || "The reminder didn't send.", "error");
      node.setData({ ...row, reminders: row.reminders + 1 });
      say(`Reminder sent to ${row.client} as a PayPal invoice.`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const cols = useMemo(() => {
    const defs: ColDef<Row>[] = [
      { field: "client", filter: true, flex: 1, minWidth: 140, tooltipValueGetter: (p) => (p.data?.kind ? null : `${p.data?.client}: ${p.data?.project}`) },
      { field: "project", hide: true },
      {
        field: "milestone",
        flex: 1.4,
        minWidth: 160,
        tooltipField: "milestone",
        editable: (p) => isOpen(p.data),
        cellClassRules: { "cell-editable": (p) => isOpen(p.data) },
      },
      {
        field: "amount",
        type: "rightAligned",
        width: 110,
        editable: (p) => isOpen(p.data),
        cellEditor: "agNumberCellEditor",
        cellEditorParams: { min: 0.01, max: 100000, precision: 2 },
        cellClassRules: { "cell-editable": (p) => isOpen(p.data) },
        valueFormatter: (p: ValueFormatterParams<Row, number>) => (p.value == null ? "" : fmt(p.value, p.data?.currency)),
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        width: 152,
        filter: true,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: (p: ICellRendererParams<Row, string>) =>
          p.data?.kind === "total" ? <span className="ledger-total-note">{p.value}</span> : <span className={`status ${STATUS_CLASS[p.value || ""] || "status-draft"}`}>{p.value}</span>,
        colSpan: (p) => (p.data?.kind === "total" ? 3 : 1),
      },
      {
        field: "due",
        headerName: "Due",
        width: 96,
        sort: "asc",
        editable: (p) => isOpen(p.data),
        cellEditor: "agDateStringCellEditor",
        cellClassRules: { "cell-editable": (p) => isOpen(p.data) },
        valueFormatter: shortDate,
      },
      {
        colId: "late",
        headerName: "Late",
        headerTooltip: "Days past the due date",
        width: 64,
        type: "rightAligned",
        valueGetter: (p) => daysLate(p.data),
        valueFormatter: (p) => (p.value ? `${p.value}d` : ""),
        cellClassRules: { "cell-late": (p) => (p.value || 0) > 0 },
      },
      { field: "paidOn", headerName: "Paid on", width: 96, valueFormatter: shortDate },
      { field: "captureId", headerName: "PayPal ID", width: 118, tooltipField: "captureId" },
      {
        colId: "action",
        headerName: "",
        width: 126,
        sortable: false,
        resizable: false,
        cellStyle: { display: "flex", alignItems: "center" },
        cellRenderer: (p: ICellRendererParams<Row>) =>
          p.data && isOpen(p.data) && p.node.rowPinned == null ? (
            <button
              type="button"
              className="grid-btn"
              title={
                !p.data.clientEmail
                  ? "Add a client email first"
                  : p.data.reminders
                    ? `Reminded ${p.data.reminders} time${p.data.reminders === 1 ? "" : "s"} already. Send ${p.data.client} another PayPal invoice reminder`
                    : `Send ${p.data.client} a PayPal invoice reminder`
              }
              disabled={!p.data.clientEmail}
              onClick={(e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = "Sending…";
                remind(p.data!, p.node).finally(() => {
                  btn.disabled = false;
                  btn.textContent = "Remind again";
                });
              }}
            >
              {p.data.reminders ? "Remind again" : "Remind"}
            </button>
          ) : null,
      },
    ];
    return defs;
  }, [fmt, remind]);

  const rowClassRules = useMemo<RowClassRules<Row>>(
    () => ({ "row-overdue": (p) => p.data?.status === "Overdue", "row-total": (p) => p.data?.kind === "total" }),
    [],
  );

  async function onEdit(e: CellValueChangedEvent<Row>) {
    if (!e.data || e.newValue === e.oldValue) return;
    const field = e.colDef.field as "milestone" | "amount" | "due";
    // Guard against a slipped keystroke sending a client a tiny price.
    if (
      field === "amount" &&
      Number(e.newValue) < Number(e.oldValue) / 2 &&
      !(await dialog.confirm({
        title: `Drop the price to ${fmt(Number(e.newValue))}?`,
        body: `${e.data.milestone} for ${e.data.client} goes from ${fmt(e.oldValue)} to ${fmt(Number(e.newValue))}. Your client sees the new price right away.`,
        confirmLabel: `Change to ${fmt(Number(e.newValue))}`,
        cancelLabel: `Keep ${fmt(e.oldValue)}`,
      }))
    ) {
      e.node.setDataValue("amount", e.oldValue);
      return;
    }
    const body = field === "milestone" ? { title: e.newValue } : field === "amount" ? { amount: Number(e.newValue) } : { dueDate: e.newValue };
    const res = await fetch(`/api/projects/${e.data.projectId}/milestones/${e.data.milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      e.node.setDataValue(e.colDef.field!, e.oldValue);
      return say(json.error || "That change didn't save.", "error");
    }
    // A new due date can move a milestone into or out of overdue.
    if (field === "due") {
      const status = json.dueDate < today() ? "Overdue" : "Awaiting payment";
      e.node.setData({ ...e.data, due: json.dueDate, status });
    }
    recomputeTotals();
    say(field === "amount" ? `Price saved. The client portal now shows ${fmt(json.amount, e.data.currency)}.` : "Saved.");
  }

  function setChip(k: FilterKey) {
    filterRef.current = k;
    setFilter(k);
    api.current?.onFilterChanged();
  }

  // Everything handed to the grid must keep the same identity between renders: a new function
  // or object makes the grid re-run filters, which recomputed totals, which re-rendered: a loop.
  const defaultColDef = useMemo<ColDef<Row>>(() => ({ sortable: true, resizable: true }), []);
  const getRowId = useCallback((p: { data: Row }) => p.data.milestoneId, []);
  const isExternalFilterPresent = useCallback(() => filterRef.current !== "all", []);
  const doesExternalFilterPass = useCallback((n: IRowNode<Row>) => {
    const st = n.data?.status;
    const f = filterRef.current;
    return f === "overdue" ? st === "Overdue" : f === "unpaid" ? isOpen(n.data) : f === "held" ? isHeld(n.data) : f === "paid" ? st === "Paid" : true;
  }, []);
  const onGridReady = useCallback(
    (e: { api: GridApi<Row> }) => {
      api.current = e.api;
      recomputeTotals();
    },
    [recomputeTotals],
  );
  const openRow = useCallback((e: { data?: Row }) => e.data && !e.data.kind && router.push(`/projects/${e.data.projectId}`), [router]);

  if (!rows.length) return <p className="muted">Nothing here yet. Create a project and its milestones appear in the ledger.</p>;

  return (
    <div className="ledger-body">
      <div className="ledger-bar">
        <div className="chips" role="group" aria-label="Show milestones">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setChip(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input className="input ledger-search" type="search" placeholder="Search clients or captures" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Search the ledger" />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              api.current?.exportDataAsCsv({
                fileName: `sealed-ai-ledger-${today()}.csv`,
                columnKeys: ["client", "project", "milestone", "amount", "status", "due", "late", "paidOn", "captureId"],
                skipPinnedBottom: true,
              })
            }
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="ledger-grid">
        <AgGridReact<Row>
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          quickFilterText={quick}
          includeHiddenColumnsInQuickFilter
          defaultColDef={defaultColDef}
          domLayout="autoHeight"
          rowHeight={46}
          getRowId={getRowId}
          pinnedBottomRowData={totals}
          rowClassRules={rowClassRules}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          tooltipShowDelay={400}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          onGridReady={onGridReady}
          onFilterChanged={recomputeTotals}
          onCellValueChanged={onEdit}
          onRowDoubleClicked={openRow}
          pagination={rows.length > 25}
          paginationPageSize={25}
          paginationPageSizeSelector={false}
        />
      </div>
      <p className="tiny muted">Click a dotted cell to edit an unpaid price, title or due date. Changes go to the client to approve before they pay. Double-click a row to open its project.</p>
    </div>
  );
}
