# Sealed

**Your work stays sealed until you're paid.**

Sealed is an AI agent for freelancers. Paste a client's brief and it returns a priced milestone plan. Deliverables are shown to the client as sealed, watermarked previews. When the client pays a milestone with PayPal, the seal breaks and the full files unlock. An assistant built on the PayPal Agent Toolkit chases late payments for you, and asks before it sends anything.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). [Watch the demo (2:36)](https://youtu.be/mc9wJs3TSCE) · [Try it live](https://sealedhq.onrender.com)

## The problem

Freelancers routinely deliver work and then wait weeks to get paid, or never get paid at all. Invoicing tools stop at "invoice sent". After that, the freelancer is left chasing, and the client already has the files.

## How Sealed works

1. **Brief to plan (AI).** Paste a DM, email or call notes. The scoping agent splits the work into 2–5 milestones, each ending in something the client can see. It prices them (fitting a stated budget), dates them against the client's deadline, and lists the questions worth asking first. Every field stays editable.
2. **Deliver and get checked (AI).** The freelancer uploads each stage's files. Each file is fingerprinted (SHA-256) and measured. A delivery check compares the files against the agreed deliverables: rules prove the facts (counts, formats, sizes, duplicates), and Gemini looks at the images to judge whether they match and look finished. Both sides see the same check before any money moves.
3. **Pay into a PayPal hold.** The client sees sealed previews and the check, then pays with PayPal Checkout using `intent: AUTHORIZE`. PayPal reserves the money on the client's account; it is not sent to the freelancer yet. Sealed verifies the authorization (status, `custom_id`, amount, currency) on the server before anything changes.
4. **Review the full work, protected.** While the money is held, the client opens a protected review copy of each image, SVG or PDF page and can inspect any spot at full original resolution. PDFs are rendered page by page on the server (pdf.js), so the PDF file itself never reaches the client before approval either. The original file never leaves the server.
5. **Approve, or ask for changes.**
   - **Approve** captures the authorization: the freelancer is paid, the seal cracks, and the originals unlock for download.
   - **Request changes** keeps the money held and locks in a 3-day revision deadline. The freelancer uploads a revision, which is checked again and opens a fresh review window.
   - **No response for 3 days** releases payment automatically, so a silent client can't stall a freelancer.
   - **Missed revision deadline**: the client can cancel, and the authorization is voided, so they were never charged.
6. **The assistant chases payments (AI + PayPal Agent Toolkit).** Ask "who owes me money?" or "remind whoever is most overdue". The assistant reads receivables and holds, drafts a reminder whose tone firms up with each one sent, shows it to you, and only after you approve sends it as a PayPal invoice linking back to the portal.
7. **Ledger (AG Grid).** Every milestone across every client, reconciled against PayPal capture IDs: paid, held, open. Unpaid prices, titles and due dates are edited in the grid and saved to the server. Quick filters (Overdue, Unpaid, Held, Paid), a live totals row that follows every filter, a days-late column, one-click reminders per row, and CSV export.

## Why both sides can trust it

| Fear | What Sealed does |
|---|---|
| Client: "I'll pay and get junk." | The AI check flags missing or weak deliverables before payment. Payment is only held, and the client reviews the full work before releasing it. Unfinished work gets a change request, and if it's never fixed the hold is voided. |
| Freelancer: "They'll take the work and not pay." | The money is reserved by PayPal before the client sees the full work. The client only ever sees a watermarked review copy; originals unlock on capture. Silence releases payment after 3 days. |
| Either: "That's not what was delivered." | Every file is fingerprinted at upload and locked during review. Change requests, views and close-up inspections are logged with times. |

## How the review copy is protected

What is guaranteed: **the original file (image or PDF) is never sent to the client's browser until the hold is captured.** No download manager, extension or "save as" can reach it before then.

What is made hard:
- The review copy is built for each viewing session and carries the viewer's name, email, time and a session code across the whole image, so any capture is traceable.
- It is sent once, as shuffled 32 px blocks XOR-ed with a per-session key, from a URL that only answers the page's own script (custom header and `Sec-Fetch-Site` checks). Replaying the URL, as a download manager would, returns 404 or 410, and the bytes on disk are not a valid image.
- The blocks are reassembled only inside a canvas that is wiped when the viewer closes or the 10-minute session ends.
- Close-ups at original resolution are small (300 px), watermarked and limited per session.
- Right-click, drag, copy, save and print are blocked, and the image blurs when the window loses focus.

What no website can do: stop someone photographing their screen, or a determined developer reading pixels from their own browser. That is why the guarantee rests on the original never being sent, and the watermark makes any copy of the review copy traceable.

## Plan approval

Before anything is paid, the client approves the plan (stages, deliverables, prices, dates) or asks for changes. Checkout is refused until it's approved. If the freelancer later changes an approved plan, it goes back to the client, who sees exactly what changed. See `lib/plan.ts`.

## How PayPal is used

