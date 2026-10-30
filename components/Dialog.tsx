"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * App-wide confirmation dialog and toast, replacing the browser's
 * window.confirm / window.alert.
 *
 *   const { confirm, notify } = useDialog();
 *   if (!(await confirm({ title, body, confirmLabel, tone: "danger" }))) return;
 *   notify("Saved.");
 */

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Danger dialogs can require typing a word to confirm. */
  typeToConfirm?: string;
}

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

interface Ctx {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  notify: (text: string, tone?: "ok" | "error") => void;
}

const DialogContext = createContext<Ctx | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setOpen({ ...o, resolve });
      }),
    [],
  );

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const close = (v: boolean) => {
    open?.resolve(v);
    setOpen(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {open && <ConfirmDialog {...open} onClose={close} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={`toast-item toast-item-${t.tone}`}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </p>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "default",
  typeToConfirm,
  onClose,
}: ConfirmOptions & { onClose: (v: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Danger dialogs focus the safe choice first, so Enter never destroys anything.
    (typeToConfirm ? inputRef.current : cancelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("button, input");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose, typeToConfirm]);

  return (
    <div className="dlg-backdrop" onClick={() => onClose(false)}>
      <div
        ref={panelRef}
        className={`dlg dlg-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby="dlg-body"
        onClick={(e) => e.stopPropagation()}
      >
        {tone === "danger" && <span className="dlg-mark" aria-hidden>!</span>}
        <h2 id="dlg-title">{title}</h2>
        {body && <div id="dlg-body" className="dlg-body">{body}</div>}
        {typeToConfirm && (
          <div className="field">
            <label htmlFor="dlg-type" className="small">
              Type <strong>{typeToConfirm}</strong> to confirm
            </label>
            <input
              id="dlg-type"
              ref={inputRef}
              className="input"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && onClose(true)}
            />
          </div>
        )}
        <div className="dlg-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => onClose(false)}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-ink"}`} disabled={!ready} onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
