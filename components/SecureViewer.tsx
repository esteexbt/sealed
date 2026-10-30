"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Session {
  sid: string;
  w: number;
  h: number;
  B: number;
  cols: number;
  rows: number;
  perm: number[];
  key: string;
  expiresAt: number;
  code: string;
  original: { width: number; height: number };
  loupe: { left: number; size: number; sharper: boolean };
  page: number;
  pages: number;
  kind: "image" | "pdf";
}

function unxor(buf: ArrayBuffer, keyB64: string) {
  const key = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= key[i % key.length];
  return out;
}

async function bitmapFrom(res: Response, key: string) {
  const bytes = unxor(await res.arrayBuffer(), key);
  return createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
}

/**
 * Shows a review copy the client can inspect but not easily take away.
 * The bytes arrive scrambled and keyed; the image only exists, reassembled,
 * inside this canvas, and is wiped when the viewer closes or the session ends.
 */
export function SecureViewer({ token, fileId, fileName, onClose }: { token: string; fileId: string; fileName: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const loupeCanvas = useRef<HTMLCanvasElement>(null);
  const sess = useRef<Session | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [left, setLeft] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [inspect, setInspect] = useState<{ x: number; y: number; busy: boolean } | null>(null);
  const [meta, setMeta] = useState<Session | null>(null);

  const wipe = useCallback(() => {
    for (const c of [canvas.current, loupeCanvas.current]) {
      if (!c) continue;
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      c.width = 1;
      c.height = 1;
    }
  }, []);

  const open = useCallback(async () => {
    setState("loading");
    setError("");
    setInspect(null);
    try {
      const res = await fetch("/api/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, fileId, page }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The preview couldn't open.");
      const s = json as Session;
      sess.current = s;
      setMeta(s);
      setLeft(s.loupe.left);
      const mres = await fetch(`/api/view/${s.sid}/mosaic`, { headers: { "x-sealed-view": s.sid }, cache: "no-store" });
      if (!mres.ok) throw new Error(await mres.text());
      const bmp = await bitmapFrom(mres, s.key);
      const c = canvas.current!;
      c.width = s.w;
      c.height = s.h;
      const ctx = c.getContext("2d")!;
      const { B, cols, perm } = s;
      for (let k = 0; k < perm.length; k++) {
        const src = perm[k];
        ctx.drawImage(bmp, (k % cols) * B, Math.floor(k / cols) * B, B, B, (src % cols) * B, Math.floor(src / cols) * B, B, B);
      }
      bmp.close();
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [token, fileId, page]);

  useEffect(() => {
    open();
    return wipe;
  }, [open, wipe]);

  // Session countdown; the canvas is wiped when it ends.
  useEffect(() => {
    if (state !== "ready") return;
    const t = setInterval(() => {
      const ms = (sess.current?.expiresAt || 0) - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) {
        wipe();
        setState("expired");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [state, wipe]);

  // Deterrents: hide when focus leaves, block save/print shortcuts and the context menu.
  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => setHidden(document.visibilityState !== "visible");
    const onVis = () => setHidden(document.visibilityState !== "visible");
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "s" || k === "p" || k === "c")) e.preventDefault();
      if (k === "printscreen" || (e.metaKey && e.shiftKey)) {
        setHidden(true);
        setTimeout(() => setHidden(document.visibilityState !== "visible" || !document.hasFocus()), 1500);
      }
      if (k === "escape") onClose();
    };
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    document.body.classList.add("viewing");
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      document.body.classList.remove("viewing");
    };
  }, [onClose]);

  async function zoom(e: React.MouseEvent<HTMLDivElement>) {
    const s = sess.current;
    if (!s || state !== "ready" || left <= 0 || inspect?.busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setInspect({ x, y, busy: true });
    try {
      const res = await fetch(`/api/view/${s.sid}/loupe?x=${x.toFixed(4)}&y=${y.toFixed(4)}`, { headers: { "x-sealed-view": s.sid }, cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setLeft(Number(res.headers.get("X-Loupes-Left") || 0));
      const bmp = await bitmapFrom(res, s.key);
      const c = loupeCanvas.current!;
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      bmp.close();
      setInspect({ x, y, busy: false });
    } catch (err) {
      setError((err as Error).message);
      setInspect(null);
    }
  }

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="sv-backdrop" role="dialog" aria-modal="true" aria-label={`Review copy of ${fileName}`} onClick={onClose}>
      <div
        className="sv"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
      >
        <header className="sv-head">
          <div>
            <h2>{fileName}</h2>
            <p className="tiny muted">
              {!meta
                ? "Opening a protected review copy…"
                : meta.kind === "pdf"
                  ? `Page ${meta.page} of ${meta.pages}, rendered as a watermarked review copy. The PDF itself is released when you approve.`
                  : meta.original.width > meta.w
                  ? `Review copy at ${meta.w}×${meta.h}. The ${meta.original.width}×${meta.original.height} original is released when you approve.`
                  : `Shown at full ${meta.w}×${meta.h} size with your watermark. The clean original is released when you approve.`}
            </p>
          </div>
          <div className="row sv-tools">
            {meta && meta.pages > 1 && (
              <nav className="sv-pager" aria-label="Pages">
                <button type="button" className="btn btn-ghost small" disabled={page <= 1 || state === "loading"} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  ‹
                </button>
                <span className="small">
                  {page} / {meta.pages}
                </span>
                <button type="button" className="btn btn-ghost small" disabled={page >= meta.pages || state === "loading"} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  ›
                </button>
              </nav>
            )}
            <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
          </div>
        </header>

        <div className="sv-body">
          <div className={`sv-stage${hidden ? " sv-hidden" : ""}`}>
            <canvas ref={canvas} className="sv-canvas" aria-hidden />
            {/* Pointer layer: the canvas itself never receives right-clicks or drags. */}
            <div className="sv-shield" onClick={zoom} title={left > 0 ? "Click to inspect this spot at full resolution" : undefined}>
              {inspect && <span className="sv-target" style={{ left: `${inspect.x * 100}%`, top: `${inspect.y * 100}%` }} />}
            </div>
            {state === "loading" && <p className="sv-msg">Unsealing a review copy for you…</p>}
            {state === "expired" && (
              <div className="sv-msg">
                <p>This preview closed after 10 minutes.</p>
                <button className="btn btn-ink" onClick={open}>Open it again</button>
              </div>
            )}
            {state === "error" && (
              <div className="sv-msg">
                <p>{error}</p>
                <button className="btn btn-ghost" onClick={open}>Try again</button>
              </div>
            )}
            {hidden && state === "ready" && <p className="sv-msg">Hidden while this window isn’t in focus.</p>}
          </div>

          <aside className="sv-side">
            <div className={`sv-loupe${hidden ? " sv-hidden" : ""}`}>
              <canvas ref={loupeCanvas} className="sv-loupe-canvas" aria-hidden style={{ visibility: inspect && !inspect.busy ? "visible" : "hidden" }} />
              {!inspect && <p className="tiny muted">Click any spot on the image to see it at full, original resolution.</p>}
              {inspect?.busy && <p className="tiny muted">Loading full resolution…</p>}
            </div>
            <p className="tiny muted">{left} close-up{left === 1 ? "" : "s"} left in this session.</p>
            <ul className="sv-facts tiny">
              <li>Marked with your name and the code {meta?.code || "…"}, so any copy can be traced.</li>
              <li>The original file stays sealed on the server until you approve.</li>
              {state === "ready" && <li>Closes in {mins}:{String(secs).padStart(2, "0")}.</li>}
            </ul>
            {error && state === "ready" && <p className="error tiny">{error}</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
