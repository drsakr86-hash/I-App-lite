import React from 'react';
import { C } from '../../modules/theme/index.js';
import { t, useLang } from '../../modules/i18n/index.js';

const KIND = {
  saving: { color: () => C.accent, icon: '⏳' },
  saved: { color: () => C.success, icon: '✓' },
  'local-only': { color: () => C.gold, icon: '⚠' },
  partial: { color: () => C.gold, icon: '⚠' },
  failed: { color: () => C.danger, icon: '✕' },
  invalid: { color: () => C.gold, icon: '⚠' }
};

const hhmm = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
};

// Save / sync / load state of the open patient file. role="status" so screen
// readers announce changes; failures use role="alert".
export default function StatusBar({ ctx }) {
  const lang = useLang();
  const { saveStatus, dismissStatus, coreStatus, refreshAll, sync, connection } = ctx;
  const items = [];
  if (connection) {
    const tone = { success: C.success, info: C.accent, warning: C.gold, danger: C.danger, neutral: C.muted }[connection.tone] || C.muted;
    items.push(
      <div key="conn" data-conn={connection.id} role={connection.id === 'failed' ? 'alert' : 'status'} aria-live="polite"
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: tone, fontSize: 12, fontWeight: 700 }}>
        <span aria-hidden="true">{connection.icon}</span>
        <span>{connection.label}</span>
        {connection.detail && <span style={{ fontWeight: 500, color: C.muted }}>{connection.detail}</span>}
      </div>
    );
  }
  if (saveStatus) {
    const k = KIND[saveStatus.kind] || KIND.failed;
    const color = k.color();
    items.push(
      <div key="save" role={saveStatus.kind === 'failed' ? 'alert' : 'status'}
        style={{ background: color + '15', border: `1px solid ${color}55`, borderRadius: 10, padding: '8px 12px', color, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span>{k.icon} {saveStatus.message}</span>
        {saveStatus.kind !== 'saving' && (
          <button type="button" aria-label={t('common.close', lang)} onClick={dismissStatus}
            style={{ background: 'transparent', border: 'none', color, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
        )}
      </div>
    );
  }
  if (coreStatus && coreStatus.state === 'error') {
    items.push(
      <div key="core" role="alert" style={{ background: C.gold + '15', border: `1px solid ${C.gold}55`, borderRadius: 10, padding: '8px 12px', color: C.gold, fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>⚠ {t('status.coreErr', lang)} {coreStatus.error ? '(' + coreStatus.error + ')' : ''}</span>
        <button type="button" onClick={refreshAll} style={{ background: C.gold + '22', border: 'none', borderRadius: 7, color: C.gold, fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>{t('status.retry', lang)}</button>
      </div>
    );
  } else if (coreStatus && coreStatus.state === 'offline') {
    items.push(<div key="off" role="status" style={{ color: C.muted, fontSize: 11 }}>📴 {t('status.offline', lang)}</div>);
  } else if (coreStatus && coreStatus.state === 'loading') {
    items.push(<div key="load" role="status" style={{ color: C.muted, fontSize: 11 }}>⏳ {t('status.loading', lang)}</div>);
  }
  const last = hhmm(sync && sync.lastSyncAt);
  const pending = sync && sync.pending ? sync.pending : 0;
  items.push(
    <div key="sync" style={{ color: C.muted, fontSize: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <span>{pending ? `🔄 ${pending} ${t('status.syncPending', lang)}` : '✓ ' + t('status.none', lang)}</span>
      {last && <span>{t('status.last', lang)}: {last}</span>}
    </div>
  );
  return <div style={{ margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>{items}</div>;
}
