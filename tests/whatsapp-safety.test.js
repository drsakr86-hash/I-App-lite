// MOCKED: deterministic Arabic (Egyptian + MSA) safety layer and text helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isUrgent, wantsHuman, isOptOut, isAffirmative, isNegative, sanitizeIncoming, cleanPatientName, normArabic, chunkText } from '../supabase/functions/_shared/text.js';
import { normArabic as appNorm } from '../src/modules/patients/list.js';

test('urgent symptoms (Egyptian + MSA wording) are escalated', () => {
  for (const t of ['نظري راح فجأة', 'في ستارة سوداء في عيني', 'حاجة دخلت عيني', 'اتضربت في عيني', 'ألم شديد في عيني', 'عيني بتنزف', 'مبقتش شايف', 'فقدان النظر المفاجئ', 'مادة كيماوية وقعت في عيني', 'ومضات ضوء', 'EMERGENCY'])
    assert.equal(isUrgent(t), true, t);
});
test('ordinary administrative messages are not urgent', () => {
  for (const t of ['عايز احجز كشف', 'الكشف بكام', 'العيادة فين', 'مواعيد الدكتور ايه', 'شكرا', 'ممكن اغير ميعاد الحجز']) assert.equal(isUrgent(t), false, t);
});
test('human request detection', () => {
  for (const t of ['عايز اكلم موظف', 'ممكن سكرتير', 'اكلم حد', 'عايز اتكلم مع مسؤول', 'human please']) assert.equal(wantsHuman(t), true, t);
  assert.equal(wantsHuman('عايز احجز'), false);
});
test('opt-out: short explicit messages only', () => {
  for (const t of ['stop', 'STOP', 'وقف الرسائل', 'إيقاف التذكير', 'الغاء الاشتراك']) assert.equal(isOptOut(t), true, t);
  for (const t of ['bus stop قريب منكم؟', 'مش هقدر اجي بس لو سمحت وقف الرسائل بتاعت العروض اللي بتيجي كتير', 'عايز احجز']) assert.equal(isOptOut(t), false, t);
});
test('yes / no are strict', () => {
  for (const t of ['تمام', 'ايوه', 'أكد', 'اه تمام', 'نعم', 'ok', 'تأكيد.']) assert.equal(isAffirmative(t), true, t);
  for (const t of ['تمام بس غير الميعاد لبكره الساعة 9', 'مش عارف', 'لا']) assert.equal(isAffirmative(t), false, t);
  assert.equal(isNegative('لا'), true); assert.equal(isNegative('بلاش'), true); assert.equal(isNegative('تمام'), false);
});
test('incoming text is sanitised: control/bidi chars removed, Arabic-Indic digits normalised, length capped', () => {
  assert.equal(sanitizeIncoming('a\u0000b‮c'), 'abc');
  assert.equal(sanitizeIncoming('الساعة ٢٠:١٠'), 'الساعة 20:10');
  assert.equal(sanitizeIncoming('x'.repeat(5000), 100).length, 100);
});
test('patient names: letters only', () => {
  assert.equal(cleanPatientName('أحمد محمد'), 'أحمد محمد'); assert.equal(cleanPatientName('12345'), null); assert.equal(cleanPatientName("'; drop table"), 'drop table');
  assert.equal(cleanPatientName('<script>x</script>'), 'scriptxscript');
});
test('chunkText never exceeds the limit', () => { for (const c of chunkText('كلمة '.repeat(2000), 3800)) assert.ok(c.length <= 3800); });
test('normArabic stays in sync with the app (patients/list.js)', () => {
  for (const s of ['أحمد  إبراهيم', 'مَنَى', 'فاطمة', 'علي']) assert.equal(normArabic(s), appNorm(s));
});
