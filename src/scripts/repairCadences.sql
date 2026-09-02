BEGIN;

-- 1. Fix schedule cadences in c961ce2d (Sep7 start, correct agreement to keep)
UPDATE recurring_agreement_schedules
  SET cadence = 'every_2_weeks', updated_at = NOW()
  WHERE id = 'de62b670-adca-4165-88fb-75b7f4f79a50';

UPDATE recurring_agreement_schedules
  SET cadence = 'weekly', updated_at = NOW()
  WHERE id = 'e53ff2d3-c96f-40e9-83c3-0b0fc46418e9';

-- 2. Cancel duplicate agreement 97fdfef3 (wrong anchor date, duplicate)
UPDATE recurring_agreements SET status = 'cancelled', updated_at = NOW()
  WHERE id = '97fdfef3-b7f0-4969-8e0c-eb6b760b45f9';

-- 3. Cancel all jobs from 97fdfef3
UPDATE jobs SET status = 'cancelled', updated_at = NOW()
  WHERE agreement_id = '97fdfef3-b7f0-4969-8e0c-eb6b760b45f9'
    AND status NOT IN ('complete', 'cancelled');

-- 4. Soft-delete occurrences from 97fdfef3
UPDATE agreement_schedule_occurrences SET deleted_at = NOW()
  WHERE agreement_id = '97fdfef3-b7f0-4969-8e0c-eb6b760b45f9'
    AND deleted_at IS NULL;

-- 5. Cancel all jobs from c961ce2d (generated with wrong cadences)
UPDATE jobs SET status = 'cancelled', updated_at = NOW()
  WHERE agreement_id = 'c961ce2d-0d5b-406f-bec8-829f48f7cd2f'
    AND status NOT IN ('complete', 'cancelled');

-- 6. Soft-delete occurrences from c961ce2d
UPDATE agreement_schedule_occurrences SET deleted_at = NOW()
  WHERE agreement_id = 'c961ce2d-0d5b-406f-bec8-829f48f7cd2f'
    AND deleted_at IS NULL;

COMMIT;
SELECT 'DB repair complete' AS result;
