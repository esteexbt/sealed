import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { CoreMessage } from "ai";
import { confirmPending, runAgent, type AgentReply } from "@/lib/agent";

export async function POST(req: Request) {
  const { user, denied } = await requireUser();
  if (denied) return denied;
  const body = (await req.json()) as { messages?: CoreMessage[]; confirm?: AgentReply["pending"] };
  try {
    if (body.confirm) return NextResponse.json(await confirmPending(body.confirm, user));
    const messages = (body.messages || []).slice(-20);
    if (!messages.length) return NextResponse.json({ error: "Ask something first." }, { status: 400 });
    return NextResponse.json(await runAgent(messages, user));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ text: `That didn't go through: ${(e as Error).message}`, steps: [] });
  }
}
