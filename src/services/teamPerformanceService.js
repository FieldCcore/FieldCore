'use strict';
const pool = require('../db/pool');

function pi(v) { return parseInt(v, 10) || 0; }
function pf(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }

function defaultRange() {
  const now = new Date();
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

async function getTeamPerformance(accountId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  // Per-user stats from job_assignments.
  // DISTINCT ON (user_id, job_id) deduplicates multi-role assignments on the same job,
  // preferring the is_primary=true row so production value is attributed correctly.
  // Production value only credited to is_primary = true assignees to avoid double-counting.
  const { rows } = await pool.query(
    `WITH deduped AS (
       SELECT DISTINCT ON (ja.user_id, ja.job_id)
         ja.user_id, ja.job_id, ja.assignment_role, ja.is_primary, ja.account_id
       FROM job_assignments ja
       WHERE ja.account_id = $1 AND ja.removed_at IS NULL
       ORDER BY ja.user_id, ja.job_id, ja.is_primary DESC
     )
     SELECT
       u.id                                                                                AS user_id,
       u.name                                                                              AS member_name,
       u.role                                                                              AS user_role,
       ARRAY_AGG(DISTINCT d.assignment_role) FILTER (WHERE d.assignment_role IS NOT NULL) AS assignment_roles,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'complete')::int                     AS completed_jobs,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('cancelled','no_show'))::int       AS lost_jobs,
       COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('complete','cancelled','no_show'))::int AS eligible_jobs,
       COALESCE(SUM(j.amount) FILTER (WHERE j.status = 'complete' AND d.is_primary = true), 0) AS production_value,
       COALESCE(SUM(j.duration_minutes) FILTER (WHERE j.status = 'complete'), 0)::int     AS total_minutes,
       ARRAY_AGG(DISTINCT j.service_type) FILTER (
         WHERE j.status = 'complete' AND j.service_type IS NOT NULL
       )                                                                                   AS top_services
     FROM deduped d
     JOIN jobs  j ON j.id = d.job_id   AND j.account_id = $1
     JOIN users u ON u.id = d.user_id  AND u.account_id = $1
     WHERE j.scheduled_at >= $2::date
       AND j.scheduled_at <  ($3::date + INTERVAL '1 day')
     GROUP BY u.id, u.name, u.role
     ORDER BY production_value DESC, completed_jobs DESC`,
    [accountId, s, e]
  );

  // Each user now appears exactly once — no merge loop needed.
  const memberMap = new Map();
  for (const r of rows) {
    memberMap.set(r.user_id, {
      userId:          r.user_id,
      name:            r.member_name,
      userRole:        r.user_role,
      assignmentRoles: r.assignment_roles || [],
      completedJobs:   pi(r.completed_jobs),
      eligibleJobs:    pi(r.eligible_jobs),
      productionValue: pf(r.production_value),
      totalMinutes:    pi(r.total_minutes),
      topServices:     r.top_services || [],
      commissionEarned: null,
    });
  }

  // Attach commission totals
  try {
    const { rows: commRows } = await pool.query(
      `SELECT user_id, COALESCE(SUM(commission_amount), 0) AS earned
       FROM commission_entries
       WHERE account_id = $1
         AND status IN ('pending','approved','payable','paid')
         AND created_at >= $2::date
         AND created_at <  ($3::date + INTERVAL '1 day')
       GROUP BY user_id`,
      [accountId, s, e]
    );
    for (const r of commRows) {
      const m = memberMap.get(r.user_id);
      if (m) m.commissionEarned = pf(r.earned);
    }
  } catch { /* commission_entries may not exist */ }

  const members = [...memberMap.values()].map(m => {
    const hours    = m.totalMinutes / 60;
    const prodVal  = m.productionValue;
    return {
      userId:          m.userId,
      name:            m.name,
      userRole:        m.userRole,
      assignmentRoles: [...m.assignmentRoles],
      jobsCompleted:   m.completedJobs,
      productionValue: prodVal,
      avgTicket:       m.completedJobs > 0 ? pf(prodVal / m.completedJobs) : null,
      completionRate:  m.eligibleJobs > 0 ? m.completedJobs / m.eligibleJobs : null,
      laborHours:      Math.round(hours * 10) / 10,
      revenuePerLaborHour: hours > 0 && prodVal > 0 ? pf(prodVal / hours) : null,
      commissionEarned: m.commissionEarned,
      topServices:     m.topServices.filter(Boolean).slice(0, 3),
    };
  });

  return {
    members,
    limitations: [
      'Production value attributed to primary assignee only. Assisting members show job count without revenue attribution.',
      'Labor hours use scheduled duration — actual time tracking not yet connected.',
    ],
    provenance: {
      sources:  ['job_assignments', 'jobs', 'users'],
      formula:  'SUM(jobs.amount WHERE is_primary=true AND status=complete) per user',
      basis:    'job.scheduled_at within requested period',
    },
  };
}

async function getMemberDetail(accountId, userId, { start, end }) {
  const { start: ds, end: de } = defaultRange();
  const s = start || ds;
  const e = end   || de;

  const [{ rows: [user] }, { rows: jobs }] = await Promise.all([
    pool.query(`SELECT id, name, role FROM users WHERE id = $1 AND account_id = $2`, [userId, accountId]),
    pool.query(
      `SELECT j.id, j.status, j.amount, j.service_type, j.scheduled_at,
              j.completed_at, j.duration_minutes, ja.assignment_role, ja.is_primary
       FROM jobs j
       JOIN job_assignments ja
         ON ja.job_id = j.id AND ja.user_id = $2 AND ja.removed_at IS NULL
       WHERE j.account_id = $1
         AND j.scheduled_at >= $3::date
         AND j.scheduled_at <  ($4::date + INTERVAL '1 day')
       ORDER BY j.scheduled_at DESC
       LIMIT 50`,
      [accountId, userId, s, e]
    ),
  ]);

  if (!user) return null;

  const completed  = jobs.filter(j => j.status === 'complete').length;
  const cancelled  = jobs.filter(j => j.status === 'cancelled').length;
  const noShows    = jobs.filter(j => j.status === 'no_show').length;
  const eligible   = completed + cancelled + noShows;
  const prodValue  = jobs.filter(j => j.status === 'complete' && j.is_primary)
    .reduce((s, j) => s + pf(j.amount), 0);
  const totalHrs   = jobs.filter(j => j.status === 'complete')
    .reduce((s, j) => s + (j.duration_minutes || 0), 0) / 60;

  return {
    user,
    period: { start: s, end: e },
    summary: {
      jobsCompleted:   completed,
      productionValue: pf(prodValue),
      completionRate:  eligible > 0 ? completed / eligible : null,
      laborHours:      Math.round(totalHrs * 10) / 10,
      revenuePerLaborHour: totalHrs > 0 && prodValue > 0 ? pf(prodValue / totalHrs) : null,
    },
    jobs: jobs.map(j => ({
      id:             j.id,
      status:         j.status,
      amount:         pf(j.amount),
      serviceType:    j.service_type,
      scheduledAt:    j.scheduled_at,
      completedAt:    j.completed_at,
      durationMinutes: j.duration_minutes,
      assignmentRole: j.assignment_role,
      isPrimary:      j.is_primary,
    })),
  };
}

module.exports = { getTeamPerformance, getMemberDetail };
