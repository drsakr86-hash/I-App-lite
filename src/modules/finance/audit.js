// Financial audit trail. One row per mutation: who / when / what / old / new /
// source / reason. Append-only, own sync key (not the capped 1500-entry general
// audit log, which truncates details to 200 chars).

import { auditIdFor } from './ids.js';

export function buildAudit({ entity, entityId, action, by = '', role = '', oldValue = null, newValue = null, source = '', reason = '', now = new Date() }) {
  return {
    id: auditIdFor(entityId, action, now.getTime()),
    at: now.toISOString(),
    by,
    role,
    entity,
    entityId: String(entityId),
    action,
    oldValue: oldValue === null ? null : JSON.stringify(oldValue),
    newValue: newValue === null ? null : JSON.stringify(newValue),
    source,
    reason
  };
}
