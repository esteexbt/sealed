"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "./useScrollLock";

export interface FileFacts {
  name: string;
  /** e.g. "PNG", "PDF", "SVG vector" */
  type: string;
  size: number;
  width?: number | null;
  height?: number | null;
  pages?: number | null;
  sha256?: string | null;
  uploadedAt?: string | null;
}

export const fileType = (name: string, opts: { pdf?: boolean; svg?: boolean } = {}) =>
  opts.pdf ? "PDF" : opts.svg ? "SVG vector" : (name.split(".").pop() || "File").toUpperCase();

export const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The facts about one delivered file, as a definition list. */
export function FileDetails({ f }: { f: FileFacts }) {
  const [copied, setCopied] = useState(false);
  return (
    <dl className="fd-facts">
      <div>
        <dt>Type</dt>
        <dd>{f.type}</dd>
      </div>
      {f.pages ? (
        <div>
          <dt>Pages</dt>
          <dd>{f.pages}</dd>
        </div>
      ) : f.width ? (
        <div>
          <dt>Size</dt>
          <dd>
            {f.width} × {f.height} px
          </dd>
        </div>
      ) : null}
      <div>
        <dt>File size</dt>
        <dd>{formatSize(f.size)}</dd>
      </div>
      {f.uploadedAt && (
        <div>
          <dt>Delivered</dt>
          <dd>{when(f.uploadedAt)}</dd>
        </div>
      )}
      {f.sha256 && (
        <div className="fd-hash">
          <dt>
            Fingerprint
            <button
              type="button"
              className="fd-copy"
              onClick={() => {
                navigator.clipboard?.writeText(f.sha256!).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </dt>
          <dd title="SHA-256 of the file as delivered. Any change to the file changes this.">{f.sha256}</dd>
        </div>
      )}
    </dl>
  );
}

/** A delivered file, opened from its thumbnail: the picture large, the facts beside it, and what you can do with it. */
export function FileDialog({
  f,
  src,
  sealed = false,
  note,
  actions,
  onClose,
}: {
  f: FileFacts;
  /** Image to show; null shows the file type instead. */
  src: string | null;
  /** True when the picture is the blurred, watermarked preview. */
  sealed?: boolean;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  useScrollLock();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="fd" role="dialog" aria-modal="true" aria-label={f.name} onClick={(e) => e.stopPropagation()}>
        <div className={`fd-media${sealed ? " fd-sealed" : ""}`}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={sealed ? `${f.name}, sealed preview` : f.name} draggable={false} onContextMenu={(e) => sealed && e.preventDefault()} />
          ) : (
            <span className="fd-generic">{f.type}</span>
          )}
        </div>
        <div className="fd-side">
          <div className="fd-head">
            <h2>{f.name}</h2>
            <button type="button" className="nt-x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <FileDetails f={f} />
          {note && <div className="fd-note small">{note}</div>}
          {actions && <div className="fd-actions">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
    </svg>
  );
}

export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
