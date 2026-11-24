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

export const ACTIVE_STATUSES: RequestStatus[] = [
  "Submitted",
  "Under Review",
  "Ordered",
  "Received",
  "Delivered",
];

export const TERMINAL_STATUSES: RequestStatus[] = [
  "Closed",
  "Rejected",
  "Cancelled",
];

export const DEFAULT_SUPPLIER = "Bricoma";

export const STATUS_COLORS: Record<
  RequestStatus,
  { bg: string; text: string; border: string }
> = {
  Submitted: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  "Under Review": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  Ordered: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
  },
  Received: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  Delivered: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  Closed: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  Rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  Cancelled: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
  },
};
