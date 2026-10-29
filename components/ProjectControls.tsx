"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "Link copied" : "Copy client link"}
    </button>
  );
}

export function UploadFiles({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/files`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Upload failed. Try again.");
    if (input.current) input.current.value = "";
    router.refresh();
  }
  return (
    <div className="upload">
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} id={`up-${milestoneId}`} />
      <label htmlFor={`up-${milestoneId}`} className="btn btn-ghost small" aria-disabled={busy}>
        {busy ? "Sealing and checking files…" : "Add deliverables"}
      </label>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

export function RemindButton({ projectId, milestoneId, hasEmail }: { projectId: string; milestoneId: string; hasEmail: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  if (!hasEmail) return <span className="tiny muted">Add a client email to send reminders</span>;
  return (
    <span className="row">
      <button
        type="button"
        className="btn btn-quiet small"
        disabled={state !== "idle"}
        onClick={async () => {
          setState("busy");
          setError("");
          const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/remind`, { method: "POST" });
          const json = await res.json();
          if (!res.ok) {
            setError(json.error);
            setState("idle");
            return;
          }
          setState("sent");
          router.refresh();
        }}
      >
        {state === "busy" ? "Sending…" : state === "sent" ? "Reminder sent" : "Send PayPal reminder"}
      </button>
      {error && <span className="error small">{error}</span>}
    </span>
  );
}

/** Freelancer milestone actions: send a revision, release a hold, re-run the check, withdraw a file. */
export function MilestoneAction({
  projectId,
  milestoneId,
  action,
  label,
  busyLabel,
  confirm,
  tone = "ghost",
}: {
  projectId: string;
  milestoneId: string;
  action: "revision" | "cancel" | "check";
  label: string;
  busyLabel: string;
  confirm?: string;
  tone?: "ghost" | "ink" | "quiet";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="row">
      <button
        type="button"
        className={`btn btn-${tone} small`}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          const json = await res.json();
          setBusy(false);
          if (!res.ok) return setError(json.error || "That didn't go through.");
          router.refresh();
        }}
      >
        {busy ? busyLabel : label}
      </button>
      {error && <span className="error small">{error}</span>}
    </span>
  );
}

export function RemoveFile({ projectId, milestoneId, fileId, name }: { projectId: string; milestoneId: string; fileId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="file-x"
      aria-label={`Remove ${name}`}
      title="Remove this file"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`Remove ${name}? It stays in the record but your client won't see it.`)) return;
        setBusy(true);
        const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/files/${fileId}`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) window.alert((await res.json()).error);
        router.refresh();
      }}
    >
      {busy ? "…" : "Remove"}
    </button>
  );
}
