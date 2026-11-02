import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Terms | Sealed" };

export default function Terms() {
  return (
    <DocPage title="Terms of use" updated="November 2026" lede="The short version: Sealed helps a freelancer and a client agree what will be delivered, holds the payment with PayPal, and releases it when the client approves.">
      <div className="doc-note">
        Sealed is currently a demo built for the PayPal AI Hackathon. Payments run in PayPal’s sandbox (test mode): no real money moves. Don’t use it for real client work yet.
      </div>

      <h2>1. What Sealed does</h2>
      <p>Sealed is a tool for freelancers and their clients. It lets a freelancer propose a plan of paid stages, lets the client approve it, shows the client sealed previews of delivered work, holds each stage’s payment with PayPal, and releases it when the client approves.</p>

      <h2>2. Accounts</h2>
      <p>Freelancers need an account; clients don’t. Clients use the private link the freelancer sends them, so treat that link like a password and share it only with the client. You’re responsible for what happens under your account and for keeping your sign-in details safe.</p>

      <h2>3. The plan is the agreement</h2>
      <p>The stages, deliverables, prices and dates the client approves are what both sides have agreed. If the plan changes, the client approves the new version before anything new is paid. Sealed’s AI tools (planning stages from a brief, checking deliveries) are there to help; they can be wrong, and both sides should check their work.</p>

      <h2>4. Payments, holds and release</h2>
      <ul>
        <li>Payments are processed by PayPal under PayPal’s own terms. Sealed never sees card or bank details.</li>
        <li>When a client pays, PayPal holds the money until the client approves the stage, asks for changes, or the review window ends.</li>
        <li>If the client doesn’t respond within 3 days of paying, the payment is released automatically.</li>
        <li>If the client asks for changes, the freelancer has 3 days to send a revision. If it doesn’t arrive, the client can cancel and the hold is released back to them.</li>
        <li>After release, the freelancer’s share, less PayPal’s fee, is sent to the PayPal email in their profile.</li>
      </ul>

      <h2>5. Files</h2>
      <p>Freelancers keep ownership of their work until it’s paid for. Previews are watermarked and the original files unlock for the client once the stage is paid. Don’t upload anything you don’t have the right to share.</p>

      <h2>6. Ratings</h2>
      <p>A client can rate a freelancer once their project is fully paid through Sealed. Keep ratings honest and about the work.</p>

      <h2>7. Fair use</h2>
      <p>Don’t use Sealed for anything illegal, to mislead anyone, or to upload harmful files. We may suspend accounts that do.</p>

      <h2>8. No guarantees</h2>
      <p>Sealed is provided as it is, while it’s being built. We do our best to keep it working and your data safe, but we can’t promise it will always be available or error-free.</p>
    </DocPage>
  );
}
