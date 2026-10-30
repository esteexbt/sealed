"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollLock } from "./useScrollLock";

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
  kind: "image" | "pdf" | "svg";
}

function unxor(buf: ArrayBuffer, keyB64: string) {
  const key = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= key[i % key.length];
  return out;
}

interface Tile {
  bmp: ImageBitmap;
  left: number;
  top: number;
  width: number;
  height: number;
}

const LENS = 240; // lens diameter in CSS px
const LENS_ZOOM = 2.6; // magnification relative to the displayed review copy

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
  const lensCanvas = useRef<HTMLCanvasElement>(null);
  const tile = useRef<Tile | null>(null);
  const inflight = useRef(false);
  const pressFresh = useRef(false);
  const pointer = useRef<{ nx: number; ny: number } | null>(null);
  const sess = useRef<Session | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [left, setLeft] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [lens, setLens] = useState<{ x: number; y: number; touch: boolean; w: number; h: number } | null>(null);
  const [sharp, setSharp] = useState(false);
  const [meta, setMeta] = useState<Session | null>(null);

  const wipe = useCallback(() => {
    tile.current?.bmp.close();
    tile.current = null;
    for (const c of [canvas.current, lensCanvas.current]) {
      if (!c) continue;
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      c.width = 1;
      c.height = 1;
    }
  }, []);

  const open = useCallback(async () => {
    setState("loading");
    setError("");
    setLens(null);
    tile.current?.bmp.close();
    tile.current = null;
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

  useScrollLock();

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

  /** Draws the lens: crisp from a native tile when one covers the spot, else from the review copy. */
  const drawLens = useCallback(() => {
    const s = sess.current;
    const p = pointer.current;
    const c = lensCanvas.current;
    const main = canvas.current;
    if (!s || !p || !c || !main) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(LENS * dpr);
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, px, px);

    const shown = main.getBoundingClientRect();
    // Native pixels covered by the lens at this zoom.
    const nativePerCss = s.original.width / (shown.width * LENS_ZOOM);
    const span = LENS * nativePerCss;
    const cx = p.nx * s.original.width;
    const cy = p.ny * s.original.height;
    const sx = cx - span / 2;
    const sy = cy - span / 2;

    // Review copy first (instant), then the sharp native tile over whatever part it covers.
    const k = s.w / s.original.width;
    ctx.drawImage(main, sx * k, sy * k, span * k, span * k, 0, 0, px, px);
    const t = tile.current;
    let covered = false;
    if (t) {
      const ix0 = Math.max(sx, t.left);
      const iy0 = Math.max(sy, t.top);
      const ix1 = Math.min(sx + span, t.left + t.width);
      const iy1 = Math.min(sy + span, t.top + t.height);
      if (ix1 > ix0 && iy1 > iy0) {
        const f = px / span;
        ctx.drawImage(t.bmp, ix0 - t.left, iy0 - t.top, ix1 - ix0, iy1 - iy0, (ix0 - sx) * f, (iy0 - sy) * f, (ix1 - ix0) * f, (iy1 - iy0) * f);
      }
      covered = ix0 === sx && iy0 === sy && ix1 === sx + span && iy1 === sy + span;
    }
    setSharp(Boolean(covered));
    return covered;
  }, []);

  const fetchTile = useCallback(async () => {
    const s = sess.current;
    const p = pointer.current;
    if (!s || !p || inflight.current || left <= 0) return;
    inflight.current = true;
    const fresh = pressFresh.current;
    pressFresh.current = false;
    try {
      const res = await fetch(`/api/view/${s.sid}/loupe?x=${p.nx.toFixed(4)}&y=${p.ny.toFixed(4)}${fresh ? "&fresh=1" : ""}`, {
        headers: { "x-sealed-view": s.sid },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      setLeft(Number(res.headers.get("X-Loupes-Left") || 0));
      const [l, t, w, h] = (res.headers.get("X-Tile") || "0,0,0,0").split(",").map(Number);
      const bmp = await bitmapFrom(res, s.key);
      tile.current?.bmp.close();
      tile.current = { bmp, left: l, top: t, width: w, height: h };
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inflight.current = false;
    }
    // The pointer may have moved on while this loaded.
    if (pointer.current && !drawLens()) fetchTile();
  }, [drawLens, left]);

  function track(e: React.PointerEvent<HTMLDivElement>) {
    const main = canvas.current;
    const stage = e.currentTarget.getBoundingClientRect();
    if (!main) return;
    const r = main.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    pointer.current = { nx, ny };
    setLens({ x: e.clientX - stage.left, y: e.clientY - stage.top, touch: e.pointerType !== "mouse", w: stage.width, h: stage.height });
    if (!drawLens()) fetchTile();
  }

  function press(e: React.PointerEvent<HTMLDivElement>) {
    if (state !== "ready" || hidden || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = canvas.current?.getBoundingClientRect();
    if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pressFresh.current = true;
    track(e);
  }

  /** Where the lens sits: centred on a mouse; on touch, clear of the finger and inside the stage. */
  function lensBox(l: { x: number; y: number; touch: boolean; w: number; h: number }) {
    const size = Math.min(LENS, Math.round(l.w * 0.6));
    const clamp = (v: number, max: number) => Math.max(4, Math.min(max - size - 4, v));
    let left = l.x - size / 2;
    let top = l.y - size / 2;
    if (l.touch) {
      const gap = 28;
      if (l.y - size - gap >= 4) top = l.y - size - gap;
      else {
        // No room above the finger: sit beside it instead.
        top = l.y - size / 2;
        left = l.x + gap + size <= l.w ? l.x + gap : l.x - gap - size;
      }
    }
    return { width: size, height: size, left: clamp(left, l.w), top: clamp(top, l.h) };
  }

  function release() {
    pointer.current = null;
    setLens(null);
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
                  : meta.kind === "svg"
                    ? "Vector file, rendered as a watermarked review copy. The SVG itself is released when you approve."
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
            <div
              className={`sv-shield${lens ? " sv-zooming" : ""}`}
              onPointerDown={press}
              onPointerMove={(e) => lens && track(e)}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
            >
              <canvas
                ref={lensCanvas}
                className={`sv-lens${sharp ? " sv-lens-sharp" : ""}`}
                aria-hidden
                style={lens ? lensBox(lens) : { display: "none" }}
              />
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
            <div className="sv-howto">
              <span className="sv-howto-icon" aria-hidden />
              <p className="small">
                <strong>Press and hold</strong> on the image to zoom, then glide to look around. The lens shows the original at full resolution.
              </p>
            </div>
            {left <= 20 && <p className="tiny muted">{left > 0 ? `Zoom is nearly used up for this session (${left} left).` : "Zoom limit reached. Reopen the preview to keep zooming."}</p>}
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
