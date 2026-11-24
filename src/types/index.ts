// types/index.ts

export type UserRole = "team_leader" | "admin";

export type RequestStatus =
  | "Submitted"
  | "Under Review"
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
  created_at: string;
  updated_at: string;
}

export interface Coworker {
  id: string;
  name: string;
  team: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Request {
  id: string;
  request_date: string;
  requested_by: string; // profile id
  coworker_id: string;
  tool_name: string;
  reference: string | null;
  description: string | null;
  supplier: string;
  quantity: number;
  note: string | null;
  status: RequestStatus;
  handover_date: string | null;
  unit_price: number | null;
  created_at: string;
  updated_at: string;

  // Joined fields (optional)
  requester?: Profile;
  coworker?: Coworker;
}
