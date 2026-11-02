import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "How payments work | Sealed", description: "How Sealed protects freelancers and clients: an agreed plan, PayPal holds, sealed previews and release on approval." };

const STEPS: [string, string][] = [
  ["Agree the plan", "The freelancer turns the brief into stages: what will be delivered, the price and the due date of each. The client approves the plan, or asks for changes, before anyone pays anything. If an approved plan changes later, the client approves it again."],
  ["The work is delivered, sealed", "When a stage is ready, the freelancer uploads it. The client sees watermarked previews to check it, but can't download it yet. Sealed’s AI compares the files with what was agreed and flags anything missing."],
  ["The client pays into a PayPal hold", "The client pays for that stage with PayPal. PayPal holds the money: it has left the client’s account, but the freelancer doesn’t have it yet."],
  ["Review, and ask for changes if needed", "The client has 3 days to review. If something isn’t right, they ask for changes, and the freelancer has 3 days to send a revision. The money stays held the whole time. If no revision arrives, the client can cancel and the hold is released back to them."],
  ["Approve, and everyone gets what they’re owed", "When the client approves, the hold is released, the original files unlock for the client, and the freelancer’s share is sent to their PayPal account. If the client doesn’t respond within 3 days of paying, it releases automatically, so a freelancer is never left waiting forever."],
];

export default function HowItWorks() {
  return (
    <DocPage title="How payments work" lede="Sealed makes sure nobody has to go first: the client never pays for work they haven’t seen, and the freelancer never hands over work that won’t be paid for.">
      <ol className="doc-steps">
        {STEPS.map(([t, d], i) => (
          <li key={t}>
            <span className="doc-n">{i + 1}</span>
            <div>
              <h2>{t}</h2>
              <p>{d}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2>Good to know</h2>
      <ul>
        <li><strong>PayPal handles the money.</strong> Card and bank details go to PayPal, never to Sealed or the freelancer.</li>
        <li><strong>Fees.</strong> PayPal charges its usual fee when a payment is released. It comes out of the freelancer’s share; the client pays the agreed price and nothing more.</li>
        <li><strong>Receipts.</strong> Both sides get a receipt in Sealed for every payment, with the PayPal reference, and PayPal emails its own receipt too.</li>
        <li><strong>Ratings are earned.</strong> Clients can rate a freelancer only once a project is fully paid through Sealed, so every review on a profile is from a real, paying client.</li>
      </ul>
    </DocPage>
  );
}
