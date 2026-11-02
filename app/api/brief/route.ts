import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { BriefError, briefFromFile, briefFromUrl } from "@/lib/brief";
import { limited } from "@/lib/limit";

/** Turns an uploaded file (multipart "file") or a link (JSON { url }) into brief text. */
export async function POST(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  if (limited(`brief:${user.id}`, 30)) return NextResponse.json({ error: "Too many briefs at once. Try again in a few minutes." }, { status: 429 });
  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
      if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "That file is over 15 MB." }, { status: 413 });
      return NextResponse.json(await briefFromFile(file));
    }
    const { url } = (await req.json()) as { url?: string };
    if (!url?.trim()) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });
    return NextResponse.json(await briefFromUrl(url));
  } catch (e) {
    if (e instanceof BriefError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[brief]", e);
    return NextResponse.json({ error: "Couldn’t read that brief. Paste the text instead." }, { status: 500 });
  }
}
