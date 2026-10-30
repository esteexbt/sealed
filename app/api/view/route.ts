import { NextResponse } from "next/server";
import { openView, ViewError } from "@/lib/view";

export async function POST(req: Request) {
  const { token, fileId, page } = (await req.json()) as { token?: string; fileId?: string; page?: number };
  if (!token || !fileId) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  try {
    return NextResponse.json(await openView(token, fileId, page), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof ViewError ? e.status : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: status === 500 ? "The preview couldn't open. Try again." : (e as Error).message }, { status });
  }
}
