import React, { useState } from 'react';
import { Modal, Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';
import { localISO, CLINICS } from '../../modules/constants/index.js';
import {
  createShareRule, previewSettlement, createSettlement, approveSettlement, cancelSettlement, paySettlement,
  settlementPaidMinor, doctorPosition
} from '../../modules/finance/doctor-accounting.js';
import { fromMinor } from '../../modules/finance/money.js';
import { newFinId } from '../../modules/finance/ids.js';
import { Money, Card, Section, Empty, SmallBtn, FieldsForm } from './parts.jsx';
import { accountOptions, methodOptions, defaultPay, amountOk } from './view-model.js';

export default function Doctors({ state, doctors, session, run, notify }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [modal, setModal] = useState(null);
  const today = localISO();
  const ctx = { by: session.name || session.username, role: session.role };
  const docOpts = doctors.map(d => [String(d.id), tv(d.name)]);
  const clinicOpts = CLINICS.map(c => [c.v, tv(c.l)]);
  const find = id => doctors.find(d => String(d.id) === String(id)) || {};
  const exec = async planner => { const r = await run(planner); notify(r); if (r.ok) setModal(null); };
  const monthStart = today.slice(0, 7) + '-01';

  const query = v => ({ doctorId: v.doctorId, doctor: find(v.doctorId).name || '', periodFrom: v.periodFrom, periodTo: v.periodTo, clinic: v.clinic || '' });

  return (
    <div>
      <Section title={tr('g8.doc.positions')}>
        {doctors.length === 0 && <Empty text={tr('g8.common.none')} />}
        {doctors.map(d => {
          const p = doctorPosition(state, { doctorId: d.id, doctor: d.name });
          return (
            <Card key={d.id}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{tv(d.name)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11, color: C.muted }}>
                <span>{tr('g8.doc.gross')}: <Money minor={p.grossRevenue} size={12} /></span>
                <span>{tr('g8.doc.share')}: <Money minor={p.doctorShare} size={12} color={C.accent} /></span>
                <span>{tr('g8.doc.paid')}: <Money minor={p.alreadyPaid} size={12} color={C.success} /></span>
                <span>{tr('g8.doc.owed')}: <Money minor={p.outstanding} size={12} color={C.gold} /></span>
              </div>
              {p.chargesWithoutRule > 0 && <div style={{ color: C.danger, fontSize: 10, marginTop: 4 }}>{tr('g8.doc.noRule').replace('{n}', p.chargesWithoutRule)}</div>}
            </Card>
          );
        })}
      </Section>

      <Section title={tr('g8.doc.settlements')} right={<Btn small color={C.purple} onClick={() => setModal({ type: 'new' })}>{tr('g8.doc.newSettlement')}</Btn>}>
        {state.settlements.length === 0 && <Empty text={tr('g8.common.none')} />}
        {[...state.settlements].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(s => {
          const paid = settlementPaidMinor(state, s.id);
          return (
            <Card key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text }}>
                <span>{tv(s.doctor)} · {s.periodFrom} → {s.periodTo}</span>
                <span style={{ color: C.muted, fontWeight: 700 }}>{tr('g8.doc.st.' + s.status)}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {tr('g8.doc.share')}: <Money minor={Math.round(Number(s.doctorShare) * 100)} size={12} /> · {tr('g8.doc.paid')}: <Money minor={paid} size={12} color={C.success} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                {s.status === 'draft' && <SmallBtn color={C.success} onClick={() => exec(st => approveSettlement(st, { id: s.id }, ctx))}>{tr('g8.doc.approve')}</SmallBtn>}
                {['approved', 'partial'].includes(s.status) && <SmallBtn color={C.gold} onClick={() => setModal({ type: 'pay', s, remaining: Math.round(Number(s.doctorShare) * 100) - paid })}>{tr('g8.doc.pay')}</SmallBtn>}
                {['draft', 'approved'].includes(s.status) && paid === 0 && <SmallBtn color={C.danger} onClick={() => setModal({ type: 'cancel', s })}>{tr('g8.exp.cancel')}</SmallBtn>}
              </div>
            </Card>
          );
        })}
      </Section>

      <Section title={tr('g8.doc.rules')} right={<Btn small color={C.teal} onClick={() => setModal({ type: 'rule' })}>{tr('g4.acc.add')}</Btn>}>
        {state.rules.length === 0 && <Empty text={tr('g8.doc.noRules')} />}
        {state.rules.map(r => (
          <Card key={r.id} style={{ fontSize: 12, color: C.text }}>
            {r.doctor ? tv(r.doctor) : tr('g8.doc.allDoctors')}{r.service ? ' · ' + tv(r.service) : ''} — <b>{r.value}{r.mode === 'percent' ? '%' : ' ' + tr('g4.common.currency')}</b>
          </Card>
        ))}
      </Section>

      {modal && modal.type === 'new' && <SettlementNew state={state} docOpts={docOpts} clinicOpts={clinicOpts} monthStart={monthStart} today={today} query={query} onClose={() => setModal(null)} onCreate={v => exec(st => createSettlement(st, { id: newFinId('set'), ...query(v) }, ctx))} />}
      {modal && modal.type === 'rule' && (
        <Modal title={tr('g8.doc.rules')} onClose={() => setModal(null)}>
          <FieldsForm initial={{ doctorId: '', service: '', mode: 'percent', value: '' }} submitLabel={tr('g4.acc.add')} onCancel={() => setModal(null)}
            fields={[
              { k: 'doctorId', label: tr('g8.doc.doctor'), type: 'select', options: docOpts, allowEmpty: true },
              { k: 'service', label: tr('g8.doc.service') },
              { k: 'mode', label: tr('g8.doc.mode'), type: 'select', options: [['percent', tr('g8.doc.percent')], ['fixed', tr('g8.doc.fixed')]], required: true },
              { k: 'value', label: tr('g8.doc.value'), type: 'number', required: true }
            ]}
            onSubmit={v => exec(st => createShareRule(st, { doctorId: v.doctorId || null, doctor: v.doctorId ? find(v.doctorId).name : '', service: v.service, mode: v.mode, value: v.value }, ctx))} />
        </Modal>
      )}
      {modal && modal.type === 'pay' && (
        <Modal title={tr('g8.doc.pay')} onClose={() => setModal(null)}>
          <FieldsForm initial={{ amount: fromMinor(modal.remaining).replace(/\.00$/, ''), ...defaultPay(state) }} submitLabel={tr('g8.doc.pay')} color={C.gold} onCancel={() => setModal(null)}
            fields={[
              { k: 'amount', label: tr('g3.expense.amount'), type: 'number', required: true },
              { k: 'method', label: tr('g8.exp.method'), type: 'select', options: methodOptions(tr), required: true },
              { k: 'accountId', label: tr('g8.exp.account'), type: 'select', options: accountOptions(state), required: true }
            ]}
            onSubmit={v => amountOk(v.amount) && exec(st => paySettlement(st, { id: newFinId('dpay'), settlementId: modal.s.id, amount: v.amount, method: v.method, accountId: v.accountId }, ctx))} />
        </Modal>
      )}
      {modal && modal.type === 'cancel' && (
        <Modal title={tr('g8.exp.cancel')} onClose={() => setModal(null)}>
          <FieldsForm fields={[{ k: 'reason', label: tr('g8.common.reason'), type: 'textarea', required: true }]} color={C.danger} submitLabel={tr('g8.exp.cancel')} onCancel={() => setModal(null)}
            onSubmit={v => exec(st => cancelSettlement(st, { id: modal.s.id, reason: v.reason }, ctx))} />
        </Modal>
      )}
    </div>
  );
}

