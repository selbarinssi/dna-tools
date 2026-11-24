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

Text

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

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind
- **Auth + Database + Realtime**: Supabase
- **Hosting**: Vercel (later)
- **Design**: IKEA-inspired (Blue `#0058A3` + Yellow `#FFDA1A` + Noto Sans)

---

## Current Status

### Completed
- [x] Next.js project setup
- [x] IKEA-inspired theme + global styles
- [x] Basic Header + Home page
- [x] Supabase connection (env + clients)
- [x] Database tables created (`profiles`, `coworkers`, `requests`)
- [x] Login page

### Next
- [ ] Auth protection (redirect if not logged in)
- [ ] Create Request form
- [ ] Requests list (for everyone)
- [ ] Admin status management
- [ ] Coworkers management
- [ ] Basic Reporting

---

## Project Structure
src/
├── app/
│ ├── login/ # Login page
│ ├── page.tsx # Home
│ ├── layout.tsx
│ └── globals.css
├── components/
│ └── layout/
│ └── Header.tsx
├── lib/
│ ├── supabase/
│ │ ├── client.ts
│ │ └── server.ts
│ └── utils.ts
└── types/

Text

---

## Database (Supabase)

- `profiles` → users + role (`team_leader` | `admin`)
- `coworkers` → list of receivers
- `requests` → main request table

---

## Local Development

```bash
npm run dev
Open [localhost](http://localhost:3000/)
