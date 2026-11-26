// types/index.ts

export type UserRole = "admin" | "team_leader" | "guest";

export type RequestStatus =
  | "Submitted"
  | "Ordered"
  | "Received"
  | "Delivered"
  | "Closed"
  | "Rejected"
  | "Cancelled";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Coworker {
  id: string;
  external_id: string | null;
  name: string;
  job_type: string | null;
  tl: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string | null;   // optional short text if you still want it
  product_url: string | null;   // product page link
  category: string | null;
  supplier: string;
  unit_price: number | null;
  reference: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Request {
  id: string;
  request_date: string;
  requested_by: string;
  coworker_id: string;
  tool_id: string | null;
  tool_name: string;
  reference: string | null;
  description: string | null;
  supplier: string;
  supplier_url: string | null;
  quantity: number;
  note: string | null;
  status: RequestStatus;
  rejection_reason: string | null;
  handover_date: string | null;
  unit_price: number | null;
  created_at: string;
  updated_at: string;

  requester?: Pick<Profile, "id" | "full_name" | "email" | "role"> | null;
  coworker?: Pick<Coworker, "id" | "name" | "job_type" | "tl"> | null;
  tool?: Pick<Tool, "id" | "name" | "reference" | "category"> | null;
}

export interface StatusHistoryEntry {
  id: string;
  request_id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  changer?: Pick<Profile, "full_name" | "email"> | null;
}
