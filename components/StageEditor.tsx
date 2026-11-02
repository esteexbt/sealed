"use client";

import { useState } from "react";

/** One stage while it's being edited. `id` is set for stages that already exist in a project. */
export interface EditStage {
  key: string;
  id?: string;
  title: string;
  description?: string;
  deliverables: string[];
  amount: number;
  /** New projects plan in days from now; existing projects use real dates. */
  dueInDays?: number;
  dueDate?: string;
  /** Under way (held, in review, paid): shown but can't change. */
  locked?: boolean;
  lockedReason?: string;
}

let n = 0;
export const stageKey = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const nice = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * The plan as a stack of stage cards: name, deliverables as chips, price and due date.
 * Used when creating a project and when editing its plan later.
 */
export function StageEditor({
  stages,
  onChange,
  currency,
  dueMode,
}: {
  stages: EditStage[];
  onChange: (next: EditStage[]) => void;
  currency: string;
  dueMode: "days" | "date";
}) {
  const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value || "$";
  const set = (key: string, patch: Partial<EditStage>) => onChange(stages.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const open = stages.filter((s) => !s.locked);

  return (
    <div className="se">
      <ol className="se-list">
        {stages.map((s, i) => (
          <li key={s.key} className={`se-card${s.locked ? " se-locked" : ""}`}>
            <div className="se-top">
              <span className="se-n" aria-hidden>{i + 1}</span>
              <input
                className="se-title"
                value={s.title}
                onChange={(e) => set(s.key, { title: e.target.value })}
                aria-label={`Stage ${i + 1} name`}
                placeholder="Stage name"
                readOnly={s.locked}
                maxLength={120}
              />
              {s.locked ? (
                <span className="se-lock" title={s.lockedReason}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  {s.lockedReason || "Under way"}
                </span>
              ) : (
                <button
                  type="button"
                  className="se-x"
                  onClick={() => onChange(stages.filter((x) => x.key !== s.key))}
                  disabled={open.length <= 1 && stages.length <= 1}
                  aria-label={`Remove ${s.title || `stage ${i + 1}`}`}
                  title="Remove stage"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" /></svg>
                </button>
              )}
            </div>
            {s.description && <p className="se-desc">{s.description}</p>}

            <Chips
              items={s.deliverables}
              locked={s.locked}
              onChange={(deliverables) => set(s.key, { deliverables })}
              label={`Stage ${i + 1} deliverables`}
            />

            <div className="se-terms">
              <label className="se-field">
                <span>Price</span>
                <span className="se-input se-money">
                  <i aria-hidden>{symbol}</i>
                  <input
                    inputMode="decimal"
                    onFocus={(e) => e.currentTarget.select()}
                    value={s.amount || ""}
                    placeholder="0"
                    readOnly={s.locked}
                    onChange={(e) => set(s.key, { amount: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                  />
                </span>
              </label>
              {dueMode === "days" ? (
                <label className="se-field">
                  <span>Due in</span>
                  <span className="se-input">
                    <input
                      inputMode="numeric"
                      onFocus={(e) => e.currentTarget.select()}
                      value={s.dueInDays ?? ""}
                      onChange={(e) => set(s.key, { dueInDays: Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                    />
                    <i aria-hidden>days</i>
                  </span>
                  <small>{nice(plusDays(s.dueInDays || 1))}</small>
                </label>
              ) : (
                <label className="se-field">
                  <span>Due</span>
                  <span className="se-input">
                    <input type="date" value={s.dueDate || ""} readOnly={s.locked} onChange={(e) => set(s.key, { dueDate: e.target.value })} />
                  </span>
                </label>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="se-add"
        onClick={() =>
          onChange([
            ...stages,
            { key: stageKey(), title: "", deliverables: [], amount: 0, ...(dueMode === "days" ? { dueInDays: Math.max(...stages.map((s) => s.dueInDays || 0), 7) + 7 } : { dueDate: plusDays(14) }) },
          ])
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        Add a stage
      </button>
    </div>
  );
}

/** Deliverables as removable chips, with a small input to add more (Enter or comma). */
function Chips({ items, onChange, locked, label }: { items: string[]; onChange: (v: string[]) => void; locked?: boolean; label: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length) onChange([...items, ...parts.filter((p) => !items.includes(p))]);
    setDraft("");
  };
  return (
    <div className="se-chips" aria-label={label}>
      {items.map((d) => (
        <span key={d} className="se-chip">
          {d}
          {!locked && (
            <button type="button" onClick={() => onChange(items.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
              ×
            </button>
          )}
        </span>
      ))}
      {!locked && (
        <input
          className="se-chip-in"
          value={draft}
          placeholder={items.length ? "Add deliverable" : "What you'll deliver, e.g. Logo files"}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && items.length) onChange(items.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add(draft)}
          aria-label="Add a deliverable"
        />
      )}
    </div>
  );
}
