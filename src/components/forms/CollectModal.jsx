import React, { useState } from 'react';
import { matchCollectPrice, initialCollectCost, initialCollectPaid } from './secretary-forms-model.js';
import { C } from '../../modules/theme/index.js';
import { inp } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { toMinor, fromMinor } from '../../modules/finance/money.js';
import { SELECTABLE_METHODS } from '../../modules/finance/constants.js';
import { defaultAccountFor } from '../../modules/finance/accounts.js';

// Payment collection form (secretary app, "💰 تحصيل"). Exact port of the
// legacy runtime's CollectModal (public/legacy/app-runtime.js). onSave(cost,
// paid) receives the cost exactly as typed (a string, or the stored/matched
// value when untouched) and the paid flag — the contract SecretaryApp's
// handleSaveCollect expects.
//
// Accounting mode: when `finance` ({accounts, snapshot}) is passed, the modal asks for the fee, the amount
// collected NOW, the payment method and the account, and calls onSave({cost, collected, method, accountId}).
// Without `finance` (accounting not set up yet) it behaves exactly as before: onSave(cost, paid).
export default function CollectModal({ apt, prices = [], finance = null, onSave, onClose }) {
  const lang = useLang();
  const matched = matchCollectPrice(prices, apt.type, apt.clinic);
  const [cost, setCost] = useState(initialCollectCost(apt, matched));
  const [paid, setPaid] = useState(initialCollectPaid(apt));
  const [collected, setCollected] = useState(() => {
    if (!finance) return '';
    const fee = finance.snapshot && finance.snapshot.charge ? finance.snapshot.fee : toMinor(initialCollectCost(apt, matched)) || 0;
    const rest = Math.max(fee - (finance.snapshot ? finance.snapshot.paid : 0), 0);
    return rest > 0 ? fromMinor(rest).replace(/\.00$/, '') : '';
  });
  const accounts = finance ? finance.accounts : [];
  const [method, setMethod] = useState('cash');
  const [accountId, setAccountId] = useState(() => (defaultAccountFor(accounts, 'cash') || {}).id || '');
  const pickMethod = m => {
    setMethod(m);
    const a = defaultAccountFor(accounts, m);
    if (a) setAccountId(a.id);
  };
  if (finance) {
    const paidBefore = finance.snapshot ? finance.snapshot.paid : 0;
    const typed = toMinor(cost);
    const col = toMinor(collected) || 0;
    const remaining = typed === null ? null : typed - paidBefore - col;
    const bad = typed === null || typed < 0 || col < 0 || (col > 0 && !accountId) || (remaining !== null && remaining < 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{apt.patient}</div>
        <div>
          <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>{t('g3.collect.cost', lang)}</label>
          <input style={{ ...inp(), textAlign: 'center', fontSize: 18, fontWeight: 700 }} type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" autoFocus />
        </div>
        {paidBefore > 0 && <div style={{ color: C.muted, fontSize: 12 }}>{t('g8.collect.paidBefore', lang, { n: fromMinor(paidBefore) })}</div>}
        <div>
          <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>{t('g8.collect.now', lang)}</label>
          <input style={{ ...inp(), textAlign: 'center', fontSize: 18, fontWeight: 700 }} type="number" inputMode="decimal" value={collected} onChange={e => setCollected(e.target.value)} placeholder="0" />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SELECTABLE_METHODS.map(m => (
            <button key={m} onClick={() => pickMethod(m)} style={{ flex: '1 1 40%', background: method === m ? C.gold + '33' : 'transparent', border: '1px solid ' + (method === m ? C.gold : C.border), borderRadius: 8, padding: '8px 6px', color: method === m ? C.gold : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{t('g8.method.' + m, lang)}</button>
          ))}
        </div>
        {accounts.length > 1 && (
          <select style={inp()} value={accountId} onChange={e => setAccountId(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {remaining !== null && (
          <div style={{ color: remaining > 0 ? C.warning || C.gold : C.success, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
            {remaining > 0 ? t('g8.collect.remaining', lang, { n: fromMinor(remaining) }) : remaining < 0 ? t('g8.collect.over', lang) : t('g8.collect.settled', lang)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid ' + C.border, borderRadius: 10, padding: 11, color: C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{t('g3.common.cancel', lang)}</button>
          <button disabled={bad} onClick={() => onSave({ cost, collected, method, accountId })} style={{ flex: 2, opacity: bad ? 0.5 : 1, background: 'linear-gradient(135deg,' + C.gold + ',#e0951f)', border: 'none', borderRadius: 10, padding: 11, color: C.bg, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{t('g3.collect.save', lang)}</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{apt.patient}</div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>{t('g3.collect.cost', lang)}</label>
        <input
          style={{ ...inp(), textAlign: 'center', fontSize: 18, fontWeight: 700 }}
          type="number"
          value={cost}
          onChange={e => setCost(e.target.value)}
          placeholder="0"
          autoFocus
        />
      </div>
      <div
        onClick={() => setPaid(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: C.card,
          border: '1px solid ' + (paid ? C.success : C.border),
          borderRadius: 10,
          padding: '10px 14px',
          cursor: 'pointer'
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: paid ? C.success : C.bg,
            border: '2px solid ' + (paid ? C.success : C.border),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: C.bg,
            fontWeight: 700
          }}
        >{paid ? '✓' : ''}</div>
        <span style={{ color: paid ? C.success : C.muted, fontSize: 13, fontWeight: 600 }}>{t('g3.collect.paidCash', lang)}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid ' + C.border,
            borderRadius: 10,
            padding: 11,
            color: C.muted,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >{t('g3.common.cancel', lang)}</button>
        <button
          onClick={() => onSave(cost, paid)}
          style={{
            flex: 2,
            background: 'linear-gradient(135deg,' + C.gold + ',#e0951f)',
            border: 'none',
            borderRadius: 10,
            padding: 11,
            color: C.bg,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >{t('g3.collect.save', lang)}</button>
      </div>
    </div>
  );
}
