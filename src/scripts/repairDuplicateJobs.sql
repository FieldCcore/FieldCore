BEGIN;

-- Soft-delete all remaining cancelled duplicate-generated jobs so they no longer appear on
-- the calendar. These were produced by the scheduler before cadence and dedup bugs were fixed.
-- Setting deleted_at (not status) preserves the distinction between user-initiated
-- cancellations and internally superseded generated jobs.

-- Round 1: ALL remaining jobs from cancelled duplicate agreement 97fdfef3 (wrong anchor)
UPDATE jobs
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE agreement_id = '97fdfef3-b7f0-4969-8e0c-eb6b760b45f9'
    AND deleted_at IS NULL;

-- Round 2: Cancelled c961ce2d jobs that are superseded by a scheduled job on the same date
-- (generated with wrong cadences before repairCadences.sql was applied)
UPDATE jobs
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE agreement_id = 'c961ce2d-0d5b-406f-bec8-829f48f7cd2f'
    AND status = 'cancelled'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM jobs j2
      WHERE j2.agreement_id = 'c961ce2d-0d5b-406f-bec8-829f48f7cd2f'
        AND j2.status = 'scheduled'
        AND j2.deleted_at IS NULL
        AND j2.scheduled_at::date = jobs.scheduled_at::date
    );

COMMIT;

-- Verification: each date in the 45-day horizon should show exactly 1 visible job
SELECT
  scheduled_at::date AS sched_date,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS visible,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'scheduled') AS scheduled_visible
FROM jobs
WHERE account_id = (
  SELECT account_id FROM recurring_agreements WHERE id = 'c961ce2d-0d5b-406f-bec8-829f48f7cd2f'
)
  AND scheduled_at::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '45 days'
GROUP BY scheduled_at::date
ORDER BY scheduled_at::date;
