'use strict';
/**
 * jobTeamAssignmentService
 *
 * Core domain service for multi-tech job assignment.
 * Supports SOLO, MULTI-MEMBER, and CREW assignment modes.
 *
 * Phase A (current): writes to job_assignments + keeps jobs.tech_id in sync
 * (legacy compat).
 * Phase B: all reads move exclusively to job_assignments.
 * Phase C: jobs.tech_id removed.
 */

const pool = require('../db/pool');
const { recordActivity } = require('./jobActivityService');

const NON_ASSIGNABLE_STATUSES = new Set([
  'complete', 'cancelled', 'no_show', 'draft',
]);

const VALID_ROLES = new Set([
  'lead_technician', 'technician', 'helper', 'apprentice',
  'specialist', 'driver', 'observer', 'crew_lead',
]);

const ACTIVE_STATUSES = new Set([
  'in_progress', 'en_route', 'arrived', 'paused',
  'awaiting_client', 'awaiting_parts', 'partially_completed', 'ready_for_inspection',
]);

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns the current active team for a job, ordered primary-first.
 *
 * @returns {{ assignments, primaryAssignment, teamSize, teamState }}
 */
async function getJobTeam(accountId, jobId) {
  const { rows } = await pool.query(
    `SELECT ja.*,
            u.name               AS member_name,
            u.role               AS member_system_role,
            u.field_work_eligible,
            u.dispatch_visible,
            u.is_available,
            u.operational_status
     FROM job_assignments ja
     JOIN users u ON u.id = ja.user_id
     WHERE ja.job_id     = $1
       AND ja.account_id = $2
       AND ja.removed_at IS NULL
     ORDER BY ja.is_primary DESC, ja.assigned_at`,
    [jobId, accountId]
  );

  const primaryAssignment = rows.find(r => r.is_primary) ?? null;
  const teamSize = rows.length;
  const teamState =
    teamSize === 0 ? 'UNASSIGNED' :
    teamSize === 1 ? 'SOLO_ASSIGNED' :
                     'TEAM_ASSIGNED';

  return { assignments: rows, primaryAssignment, teamSize, teamState };
}

/**
 * Returns all active crews for an account with their members.
 */
