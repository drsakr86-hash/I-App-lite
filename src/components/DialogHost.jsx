// Renders the dialogs requested through src/modules/ui/dialogs.js (askConfirm / notify), one at a time, on top of
// everything else (it is the last element in the root and shares the modal z-index).
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Btn } from './common.jsx';
import { C } from '../modules/theme/index.js';
import { t, useLang } from '../modules/i18n/index.js';
import { setDialogHost } from '../modules/ui/dialogs.js';

export default function DialogHost() {
  const lang = useLang();
  const [queue, setQueue] = useState([]);
  const seq = useRef(0);
  const live = useRef(new Map()); // id -> resolve, so unmount can settle everything still open

  useEffect(() => {
    const add = kind => msg => new Promise(resolve => {
      const id = ++seq.current;
      live.current.set(id, resolve);
      setQueue(q => [...q, { id, kind, msg }]);
    });
    const off = setDialogHost({ confirm: add('confirm'), alert: add('alert') });
    const pending = live.current;
    return () => {
      off();
      pending.forEach(resolve => resolve(false)); // never leave a caller waiting forever
      pending.clear();
    };
  }, []);

  const cur = queue[0];
  if (!cur) return null;
  const done = value => {
    const resolve = live.current.get(cur.id);
    live.current.delete(cur.id);
    setQueue(q => q.filter(x => x.id !== cur.id));
    if (resolve) resolve(value);
  };
  const text = <p style={{ color: C.text, fontSize: 14, lineHeight: 1.7, marginBottom: 20, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{cur.msg}</p>;
  if (cur.kind === 'alert') {
    return (
      <Modal key={cur.id} title={t('g14.dialog.notice', lang)} onClose={() => done(undefined)}>
        {text}
        <Btn full onClick={() => done(undefined)}>{t('g14.dialog.ok', lang)}</Btn>
      </Modal>
    );
  }
  return (
    <Modal key={cur.id} title={t('g3.common.confirm', lang)} onClose={() => done(false)}>
      {text}
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn outline full onClick={() => done(false)}>{t('g3.common.cancel', lang)}</Btn>
        <Btn danger full onClick={() => done(true)}>{t('g3.common.confirm', lang)}</Btn>
      </div>
    </Modal>
  );
}
