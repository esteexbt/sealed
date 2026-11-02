import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Privacy | Sealed" };

export default function Privacy() {
  return (
    <DocPage title="Privacy" updated="November 2026" lede="Sealed keeps only what it needs to run your projects and payments, and never sells it.">
      <h2>What we keep</h2>
      <ul>
        <li><strong>Freelancers:</strong> your name, email, sign-in method, profile details you choose to add (photo, banner, bio, links), and the PayPal email you get paid to.</li>
        <li><strong>Projects:</strong> the brief, the plan, client name and email, the files you upload, change requests, ratings and payment status.</li>
        <li><strong>Payments:</strong> PayPal reference numbers, amounts and dates, and the PayPal email the client paid with. Card and bank details stay with PayPal; Sealed never sees them.</li>
        <li><strong>Review activity:</strong> when a client opens a sealed preview, so the freelancer can see their work was looked at.</li>
      </ul>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>PayPal</strong> processes payments, holds, payouts and reminder invoices.</li>
        <li><strong>An AI provider</strong> (such as Groq or Google Gemini) reads briefs to plan stages, and file details or previews to check deliveries.</li>
        <li><strong>Hosting and storage</strong> (Render and Supabase) run the app and keep its data.</li>
        <li><strong>Google</strong>, if you choose to sign in with Google.</li>
      </ul>

      <h2>What’s public</h2>
      <p>Your public profile (name, headline, bio, photo, links, Sealed stats and verified reviews) is visible to anyone with its link. Projects and files are private: only you and the client with the project’s link can see them.</p>

      <h2>Your choices</h2>
      <p>You can edit your profile at any time. To have your account and data deleted, contact the Sealed team and we’ll remove it.</p>
    </DocPage>
  );
}
