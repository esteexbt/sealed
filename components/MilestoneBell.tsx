"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useScrollLock } from "./useScrollLock";
import type { Notice } from "@/lib/notify";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Bell on each milestone: counts what the client did since the freelancer last looked. */
export function MilestoneBell({
  projectId,
  milestoneId,
  milestoneTitle,
  client,
  items,
  unreadIds,
  reviseBy,
}: {
  projectId: string;
  milestoneId: string;
  milestoneTitle: string;
  client: string;
  items: Notice[];
  unreadIds: string[];
  reviseBy: string | null;
}) {
  const [open, setOpen] = useState(false);
  // The ones that were new when the pop-up opened stay marked as new while it's open.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const router = useRouter();
  const count = unreadIds.length;
  // Lets other controls on the page (the "See what they asked" button) open this pop-up.
  useEffect(() => {
    const on = () => showRef.current();
    window.addEventListener(`notices:${milestoneId}`, on);
    return () => window.removeEventListener(`notices:${milestoneId}`, on);
  }, [milestoneId]);
  const label = count ? `${count} new update${count === 1 ? "" : "s"} from ${client}` : `Updates from ${client}`;

  const show = () => {
    setFresh(new Set(unreadIds));
    setOpen(true);
    if (count) fetch(`/api/projects/${projectId}/milestones/${milestoneId}/seen`, { method: "POST" }).then(() => router.refresh()).catch(() => {});
  };
  const showRef = useRef(show);
  showRef.current = show;

  return (
    <>
      <button type="button" className={`bell${count ? " bell-on" : ""}`} onClick={show} aria-label={label} title={label}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && <span className="bell-count">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <NoticeDialog
          title={milestoneTitle}
          client={client}
          items={items}
          fresh={fresh}
          reviseBy={reviseBy}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function NoticeDialog({
  title,
  client,
  items,
  fresh,
  reviseBy,
  onClose,
}: {
  title: string;
  client: string;
  items: Notice[];
  fresh: Set<string>;
  reviseBy: string | null;
  onClose: () => void;
}) {
  useScrollLock();
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const todo = items.some((n) => n.open);

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div className="dlg dlg-wide nt" role="dialog" aria-modal="true" aria-labelledby="nt-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <div>
            <h2 id="nt-title">Updates from {client}</h2>
            <p className="small muted">{title}</p>
          </div>
          <button ref={closeBtn} type="button" className="nt-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <p className="dlg-body">Nothing yet. When {client} pays, asks for changes or approves, it shows up here.</p>
        ) : (
          <ol className="nt-list">
            {items.map((n) => (
              <li key={n.id} className={`nt-item nt-${n.kind}${fresh.has(n.id) ? " nt-new" : ""}`}>
                <span className="nt-dot" aria-hidden />
                <div className="nt-main">
                  <div className="nt-row">
                    <strong>{n.title}</strong>
                    {fresh.has(n.id) && <span className="nt-badge">New</span>}
                  </div>
                  <span className="tiny muted">{fmt(n.at)}</span>
                  {n.note && <blockquote className="nt-note">{n.note}</blockquote>}
                  {n.kind === "changes" && (
                    <span className={`nt-state ${n.open ? "nt-todo" : "nt-done"}`}>
                      {n.open
                        ? `To do${reviseBy ? `, revise by ${fmt(reviseBy)}` : ""}`
                        : n.resolvedAt
                          ? `Done, revision sent ${fmt(n.resolvedAt)}`
                          : "Closed"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="dlg-actions nt-foot">
          {todo && <p className="small muted">Upload the fixed files, remove the old ones, then press Send revision.</p>}
          <button type="button" className="btn btn-ink" onClick={onClose}>
            {todo ? "Got it" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keeps the freelancer's page current, so a new change request shows without a reload. */
export function LiveRefresh({ every = 20000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden && !document.querySelector(".dlg-backdrop")) router.refresh();
    }, every);
    const onVis = () => !document.hidden && router.refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, every]);
  return null;
}

/** Opens a milestone's updates pop-up from elsewhere on the page. */
export function OpenNotices({ milestoneId, children }: { milestoneId: string; children: React.ReactNode }) {
  return (
    <button type="button" className="ms-note-link" onClick={() => window.dispatchEvent(new Event(`notices:${milestoneId}`))}>
      {children}
    </button>
  );
}
