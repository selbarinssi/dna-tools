// lib/constants.ts

import type { RequestStatus } from "@/types";

export const REQUEST_STATUSES: RequestStatus[] = [
  "Submitted",
  "Under Review",
  "Ordered",
  "Received",
  "Delivered",
  "Closed",
  "Rejected",
  "Cancelled",
];

/** Still being processed (not yet in the coworker's hands). */
export const OPEN_STATUSES: RequestStatus[] = [
  "Submitted",
  "Under Review",
  "Ordered",
  "Received",
];

export const TERMINAL_STATUSES: RequestStatus[] = [
  "Closed",
  "Rejected",
  "Cancelled",
];

/** Statuses that do not cost money. */
export const NO_SPEND_STATUSES: RequestStatus[] = ["Rejected", "Cancelled"];

/**
 * Allowed status changes. MUST match the CASE block in
 * supabase/migrations/001_v2_security_workflow.sql (guard_request_update).
 * The database enforces it; this copy is only used to show the right buttons.
 */
export const STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  Submitted: ["Under Review", "Rejected", "Cancelled"],
  "Under Review": ["Submitted", "Ordered", "Rejected", "Cancelled"],
  Ordered: ["Under Review", "Received", "Cancelled"],
  Received: ["Ordered", "Delivered"],
  Delivered: ["Received", "Closed"],
  Closed: [],
  Rejected: [],
  Cancelled: [],
};

export const DEFAULT_SUPPLIER = "Bricoma";

export const PAGE_SIZE = 25;

export const STATUS_COLORS: Record<
  RequestStatus,
  { bg: string; text: string; border: string }
> = {
  Submitted: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "Under Review": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Ordered: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  Received: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Closed: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  Rejected: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  Cancelled: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};
