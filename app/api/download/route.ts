import JSZip from "jszip";
import { currentFiles, read } from "@/lib/db";
import { readStored } from "@/lib/files";

/** All of a paid milestone's files in one zip, for the client. ?t=<portal token>&m=<milestone id> */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const mid = url.searchParams.get("m");
  const project = t ? read().projects.find((p) => p.portalToken === t) : undefined;
  const m = project?.milestones.find((x) => x.id === mid);
  if (!project || !m) return new Response("Not found", { status: 404 });
  if (m.status !== "paid") return new Response("These files unlock when you approve the work and payment is released.", { status: 402 });

  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of currentFiles(m)) {
    // Two uploads can share a name; keep both.
    let name = f.name.replace(/[\\/]/g, "_");
    for (let i = 2; used.has(name.toLowerCase()); i++) name = f.name.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    used.add(name.toLowerCase());
    zip.file(name, readStored(f.originalKey));
  }
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "files";
  const filename = `${slug(project.title)}-${slug(m.title)}.zip`;
  return new Response(body as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
