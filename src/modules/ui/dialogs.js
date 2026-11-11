// In-app replacements for window.confirm() / alert().
//
// The native dialogs look foreign inside the app (browser chrome, "localhost says…", no RTL styling), cannot be
// closed with the back button, and are blocked outright in some embedded webviews. Call sites keep their shape:
//
//   if (!await askConfirm(msg)) return;      // was: if (!window.confirm(msg)) return;
//   notify(msg);                              // was: alert(msg);          (await it when the next line must wait)
//
// <DialogHost/> (mounted once at the root) registers itself here and renders the dialogs. With no host mounted
// (unit tests, a screen rendered on its own) the native dialog is used, so behaviour never silently changes.

let host = null;

const nativeFn = name => {
  const w = typeof window !== 'undefined' ? window : null;
  if (w && typeof w[name] === 'function') return w[name].bind(w);
  if (typeof globalThis[name] === 'function') return globalThis[name];
  return null;
};

// h = { confirm(msg) -> Promise<boolean>, alert(msg) -> Promise<void> }. Returns an unregister function.
export function setDialogHost(h) {
  host = h;
  return () => { if (host === h) host = null; };
}

// Resolves true when the user confirms. Never rejects. No host and no native confirm -> false (do nothing).
export function askConfirm(msg) {
  if (host) return host.confirm(String(msg == null ? '' : msg));
  const fn = nativeFn('confirm');
  return Promise.resolve(fn ? !!fn(msg) : false);
}

// Resolves when the user dismisses the message. Never rejects.
export function notify(msg) {
  if (host) return host.alert(String(msg == null ? '' : msg));
  const fn = nativeFn('alert');
  if (fn) fn(msg); else console.warn('[notify]', msg);
  return Promise.resolve();
}
