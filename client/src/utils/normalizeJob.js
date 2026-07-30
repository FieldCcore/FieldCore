export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Maps a raw job API response to a canonical shape with consistent field presence.
// All callers (Calendar, Dispatch, TechApp) should pass jobs through this before display.
export function normalizeJob(rawJob) {
  if (!rawJob) return null;
  return {
    ...rawJob,
    id:               rawJob.id,
    service_type:     rawJob.service_type     || '',
    client_name:      rawJob.client_name      || '',
    client_id:        rawJob.client_id        ?? null,
    status:           rawJob.status           || 'scheduled',
    priority:         rawJob.priority         || 'normal',
    is_multi_day:     !!rawJob.is_multi_day,
    scheduled_at:     rawJob.scheduled_at     || null,
    duration_minutes: rawJob.duration_minutes || 60,
    tech_id:          rawJob.tech_id          ?? null,
    tech_name:        rawJob.tech_name        || null,
    job_manager_id:   rawJob.job_manager_id   ?? null,
    job_manager_name: rawJob.job_manager_name || null,
    service_address:  rawJob.service_address  || '',
    service_city:     rawJob.service_city     || '',
    service_state:    rawJob.service_state    || '',
    service_zip:      rawJob.service_zip      || '',
    scope_of_work:    rawJob.scope_of_work    || '',
    description:      rawJob.description      || '',
    notes:            rawJob.notes            || '',
    amount:           rawJob.amount           ?? null,
    recurring:        rawJob.recurring        || 'none',
    grace_period_minutes:    parseFloat(rawJob.grace_period_minutes) || 15,
    no_show_clock_started_at: rawJob.no_show_clock_started_at || null,
    overall_completion_pct:  rawJob.overall_completion_pct || 0,
    sessions: Array.isArray(rawJob.sessions) ? rawJob.sessions : [],
  };
}
