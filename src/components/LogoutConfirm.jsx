// Logout used to fire on a single tap of the ⏻ icon (right next to search), with no question asked --
// even with unsynced changes pending. This asks first and says plainly what happens to pending changes.
import React from 'react';
import { Confirm } from './common.jsx';
import { dirtyKeys } from '../modules/sync/index.js';
import { t, useLang } from '../modules/i18n/index.js';

export const logoutMessage = (pending, lang) =>
  pending > 0 ? t('g14.logout.pending', lang, { n: pending }) : t('g14.logout.confirm', lang);

export default function LogoutConfirm({ onOk, onNo }) {
  const lang = useLang();
  let pending = 0;
  try { pending = dirtyKeys().length; } catch { /* storage unavailable: treat as nothing pending */ }
  return <Confirm msg={logoutMessage(pending, lang)} onOk={onOk} onNo={onNo} />;
}
