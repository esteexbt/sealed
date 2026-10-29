import "server-only";
import { generateObject, generateText, type LanguageModelV1 } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { aiMode, config } from "./config";
import type { ScopePlan } from "./types";

export function model(): LanguageModelV1 | null {
  if (aiMode === "anthropic")
    return createAnthropic({ apiKey: config.anthropicKey })(process.env.AI_MODEL || "claude-sonnet-4-5");
  if (aiMode === "openai") return createOpenAI({ apiKey: config.openaiKey })(process.env.AI_MODEL || "gpt-4.1");
  return null;
}

export const modelLabel =
  aiMode === "anthropic" ? "Claude (Anthropic)" : aiMode === "openai" ? "OpenAI" : "Offline planner";

const planSchema = z.object({
  title: z.string().describe("Short project title, e.g. 'Brand identity for Bean There Coffee'"),
  clientName: z.string().describe("Client or business name if given, else 'Client'"),
  clientEmail: z.string().describe("Client email if present in the brief, else empty string"),
  currency: z.string().describe("ISO currency code. Default USD unless the brief clearly uses another"),
  summary: z.string().describe("Two sentences: what will be delivered and the key constraint"),
  questions: z
    .array(z.string())
    .max(4)
    .describe("Questions the freelancer should ask before starting: things the brief leaves unclear that change price or scope"),
  milestones: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().describe("One sentence on what this stage achieves"),
        deliverables: z.array(z.string()).min(1).max(6).describe("Concrete files or outputs the client receives"),
        amount: z.number().positive().describe("Price for this milestone in the project currency"),
        dueInDays: z.number().int().positive().describe("Days from today the milestone is due"),
      }),
    )
    .min(2)
    .max(5),
});

const SCOPE_SYSTEM = `You are the scoping partner for an independent creative freelancer.
Turn a client's brief (often a messy DM or email) into a payment plan the freelancer can send.

Rules:
- Split the work into 2-5 milestones. Each milestone must end in something the client can see and receive, because payment unlocks those files.
- The first milestone should be small enough that a new client will pay it quickly (roughly 25-35% of the total).
- Price fairly for a skilled independent freelancer. If the brief states a budget, fit inside it and say in the summary what the budget covers. If no budget, use typical market rates.
- Respect any deadline in the brief: the final milestone is due before it.
- Questions are only for things that genuinely change price or scope. No filler.
- Never invent client contact details.`;

export async function scopeBrief(brief: string, freelancerRate?: string): Promise<ScopePlan> {
  const m = model();
  if (!m) return offlinePlan(brief);
  const { object } = await generateObject({
    model: m,
    schema: planSchema,
    system: SCOPE_SYSTEM,
    prompt: `Today is ${new Date().toISOString().slice(0, 10)}.${freelancerRate ? ` The freelancer's usual rate: ${freelancerRate}.` : ""}\n\nClient brief:\n"""\n${brief}\n"""`,
  });
  return object;
}

export async function draftReminder(opts: {
  clientName: string;
  milestoneTitle: string;
  amount: string;
  daysOverdue: number;
  remindersSent: number;
  portalUrl: string;
}): Promise<string> {
  const m = model();
  const fallback = offlineReminder(opts);
  if (!m) return fallback;
  const { text } = await generateText({
    model: m,
    system:
      "You write payment reminders for an independent freelancer. Warm, brief, never passive-aggressive, never grovelling. Plain text, no subject line, no placeholders. Under 90 words. Firmer with each reminder already sent, but always polite. Mention that the files unlock the moment payment goes through.",
    prompt: JSON.stringify(opts),
  });
  return text.trim() || fallback;
}

/* --------------------- Offline planner (no API key) --------------------- */

function offlineReminder(o: { clientName: string; milestoneTitle: string; amount: string; daysOverdue: number; remindersSent: number; portalUrl: string }) {
  const firm = o.remindersSent > 0;
  return `Hi ${o.clientName},\n\n${firm ? "Following up again on" : "A quick nudge on"} "${o.milestoneTitle}" (${o.amount}), which was due ${o.daysOverdue > 0 ? `${o.daysOverdue} day${o.daysOverdue === 1 ? "" : "s"} ago` : "today"}. Everything is ready on my side, and the files unlock the moment payment goes through:\n${o.portalUrl}\n\n${firm ? "Let me know if anything is holding this up." : "Thanks so much!"}\n${config.freelancerName}`;
}