async function getCrews(accountId) {
  const { rows: crews } = await pool.query(
    `SELECT c.id, c.name, c.active, c.created_at
     FROM crews c
     WHERE c.account_id = $1 AND c.active = TRUE
     ORDER BY c.name`,
    [accountId]
  );

  if (!crews.length) return [];

  const crewIds = crews.map(c => c.id);
  const { rows: members } = await pool.query(
    `SELECT cm.crew_id, cm.user_id, cm.default_role, cm.is_lead, u.name AS member_name
     FROM crew_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.crew_id = ANY($1::uuid[]) AND cm.active = TRUE
     ORDER BY cm.is_lead DESC, u.name`,
    [crewIds]
  );

  const membersByCrewId = members.reduce((acc, m) => {
    if (!acc[m.crew_id]) acc[m.crew_id] = [];
    acc[m.crew_id].push(m);
    return acc;
  }, {});

  return crews.map(c => ({
    ...c,
    members: membersByCrewId[c.id] || [],
    memberCount: (membersByCrewId[c.id] || []).length,
  }));
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Validates a proposed team update.
 *
 * Input members: [{ userId, assignmentRole, isPrimary }]
 *
 * Returns:
 * {
 *   allowed,           // false if any member has blocking issues
 *   teamState,         // UNASSIGNED | SOLO_ASSIGNED | TEAM_ASSIGNED | NO_CHANGES | MODIFIED_TEAM | UNAVAILABLE_SELECTION
 *   memberResults,     // per-member validation
 *   added,            // new members
 *   removed,          // removed members
 *   updated,          // role/lead changes
 *   workloadImpact,   // per-member impact
 *   warnings,         // team-level warnings
 *   blockingIssues,   // team-level blocks
 * }
 */
async function validateTeamUpdate({ accountId, jobId, requestedByUserId, members = [], crewId }) {
  const teamBlocking = [];
  const teamWarnings = [];

  // ── Job ────────────────────────────────────────────────────────────────────
  const { rows: jobRows } = await pool.query(
    `SELECT j.*, c.name AS client_name
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, accountId]
  );
  if (!jobRows.length) {
    return {
      allowed: false, teamState: 'UNAVAILABLE_SELECTION',
      memberResults: [],
      added: [], removed: [], updated: [],
      blockingIssues: [{ type: 'job_not_found', message: 'Job not found.' }],
      warnings: [], workloadImpact: [],
    };
  }
  const job = jobRows[0];

  if (NON_ASSIGNABLE_STATUSES.has(job.status)) {
    teamBlocking.push({ type: 'job_not_assignable', message: `Job cannot be assigned — status is "${job.status}".` });
  }

  // ── Current team ──────────────────────────────────────────────────────────
  const { assignments: current } = await getJobTeam(accountId, jobId);
  const currentByUserId = Object.fromEntries(current.map(a => [a.user_id, a]));

  // ── Dedup members ─────────────────────────────────────────────────────────
  const seen = new Set();
  const deduped = members.filter(m => {
    if (seen.has(m.userId)) return false;
    seen.add(m.userId);
    return true;
  });

  // Exactly one primary
  const primaries = deduped.filter(m => m.isPrimary);
  if (deduped.length > 0 && primaries.length === 0) {
    teamBlocking.push({ type: 'no_primary', message: 'Exactly one lead technician is required.' });
  }
  if (primaries.length > 1) {
    teamBlocking.push({ type: 'multiple_primaries', message: 'Only one lead technician is allowed.' });
  }

  // ── Validate each member ──────────────────────────────────────────────────
  const memberIds = deduped.map(m => m.userId).filter(Boolean);
  let techRows = [];
  if (memberIds.length) {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.role, u.field_work_eligible, u.dispatch_visible,
              u.is_available, u.operational_status
       FROM users u
       WHERE u.id = ANY($1::uuid[]) AND u.account_id = $2`,
      [memberIds, accountId]
    );
    techRows = rows;
  }
  const techById = Object.fromEntries(techRows.map(t => [t.id, t]));

  // Schedule overlap check — only if job is scheduled
  let overlapsById = {};
  if (job.scheduled_at && memberIds.length) {
    const start = new Date(job.scheduled_at);
    const end   = new Date(start.getTime() + (job.duration_minutes || 60) * 60000);
    const { rows: overlaps } = await pool.query(
      `SELECT ja.user_id, j.service_type, j.client_id
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = ANY($1::uuid[])
         AND ja.account_id = $2
         AND ja.removed_at IS NULL
         AND j.id != $3
         AND j.status NOT IN ('cancelled','complete','no_show')
         AND j.scheduled_at IS NOT NULL
         AND j.scheduled_at < $5
         AND (j.scheduled_at + (COALESCE(j.duration_minutes,60) * INTERVAL '1 minute')) > $4`,
      [memberIds, accountId, jobId, start.toISOString(), end.toISOString()]
    );
    overlapsById = overlaps.reduce((acc, o) => {
      if (!acc[o.user_id]) acc[o.user_id] = [];
      acc[o.user_id].push(o);
      return acc;
    }, {});
  }

  // Workload per member
  let workloadById = {};
  if (memberIds.length) {
    const dateStr = job.scheduled_at
      ? new Date(job.scheduled_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const { rows: wl } = await pool.query(
      `SELECT ja.user_id,
              COUNT(DISTINCT j.id)                            AS job_count,
              COALESCE(SUM(j.duration_minutes), 0)           AS total_minutes
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = ANY($1::uuid[])
         AND ja.account_id = $2
         AND ja.removed_at IS NULL
         AND j.id != $3
         AND j.status NOT IN ('cancelled','no_show','draft','unscheduled')
         AND (j.scheduled_at)::date = $4::date
       GROUP BY ja.user_id`,
      [memberIds, accountId, jobId, dateStr]
    );
    workloadById = Object.fromEntries(wl.map(r => [r.user_id, r]));
  }

  const DEFAULT_SHIFT = 8 * 60;
  const memberResults = deduped.map(m => {
    const tech    = techById[m.userId];
    const blocking = [];
    const warnings = [];

    if (!tech) {
      blocking.push({ type: 'tech_not_found', message: 'Team member not found in this account.' });
      return { userId: m.userId, allowed: false, blockingIssues: blocking, warnings, workloadImpact: null };
    }

    if (!tech.field_work_eligible) {
      blocking.push({ type: 'not_field_eligible', message: `${tech.name} is not configured for field work.` });
    }
    if (!tech.dispatch_visible) {
      warnings.push({ type: 'not_dispatch_visible', message: `${tech.name} is not visible in Dispatch.` });
    }
    if (!tech.is_available) {
      warnings.push({ type: 'tech_unavailable', message: `${tech.name} has marked themselves unavailable.` });
    }
    if (tech.operational_status === 'off_duty') {
      warnings.push({ type: 'off_duty', message: `${tech.name} is currently off duty.` });
    }

    const memberOverlaps = overlapsById[m.userId] || [];
    for (const o of memberOverlaps) {
      blocking.push({ type: 'schedule_overlap', message: `${tech.name} has a conflicting job at this time.` });
    }

    if (!VALID_ROLES.has(m.assignmentRole)) {
      blocking.push({ type: 'invalid_role', message: `"${m.assignmentRole}" is not a valid assignment role.` });
    }

    const wl            = workloadById[m.userId] || {};
    const currentMin    = parseInt(wl.total_minutes || 0, 10);
    const addedMin      = job.duration_minutes || 60;
    const newMin        = currentMin + addedMin;
    const capacityPct   = Math.round((newMin / DEFAULT_SHIFT) * 100);
    const overtimeMin   = Math.max(0, newMin - DEFAULT_SHIFT);

    if (overtimeMin > 0 && !warnings.some(w => w.type === 'overtime_risk')) {
      warnings.push({ type: 'overtime_risk', message: `Adding this job creates ${Math.round(overtimeMin / 6) / 10}h overtime for ${tech.name}.` });
    }

    const workloadImpact = {
      currentJobCount:  parseInt(wl.job_count || 0, 10),
      newJobCount:      parseInt(wl.job_count || 0, 10) + 1,
      currentServiceHours: +(currentMin / 60).toFixed(1),
      newServiceHours:     +(newMin     / 60).toFixed(1),
      capacityPercent:  capacityPct,
      overtimeRiskMinutes: overtimeMin,
    };

    return {
      userId:       m.userId,
      memberName:   tech.name,
      isPrimary:    m.isPrimary,
      assignmentRole: m.assignmentRole,
      allowed:      blocking.length === 0,
      blockingIssues: blocking,
      warnings,
      workloadImpact,
    };
  });

  // ── Compute diff vs current team ──────────────────────────────────────────
  const proposedIds   = new Set(deduped.map(m => m.userId));
  const currentIds    = new Set(current.map(a => a.user_id));
  const added         = deduped.filter(m => !currentIds.has(m.userId));
  const removed       = current.filter(a => !proposedIds.has(a.user_id));
  const updated       = deduped.filter(m => {
    const existing = currentByUserId[m.userId];
    if (!existing) return false;
    return existing.assignment_role !== m.assignmentRole || existing.is_primary !== m.isPrimary;
  });

  const noChanges = added.length === 0 && removed.length === 0 && updated.length === 0;

  // Warn if active job is being modified
  if (ACTIVE_STATUSES.has(job.status) && (added.length > 0 || removed.length > 0)) {
    teamWarnings.push({ type: 'active_job_change', message: `This job is currently "${job.status}". Team changes may affect field operations.` });
  }

  const hasAnyBlock = teamBlocking.length > 0 || memberResults.some(r => !r.allowed);

  const teamState = noChanges ? 'NO_CHANGES'
    : deduped.length === 0   ? 'UNASSIGNED'
    : hasAnyBlock            ? 'UNAVAILABLE_SELECTION'
    : deduped.length === 1   ? 'SOLO_ASSIGNED'
    :                          'TEAM_ASSIGNED';

  return {
    allowed:        !hasAnyBlock,
    teamState,
    memberResults,
    added,
    removed,
    updated,
    blockingIssues: teamBlocking,
    warnings:       teamWarnings,
    workloadImpact: memberResults.map(r => ({ userId: r.userId, ...r.workloadImpact })),
  };
}

// ── Apply ─────────────────────────────────────────────────────────────────────

/**
 * Persist team assignment changes inside a transaction.
 *
 * Input members: [{ userId, assignmentRole, isPrimary }]
 *
 * - Soft-removes members not in new list
 * - Inserts new members
 * - Updates role/primary for existing members
 * - Syncs jobs.tech_id to primary (Phase A legacy compat)
 * - Records Activity events
 *
 * Returns { assignments, primaryAssignment, teamSize, teamState }
 */
async function applyTeamUpdate({ accountId, jobId, requestedByUserId, members = [], crewId, overrideReasons }) {
  // Fetch actor name
  const { rows: [actor] } = await pool.query(
    `SELECT name FROM users WHERE id = $1`, [requestedByUserId]
  ).catch(() => ({ rows: [{}] }));
  const actorName = actor?.name || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Current team snapshot for diff
    const { rows: current } = await client.query(
      `SELECT id, user_id, assignment_role, is_primary, status
       FROM job_assignments
       WHERE job_id = $1 AND account_id = $2 AND removed_at IS NULL`,
      [jobId, accountId]
    );
    const currentById = Object.fromEntries(current.map(a => [a.user_id, a]));

    const proposedIds = new Set(members.map(m => m.userId));
    const currentIds  = new Set(current.map(a => a.user_id));

    // Dedup members
    const seen = new Set();
    const deduped = members.filter(m => { if (seen.has(m.userId)) return false; seen.add(m.userId); return true; });

    const now = new Date().toISOString();

    // 1. Soft-remove members not in new list
    const toRemove = current.filter(a => !proposedIds.has(a.user_id));
    for (const a of toRemove) {
      await client.query(
        `UPDATE job_assignments
         SET removed_at = NOW(), removed_by = $1, removal_reason = 'team_updated', updated_at = NOW()
         WHERE id = $2`,
        [requestedByUserId, a.id]
      );
    }

    // 2. Insert new members / update existing
    const primaryMember = deduped.find(m => m.isPrimary) || deduped[0];
    for (const m of deduped) {
      const role      = VALID_ROLES.has(m.assignmentRole) ? m.assignmentRole : 'technician';
      const isPrimary = m === primaryMember || m.isPrimary;

      if (currentIds.has(m.userId)) {
        // Update role/primary only if changed
        await client.query(
          `UPDATE job_assignments
           SET assignment_role = $1, is_primary = $2, updated_at = NOW()
           WHERE job_id = $3 AND user_id = $4 AND account_id = $5 AND removed_at IS NULL`,
          [role, isPrimary, jobId, m.userId, accountId]
        );
      } else {
        // Insert new
        await client.query(
          `INSERT INTO job_assignments
             (account_id, job_id, user_id, crew_id, assignment_role, is_primary,
              status, assigned_at, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'assigned', NOW(), $7)
           ON CONFLICT DO NOTHING`,
          [accountId, jobId, m.userId, crewId || null, role, isPrimary, requestedByUserId]
        );
      }
    }

    // 3. Phase A: keep jobs.tech_id in sync with primary assignment
    const primaryUserId = primaryMember?.userId ?? null;
    await client.query(
      `UPDATE jobs SET tech_id = $1, updated_at = NOW() WHERE id = $2 AND account_id = $3`,
      [primaryUserId, jobId, accountId]
    );

    await client.query('COMMIT');

    // 4. Activity events (non-fatal, outside transaction)
    const added   = deduped.filter(m => !currentIds.has(m.userId));
    const removed = toRemove;
    const oldPrimary = current.find(a => a.is_primary);
    const leadChanged = oldPrimary && primaryMember && oldPrimary.user_id !== primaryMember.userId;

    if (added.length > 0 && removed.length === 0 && current.length === 0) {
      // First assignment
      recordActivity({
        accountId, jobId, techId: primaryUserId,
        eventType: 'job.team_assigned',
        actor: { id: requestedByUserId, name: actorName, type: 'user' },
        summary: deduped.length === 1
          ? `Assigned to ${deduped[0]?.userId}`
          : `Team of ${deduped.length} assigned`,
        metadata: {
          memberIds: deduped.map(m => m.userId),
          primaryUserId,
          roles: deduped.map(m => ({ userId: m.userId, role: m.assignmentRole })),
        },
        source: 'domain',
      });
    } else if (added.length === 0 && removed.length === 0 && !leadChanged) {
      // Role updates only
      recordActivity({
        accountId, jobId, techId: primaryUserId,
        eventType: 'job.team_updated',
        actor: { id: requestedByUserId, name: actorName, type: 'user' },
        summary: 'Team roles updated',
        metadata: { memberIds: deduped.map(m => m.userId) },
        source: 'domain',
      });
    } else {
      for (const m of added) {
        recordActivity({
          accountId, jobId, techId: m.userId,
          eventType: 'job.member_added',
          actor: { id: requestedByUserId, name: actorName, type: 'user' },
          summary: `Team member added`,
          metadata: { userId: m.userId, assignmentRole: m.assignmentRole, isPrimary: m.isPrimary },
          source: 'domain',
        });
      }
      for (const a of removed) {
        recordActivity({
          accountId, jobId, techId: a.user_id,
          eventType: 'job.member_removed',
          actor: { id: requestedByUserId, name: actorName, type: 'user' },
          summary: `Team member removed`,
          metadata: { userId: a.user_id, previousRole: a.assignment_role },
          source: 'domain',
        });
      }
      if (leadChanged) {
        recordActivity({
          accountId, jobId, techId: primaryMember.userId,
          eventType: 'job.lead_changed',
          actor: { id: requestedByUserId, name: actorName, type: 'user' },
          summary: `Lead technician changed`,
          metadata: { previousLeadId: oldPrimary.user_id, newLeadId: primaryMember.userId },
          source: 'domain',
        });
      }
    }

    // Communication events (queued internally)
    if (added.length > 0) {
      recordActivity({
        accountId, jobId, techId: primaryUserId,
        eventType: 'job.communication_sent',
        actor: { id: requestedByUserId, name: actorName, type: 'system' },
        summary: `Assignment notifications queued for ${added.length} member(s)`,
        metadata: {
          type: current.length === 0 ? 'JobTeamAssigned' : 'JobTeamUpdated',
          addedIds: added.map(m => m.userId),
          queued: true, providerConfigured: false,
        },
        source: 'domain',
      });
    }

    return getJobTeam(accountId, jobId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Crew expand ───────────────────────────────────────────────────────────────

/**
 * Expand a saved crew into a proposed member list for validateTeamUpdate.
 * Returns [{ userId, assignmentRole, isPrimary }]
 */
async function expandCrewToMembers(accountId, crewId) {
  const { rows } = await pool.query(
    `SELECT cm.user_id, cm.default_role, cm.is_lead
     FROM crew_members cm
     WHERE cm.crew_id = $1 AND cm.account_id = $2 AND cm.active = TRUE`,
    [crewId, accountId]
  );

  const leadMember = rows.find(r => r.is_lead) || rows[0];
  return rows.map(r => ({
    userId:         r.user_id,
    assignmentRole: r.default_role || 'technician',
    isPrimary:      r === leadMember,
  }));
}

// ── Crew CRUD ─────────────────────────────────────────────────────────────────

async function createCrew(accountId, name, memberDefs = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [crew] } = await client.query(
      `INSERT INTO crews (account_id, name) VALUES ($1, $2) RETURNING *`,
      [accountId, name]
    );

    for (const m of memberDefs) {
      await client.query(
        `INSERT INTO crew_members (crew_id, account_id, user_id, default_role, is_lead)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (crew_id, user_id) DO UPDATE
           SET default_role = EXCLUDED.default_role, is_lead = EXCLUDED.is_lead`,
        [crew.id, accountId, m.userId, m.defaultRole || 'technician', m.isLead || false]
      );
    }

    await client.query('COMMIT');
    return getCrews(accountId).then(cs => cs.find(c => c.id === crew.id));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getJobTeam,
  getCrews,
  validateTeamUpdate,
  applyTeamUpdate,
  expandCrewToMembers,
  createCrew,
};
