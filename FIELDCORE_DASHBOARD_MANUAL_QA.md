# FieldCore Dashboard Manual QA Checklist

## Environment

| Field | Value |
|-------|-------|
| Test URL | https://app.getfieldcore.com |
| Build / Commit | b9c1a05 + verification fixes (see VERIFICATION_REPORT.md) |
| Browser | Chrome 125+, Safari 17+, Firefox 126+ |
| Screen Resolutions | 1920×1080, 1440×900, 1366×768, 1280×800, 1024×768, 768×1024 |
| User Roles Tested | Owner, Manager, Staff, Tech |
| Subscription Plans | starter, solo, pro, scale |
| Entity | Primary account + multi-entity accounts where applicable |
| Date Tested | 2026-07-23 |

---

## Create New Menu

- [ ] Menu opens on click of "+ Create New" button
- [ ] Escape key closes the menu
- [ ] Clicking outside closes the menu
- [ ] Menu can be opened by keyboard (Tab to button, Enter/Space to open)
- [ ] **Client** option is visible and navigates to /clients?new=1
- [ ] **Request** option is visible and navigates to /requests?new=1
- [ ] **Quote** option is visible and navigates to /estimates?new=1
- [ ] **Job** option has a right-chevron indicating a submenu
- [ ] Clicking Job expands/collapses the submenu inline
- [ ] **Single-Day Job** submenu item navigates to /jobs?new=1
- [ ] **Multi-Day Job** submenu item navigates to /jobs?new=1&multiday=1 (Solo+ only)
- [ ] **Project** submenu item navigates to /projects?new=1 (Pro+ only)
- [ ] **Invoice** option is visible and navigates to /invoices?new=1
- [ ] All icons are from Lucide (SVG-based, not emoji)
- [ ] No emoji characters appear anywhere in the menu
- [ ] Multi-Day Job shows "Solo+" badge and lock icon on Starter plan
- [ ] Project shows "Pro+" badge and lock icon on Starter/Solo plans
- [ ] "View plans and upgrade →" footer link appears when any item is locked
- [ ] Clicking a locked item does nothing (no navigation, no error)
- [ ] Tech role: no special restrictions observed on this menu (techs see the same menu)

---

## Dashboard Cards (KPI Grid)

- [ ] Six cards display in a single row at 1440px+ (Today Revenue, MTD, Active Jobs, Pending Invoices, Pending Deposits, Avg Rating)
- [ ] Cards wrap to 3 columns at tablet width (769–1024px)
- [ ] Cards wrap to 2 columns at 768px
- [ ] Cards display as single column on mobile (<480px)
- [ ] **Today Revenue** shows correct dollar amount (completed jobs today)
- [ ] **Month to Date** shows correct MTD completed revenue
- [ ] **Active Jobs** shows count of in_progress jobs only
- [ ] **Pending Invoices** shows outstanding invoice total and count
- [ ] **Pending Deposits** shows count of awaiting-payment deposits
- [ ] **Avg Rating** shows rating from Google GBP if connected, internal reviews otherwise
- [ ] Avg Rating shows "Google" or "Internal" source label
- [ ] Cards with zero values render "0" or "$0" cleanly (no blank or crash)
- [ ] Cards with no data show "—" or appropriate empty state
- [ ] No card clips its content at any supported viewport
- [ ] Badges ("Active", "Live", "Excellent", etc.) do not overlap card content
- [ ] Typography is consistent across all cards (Inter font, consistent sizes)

---

## Google Reviews Integration

- [ ] "Connect Google Business Profile" action exists in Business Settings → Integrations tab
- [ ] OAuth flow redirects to Google's consent screen
- [ ] After consent, user is redirected back to /settings/business?tab=integrations&connected=1
- [ ] Connected state shows location name and last sync time
- [ ] Average Rating card on Dashboard shows Google rating after connection
- [ ] Manual "Sync Now" button triggers a review sync
- [ ] Newly synced review appears in the reviews section
- [ ] New review notification appears in NotificationBell
- [ ] Syncing the same reviews again does NOT create duplicate notifications
- [ ] Disconnect button sets status to 'disconnected'
- [ ] Expired token state shows an appropriate error and "Reconnect" option
- [ ] Integration failure does not crash the Dashboard
- [ ] No access_token or refresh_token is returned to the browser in any API response
- [ ] ENCRYPTION_KEY env var is documented in .env.example ✓

---

## Review Requests

- [ ] Settings → Business Settings shows review request timing options
- [ ] Timing options available: 0min (immediate), 30min, 1h, 2h, 4h, 12h, 24h, 2 days, 3 days, 7 days
- [ ] Saving a delay option persists (verified by refreshing the settings page)
- [ ] Completing a job triggers review request after the configured delay
- [ ] Client without phone AND email does not receive a request (no crash)
- [ ] A job that already had a review request sent (review_request_sent=TRUE) does not get a second request
- [ ] Cancelled jobs (when exclude_cancelled=true) are skipped
- [ ] Review request scheduling survives server restart (cron-based, not browser timer)

