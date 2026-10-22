// BottomNav -- the main tabs live in the bar itself; everything else
// (investigation orders, imaging centre, settings, language, theme) is
// reached from the "More" sheet so the bar and the top bar stay uncluttered.
import React from 'react';
import { C } from '../modules/theme/index.js';
import { XRAY_ICON } from '../modules/ui/atoms.jsx';
import ClinicChatIcon from './ClinicChatIcon.jsx';
import { primaryNavItems, moreNavItems, isMoreActive, MORE_ID } from './bottomnav-model.js';
import { ThemeToggle, LangToggle } from './common.jsx';
import { t, useLang } from '../modules/i18n/index.js';

const NAV_HEIGHT = 64;

function NavIcon({ item, on }) {
  if (item.icon === 'clinicchat') return <ClinicChatIcon size={24} color={on ? C.accent : C.muted} />;
  return item.icon === 'xray' ? (
    <img
      src={XRAY_ICON}
      alt=""
      style={{
        width: 24, height: 24, display: 'block',
        filter: on ? `drop-shadow(0 0 6px ${C.accent}) brightness(1.3)` : 'brightness(0.75)'
      }}
    />
  ) : item.icon;
}

function NavButton({ icon, label, on, onClick, ariaExpanded }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={ariaExpanded}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 10px'
      }}
    >
      <div style={{
        fontSize: 20,
        filter: on ? `drop-shadow(0 0 6px ${C.accent})` : 'none',
        transform: on ? 'scale(1.2)' : 'scale(1)',
        transition: 'all 0.2s'
      }}>{icon}</div>
      <span style={{ fontSize: 9, fontWeight: 600, color: on ? C.accent : C.muted }}>{label}</span>
    </button>
  );
}

function SheetTile({ icon, label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? `${C.accent}22` : C.card,
        border: `1px solid ${on ? C.accent : C.border}`,
        borderRadius: 14, padding: '14px 8px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        color: on ? C.accent : C.text, fontSize: 12, fontWeight: 600, minHeight: 84
      }}
    >
      <span style={{ fontSize: 24, display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SheetRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 14px'
    }}>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

export default function BottomNav({ active, setActive, role }) {
  const lang = useLang();
  const [open, setOpen] = React.useState(false);
  const items = primaryNavItems(role);
  const moreItems = moreNavItems(role);
  const moreOn = isMoreActive(active, role);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = id => { setActive(id); setOpen(false); };

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', top: 0, insetInlineStart: 0, insetInlineEnd: 0, bottom: NAV_HEIGHT,
            background: 'rgba(0,0,0,0.5)', zIndex: 190, display: 'flex', alignItems: 'flex-end'
          }}
        >
          <div
            role="dialog"
            aria-label={t('g3.nav.more', lang)}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: C.surface, borderTop: `1px solid ${C.border}`,
              borderRadius: '18px 18px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              maxHeight: '75vh', overflowY: 'auto'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {moreItems.map(item => (
                <SheetTile
                  key={item.id}
                  icon={<NavIcon item={item} on={active === item.id} />}
                  label={t(item.labelKey, lang)}
                  on={active === item.id}
                  onClick={() => go(item.id)}
                />
              ))}
              <SheetTile
                icon="⚙️"
                label={t('g3.topbar.settings', lang)}
                on={active === 'settings'}
                onClick={() => go('settings')}
              />
            </div>
            <SheetRow label={t('g3.nav.language', lang)}><LangToggle /></SheetRow>
            <SheetRow label={t('g3.nav.appearance', lang)}><ThemeToggle /></SheetRow>
          </div>
        </div>
      )}
      <div style={{
        position: 'fixed', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: NAV_HEIGHT, zIndex: 200
      }}>
        {items.map(item => (
          <NavButton
            key={item.id}
            icon={<NavIcon item={item} on={active === item.id} />}
            label={t(item.labelKey, lang)}
            on={active === item.id}
            onClick={() => go(item.id)}
          />
        ))}
        <NavButton
          key={MORE_ID}
          icon="☰"
          label={t('g3.nav.more', lang)}
          on={moreOn || open}
          ariaExpanded={open}
          onClick={() => setOpen(o => !o)}
        />
      </div>
    </>
  );
}
