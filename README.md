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

### Completed
- [x] Next.js project setup
- [x] IKEA-inspired theme + global styles
- [x] Header with user profile + logout + navigation
- [x] Supabase connection (env + clients)
- [x] Database tables (`profiles`, `coworkers`, `requests`)
- [x] Login page + middleware auth protection
- [x] Core types & constants
- [x] Requests list (home page) with filters + realtime
- [x] Create Request form (modal)
- [x] Admin can change status inline
- [x] Role-based UI (New Request only for team_leader + admin)
- [x] Coworkers management (CRUD) at `/coworkers`
- [x] Handover date column + auto-set when status → Delivered
- [x] Basic Reporting at `/reporting` (by status / requester / coworker)

### Next (optional polish)
- [ ] Manual edit of handover date
- [ ] Status history log
- [ ] Mobile responsiveness improvements
- [ ] Export to Excel

---

## Project Structure
```
src/
├── app/
│   ├── login/
│   ├── coworkers/
│   ├── reporting/
│   ├── page.tsx          # Requests list (home)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── layout/
│   │   └── Header.tsx
│   ├── requests/
│   │   ├── RequestsList.tsx
│   │   ├── RequestForm.tsx
│   │   └── StatusBadge.tsx
│   ├── coworkers/
│   │   └── CoworkersManager.tsx
│   └── reporting/
│       └── ReportingDashboard.tsx
├── lib/
│   ├── supabase/
│   ├── constants.ts
│   └── utils.ts
└── types/
```

---

## Database (Supabase)

- `profiles` → users + role (`team_leader` | `admin`)
- `coworkers` → list of receivers (`name`, `team`, `is_active`)
- `requests` → main request table

**Expected columns for `requests`:**
- id, request_date, requested_by, coworker_id
- tool_name, reference, description, supplier, quantity
- note, status, handover_date, unit_price
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
