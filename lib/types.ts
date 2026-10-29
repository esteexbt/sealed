export type MilestoneStatus = "draft" | "awaiting_payment" | "paid" | "refunded";

export interface Deliverable {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** stored file names inside data/files */
  originalKey: string;
  previewKey: string | null;
  uploadedAt: string;
}

export interface Payment {
  orderId: string;
  captureId: string | null;
  amount: number;
  currency: string;
  payerEmail: string | null;
  capturedAt: string | null;
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
}

export interface Project {
  id: string;
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
}

export interface ActivityEvent {
  id: string;
  at: string;
  projectId: string;
  milestoneId?: string;
  kind: "created" | "file_uploaded" | "payment_captured" | "reminder_sent" | "refunded" | "agent_action" | "edited";
  text: string;
}

export interface Store {
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
