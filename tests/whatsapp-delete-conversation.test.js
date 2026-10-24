// Delete-conversation: SQL is admin-only and refuses an active chat; UI offers it to admins only. (Static checks; the SQL itself must be run by the owner.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../docs/sql/whatsapp-delete-conversation.sql', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/screens/WhatsAppInbox.jsx', import.meta.url), 'utf8');
const svc = fs.readFileSync(new URL('../src/modules/whatsapp/service.js', import.meta.url), 'utf8');
const dict = fs.readFileSync(new URL('../src/modules/i18n/dict/g9.js', import.meta.url), 'utf8');

test('SQL: admin only, active chats refused, audited, not callable by anon', () => {
  assert.match(sql, /iapp_has_role\(array\['admin'\]\)/);
  assert.match(sql, /v_status = 'ai' then raise exception 'conversation_active'/);
  assert.match(sql, /staff\.delete_conversation/);
  assert.match(sql, /revoke all on function public\.wa_staff_delete_conversation\(bigint\) from public, anon/);
  assert.doesNotMatch(sql, /delete from public\.wa_contacts/, 'contact (opt-out) must be kept');
});

test('service and UI: delete is wired, admin only, behind a confirm', () => {
  assert.match(svc, /deleteConv = id => rpc\('wa_staff_delete_conversation'/);
  assert.match(ui, /session\.role === 'admin' && <button[^>]*onClick=\{removeConv\}/);
  assert.match(ui, /window\.confirm\(t\('g9\.wa\.deleteConfirm'/);
});

test('both languages have the delete strings', () => {
  for (const k of ['g9.wa.delete', 'g9.wa.deleteConfirm', 'g9.wa.deleteActive']) assert.equal(dict.split('"' + k + '"').length - 1, 2, k);
});
