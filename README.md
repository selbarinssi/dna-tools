# D&A Tools

Internal tool request system for D&A / IKEA teams.

Team Leaders request tools (mainly sourced from Bricoma.ma) for specific Coworkers.  
Admins manage the full request lifecycle.  
Real-time desktop dashboard with clean IKEA-inspired design.

---

## Vision

- Team Leaders create requests for tools destined to a specific Coworker
- Everyone can see all requests and their status
- Admins update status and manage the process
- Simple reporting by Requester (Team Leader) and by Coworker (Receiver)
- Desktop-only for now
- Real-time updates (no email/WhatsApp notifications in v1)

### Status Flow
Submitted → Under Review → Ordered → Received → Delivered → Closed  
↘ Rejected / Cancelled

### Main Fields on a Request
- Request Date
- Requested by (Team Leader)
- Coworker (Receiver)
- Tool name
- Référence / Description
- Supplier (default: Bricoma)
- Quantity
- Note
- Request Status
- Handover date to Coworker
- Unit price (optional – for reporting)

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind
- **Auth + Database + Realtime**: Supabase
- **Hosting**: Vercel (later)
- **Design**: IKEA-inspired (Blue `#0058A3` + Yellow `#FFDA1A` + Noto Sans)

---

## Current Status

### Completed (v1)
- [x] Next.js + Supabase setup, IKEA theme, login, role-based UI
- [x] Requests list + create form, coworkers CRUD, basic reporting

### Completed (v2)
- [x] **Database security**: Row Level Security on every table (`supabase/migrations/001_v2_security_workflow.sql`)
- [x] **Enforced workflow**: allowed status changes are checked by the database, not just the UI
- [x] **Status history** (who / when / why) shown in a detail panel
- [x] Team leaders can edit or cancel their own request while it is still *Submitted*
- [x] Rejection requires a reason
- [x] Admin can edit handover date (Delivered / Closed requests)
- [x] Requests list: search, filters (status, coworker, requester, dates, "My requests"), sorting, pagination, CSV export
- [x] Product link field (e.g. the bricoma.ma page)
- [x] Reporting: date range, spend (MAD), average time to deliver, by month / requester / coworker, CSV export
- [x] Coworkers are deactivated, never hard-deleted
- [x] Admin **Users** page (roles, activate / deactivate); profiles are auto-created for new auth users
- [x] `middleware.ts` renamed to `proxy.ts` (Next.js 16)

### Ideas for later
- [ ] Password reset page
- [ ] Mobile layout polish
- [ ] Email / WhatsApp notifications
- [ ] Per-coworker budget limits

---

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Supabase URL + anon key.
2. In Supabase: **SQL Editor -> New query**, paste `supabase/migrations/001_v2_security_workflow.sql`, **Run**.
   (It replaces all existing RLS policies on the 4 tables. Safe to re-run.)
3. Add users in **Authentication -> Users -> Add user**. They appear as *Team leader*; promote admins on the **Users** page.
4. `npm install` then `npm run dev`.

> The status rules exist in two places that must stay identical:
> `STATUS_TRANSITIONS` in `src/lib/constants.ts` (buttons) and the `CASE` block in the SQL function
> `guard_request_update` (enforcement).

---

## Project Structure
```
src/
├── app/
│   ├── login/
│   ├── coworkers/
│   ├── reporting/
│   ├── users/            # Admin: roles + access
│   ├── page.tsx          # Requests list (home)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── layout/
│   │   └── Header.tsx
│   ├── requests/
│   │   ├── RequestsList.tsx
│   │   ├── RequestForm.tsx
│   │   ├── RequestDetail.tsx   # side panel: details, edit, actions, history
│   │   └── StatusBadge.tsx
│   ├── coworkers/
│   │   └── CoworkersManager.tsx
│   └── reporting/
│       └── ReportingDashboard.tsx
├── lib/
│   ├── supabase/
│   ├── constants.ts      # statuses + allowed transitions
│   ├── requests.ts       # query / filter helpers
│   ├── csv.ts            # Excel-friendly export
│   └── utils.ts
├── proxy.ts              # auth protection (was middleware.ts)
└── types/
supabase/migrations/      # SQL to run in Supabase
```

---

## Database (Supabase)

- `profiles` → users + role (`team_leader` | `admin`) + `is_active`
- `coworkers` → list of receivers (`name`, `team`, `is_active`)
- `requests` → main request table
- `request_status_history` → audit log (filled automatically by a trigger)

**Expected columns for `requests`:**
- id, request_date, requested_by, coworker_id
- tool_name, reference, description, supplier, quantity
- note, status, handover_date, unit_price, supplier_url, rejection_reason
- created_at, updated_at

---

## Local Development

```bash
git pull origin main
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Make sure `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
