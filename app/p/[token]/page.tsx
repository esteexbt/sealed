import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectByToken } from "@/lib/db";
import { config, paypalMode } from "@/lib/config";
import { Portal, type PortalMilestone } from "./Portal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = getProjectByToken((await params).token);
  return { title: p ? `${p.title} | Sealed AI` : "Sealed AI", robots: { index: false } };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = getProjectByToken(token);
  if (!p) notFound();

  // Only send what the client is allowed to see: never original file keys.
  const milestones: PortalMilestone[] = p.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    deliverables: m.deliverables,
    amount: m.amount,
    dueDate: m.dueDate,
    paid: m.status === "paid",
    refunded: m.status === "refunded",
    files: m.files.map((f) => ({ id: f.id, name: f.name, hasPreview: Boolean(f.previewKey), size: f.size })),
  }));

  return (
    <Portal
      token={token}
      title={p.title}
      clientName={p.clientName}
      freelancer={config.freelancerName}
      currency={p.currency}
      milestones={milestones}
      mode={paypalMode}
      clientId={paypalMode === "sandbox" ? config.paypalClientId : ""}
    />
  );
}
