/**
 * awaiting_payment → in_review (client paid into a PayPal hold, reviewing)
 *   in_review → paid (client approved, or review window ran out)
 *   in_review → changes_requested → in_review (freelancer sent a revision)
 *   changes_requested → cancelled (freelancer missed the revision deadline, client cancelled; hold voided)
 *   paid → refunded
 */
export type MilestoneStatus =
  | "draft"
  | "awaiting_payment"
  | "in_review"
  | "changes_requested"
  | "paid"
  | "refunded"
  | "cancelled";

export interface Deliverable {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** stored file names inside data/files */
  originalKey: string;
  previewKey: string | null;
  uploadedAt: string;
  /** SHA-256 of the original bytes: proof of exactly what was delivered. */
  sha256?: string;
  width?: number;
  height?: number;
  /** Page count for PDFs. */
  pages?: number;
  /** Set when the freelancer withdraws a file before it is locked for review. */
  removedAt?: string | null;
}

export interface CheckItem {
  label: string;
  status: "met" | "partial" | "missing" | "info";
  note: string;
}

export interface DeliveryCheck {
  at: string;
  /** Which files the check looked at, so a changed file set marks it stale. */
  filesKey: string;
  by: "ai-vision" | "ai-text" | "rules";
  verdict: "ok" | "warn" | "fail";
  summary: string;
  items: CheckItem[];
}

export interface ChangeRequest {
  id: string;
  at: string;
  note: string;
  resolvedAt?: string | null;
}

export interface ViewEvent {
  id: string;
  at: string;
  fileId: string;
  fileName: string;
  inspections: number;
}

export interface Payment {
  orderId: string;
  /** PayPal authorization: the client's money held, not yet moved. */
  authorizationId?: string | null;
  authorizedAt?: string | null;
  /** When the hold is released to the freelancer if the client does nothing. */
  reviewEndsAt?: string | null;
  captureId: string | null;
  /** PayPal's status for the capture: COMPLETED, or PENDING while PayPal clears it. */
  captureStatus?: string | null;
  amount: number;
  currency: string;
  payerEmail: string | null;
  capturedAt: string | null;
  releasedBy?: "client" | "auto" | null;
  voidedAt?: string | null;
  releaseError?: string | null;
  mode: "sandbox" | "simulation";
}

export interface Reminder {
  id: string;
  sentAt: string;
  channel: "paypal_invoice" | "draft";
  invoiceId: string | null;
  message: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  amount: number;
  dueDate: string; // YYYY-MM-DD
  status: MilestoneStatus;
  files: Deliverable[];
  payment: Payment | null;
  reminders: Reminder[];
  check?: DeliveryCheck | null;
  changeRequests?: ChangeRequest[];
  /** Deadline for the freelancer to send a revision after changes were requested. */
  reviseBy?: string | null;
  views?: ViewEvent[];
  /** When the freelancer last opened this milestone's notifications. */
  noticesSeenAt?: string | null;
  /** When the client last opened this milestone's notifications. */
  clientSeenAt?: string | null;
}

export interface User {
  id: string;
  /** Lower-cased. */
  email: string;
  /** Shown to clients on the portal, invoices and reminders. */
  name: string;
  /** scrypt hash "salt:hash"; null for accounts that only use Google or PayPal. */
  passwordHash: string | null;
  googleId?: string | null;
  paypalId?: string | null;
  /** Where the freelancer gets paid. */
  paypalEmail?: string | null;
  /** The shared demo account judges can open without signing up. */
  demo?: boolean;
  createdAt: string;
  /** Public profile at /u/{handle}. */
  handle?: string;
  headline?: string;
  bio?: string;
  avatarKey?: string | null;
  bannerKey?: string | null;
  /** Bumped on each image change, so cached copies refresh. */
  imageVersion?: number;
  socials?: Partial<Record<SocialKind, string>>;
}

export type SocialKind = "website" | "email" | "x" | "linkedin" | "instagram" | "behance" | "dribbble" | "github";

/** A client's rating of the freelancer for one project. Only possible after a PayPal payment was captured. */
export interface Review {
  rating: number;
  comment: string;
  at: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  /** The freelancer who owns this project. */
  ownerId?: string;
  /** unguessable token used in the client portal URL */
  portalToken: string;
  title: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  brief: string;
  summary: string;
  questions: string[];
  milestones: Milestone[];
  createdAt: string;
  review?: Review | null;
}

export interface ActivityEvent {
  id: string;
  at: string;
  projectId: string;
  milestoneId?: string;
  kind:
    | "created"
    | "file_uploaded"
    | "file_removed"
    | "payment_held"
    | "payment_captured"
    | "changes_requested"
    | "revision_sent"
    | "hold_released"
    | "viewed"
    | "reminder_sent"
    | "refunded"
    | "agent_action"
    | "edited";
  text: string;
}

export interface Store {
  users?: User[];
  projects: Project[];
  activity: ActivityEvent[];
}

/** The plan the scope agent returns from a brief. */
export interface ScopePlan {
  title: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  summary: string;
  questions: string[];
  milestones: {
    title: string;
    description: string;
    deliverables: string[];
    amount: number;
    dueInDays: number;
  }[];
}
