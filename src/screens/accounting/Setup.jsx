import React, { useState } from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { planLegacyMigration } from '../../modules/finance/legacy-migration.js';
import { missingEntries } from '../../modules/finance/repair.js';
import { Card, Section, Empty } from './parts.jsx';
import { healthModel } from './view-model.js';

const REPORT_KEYS = ['chargesCreated', 'paymentsCreated', 'expensesConverted', 'recurringConverted', 'skippedNoAmount', 'alreadyMigrated'];

// Explicit, admin-only financial setup. "Preview" is a dry run: it computes the plan and writes NOTHING.
export function MigrationPanel({ state, data, session, run, notify, compact }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const [plan, setPlan] = useState(null);
  const ctx = { by: session.name || session.username, role: session.role };
  const preview = () => setPlan(planLegacyMigration(data, state, { now: new Date() }));
  const apply = async () => {
    const r = await run(st => planLegacyMigration(data, st, { now: new Date() }).batch);
    notify(r);
    if (r.ok) setPlan(null);
  };
  return (
    <Section title={tr('g8.setup.migrationTitle')}>
      <Card>
        <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>{tr(compact ? 'g8.setup.firstRun' : 'g8.setup.migrationNote')}</div>
        {!plan && <Btn full color={C.accent} onClick={preview}>{tr('g8.setup.preview')}</Btn>}
        {plan && (
          <div>
            {REPORT_KEYS.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, padding: '3px 0' }}>
                <span>{tr('g8.setup.r.' + k)}</span><b>{plan.report[k]}</b>
              </div>
            ))}
            {plan.report.needsReview.length > 0 && (
              <div style={{ color: C.gold, fontSize: 11, marginTop: 8 }}>
                {tr('g8.setup.needsReview').replace('{n}', plan.report.needsReview.length)}
                {plan.report.needsReview.slice(0, 8).map((r, i) => <div key={i} dir="auto">• {r.patient || r.visitId || r.appointmentId} — {tr('g8.setup.rv.' + r.type)}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn outline full onClick={() => setPlan(null)}>{tr('g3.common.cancel')}</Btn>
              <Btn full color={C.success} onClick={apply}>{tr('g8.setup.apply')}</Btn>
            </div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>{tr('g8.setup.safe')}</div>
          </div>
        )}
      </Card>
    </Section>
  );
}

export default function Setup({ state, data, session, run, notify }) {
  const lang = useLang();
  const tr = k => t(k, lang);
  const health = healthModel(state);
  const ctx = { by: session.name || session.username, role: session.role };
  const audit = [...state.audit].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  return (
    <div>
      <MigrationPanel state={state} data={data} session={session} run={run} notify={notify} />
      <Section title={tr('g8.setup.health')}>
        <Card>
          <div style={{ color: health.ok ? C.success : C.danger, fontWeight: 700, fontSize: 13 }}>{health.ok ? tr('g8.setup.healthy') : tr('g8.setup.unhealthy')}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{tr('g8.setup.entries').replace('{n}', state.entries.length)} · {tr('g8.setup.problems').replace('{n}', health.problems.length)} · {tr('g8.setup.missing').replace('{n}', health.missing)}</div>
          {health.missing > 0 && (
            <div style={{ marginTop: 8 }}>
              <Btn full color={C.gold} onClick={async () => notify(await run(st => missingEntries(st, ctx)))}>{tr('g8.setup.repair')}</Btn>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>{tr('g8.setup.repairNote')}</div>
            </div>
          )}
        </Card>
      </Section>
      <Section title={tr('g8.setup.auditTitle')}>
        {audit.length === 0 && <Empty text={tr('g8.common.none')} />}
        {audit.map(a => (
          <Card key={a.id} style={{ fontSize: 11, color: C.muted }}>
            <div style={{ color: C.text }}>{a.entity} · {a.action}{a.reason ? ' — ' + a.reason : ''}</div>
            <div>{String(a.at).replace('T', ' ').slice(0, 16)} · {a.by}{a.role ? ' (' + a.role + ')' : ''}</div>
          </Card>
        ))}
      </Section>
    </div>
  );
}
