'use strict';

/**
 * Authority Extraction Worker
 *
 * Polls for pending extraction runs and processes them one at a time.
 *   - Claims the next pending run via SELECT FOR UPDATE SKIP LOCKED
 *   - Processes it (fetch PDF → provider → persist candidates)
 *   - Polls every 5 seconds when idle, immediately when a run was found
 *
 * Intended to be started once per process via start().
 * The worker is deliberately single-threaded (one run at a time) to keep
 * per-process resource usage predictable. Scale horizontally for throughput.
 */

const extractionService = require('../services/authorityExtractionService');

const IDLE_POLL_MS    = 5_000;
const STALE_CHECK_MS  = 10 * 60 * 1000; // 10 minutes — check for stuck PENDING_EXTRACTION cases

let _running = false;
let _timer   = null;

async function _tick() {
  let claimed = null;
  try {
    claimed = await extractionService.claimNextRun();
  } catch (err) {
    console.error('[authorityExtractionWorker] claimNextRun failed:', err.message);
  }

  if (claimed) {
    try {
      await extractionService.processExtractionRun(claimed.id, claimed.leaseToken);
    } catch (err) {
      console.error(`[authorityExtractionWorker] processExtractionRun(${claimed.id}) uncaught:`, err.message);
    }
    // Immediately look for more work — don't wait the idle interval
    if (_running) _timer = setTimeout(_tick, 0);
  } else {
    // Nothing to claim — wait before checking again
    if (_running) _timer = setTimeout(_tick, IDLE_POLL_MS);
  }
}

/**
 * Start the worker loop. Safe to call multiple times — subsequent calls are no-ops.
 */
function start() {
  if (_running) return;
  _running = true;
  console.log('[authorityExtractionWorker] started');
  _timer = setTimeout(_tick, 0);
}

/**
 * Stop the worker loop gracefully. The current in-flight tick (if any) will finish.
 */
function stop() {
  _running = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  console.log('[authorityExtractionWorker] stopped');
}

module.exports = { start, stop };
