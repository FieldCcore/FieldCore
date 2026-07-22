# CLAUDE.md — FIELDCORE INC.
# Last updated: 2026-07-22

## REAL STACK
Backend:  Express.js in src/ — routes, middleware, services, PostgreSQL pool
Database: PostgreSQL via DATABASE_URL (Railway in production, local port 5433 in dev)
Auth:     JWT Bearer tokens — stored in localStorage as fc_token (NOT a cookie)
Frontend: React + Vite in client/src/ — calls Express API via axios instance (src/api.js)
Mobile:   TechApp.jsx — full-screen React PWA served from same Vite build
Hosting:  Railway (Express backend) + Vercel (React/Vite frontend)

DO NOT USE: Supabase, Supabase auth, Supabase client, @supabase/ssr, @supabase/supabase-js
DO NOT USE: Magic links, Supabase sessions, createClient from Supabase
DO NOT USE: Cookie-based auth — token is localStorage, passed as Bearer in Authorization header

## AUTH FLOW
Login:   POST /api/auth/login → { token, refreshToken, user }
Storage: localStorage.setItem('fc_token', token)
Requests: Authorization: Bearer <token>  (via axios interceptor in client/src/api.js)
Refresh: POST /api/auth/refresh { refreshToken } → { token, user }
Logout:  POST /api/auth/logout → clears localStorage + revokes server session

## KEY EXPRESS ROUTES
POST /api/auth/login         — { email, password } → { token, refreshToken, user }
GET  /api/auth/me            — Bearer token → { user: { id, name, email, role, accountId, accountName, plan } }
POST /api/auth/refresh       — { refreshToken } → { token, user }
POST /api/auth/logout        — revoke session
GET  /api/auth/accounts      — list accounts user can access
POST /api/auth/switch        — switch active account → new token
JWT payload: { userId, accountId, role }

## MULTI-DAY JOBS (added 2026-07-22)
Multi-day jobs use is_multi_day = true on the jobs table.
Child sessions in job_sessions table (one row per workday).
Technicians per session in job_session_techs (many-to-many).
Assets/service items in job_assets.
Key endpoints:
  GET  /api/jobs/sessions              — all sessions for calendar (BEFORE /:id to avoid routing conflict)
  POST /api/jobs/:id/complete          — complete parent job + generate invoice (owner/manager only)
  POST /api/jobs/:id/sessions/:sid/complete — daily closeout (any auth)
  GET  /api/mobile/sessions/today      — tech's sessions for today
  POST /api/mobile/sessions/:sid/checkin
  POST /api/mobile/sessions/:sid/complete

## DOMAIN
getfieldcore.com — production
NEVER use: fieldcore.io or usefieldcore.com

## BRAND COLORS
Navy       #1C2333  — sidebar, headers
Sand       #D6B58A  — CTAs, active states (NOT orange — never substitute)
Slate      #5F667A  — secondary text
Steel      #8A90A2  — placeholders
Off White  #EDEBE7  — page backgrounds
White      #FFFFFF  — text on dark
Light Gray #E6E6E6 — borders

## TYPOGRAPHY
Inter (400/500/700) — all UI text
Syne 800 / Arial Black — FIELDCORE wordmark only (ALL CAPS)
Use ™ always. Never ®.

## CODING RULES
- Money: integer cents. 4999 = $49.99. Never float.
- All data from Express API — inline styles in React components, className for CSS modules
- API responses: { error: string } on failure, data object on success
- Tenant isolation: every query filters by account_id from req.accountId (never from client)
- requireAuth middleware sets req.userId, req.accountId, req.userRole on every protected route
- requireRole('owner','manager') for write operations; techs get read-only or session-specific writes
