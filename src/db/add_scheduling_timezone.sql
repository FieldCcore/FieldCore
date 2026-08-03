-- Migration: add scheduling_timezone and original_local_start to jobs
-- Run once against production Railway database.
-- Safe to apply to existing tables (IF NOT EXISTS / DO NOTHING guards).
-- Does NOT bulk-shift existing job timestamps — historical data preserved.

-- 1. scheduling_timezone: IANA timezone identifier used when this job was scheduled.
--    NULL on legacy rows (scheduled before this column existed).
--    Frontend populates from business_profiles.timezone at time of creation.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scheduling_timezone TEXT;

-- 2. original_local_start: the wall-clock local time the creator intended,
--    stored for audit purposes. 'YYYY-MM-DDTHH:MM' string in scheduling_timezone.
--    NULL on legacy rows.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS original_local_start TEXT;

-- Optional index for timezone-scoped reporting (low-cardinality column — small index)
CREATE INDEX IF NOT EXISTS idx_jobs_scheduling_tz
  ON jobs (account_id, scheduling_timezone)
  WHERE scheduling_timezone IS NOT NULL;

-- Verify
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'scheduling_timezone'
  ) THEN
    RAISE NOTICE 'scheduling_timezone column exists OK';
  ELSE
    RAISE EXCEPTION 'scheduling_timezone column NOT created';
  END IF;
END $$;
