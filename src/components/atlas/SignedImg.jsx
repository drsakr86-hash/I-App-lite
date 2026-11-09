// A private image: the signed link is made on demand and renewed once if the browser fails to load it.
import React, { useEffect, useState } from 'react';
import { C } from '../../modules/theme/index.js';
import { t } from '../../modules/i18n/index.js';

export default function SignedImg({ cache, path, alt, lang, style }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(''); setFailed(false); setTried(false);
    if (path) cache.get(path).then(u => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [cache, path]);
  const onError = () => {
    if (tried) { setFailed(true); return; }
    setTried(true);
    cache.get(path, { force: true }).then(setUrl).catch(() => setFailed(true));
  };
  if (failed) return <span style={{ fontSize: 11, color: C.danger }}>{t('atlas.attach.imgFail', lang)}</span>;
  return url ? <img src={url} alt={alt} onError={onError} style={style} /> : <span style={{ fontSize: 11, color: C.muted }}>…</span>;
}
