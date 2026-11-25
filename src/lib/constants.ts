// lib/constants.ts

import type { RequestStatus } from "@/types";

export const REQUEST_STATUSES: RequestStatus[] = [
  "Submitted",
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
 * Allowed status changes.
 * Must match the database trigger (guard_request_update).
 */
export const STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  Submitted: ["Ordered", "Rejected", "Cancelled"],
  Ordered: ["Received", "Cancelled"],
  Received: ["Delivered"],
  Delivered: ["Closed"],
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
  Ordered: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  Received: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Closed: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  Rejected: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  Cancelled: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};
