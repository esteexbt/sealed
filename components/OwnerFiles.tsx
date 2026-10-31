"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "./Dialog";
import { DownloadIcon, FileDialog, fileType, type FileFacts } from "./FileDialog";

export interface OwnerFile {
  id: string;
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  pages: number | null;
  sha256: string | null;
  uploadedAt: string;
  pdf: boolean;
  svg: boolean;
  hasPreview: boolean;
}

/** The freelancer's view of a stage's files: thumbnails only; details open in a pop-up. */
export function OwnerFiles({ projectId, milestoneId, files, editable }: { projectId: string; milestoneId: string; files: OwnerFile[]; editable: boolean }) {
  const [open, setOpen] = useState<OwnerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const dialog = useDialog();
  const thumb = (f: OwnerFile) => (f.hasPreview ? `/api/files/${f.id}?variant=${f.pdf || f.svg ? "page" : "full"}` : null);
  const facts = (f: OwnerFile): FileFacts => ({ name: f.name, type: fileType(f.name, f), size: f.size, width: f.width, height: f.height, pages: f.pages, sha256: f.sha256, uploadedAt: f.uploadedAt });

  async function remove(f: OwnerFile) {
    setOpen(null);
    const ok = await dialog.confirm({
      title: `Remove ${f.name}?`,
      body: "Your client won’t see it any more. It stays in the project record with its fingerprint, so there’s always proof of what was delivered.",
      confirmLabel: "Remove file",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/files/${f.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return dialog.notify((await res.json()).error || "The file couldn’t be removed.", "error");
    dialog.notify(`Removed ${f.name}.`);
    router.refresh();
  }

  return (
    <>
      <ul className="files">
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" className="ft" onClick={() => setOpen(f)} title={f.name} aria-label={`Open ${f.name}`}>
              {thumb(f) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb(f)!} alt="" loading="lazy" />
              ) : (
                <span className="ft-generic">{fileType(f.name, f)}</span>
              )}
              <span className="ft-type">{f.pdf ? "PDF" : f.svg ? "SVG" : (f.name.split(".").pop() || "").toUpperCase()}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <FileDialog
          f={facts(open)}
          src={thumb(open) && (open.pdf || open.svg ? thumb(open) : `/api/files/${open.id}?variant=full`)}
          note={editable ? null : "Files are locked while the client reviews or after payment, so what was delivered can’t change."}
          onClose={() => setOpen(null)}
          actions={
            <>
              <a className="btn btn-ghost" href={`/api/files/${open.id}?variant=full&download=1`} download={open.name}>
                <DownloadIcon /> Download original
              </a>
              {editable && (
                <button type="button" className="btn btn-danger-outline" onClick={() => remove(open)} disabled={busy}>
                  {busy ? "Removing…" : "Remove file"}
                </button>
              )}
            </>
          }
        />
      )}
    </>
  );
}
