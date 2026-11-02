import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentFiles, getProjectByToken } from "@/lib/db";
import { config, paypalMode } from "@/lib/config";
import { settleDue } from "@/lib/actions";
import { isStale, refreshInBackground } from "@/lib/check";
import { ensurePreviews, isImage, isPdf, isReviewable } from "@/lib/files";
import { Portal, type PortalMilestone } from "./Portal";
import { clientNotices, unread } from "@/lib/notify";
import { money } from "@/lib/actions";
import { ownerName, ownerOf } from "@/lib/auth";
import { profileStats } from "@/lib/profile";
import { isAgreed, planDiff } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = getProjectByToken((await params).token);
  return { title: p ? `${p.title} | Sealed` : "Sealed", robots: { index: false } };
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
    const updates = clientNotices(m, ownerName(p), (n) => money(n, p.currency));
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
      updates,
      unreadIds: unread(updates, m.clientSeenAt).map((n) => n.id),
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

  const owner = ownerOf(p);
  const ownerStats = owner?.handle ? profileStats(owner.id) : null;
  const freelancerCard = {
    avatar: owner?.handle && owner.avatarKey ? `/api/u/${owner.handle}/image/avatar?v=${owner.imageVersion || 0}` : null,
    headline: owner?.headline || "",
    rating: ownerStats?.rating ?? null,
    reviews: ownerStats?.reviews.length ?? 0,
  };

  const diff = planDiff(p);
  const plan = {
    status: p.agreement?.status || ("agreed" as const),
    agreed: isAgreed(p),
    version: p.agreement?.version || 1,
    agreedAt: p.agreement?.agreedAt || null,
    request: p.agreement?.request || null,
    changes: Object.fromEntries(diff.stages.filter((d) => d.isNew || d.was).map((d) => [d.id, { isNew: d.isNew, was: d.was }])),
    removed: diff.removed.map((t) => ({ title: t.title, amount: t.amount })),
  };

  return (
    <Portal
      plan={plan}
      freelancerCard={freelancerCard}
      token={token}
      title={p.title}
      clientName={p.clientName}
      freelancer={ownerName(p)}
      freelancerHandle={ownerOf(p)?.handle || null}
      review={p.review ? { rating: p.review.rating, comment: p.review.comment } : null}
      canReview={p.milestones.some((m) => m.status === "paid" && Boolean(m.payment?.captureId))}
      currency={p.currency}
      milestones={milestones}
      mode={paypalMode}
      clientId={paypalMode === "sandbox" ? config.paypalClientId : ""}
    />
  );
}
