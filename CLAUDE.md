# CLAUDE.md — FIELDCORE INC.
# Last updated: June 10, 2026

## REAL STACK
Backend: Express.js in src/ — routes, middleware, services, PostgreSQL pool
Database: PostgreSQL via DATABASE_URL (Railway in production, local port 5433 in dev)
Auth: JWT tokens stored in cookie fieldcore_token
Frontend: Next.js 14 App Router in app/ — calls Express API via fetch
Mobile: Expo in mobile/ directory
Hosting: Railway (Express backend) + Vercel (Next.js frontend)

DO NOT USE: Supabase, Supabase auth, Supabase client, @supabase/ssr, @supabase/supabase-js
DO NOT USE: Magic links, Supabase sessions, createClient from Supabase

## ALL API CALLS FROM Next.js
Every data request from app/ goes to the Express backend via:
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/[route]`, {
  headers: { Authorization: `Bearer ${token}` }
})
Token is read from cookie: fieldcore_token

## KEY EXPRESS ROUTES
POST /api/auth/login         — { email, password } → { token, refreshToken, user }
GET  /api/auth/me            — Bearer token → { user: { id, name, email, role, accountId, accountName, plan } }
POST /api/auth/refresh       — { refreshToken } → { token, user }
POST /api/auth/logout        — revoke session
GET  /api/auth/accounts      — list accounts user can access
POST /api/auth/switch        — switch active account → new token
JWT payload: { userId, accountId, role }

## DOMAIN
getfieldcore.com — production
NEVER use: fieldcore.io or usefieldcore.com

## BRAND COLORS
Navy      #1C2333  — sidebar, headers
Sand      #D6B58A  — CTAs, active states (NOT orange — never substitute)
Slate     #5F667A  — secondary text
Steel     #8A90A2  — placeholders
Off White #EDEBE7  — page backgrounds
White     #FFFFFF  — text on dark
Light Gray #E6E6E6 — borders

## TAILWIND TOKENS (defined in tailwind.config.ts)
bg-navy / text-navy | bg-sand / text-sand | bg-slate / text-slate
bg-steel / text-steel | bg-offwhite | border-lightgray

## TYPOGRAPHY
Inter (400/500/700) — all UI text
Syne 800 / Arial Black — FIELDCORE wordmark only (ALL CAPS)
Use ™ always. Never ®.

## ENTITY SWITCHER — DECISION-051
Permanently visible in sidebar. No toggle. No useState open/closed.
Always rendered below FIELDCORE™ wordmark, above nav items.
Component: components/dashboard/EntitySwitcher.tsx

## CODING RULES
- Money: integer cents. 4999 = $49.99. Never float.
- Auth: read fieldcore_token cookie in every protected server component
- All data from Express API — never direct DB calls from Next.js
- Tailwind className in Next.js. Inline styles in Claude artifacts only.
- Server Components by default. 'use client' only when needed.
- API responses: { error: string } on failure, data object on success