function offlinePlan(brief: string): ScopePlan {
  const text = brief.toLowerCase();
  const email = brief.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || "";
  const budgetMatch = brief.match(/(?:\$|usd\s?)(\d[\d,]*)(k)?/i);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) * (budgetMatch[2] ? 1000 : 1) : 0;
  const weeks = Number(brief.match(/(\d+)\s*weeks?/i)?.[1] || 4);
  const nameMatch =
    brief.match(/(?:called|named)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/) ||
    brief.match(/(?:startup|company|brand|shop|business|store|restaurant|agency|app)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,2})/) ||
    brief.match(/(?:for|at)\s+(?:my\s+)?([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/);
  const clientName = nameMatch?.[1] || "Client";

  const kind = /website|landing|site|web app/.test(text)
    ? "web"
    : /video|motion|animation|reel/.test(text)
      ? "motion"
      : "brand";

  const templates: Record<string, ScopePlan["milestones"]> = {
    brand: [
      { title: "Discovery and logo concepts", description: "Pin down the direction and present first logo routes.", deliverables: ["Moodboard", "3 logo concepts"], amount: 0.3, dueInDays: 0.3 },
      { title: "Logo refinement", description: "Develop the chosen concept into a finished mark.", deliverables: ["Final logo (SVG, PNG)", "Logo variations"], amount: 0.35, dueInDays: 0.65 },
      { title: "Brand kit", description: "Package the identity so anyone can use it consistently.", deliverables: ["Color palette", "Typography", "Brand guidelines PDF", "Social templates"], amount: 0.35, dueInDays: 0.95 },
    ],
    web: [
      { title: "Wireframes and direction", description: "Agree the structure and look before anything is built.", deliverables: ["Sitemap", "Wireframes", "Style direction"], amount: 0.3, dueInDays: 0.3 },
      { title: "High-fidelity design", description: "Full designs for every page, desktop and mobile.", deliverables: ["Figma designs", "Clickable prototype"], amount: 0.35, dueInDays: 0.65 },
      { title: "Build and launch", description: "Ship the site live and hand it over.", deliverables: ["Live site", "Source files", "Handover notes"], amount: 0.35, dueInDays: 0.95 },
    ],
    motion: [
      { title: "Script and storyboard", description: "Lock the story and key frames.", deliverables: ["Script", "Storyboard"], amount: 0.3, dueInDays: 0.3 },
      { title: "Animatic", description: "Rough timing with sound to approve the pacing.", deliverables: ["Animatic video"], amount: 0.3, dueInDays: 0.6 },
      { title: "Final animation", description: "Polished, delivery-ready video.", deliverables: ["Final video (MP4)", "Social cutdowns"], amount: 0.4, dueInDays: 0.95 },
    ],
  };
  const total = budget || { brand: 1500, web: 2400, motion: 1800 }[kind]!;
  const days = Math.max(7, weeks * 7);
  const milestones = templates[kind].map((m) => ({
    ...m,
    amount: Math.round((total * m.amount) / 10) * 10,
    dueInDays: Math.max(2, Math.round(days * m.dueInDays)),
  }));
  const label = { brand: "Brand identity", web: "Website", motion: "Motion piece" }[kind];
  return {
    title: `${label} for ${clientName}`,
    clientName,
    clientEmail: email,
    currency: "USD",
    summary: `${label} delivered in ${milestones.length} paid stages over about ${Math.round(days / 7)} weeks.${budget ? ` Fits the stated budget of $${budget.toLocaleString()}.` : ""}`,
    questions: [
      "Do you have existing brand assets or references you like?",
      "Who signs off on each stage, and how many revision rounds do you expect?",
      ...(budget ? [] : ["What budget range are you working with?"]),
    ],
    milestones,
  };
}
