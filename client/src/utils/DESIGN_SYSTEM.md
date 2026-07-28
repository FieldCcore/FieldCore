# FieldCore Status System

## Core Design Rule

> **FieldCore status colors communicate business impact, not generic UI state.
> Blue is reserved for brand identity and must never be used as a semantic status color.**

---

## Four Semantic Tones

### `success` — Green
Everything is healthy. No action needed.

| Examples |
|---|
| Paid |
| Completed |
| Connected |
| Live |
| Active |
| Available |
| Synced |
| All Paid |
| Clear |
| Healthy |

### `warning` — True Yellow (`#FFF9DB` / `#8A6D00`)
No immediate business impact. Will become a problem if ignored.

| Examples |
|---|
| Syncing |
| Paused |
| Rescheduled |
| Awaiting Client |
| Due Soon |
| Expiring Soon |
| Awaiting Approval |
| Setup Required |
| Reminder Sent |

### `critical` — Red
The business is currently affected. **If money is waiting to be collected, it is red.**

| Examples |
|---|
| Outstanding Invoice |
| Awaiting Payment |
| Deposit Pending |
| Deposit Overdue |
| Failed Payment |
| Action Needed |
| Needs Reconnect |
| Job Late |
| Error |
| Past Due |
| Blocked |
| Cancelled |

### `neutral` — Gray
No active status. Nothing to act on.

| Examples |
|---|
| Scheduled (not yet started) |
| Draft |
| Sent (awaiting) |
| Archived |
| Refunded |
| Void |
| No Deposits |
| No Reviews |
| Unknown |

---

## Status Component Usage

```jsx
// Correct: pass `status` string, let the badge decide the color
<StatusBadge status="outstanding" />     // → critical/red
<StatusBadge status="paid" />            // → success/green
<StatusBadge status="syncing" />         // → warning/yellow
<StatusBadge status="draft" />           // → neutral/gray

// Override only when necessary
<StatusBadge variant="critical">Overdue</StatusBadge>
<StatusBadge variant="warning">Due Soon</StatusBadge>
```

```jsx
// KPI cards and inline badges use `tone` prop
<KpiCard tone="critical" badge={{ label: 'Outstanding', tone: 'critical' }} />
<KpiCard tone="success"  badge={{ label: 'All Paid',    tone: 'success' }} />
```

---

## Utility Functions (client/src/utils/statusColors.js)

```js
import { jobStatusTone, sessionStatusTone, TONE_HEX, toneDot } from './statusColors';

// Derive tone from job status string
const tone = jobStatusTone('in_progress');    // → 'success'
const tone = jobStatusTone('paused');         // → 'warning'
const tone = jobStatusTone('cancelled');      // → 'critical'

// Get hex badge style for inline use (SVG, canvas, mobile)
const { bg, color } = TONE_HEX.critical;     // → { bg: '#FFEBEE', color: '#C62828' }

// Get single hex color for map dots / calendar bars
const dot = toneDot('success');              // → '#2E7D32'
```

---

## What Blue Is For

Blue (`var(--blue)`, `#1565C0`) is a brand color. It may be used for:

- Navigation elements
- Brand icons and illustrations
- Hyperlinks
- Charts and data visualizations
- Decorative UI elements
- Focus rings and keyboard accessibility states

Blue must **never** appear in a status badge, chip, pill, label, timeline event, alert, notification, or any component that communicates a business state.

---

## CSS Classes

```css
/* Approved status classes */
.kpi-badge--success   /* green */
.kpi-badge--warning   /* yellow */
.kpi-badge--critical  /* red */
.kpi-badge--neutral   /* gray */

.tp-row--critical     /* Today's Priorities — red */
.tp-row--warning      /* Today's Priorities — yellow */
.tp-row--success      /* Today's Priorities — green */

.ra-row--critical     /* Recent Activity — red */
.ra-row--warning      /* Recent Activity — yellow */
.ra-row--success      /* Recent Activity — green */
```

---

## Remove Generic "Pending"

Never display a generic "Pending" badge when a more meaningful label exists.

| Generic | Preferred |
|---|---|
| Pending | Awaiting Payment |
| Pending | Awaiting Approval |
| Pending | Scheduled |
| Pending | Processing |
| Pending | Syncing |
| Pending | Waiting for Customer |
| Pending | Waiting for Signature |
| Pending | Waiting for Parts |