---

## Dynamic Dashboard Banner

- [ ] Dashboard shows no empty banner space when no banners exist
- [ ] Creating a banner (owner only) causes it to appear on Dashboard
- [ ] Banner displays title, message, and correct severity color
- [ ] Dismissing a banner hides it for the current user
- [ ] Other users still see a dismissed banner after one user dismisses it
- [ ] Future-dated banner (starts_at in future) does not appear
- [ ] Expired banner (ends_at in past) does not appear
- [ ] Role-targeted banner ("staff" only) is not visible to tech users
- [ ] Primary action button navigates to the specified URL
- [ ] Secondary action link navigates to the specified URL
- [ ] Non-dismissible banner cannot be closed (no X button)
- [ ] Deactivated banner disappears from Dashboard immediately on next load

---

## Requests Page

- [ ] /requests page loads for Owner, Manager, Staff roles
- [ ] Tech role cannot access /requests (redirects or 403)
- [ ] "+ New Request" button opens the slide-in form
- [ ] Form accepts: Client Name, Email, Phone, Service Type, Requested Date, Preferred Time, Location, Notes, Source, Status, Follow-up Date
- [ ] Creating a request with only client_name succeeds
- [ ] Submitting without client_name shows a validation error
- [ ] Created request appears in the list immediately
- [ ] Clicking a row opens the edit form pre-populated with the request's data
- [ ] Saving edits updates the record
- [ ] Status filter pills (New, Contacted, etc.) filter the list correctly
- [ ] "Close" button marks the request as closed (soft delete)
- [ ] Tech cannot see the Close button
- [ ] Creating a request does NOT automatically create a job or client record

---

## Responsive Layouts

### 1920×1080
- [ ] 6 KPI cards in one row, no overflow
- [ ] Deposits card content is fully visible
- [ ] Create New menu fully visible

### 1440×900
- [ ] 6 KPI cards in one row, no overflow
- [ ] Dashboard 3-column layout intact

### 1366×768
- [ ] 6 KPI cards in one row (may be compact but not clipping)
- [ ] No horizontal scrollbar

### 1280×800
- [ ] KPI cards may wrap to 3-column — intentional
- [ ] No content clipping

### 1024×768
- [ ] KPI cards in 3-column layout (tablet breakpoint)
- [ ] Sidebar and content both usable

### 768px (tablet)
- [ ] KPI cards in 2-column layout
- [ ] No horizontal scrollbar

### 480px (mobile)
- [ ] KPI cards in 1-column layout
- [ ] No horizontal scrollbar
- [ ] Create New accessible via mobile header

---

## Permissions by Role

### Owner
- [ ] Can access all Dashboard KPIs
- [ ] Can open Create New for all options
- [ ] Can manage Google integration
- [ ] Can create/delete banners
- [ ] Can change review request settings

### Manager
- [ ] Can see Dashboard KPIs
- [ ] Can access Create New
- [ ] Can view (not manage) Google integration
- [ ] Cannot create or delete banners (403 from backend)
- [ ] Cannot change review settings (403 from backend)

### Staff
- [ ] Can see Dashboard KPIs
- [ ] Can access Create New
- [ ] Cannot access Google integration (403)
- [ ] Cannot manage banners (403)

### Tech
- [ ] Cannot access /requests (403)
- [ ] Cannot access /api/google-reviews (403)
- [ ] Cannot access /api/review-settings (403)
- [ ] Cannot create banners (403)
- [ ] Sees TechApp mobile view instead of Dashboard

---

## Entity Isolation

- [ ] Switching entity updates all Dashboard KPIs to show only that entity's data
- [ ] Today Revenue reflects the active entity's jobs only
- [ ] Pending Deposits reflects the active entity's deposits only
- [ ] Google reviews show the active entity's GBP location rating
- [ ] Requests list shows only the active entity's requests
- [ ] Attempting to access another entity's banner by direct ID returns 404 or 404
- [ ] Attempting to access another entity's request by direct ID returns 404

---

## Signoff

| Item | Status | Date | Name |
|------|--------|------|------|
| Founder approval | Pending | | |
| Engineering approval | Pending | | |
| Remaining defects | See VERIFICATION_REPORT.md | | |
| Release recommendation | NOT RELEASE READY — external config required | 2026-07-23 | Automated QA |

### Remaining Defects
- Google Business Profile integration requires external credentials (BLOCKED BY EXTERNAL CONFIG)
- Projects page (/projects) does not exist — "Project" in Create New navigates to a missing route
- invoice payment terms frontend not yet integrated in Invoice create/edit form
- client credit_terms_eligible fields not wired to Invoice UI
- Avg Rating "disconnected" state only shows "—" without explanation on how to connect
- BusinessSettings Integrations tab not yet implemented (Google OAuth connection UI missing)