| Capability | API | Where |
|---|---|---|
| Client checkout into a hold | JS SDK Buttons (`intent=authorize`) + **Orders v2** create / authorize | `app/p/[token]/Portal.tsx`, `lib/paypal.ts` |
| Release on approval or after the review window | **Payments v2** authorization capture | `lib/actions.ts` → `release`, `settleDue` |
| Cancel without charging | **Payments v2** authorization void | `lib/actions.ts` → `cancelHold` |
| Paying the freelancer | **Payouts v1**: the freelancer's share (capture net of PayPal's fee) is sent to the PayPal email in their profile; waiting, failed and pending payouts are tracked and retried | `lib/actions.ts` → `payOut`, `retryPayouts`, `refreshPayouts` |
| Payment-gated delivery | Server-side authorization verification (status, `custom_id`, amount, currency); originals served only after capture | `lib/actions.ts` → `completeCheckout`, `app/api/files` |
| Payment reminders | **Invoicing v2** create + send | `lib/paypal.ts` → `createAndSendInvoice` |
| Refunds | **Payments v2** capture refund | `lib/paypal.ts` → `refundCapture` |
| Agentic operations | **PayPal Agent Toolkit** (`@paypal/agent-toolkit/ai-sdk`): `list_invoices`, `get_invoice`, `list_transactions` (kept to three so every question fits Groq's free-tier token limit; reminders go through Sealed's own `send_payment_reminder`, which creates and sends a PayPal invoice) | `lib/agent.ts` |

## How AI is used

The app uses one AI provider through the **Vercel AI SDK**, picked by which key is set: Groq (`GROQ_API_KEY`, free tier, GPT-OSS 120B), Google Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`, free tier), Anthropic Claude, or OpenAI.

- **Scoping agent** (`lib/ai.ts`, `generateObject` with a Zod schema): turns an unstructured brief into a typed milestone plan with prices, dates and open questions.
- **Delivery check** (`lib/check.ts`): Gemini (vision) compares the uploaded images with the agreed deliverables and flags missing, partial or unfinished work; deterministic rules add provable facts. Text found inside files is treated as content, never as instructions.
- **Reminder writer** (`lib/ai.ts`, `generateText`): drafts payment reminders whose tone escalates with the number already sent.
- **Money assistant** (`lib/agent.ts`, `generateText` with tools and multi-step calling): combines Sealed's own tools with the PayPal Agent Toolkit's tools. Actions that move money (sending an invoice, refunding) need two steps: a preview call, then a confirmed call after the user says yes.

With no AI key set, or if the provider errors or a free-tier quota runs out, Sealed falls back to a rule-based planner and assistant, so the app never breaks mid-demo. The live AI path is what the demo shows.

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
- **Accounts:** freelancers sign up with email and password, or with Google or PayPal once those keys are set (see `.env.example`). Each freelancer only sees their own projects. Clients never need an account: their portal link holds an unguessable token. `npm run seed` also creates a demo account, opened from **Try the demo** on the sign-in page.

## Deploy

`render.yaml` deploys Sealed to Render as a single web service. The demo start script seeds data only when the store is empty.

Render's free plan wipes the disk on every restart, so Sealed keeps an off-server copy in a private Supabase Storage bucket (free tier): every change to the store and every saved file is copied there as it happens (`lib/backup.ts`), and `scripts/sync.mjs pull` restores it all before the server starts. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to turn it on; without them Sealed uses the local disk only.

## Testing notes for judges

- Live demo: https://sealedhq.onrender.com
- Demo video: https://youtu.be/mc9wJs3TSCE
- Sign in: press **Try the demo** on the sign-in page, or create your own account with any email.
- PayPal sandbox buyer (the client): `client@sealed.com` / `client@sealed.com`. This is a PayPal **sandbox** test account with play money; use it when you press **Pay with PayPal**.
- Payouts: the demo freelancer's PayPal email is the sandbox account `freelancer@sealed.com`, so approving a stage sends a real sandbox Payout to it.

Walkthrough: sign in with **Try the demo**, press **New project**, paste or attach a brief and press **Plan the payments**, then **Create project**. Press **Open the client's view** and approve the plan. Back on the project, use **Add deliverables** to upload a couple of images (the AI check runs on its own). In the client's view press **Pay with PayPal** and log in with the sandbox buyer above; the stage then shows the money held by PayPal. Press **Approve and release**: the files unlock, both sides get a receipt, and the freelancer is paid out. Then try the **Ledger** and the **Assistant**.

## Security model

- Freelancer accounts: passwords hashed with scrypt; sessions are signed, http-only cookies; sign-in attempts are rate limited. Google and PayPal sign-in use the OAuth authorization-code flow with a state check.
- Every freelancer page and API checks that the project belongs to the signed-in freelancer. Another freelancer gets "not found", never someone else's files or payments.

- The client portal receives preview URLs only; original file keys never reach the browser.
- `/api/files/:id?variant=full` returns `402` for clients until the milestone is paid. Requests without a portal token need the owner session.
- A milestone becomes `in_review` only after PayPal confirms the authorization, and `paid` only after the authorization is captured. A void or refund keeps the originals sealed.
- Delivered files are treated as untrusted: SVGs are sanitised (no scripts, event handlers, entities or external references) before rendering, originals are served with `Content-Security-Policy: sandbox` and `nosniff`, and anything that isn't an image downloads instead of opening.
- Files are locked while a milestone is in review or paid; withdrawn files stay on record with their fingerprint.
- Orders and captures use `PayPal-Request-Id` idempotency keys.

## Brand

The full brand kit is in [`brand/`](brand/): logo files (SVG, PNG, JPG), app icons, favicons, social images, UI icons, fonts, design tokens and the brand guidelines PDF. The mark, The Fold, is an envelope folded into a hexagon and closed with a seal: delivered, sealed, waiting for approval.

## Stack

Next.js 16 (App Router), TypeScript, Vercel AI SDK, PayPal Agent Toolkit, PayPal REST APIs and JS SDK, AG Grid Community, sharp. Type: Young Serif and Public Sans.

## License

MIT
