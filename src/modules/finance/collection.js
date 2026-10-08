// The collection flow (secretary "💰 تحصيل"):
//   CollectModal → create/adjust Charge → create Payment (method + account) → ledger entries.
// The clinical Visit / Appointment are NOT the transaction: they only receive a best-effort
// legacy mirror (cost/paid) afterwards so the older screens keep showing the same numbers.

import { fail } from './constants.js';
import { toMinor, fromMinor } from './money.js';
import { applyBatch, mergeBatches } from './batch.js';
import { createCharge, adjustCharge, recordPayment, baseCharges, chargeBalance, legacyMirror } from './billing.js';

export const aptSourceRef = apt => 'apt-' + apt.id;

// A charge may already exist for this appointment — created by the collection flow or migrated from the legacy visit.
export function findChargeForApt(state, apt) {
  const ref = aptSourceRef(apt);
  return baseCharges(state.charges).find(c =>
    String(c.sourceRef) === ref || String(c.visitId) === ref || (c.appointmentId != null && String(c.appointmentId) === String(apt.id)));
}

// Numbers the modal needs (all minor units): fee, paid so far, outstanding, and the suggested amount to collect now.
export function collectionSnapshot(state, apt, typedCost) {
  const ch = findChargeForApt(state, apt);
  const bal = ch ? chargeBalance(ch.id, state) : { net: 0, netPaid: 0, outstanding: 0 };
  const fee = toMinor(typedCost);
  const feeMinor = fee === null ? bal.net : fee;
  return { charge: ch || null, fee: feeMinor, paid: bal.netPaid, outstanding: Math.max(feeMinor - bal.netPaid, 0) };
}

// input: {apt, cost, collected, method, accountId, paymentId?, doctors?}
export function planCollection(state, input, ctx = {}) {
  const { apt } = input;
  const cost = toMinor(input.cost) || 0;
  const collected = toMinor(input.collected) || 0;
  if (cost < 0 || collected < 0) fail('AMOUNT_INVALID', 'amounts cannot be negative');
  let working = state;
  const parts = [];
  let charge = findChargeForApt(state, apt);

  if (!charge && cost > 0) {
    const d = (input.doctors || []).find(x => x.short === apt.doctor || x.name === apt.doctor);
    const b = createCharge(state, {
      patientId: apt.patientId ?? null, visitId: aptSourceRef(apt), appointmentId: apt.id, service: apt.type || '', amount: fromMinor(cost),
      doctorId: d ? d.id : null, doctor: apt.doctor || '', clinic: apt.clinic || '', serviceDate: apt.date,
      source: 'COLLECT_MODAL', sourceRef: aptSourceRef(apt)
    }, ctx);
    parts.push(b); working = applyBatch(working, b);
    charge = b.charges[0];
  } else if (charge) {
    const net = chargeBalance(charge.id, working).net;
    if (cost > 0 && cost !== net) {
      // Changing an existing fee is an adjustment; the server only lets admins post those.
      if (ctx.role && ctx.role !== 'admin') fail('ADJUST_FORBIDDEN', 'only an admin can change a fee that was already charged');
      const b = adjustCharge(working, { chargeId: charge.id, newNet: fromMinor(cost), reason: input.reason || 'تعديل السعر عند التحصيل' }, ctx);
      parts.push(b); working = applyBatch(working, b);
    }
  }

  if (collected > 0) {
    if (!charge) fail('CHARGE_NOT_FOUND', 'enter the fee before collecting');
    const b = recordPayment(working, {
      id: input.paymentId, chargeId: charge.id, amount: fromMinor(collected), method: input.method, accountId: input.accountId, source: 'COLLECT_MODAL',
      sourceRef: null, notes: ''
    }, ctx);
    parts.push(b); working = applyBatch(working, b);
  }

  const batch = mergeBatches(...parts);
  const mirror = charge ? legacyMirror(charge.id, working) : { cost: String(cost ? fromMinor(cost).replace(/\.00$/, '') : 0), paid: false };
  return { batch, chargeId: charge ? charge.id : null, mirror, state: working };
}
