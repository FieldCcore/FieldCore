'use strict';

// Normalized job activity event types — single source of truth for all writers and readers.
// Do not invent aliases. Do not add frontend-only names.

const JOB = {
  CREATED:    'job.created',
  UPDATED:    'job.updated',
  RESCHEDULED:'job.rescheduled',
  ASSIGNED:   'job.assigned',
  REASSIGNED: 'job.reassigned',
  UNASSIGNED: 'job.unassigned',
  STARTED:    'job.started',
  COMPLETED:  'job.completed',
  CANCELLED:  'job.cancelled',
  REOPENED:   'job.reopened',
};

const LOCATION = {
  ADDRESS_SELECTED: 'job.address_selected',
  ADDRESS_UPDATED:  'job.address_updated',
  GEOCODE_REQUESTED:'job.geocode_requested',
  GEOCODE_RESOLVED: 'job.geocode_resolved',
  GEOCODE_FAILED:   'job.geocode_failed',
  MAP_LOCATION_SET: 'job.map_location_set',
};

const EMERGENCY = {
  ACTIVATED:              'job.emergency_activated',
  UPDATED:                'job.emergency_updated',
  ACKNOWLEDGED:           'job.emergency_acknowledged',
  RESOLVED:               'job.emergency_resolved',
  DEACTIVATED:            'job.emergency_deactivated',
  PRIORITY_CHANGED:       'job.emergency_priority_changed',
  RESPONSE_TARGET_CHANGED:'job.emergency_response_target_changed',
};

const COMMUNICATION = {
  DRAFTED:   'job.communication_drafted',
  QUEUED:    'job.communication_queued',
  SENT:      'job.communication_sent',
  DELIVERED: 'job.communication_delivered',
  FAILED:    'job.communication_failed',
};

const DISPATCH = {
  ROUTE_UPDATED:       'job.route_updated',
  CONFLICT_DETECTED:   'job.conflict_detected',
  CONFLICT_OVERRIDDEN: 'job.conflict_overridden',
  DELAY_DETECTED:      'job.delay_detected',
  SERVICE_AREA_EXCEPTION: 'job.service_area_exception',
};

// Category labels — maps event type prefix to display category
const CATEGORY_MAP = {
  'job.created':    'job', 'job.updated':   'job', 'job.rescheduled': 'job',
  'job.assigned':   'job', 'job.reassigned':'job', 'job.unassigned':  'job',
  'job.started':    'job', 'job.completed': 'job', 'job.cancelled':   'job',
  'job.reopened':   'job',
  'job.address_selected': 'location', 'job.address_updated': 'location',
  'job.geocode_requested': 'location', 'job.geocode_resolved': 'location',
  'job.geocode_failed': 'location', 'job.map_location_set': 'location',
  'job.emergency_activated': 'emergency', 'job.emergency_updated': 'emergency',
  'job.emergency_acknowledged': 'emergency', 'job.emergency_resolved': 'emergency',
  'job.emergency_deactivated': 'emergency', 'job.emergency_priority_changed': 'emergency',
  'job.emergency_response_target_changed': 'emergency',
  'job.communication_drafted': 'communication', 'job.communication_queued': 'communication',
  'job.communication_sent': 'communication', 'job.communication_delivered': 'communication',
  'job.communication_failed': 'communication',
  'job.route_updated': 'dispatch', 'job.conflict_detected': 'dispatch',
  'job.conflict_overridden': 'dispatch', 'job.delay_detected': 'dispatch',
  'job.service_area_exception': 'dispatch',
};

function categoryFor(eventType) {
  if (CATEGORY_MAP[eventType]) return CATEGORY_MAP[eventType];
  if (eventType.startsWith('job.emergency_')) return 'emergency';
  if (eventType.startsWith('job.communication_')) return 'communication';
  if (eventType.startsWith('job.')) return 'job';
  return 'dispatch';
}

module.exports = { JOB, LOCATION, EMERGENCY, COMMUNICATION, DISPATCH, CATEGORY_MAP, categoryFor };
