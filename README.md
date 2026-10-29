# Sealed AI

**Your work stays sealed until you're paid.**

Sealed AI is an AI agent for freelancers. Paste a client's brief and it returns a priced milestone plan. Deliverables are shown to the client as sealed, watermarked previews. When the client pays a milestone with PayPal, the seal breaks and the full files unlock. An assistant built on the PayPal Agent Toolkit chases late payments for you, and asks before it sends anything.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## The problem

Freelancers routinely deliver work and then wait weeks to get paid, or never get paid at all. Invoicing tools stop at "invoice sent". After that, the freelancer is left chasing, and the client already has the files.

## How Sealed AI works

1. **Brief to plan (AI).** Paste a DM, email or call notes. The scoping agent splits the work into 2–5 milestones, each ending in something the client can see. It prices them (fitting a stated budget), dates them against the client's deadline, and lists the questions worth asking first. Every field stays editable.
2. **Sealed deliverables.** Upload files to a milestone. Images get a blurred, watermarked preview generated on the server. The client portal shows only previews, behind a wax seal.
3. **Pay to unlock (PayPal).** The client pays a milestone through PayPal Checkout. Sealed AI captures the order on the server and unlocks the originals only after PayPal confirms a `COMPLETED` capture for exactly that milestone, amount and currency. The seal cracks open and the downloads appear.
4. **The assistant chases payments (AI + PayPal Agent Toolkit).** Ask "who owes me money?" or "remind whoever is most overdue". The assistant reads your receivables, drafts a reminder in a tone that gets firmer with each one sent, shows it to you, and only after you approve sends it as a PayPal invoice that links back to the portal. It can also look up invoices, orders and transactions in PayPal, and refund a milestone (which seals its files again).
5. **Ledger (AG Grid).** Every milestone across every client, reconciled against PayPal capture IDs. Unpaid prices, titles and due dates are edited in the grid and saved to the server; the client portal updates immediately, and a checkout opened at the old price can no longer be captured. Paid milestones are locked. Quick filters (Overdue, Unpaid, Paid), a live totals row that follows every filter, a days-late column, one-click PayPal reminders per row, and CSV export for accounting.

## How PayPal is used

| Capability | API | Where |
|---|---|---|
| Client checkout | JS SDK Buttons + **Orders v2** create / capture | `app/p/[token]/Portal.tsx`, `lib/paypal.ts` |
| Payment-gated delivery | Server-side capture verification (status, `custom_id`, amount, currency) | `lib/actions.ts` → `completeCheckout` |
| Payment reminders | **Invoicing v2** create + send | `lib/paypal.ts` → `createAndSendInvoice` |
| Refunds | **Payments v2** capture refund | `lib/paypal.ts` → `refundCapture` |
| Agentic operations | **PayPal Agent Toolkit** (`@paypal/agent-toolkit/ai-sdk`): `list_invoices`, `get_invoice`, `search_invoicing`, `send_invoice_reminder`, `get_order`, `list_transactions`, `get_merchant_insights` | `lib/agent.ts` |

## How AI is used

The app uses one AI provider through the **Vercel AI SDK**, picked by which key is set: Groq (`GROQ_API_KEY`, free tier, GPT-OSS 120B), Google Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`, free tier), Anthropic Claude, or OpenAI.

- **Scoping agent** (`lib/ai.ts`, `generateObject` with a Zod schema): turns an unstructured brief into a typed milestone plan with prices, dates and open questions.
- **Reminder writer** (`lib/ai.ts`, `generateText`): drafts payment reminders whose tone escalates with the number already sent.
- **Money assistant** (`lib/agent.ts`, `generateText` with tools and multi-step calling): combines Sealed AI's own tools with the PayPal Agent Toolkit's tools. Actions that move money (sending an invoice, refunding) need two steps: a preview call, then a confirmed call after the user says yes.

With no AI key set, or if the provider errors or a free-tier quota runs out, Sealed AI falls back to a rule-based planner and assistant, so the app never breaks mid-demo. The live AI path is what the demo shows.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your keys (all optional)
npm run seed                 # demo data: 3 clients, sealed logo concepts, one overdue payment
npm run dev
```

Open http://localhost:3000. The seed script prints a client portal link.

- **PayPal:** create a sandbox app at developer.paypal.com (Apps & Credentials, Sandbox) and set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Pay in the portal with your sandbox personal account. With no keys set, payments are simulated end to end, using the same verification code path.
- **AI:** set `GROQ_API_KEY` (free at console.groq.com) or `GOOGLE_GENERATIVE_AI_API_KEY` (free at aistudio.google.com). Anthropic and OpenAI keys also work. `AI_MODEL` overrides the default model.
- **Dashboard password:** set `OWNER_PASSWORD` when deployed. Clients never need an account; their portal link holds an unguessable token.

## Deploy

`render.yaml` deploys Sealed AI to Render as a single web service. The demo start script seeds data only when the store is empty.

## Testing notes for judges

- Live demo: _added at submission_
- Dashboard password: _added at submission_
- PayPal sandbox buyer: _added at submission_

## Security model

- The client portal receives preview URLs only; original file keys never reach the browser.
- `/api/files/:id?variant=full` returns `402` for clients until the milestone is paid. Requests without a portal token need the owner session.
- A milestone becomes `paid` only inside `completeCheckout`, after PayPal confirms the capture. A refund flips it back and the files seal again.
- Orders and captures use `PayPal-Request-Id` idempotency keys.

## Stack

Next.js 16 (App Router), TypeScript, Vercel AI SDK, PayPal Agent Toolkit, PayPal REST APIs and JS SDK, AG Grid Community, sharp. Type: Young Serif and Public Sans.

## License

MIT
