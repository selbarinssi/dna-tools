import type { Request } from "@/types";

export const REQUEST_SELECT = `
  *,
  requester:profiles!requested_by (id, full_name, email, role),
  coworker:coworkers (id, name, team)
`;

export interface RequestFilters {
  search: string;
  status: string; // "all" or a status
  coworkerId: string; // "all" or uuid
  requesterId: string; // "all" or uuid
  from: string; // yyyy-MM-dd or ""
  to: string; // yyyy-MM-dd or ""
}

export const EMPTY_FILTERS: RequestFilters = {
  search: "",
  status: "all",
  coworkerId: "all",
  requesterId: "all",
  from: "",
  to: "",
};

export function hasActiveFilters(f: RequestFilters) {
  return (Object.keys(EMPTY_FILTERS) as (keyof RequestFilters)[]).some(
    (k) => f[k] !== EMPTY_FILTERS[k]
  );
}

/** Applies the filters to any Supabase select query on "requests". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters<Q extends { eq: any; or: any; gte: any; lte: any }>(
  q: Q,
  f: RequestFilters
): Q {
  let query: Q = q;
  if (f.status !== "all") query = query.eq("status", f.status);
  if (f.coworkerId !== "all") query = query.eq("coworker_id", f.coworkerId);
  if (f.requesterId !== "all") query = query.eq("requested_by", f.requesterId);
  if (f.from) query = query.gte("request_date", f.from);
  if (f.to) query = query.lte("request_date", f.to);

  // strip characters that have a meaning inside a PostgREST "or" filter
  const term = f.search.trim().replace(/[,()%*\\]/g, " ").trim();
  if (term) {
    query = query.or(
      `tool_name.ilike.%${term}%,reference.ilike.%${term}%,description.ilike.%${term}%,note.ilike.%${term}%`
    );
  }
  return query;
}

/** Supabase returns max 1000 rows per request: this loops until all are loaded. */
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const STEP = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += STEP) {
    const { data, error } = await build(from, from + STEP - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < STEP) break;
  }
  return all;
}

export function requesterName(r: Pick<Request, "requester">) {
  return r.requester?.full_name || r.requester?.email || "Unknown";
}

export function lineTotal(r: Pick<Request, "quantity" | "unit_price">) {
  return r.unit_price === null || r.unit_price === undefined
    ? null
    : r.quantity * r.unit_price;
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(n);
}
