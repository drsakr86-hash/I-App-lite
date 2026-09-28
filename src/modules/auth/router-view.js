// Pure routing decision for UnifiedRouter (public/legacy/app-runtime.js).
// UnifiedRouter still owns every actual React.createElement call (it needs
// the real screen components, useNewScreen() flags, and side effects like
// setting CURRENT_USER) — this only replaces its inline if/else chain with a
// single tested decision, so which screen key a given state maps to is
// covered by unit tests instead of only by reading JSX.
export function routeViewFor({ ready, session, invalidRole }) {
  if (!ready) return 'loading';
  if (!session) return 'login';
  if (session.kind === 'patient') return 'patient';
  if (invalidRole) return 'blocked';
  if (session.mustChange && !session.email) return 'force-password-change';
  if (session.role === 'secretary' || session.role === 'employee') return 'secretary';
  return 'doctor';
}

// Phase 6, batch 2 (real routing, part A): maps a routeViewFor() result to a
// URL path so UnifiedRouter can keep the address bar (a HashRouter hash) in
// sync with the session-derived view. This is purely a URL reflection of
// state — it does not change which component renders for a given state, and
// an unknown/unexpected key safely falls back to '/login' rather than
// throwing or exposing a blank route.
const ROUTE_PATH = {
  loading: '/loading',
  login: '/login',
  patient: '/patient',
  blocked: '/blocked',
  'force-password-change': '/force-password-change',
  secretary: '/secretary',
  doctor: '/doctor'
};

export function pathForRouteView(routeView) {
  return ROUTE_PATH[routeView] || '/login';
}