function SettlementNew({ state, docOpts, clinicOpts, monthStart, today, query, onClose, onCreate }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [v, setV] = useState({ doctorId: docOpts[0] ? docOpts[0][0] : '', periodFrom: monthStart, periodTo: today, clinic: '' });
  const prev = v.doctorId && v.periodFrom && v.periodTo ? previewSettlement(state, query(v)) : null;
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title={tr('g8.doc.newSettlement')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select value={v.doctorId} onChange={set('doctorId')} style={{ padding: 10, borderRadius: 8 }}>{docOpts.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        <input type="date" value={v.periodFrom} onChange={set('periodFrom')} style={{ padding: 10, borderRadius: 8 }} />
        <input type="date" value={v.periodTo} onChange={set('periodTo')} style={{ padding: 10, borderRadius: 8 }} />
        <select value={v.clinic} onChange={set('clinic')} style={{ padding: 10, borderRadius: 8 }}><option value="">{tr('g3.expense.allClinics')}</option>{clinicOpts.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        {prev && (
          <Card>
            <div style={{ fontSize: 12, color: C.text }}>{tr('g8.doc.previewCount').replace('{n}', prev.lines.length)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{tr('g8.doc.gross')}: <Money minor={prev.gross} size={12} /> · {tr('g8.doc.share')}: <Money minor={prev.doctorShare} size={12} color={C.accent} /> · {tr('g8.doc.center')}: <Money minor={prev.centerShare} size={12} /></div>
            {prev.withoutRule > 0 && <div style={{ color: C.danger, fontSize: 10, marginTop: 4 }}>{tr('g8.doc.noRule').replace('{n}', prev.withoutRule)}</div>}
          </Card>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn outline full onClick={onClose}>{tr('g3.common.cancel')}</Btn>
          <Btn full color={C.purple} onClick={() => prev && prev.lines.length && onCreate(v)}>{tr('g8.doc.createDraft')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
