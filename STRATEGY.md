# Sealed: how we win the PayPal AI Hackathon

**Deadline:** Nov 12, 2026, 12:00pm PST (9:00pm Lagos). Internal submit target: **Nov 11, 9pm Lagos**. We keep the final day as buffer.

## The product in one line

Sealed is an AI agent for freelancers. It turns a client brief into a priced milestone plan and gets the work paid through PayPal. Deliverables stay sealed (watermarked previews) until the client pays, then unlock automatically.

## Why this wins

The judges score five things equally. Each one is answered below with something they can see in the demo.

| Criterion | How Sealed answers it |
|---|---|
| Technological implementation | Uses the official PayPal Agent Toolkit for the agent (invoices, reminders, orders, refunds, transactions), the Orders v2 API and JS SDK for checkout, and server-side capture verification as the gate on delivery. The AI is load-bearing: scoping, pricing, follow-ups, and an ops agent that calls real PayPal tools. |
| Design | Built and designed by a working designer. It's a complete product flow, not a proof of concept. One signature moment: the seal breaking on payment. |
| Potential impact | Late or missing payment is the most common freelancer complaint. The specific claim we make: the client can see the work but can't take it unpaid, so the freelancer never ships for free. |
| Innovation | Payment-gated delivery. Most invoicing tools stop at "invoice sent", while Sealed ties the payment capture to the files themselves. |
| Presentation | ST makes motion and video professionally. The demo video follows a real story, end to end, in under 3 minutes. |

## Prizes we're aiming at (one project can be eligible for several)

- 1st / 2nd / 3rd overall ($12k / $8k / $5k)
- Best Use of Agentic Commerce ($5k): the ops agent acts on PayPal via the toolkit
- Best Use of PayPal + AI ($5k)
- Most Impactful ($5k)
- Best Demo Delivery ($5k): our strongest single shot
- Best Use of AG Grid ($5k / $2k / $1k ×3): the money ledger is an AG Grid table
- Best Use of Render (credits): we host the live demo on Render

Confirm in the official rules whether one project can collect more than one prize, and adjust if not.

## Hard requirements (a miss here means disqualification)

- [ ] Working hosted demo URL and/or full run instructions. A mockup does not count.
- [ ] Public GitHub repo with an open source license (MIT) shown in the About section
- [ ] README states which AI tools are used and how
- [ ] YouTube demo under 3 minutes, public, showing it working, with no copyrighted music
- [ ] Uses PayPal sandbox meaningfully, and the AI is meaningful
- [ ] Text description of features
- [ ] Judges can test it: a seeded demo account and sandbox buyer credentials go in the testing notes

## The demo story (the video is built around this)

1. Ada, a freelance brand designer, gets a messy DM from a client: "need a logo + brand kit for my coffee shop, launching in 3 weeks, budget is tight."
2. She pastes it into Sealed. The agent returns three milestones, each priced and dated, plus two questions to ask the client.
3. She uploads the logo concepts to milestone 1. The client portal shows them under a wax seal: blurred and watermarked.
4. The client pays milestone 1 with PayPal (sandbox). **The seal cracks.** The full-resolution files unlock. This is the hero shot.
5. Milestone 2 is overdue. Ada asks the agent "who owes me money?" The agent checks PayPal, drafts a friendly reminder, and sends it through PayPal invoicing.
6. The ledger (AG Grid) shows everything reconciled.
7. Close on the impact line.

## Timeline

| Days | Dates | Work |
|---|---|---|
| 1–2 | Oct 29–30 | Repo, data model, PayPal sandbox setup, brief-to-plan agent, portal with checkout and capture |
| 3–5 | Oct 31–Nov 2 | Sealed previews, unlock flow, ops agent on the PayPal Agent Toolkit, reminders |
| 6–7 | Nov 3–4 | AG Grid ledger, freelancer dashboard, empty and error states |
| 8–9 | Nov 5–6 | Design polish, seal animation, mobile portal |
| 10 | Nov 7 | Deploy to Render, seed demo data, end-to-end test with a sandbox buyer |
| 11–12 | Nov 8–9 | Record and edit the demo video, write the Devpost description |
| 13 | Nov 10 | Fresh-eyes QA pass: run the judges' path from scratch |
| 14 | Nov 11 | Submit. Nov 12 is buffer only. |

## What ST needs to do (only you can)

1. Register on the Devpost page (team of one is fine; add teammates there if any).
2. Create a PayPal Developer account. In the sandbox, create an app and copy its Client ID and Secret. Also note the default sandbox personal (buyer) account login for testing.
3. Get an OpenAI or Anthropic API key (either one works).
4. Make a GitHub account/repo named `sealed` (public).
5. Create a Render account (free).
