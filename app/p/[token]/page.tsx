import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentFiles, getProjectByToken } from "@/lib/db";
import { config, paypalMode } from "@/lib/config";
import { settleDue } from "@/lib/actions";
import { isStale, refreshInBackground } from "@/lib/check";
import { ensurePreviews, isImage, isPdf, isReviewable } from "@/lib/files";
import { Portal, type PortalMilestone } from "./Portal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = getProjectByToken((await params).token);
  return { title: p ? `${p.title} | Sealed AI` : "Sealed AI", robots: { index: false } };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await settleDue();
  const first = getProjectByToken(token);
  if (!first) notFound();
  await ensurePreviews(first.id);
  const p = getProjectByToken(token)!;

  // Only send what the client is allowed to see: never original file keys.
  const milestones: PortalMilestone[] = p.milestones.map((m) => {
    if (isStale(m)) refreshInBackground(p.id, m);
    const openRequest = (m.changeRequests || []).filter((c) => !c.resolvedAt).at(-1) || null;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      deliverables: m.deliverables,
      amount: m.amount,
      dueDate: m.dueDate,
      status: m.status,
      reviewEndsAt: m.payment?.reviewEndsAt || null,
      releasedBy: m.payment?.releasedBy || null,
      reviseBy: m.reviseBy || null,
      openRequest: openRequest ? { at: openRequest.at, note: openRequest.note } : null,
      rounds: (m.changeRequests || []).length,
      check: m.check && !isStale(m) ? m.check : null,
      checkPending: isStale(m),
      files: currentFiles(m).map((f) => ({
        id: f.id,
        name: f.name,
        hasPreview: Boolean(f.previewKey),
        image: isImage(f.mime),
        pdf: isPdf(f.mime, f.name),
        svg: f.mime === "image/svg+xml",
        reviewable: isReviewable(f),
        pages: f.pages || null,
        size: f.size,
        width: f.width || null,
        height: f.height || null,
        sha256: f.sha256 || null,
      })),
    };
  });

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
