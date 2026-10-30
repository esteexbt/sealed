"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "./useScrollLock";

/** The client's "Request changes" form, as a focused pop-up. */
export function ChangeRequestDialog({
  milestoneTitle,
  amount,
  freelancer,
  deliverables,
  busy,
  error,
  onSend,
  onClose,
}: {
  milestoneTitle: string;
  amount: string;
  freelancer: string;
  deliverables: string[];
  busy: boolean;
  error: string;
  onSend: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  useScrollLock();

  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const ok = note.trim().length >= 10;
  const add = (d: string) => setNote((n) => (n.trim() ? `${n.trimEnd()}\n` : "") + `${d}: `);

  return (
    <div className="dlg-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="dlg dlg-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cr-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onSend(note.trim());
        }}
      >
        <h2 id="cr-title">What needs to change?</h2>
        <p className="dlg-body">
          {freelancer} gets 3 days to send a revision for <strong>{milestoneTitle}</strong>. Your {amount} stays held by PayPal the whole time, and if the revision doesn’t arrive you can cancel and get it back.
        </p>
        {deliverables.length > 1 && (
          <div className="cr-chips" aria-label="Point to a deliverable">
            {deliverables.map((d) => (
              <button key={d} type="button" className="chip" onClick={() => add(d)}>
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="cr-note" className="small">
            Be specific: what’s wrong, and what would make it right.
          </label>
          <textarea
            id="cr-note"
            ref={area}
            className="textarea"
            style={{ minHeight: 140 }}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The SVG logo is missing, and the palette needs a lighter green for the cups."
          />
          <span className="tiny muted" style={{ justifySelf: "end" }}>
            {note.trim().length < 10 ? "A sentence or two is enough." : `${note.length} / 2000`}
          </span>
        </div>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-ink" disabled={!ok || busy}>
            {busy ? "Sending…" : "Send change request"}
          </button>
        </div>
      </form>
    </div>
  );
}
