// Pure/style logic for the shared UI atoms in src/modules/ui/atoms.jsx (no
// JSX, so this can be unit-tested directly with node --test — mirrors the
// existing src/components/common-model.js / common.jsx split). Every value
// mirrors the legacy runtime's SC / inp / Field / SecHead / Tag / XRAY_ICON
// exactly (public/legacy/app-runtime.js), reading the live shared theme
// object so a theme change is reflected immediately, same as the legacy
// originals.
import { C } from '../theme/index.js';

// Status label -> color, used to tint a patient's status text.
export const SC = {
  get 'مكتمل'() { return C.success; },
  get 'متابعة'() { return C.gold; },
  get 'طارئ'() { return C.danger; }
};

// Style object for a standard text input, with any extra styles merged in.
export const inp = (ex = {}) => ({
  width: '100%',
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  color: C.text,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  direction: 'rtl',
  fontFamily: 'inherit',
  ...ex
});

// Field's label style.
export const fieldLabelStyle = () => ({ color: C.muted, fontSize: 11, display: 'block', marginBottom: 5 });

// SecHead's label color: the given color, or the accent color by default.
export const secHeadLabelColor = color => color || C.accent;

// Tag's pill style (background is the given color at ~13% opacity).
export const tagStyle = color => ({ background: color + '22', color, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 600 });

// Data-URI icon for the imaging-center machine illustration.
export const XRAY_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0a1628"/><!-- Screen --><rect x="28" y="4" width="32" height="24" rx="3" fill="#1a2a40" stroke="#00C2FF" stroke-width="1.2"/><!-- Screen content colormap --><rect x="30" y="6" width="28" height="20" rx="2" fill="#0d1f35"/><ellipse cx="44" cy="13" rx="7" ry="5" fill="#00aaff" opacity="0.5"/><ellipse cx="44" cy="13" rx="4" ry="3" fill="#00ffcc" opacity="0.6"/><ellipse cx="44" cy="13" rx="2" ry="1.5" fill="#ffcc00" opacity="0.8"/><rect x="30" y="19" width="28" height="5" rx="1" fill="#050e1a"/><path d="M30 22 Q36 19 42 21 Q48 23 58 20" fill="none" stroke="#00C2FF" stroke-width="1" opacity="0.8"/><!-- Screen stand --><rect x="42" y="28" width="4" height="5" fill="#1a2a40"/><!-- Machine body --><rect x="4" y="30" width="26" height="28" rx="5" fill="#c8d4e0" stroke="#a0b0c0" stroke-width="1"/><!-- Machine top arch --><rect x="7" y="22" width="20" height="14" rx="4" fill="#b8c8d8" stroke="#90a0b0" stroke-width="1"/><!-- Lens/camera hole --><circle cx="17" cy="27" r="4" fill="#2a3a50"/><circle cx="17" cy="27" r="2.5" fill="#0a1628"/><circle cx="17" cy="27" r="1.2" fill="#00C2FF" opacity="0.8"/><!-- Handle --><rect x="24" y="24" width="5" height="10" rx="2.5" fill="#7a9ab8" stroke="#6080a0" stroke-width="0.8"/><!-- Blue accent strip --><rect x="4" y="38" width="5" height="14" rx="2" fill="#00C2FF" opacity="0.7"/><!-- Base --><rect x="2" y="55" width="30" height="5" rx="3" fill="#a0b0c0" stroke="#809090" stroke-width="0.8"/><!-- Colormap dots on screen --><circle cx="35" cy="10" r="1.5" fill="#ff4444" opacity="0.8"/><circle cx="39" cy="8" r="1.5" fill="#ff8800" opacity="0.8"/><circle cx="50" cy="9" r="1.5" fill="#00cc44" opacity="0.8"/><circle cx="54" cy="11" r="1.5" fill="#0088ff" opacity="0.8"/></svg>')}`;
