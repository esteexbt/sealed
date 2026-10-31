import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { scopeBrief } from "@/lib/ai";

export async function POST(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const { brief, rate } = (await req.json()) as { brief?: string; rate?: string };
  if (!brief || brief.trim().length < 15) {
    return NextResponse.json({ error: "Paste the client's brief or message first. A sentence or two is enough." }, { status: 400 });
  }
  try {
    const plan = await scopeBrief(brief.slice(0, 6000), rate);
    return NextResponse.json({ plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "The planner couldn't read that brief. Try again, or add a little more detail." }, { status: 502 });
  }
}
