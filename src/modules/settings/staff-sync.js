// Mirrors a staff account change to the server (public.iapp_staff) through the admin-only RPCs.
// The server is the authority for roles (RLS reads iapp_staff); the local user list is a convenience copy.
// Never throws: returns { ok, error }.
import { getSB } from '../data-access/index.js';
import { staffRpcArgs } from './model.js';

export async function pushStaffRole(rec, sb = getSB()) {
  if (!sb || typeof sb.rpc !== 'function') return { ok: false, error: 'offline' };
  try {
    const r = await sb.rpc('iapp_admin_set_staff', staffRpcArgs(rec));
    return r && r.error ? { ok: false, error: r.error.message || String(r.error) } : { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

export async function removeStaffRole(email, sb = getSB()) {
  if (!sb || typeof sb.rpc !== 'function') return { ok: false, error: 'offline' };
  try {
    const r = await sb.rpc('iapp_admin_remove_staff', { p_email: String(email || '').trim().toLowerCase() });
    return r && r.error ? { ok: false, error: r.error.message || String(r.error) } : { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}
