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
        {busy ? "Sealing files…" : "Add deliverables"}
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
