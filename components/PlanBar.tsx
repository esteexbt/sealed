"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StageEditor, stageKey, type EditStage } from "./StageEditor";
import { useScrollLock } from "./useScrollLock";
import { useDialog } from "./Dialog";

export interface PlanStage {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  amount: number;
  dueDate: string;
  locked: boolean;
  lockedReason: string;
}

/**
 * Where the plan stands with the client, on the freelancer's project page:
 * waiting for approval, changes asked for, or approved. "Edit plan" opens the editor;
 * saving sends the plan back to the client to approve.
 */
export function PlanBar({
  projectId,
  client,
  currency,
  status,
  version,
  agreedAt,
  request,
  stages,
}: {
  projectId: string;
  client: string;
  currency: string;
  status: "pending" | "changes" | "agreed";
  version: number;
  agreedAt: string | null;
  request: { at: string; note: string } | null;
  stages: PlanStage[];
}) {
  const [editing, setEditing] = useState(false);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const icon =
    status === "agreed" ? (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 10.5l3.6 3.5 7.4-8" /></svg>
    ) : status === "changes" ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 5h14v10H9l-4 4V5Z" /></svg>
    ) : (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
    );

  return (
    <>
      <div className={`planbar planbar-${status}`} role="status">
        <span className="planbar-ic">{icon}</span>
        <div className="planbar-text">
          {status === "agreed" ? (
            <>
              <strong>Plan approved{agreedAt ? ` ${day(agreedAt)}` : ""}</strong>
              <span>{client} agreed the stages and prices. Changing them sends the plan back for approval.</span>
            </>
          ) : status === "changes" ? (
            <>
              <strong>{client} asked for changes to the plan</strong>
              <span className="planbar-note">“{request?.note}”</span>
            </>
          ) : (
            <>
              <strong>{version > 1 ? `Waiting for ${client} to approve your changes` : `Waiting for ${client} to approve the plan`}</strong>
              <span>They can’t pay for any stage until they do. Share the client link if you haven’t.</span>
            </>
          )}
        </div>
        <button type="button" className={`btn ${status === "changes" ? "btn-seal" : "btn-ghost"} planbar-btn`} onClick={() => setEditing(true)}>
          {status === "changes" ? "Update the plan" : "Edit plan"}
        </button>
      </div>
      {editing && <PlanDialog projectId={projectId} client={client} currency={currency} initial={stages} agreed={status === "agreed"} request={status === "changes" ? request : null} onClose={() => setEditing(false)} />}
    </>
  );
}

function PlanDialog({
  projectId,
  client,
  currency,
  initial,
  agreed,
  request,
  onClose,
}: {
  projectId: string;
  client: string;
  currency: string;
  initial: PlanStage[];
  agreed: boolean;
  request: { at: string; note: string } | null;
  onClose: () => void;
}) {
  useScrollLock();
  const router = useRouter();
  const dialog = useDialog();
  const box = useRef<HTMLDivElement>(null);
  const [stages, setStages] = useState<EditStage[]>(() =>
    initial.map((s) => ({ key: stageKey(), id: s.id, title: s.title, description: s.description, deliverables: s.deliverables, amount: s.amount, dueDate: s.dueDate, locked: s.locked, lockedReason: s.lockedReason })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const total = stages.reduce((a, s) => a + (s.amount || 0), 0);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    setError("");
    const bad = stages.find((x) => !x.title.trim()) ? "Give every stage a name." : stages.find((x) => !(x.amount > 0)) ? "Give every stage a price." : stages.find((x) => !x.deliverables.length) ? "List at least one deliverable for each stage." : "";
    if (bad) return setError(bad);
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stages.map((s) => ({ id: s.id, title: s.title, deliverables: s.deliverables, amount: s.amount, dueDate: s.dueDate })) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "That didn’t save. Try again.");
    onClose();
    router.refresh();
    dialog.notify(json.changed ? `Plan updated. ${client} needs to approve it before paying.` : "No changes to save.");
  }

  return (
    <div className="dlg-backdrop" onClick={() => !busy && onClose()}>
      <div ref={box} tabIndex={-1} className="dlg dlg-wide plan-dlg" role="dialog" aria-modal="true" aria-labelledby="pd-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <div>
            <h2 id="pd-title">Edit the plan</h2>
            <p className="small muted">
              {agreed ? `${client} already approved this plan. Saving changes sends it back to them to approve again.` : `${client} approves the plan before paying for anything.`}
            </p>
          </div>
          <button type="button" className="nt-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>
        <div className="plan-dlg-body">
          {request && (
            <div className="plan-dlg-req">
              <strong>{client} asked:</strong> “{request.note}”
            </div>
          )}
          <StageEditor stages={stages} onChange={setStages} currency={currency} dueMode="date" />
        </div>
        <div className="plan-dlg-foot">
          <p className="plan-sum">
            <strong className="plan-total">{fmt(total)}</strong>
            <span className="muted"> in {stages.length} payment{stages.length === 1 ? "" : "s"}</span>
          </p>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-seal" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save and send to client"}</button>
          </div>
          {error && <p className="error small" role="alert" style={{ flexBasis: "100%" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
