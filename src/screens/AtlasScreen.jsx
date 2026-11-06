// Anatomy atlas screen (feature flag `atlas`, docs/ATLAS.md). Phase 1: static, original, bilingual plates with
// selectable structures, zoom/pan, labels and local drawn annotations. Nothing here reads or writes patient data or the database.
import React, { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { C } from '../modules/theme/index.js';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { listPlates, getPlate, firstPlateId, partName, pick, searchParts, plateVBox, plateAttribution, isApproved, normalizeText } from '../modules/atlas/model.js';
import { zoomCentered, ZOOM_STEP } from '../modules/atlas/viewport.js';
import { ANNOTATION_COLORS, loadAnnotations, saveAnnotations, add, undo, note } from '../modules/atlas/annotations.js';
import AtlasViewer from '../components/atlas/AtlasViewer.jsx';
import { privateStorageEnabled } from '../services/private-storage.js';
import { canApproveDrawing } from '../modules/atlas/drawings.js';
// loaded only when the private-storage flag is on and the role may approve (keeps the sync layer out of the plain atlas)
const AttachDrawing = lazy(() => import('../components/atlas/AttachDrawing.jsx'));

const btn = (on, extra = {}) => ({
  background: on ? `${C.accent}22` : C.card, border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.accent : C.text,
  borderRadius: 10, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, ...extra
});

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// The exported file shows the whole plate (not the current zoom), without selection highlights, with its attribution line.
function serializePlate(svg, plate, lang) {
  const clone = svg.cloneNode(true);
  const b = plateVBox(plate);
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  clone.setAttribute('width', String(b.w * 2)); clone.setAttribute('height', String(b.h * 2));
  clone.removeAttribute('style'); clone.removeAttribute('role');
  clone.querySelectorAll('[data-ui="1"]').forEach(n => n.remove());
  const foot = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  foot.setAttribute('x', String(b.x + 8)); foot.setAttribute('y', String(b.y + b.h - 8));
  foot.setAttribute('font-size', '9'); foot.setAttribute('fill', '#6b7280'); foot.setAttribute('direction', 'ltr');
  foot.textContent = `${pick(plate.title, lang)} — ${plateAttribution(plate)}${isApproved(plate) ? '' : ' — draft'}`;
  clone.appendChild(foot);
  return { text: new XMLSerializer().serializeToString(clone), w: b.w * 2, h: b.h * 2 };
}

export default function AtlasScreen({ role = null, user = null, context = null, drawings = [], onDrawingsChange = null, embedded = false } = {}) {
  const lang = useLang();
  const [plateId, setPlateId] = useState(firstPlateId());
  const plate = getPlate(plateId);
  const base = plateVBox(plate);
  const [viewState, setViewState] = useState({ id: plateId, view: base });
  const view = viewState.id === plateId ? viewState.view : base;
  const setView = useCallback(v => setViewState(prev => ({ id: plateId, view: typeof v === 'function' ? v(prev.id === plateId ? prev.view : plateVBox(getPlate(plateId))) : v })), [plateId]);
  const [selectedId, setSelectedId] = useState(null);
  const [labelMode, setLabelMode] = useState(null); // null = automatic (names on wide screens, numbers on phones)
  const [bothLangs, setBothLangs] = useState(false);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [annotations, setAnnotations] = useState([]);
  const [pendingText, setPendingText] = useState(null);
  const [textValue, setTextValue] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const svgRef = useRef(null);
  const plates = useMemo(() => listPlates(), []);

  // switching plate: reset the view and selection, load that plate's saved drawing
  useEffect(() => {
    setSelectedId(null); setPendingText(null); setMessage('');
    try { setAnnotations(loadAnnotations(localStorage, plateId)); } catch { setAnnotations([]); }
  }, [plateId]);

  const commit = useCallback(list => {
    setAnnotations(list);
    try { saveAnnotations(localStorage, plateId, list); } catch { /* storage unavailable: the drawing stays for this visit only */ }
  }, [plateId]);

  const results = useMemo(() => (normalizeText(query).length >= 2 ? searchParts(query).slice(0, 8) : []), [query]);
  const selected = selectedId ? plate.parts.find(p => p.id === selectedId) : null;
  const other = lang === 'ar' ? 'en' : 'ar';

  const openResult = r => { setPlateId(r.plateId); setQuery(''); setTimeout(() => setSelectedId(r.partId), 0); };
  const zoom = f => setView(v => zoomCentered(v, base, f));

  const submitText = e => {
    e.preventDefault();
    if (pendingText && textValue.trim()) commit(add(annotations, note(pendingText, textValue, color)));
    setPendingText(null); setTextValue('');
  };

  // The whole plate as a PNG (and a small copy for lists). Shared by "save PNG" and "approve & attach".
  const renderBlobs = async () => {
    const { text, w, h } = serializePlate(svgRef.current, plate, lang);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
    try { await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; }); } finally { URL.revokeObjectURL(url); }
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fbf9f4'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const png = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!png) throw new Error('empty');
    const tw = 320; const th = Math.max(1, Math.round(h * tw / w));
    const small = document.createElement('canvas'); small.width = tw; small.height = th;
    const sctx = small.getContext('2d'); sctx.fillStyle = '#fbf9f4'; sctx.fillRect(0, 0, tw, th); sctx.drawImage(canvas, 0, 0, tw, th);
    const thumb = await new Promise(r => small.toBlob(r, 'image/png'));
    return { png, thumb };
  };

  const exportAs = async kind => {
    setMessage('');
    try {
      if (kind === 'svg') { download(`${plate.id}.svg`, new Blob([serializePlate(svgRef.current, plate, lang).text], { type: 'image/svg+xml' })); return; }
      const { png } = await renderBlobs();
      download(`${plate.id}.png`, png);
    } catch { setMessage(t('atlas.export.failed', lang)); }
  };

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 };
  const modeNow = labelMode || 'auto';

  return (
    <div style={{ padding: embedded ? 0 : 12, paddingBottom: embedded ? 12 : 90, direction: dirOf(lang), color: C.text, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{t('atlas.title', lang)}</div>
        <div role="note" style={{ marginTop: 6, fontSize: 12, color: C.gold, background: `${C.gold}18`, border: `1px solid ${C.gold}55`, borderRadius: 10, padding: '6px 10px' }}>{t('atlas.draft', lang)}</div>
      </div>

      <div style={{ position: 'relative' }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)} placeholder={t('atlas.search', lang)} aria-label={t('atlas.search', lang)}
          style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '9px 12px', fontSize: 14 }}
        />
        {normalizeText(query).length >= 2 ? (
          <div style={{ ...card, position: 'absolute', zIndex: 5, insetInlineStart: 0, insetInlineEnd: 0, marginTop: 4, padding: 6, maxHeight: 260, overflowY: 'auto' }}>
            {results.length ? results.map(r => {
              const p = getPlate(r.plateId); const part = p.parts.find(x => x.id === r.partId);
              return (
                <button key={r.plateId + r.partId} onClick={() => openResult(r)} style={{ ...btn(false), display: 'block', width: '100%', textAlign: 'start', border: 'none', background: 'transparent' }}>
                  {partName(part, lang)} <span style={{ color: C.muted, fontWeight: 400 }}>· {pick(p.title, lang)}</span>
                </button>
              );
            }) : <div style={{ padding: 8, color: C.muted, fontSize: 13 }}>{t('atlas.search.none', lang)}</div>}
          </div>
        ) : null}
      </div>

      <div role="tablist" aria-label={t('atlas.plates', lang)} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {plates.map(p => (
          <button key={p.id} role="tab" aria-selected={p.id === plateId} onClick={() => setPlateId(p.id)} style={{ ...btn(p.id === plateId), whiteSpace: 'nowrap', flex: '0 0 auto' }}>
            {pick(p.title, lang)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <button style={btn(false)} onClick={() => zoom(ZOOM_STEP)} aria-label={t('atlas.zoom.in', lang)}>＋</button>
        <button style={btn(false)} onClick={() => zoom(1 / ZOOM_STEP)} aria-label={t('atlas.zoom.out', lang)}>－</button>
        <button style={btn(false)} onClick={() => setView(base)}>{t('atlas.zoom.reset', lang)}</button>
        <span style={{ width: 8 }} />
        {['select', 'pen', 'arrow', 'text'].map(k => (
          <button key={k} style={btn(tool === k)} aria-pressed={tool === k} onClick={() => { setTool(k); setPendingText(null); }}>{t(`atlas.tool.${k}`, lang)}</button>
        ))}
        <span role="group" aria-label={t('atlas.color', lang)} style={{ display: 'inline-flex', gap: 6, marginInline: 4 }}>
          {ANNOTATION_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} style={{ width: 26, height: 26, borderRadius: 13, background: c, border: `3px solid ${color === c ? C.accent : C.border}`, cursor: 'pointer', padding: 0 }} />
          ))}
        </span>
        <button style={btn(false)} disabled={!annotations.length} onClick={() => commit(undo(annotations))}>{t('atlas.undo', lang)}</button>
        <button style={btn(false)} disabled={!annotations.length} onClick={() => { if (window.confirm(t('atlas.clear.confirm', lang))) commit([]); }}>{t('atlas.clear', lang)}</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted }}>{t('atlas.labels', lang)}:</span>
        {['auto', 'names', 'numbers', 'off'].map(m => (
          <button key={m} style={btn(modeNow === m)} aria-pressed={modeNow === m} onClick={() => setLabelMode(m === 'auto' ? null : m)}>
            {m === 'auto' ? `${t('atlas.labels.names', lang)}/${t('atlas.labels.numbers', lang)}` : t(`atlas.labels.${m}`, lang)}
          </button>
        ))}
        <button style={btn(bothLangs)} aria-pressed={bothLangs} onClick={() => setBothLangs(b => !b)}>{t('atlas.labels.both', lang)}</button>
        <span style={{ flex: 1 }} />
        <button style={btn(false)} onClick={() => exportAs('png')}>{t('atlas.export.png', lang)}</button>
        <button style={btn(false)} onClick={() => exportAs('svg')}>{t('atlas.export.svg', lang)}</button>
      </div>

      {pendingText ? (
        <form onSubmit={submitText} style={{ ...card, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input autoFocus value={textValue} maxLength={80} onChange={e => setTextValue(e.target.value)} placeholder={t('atlas.text.placeholder', lang)} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14 }} />
          <button type="submit" style={btn(true)}>{t('atlas.text.add', lang)}</button>
          <button type="button" style={btn(false)} onClick={() => { setPendingText(null); setTextValue(''); }}>{t('atlas.text.cancel', lang)}</button>
        </form>
      ) : tool === 'text' ? <div style={{ fontSize: 12, color: C.muted }}>{t('atlas.text.hint', lang)}</div> : null}

      <AtlasViewer
        key={plate.id}
        plate={plate} lang={lang} selectedId={selectedId} onSelect={setSelectedId}
        labelMode={labelMode} bothLangs={bothLangs} tool={tool} color={color} annotations={annotations}
        onAnnotate={a => commit(add(annotations, a))} onTextPoint={p => { setPendingText(p); setTextValue(''); }}
        view={view} onViewChange={setView} svgRef={svgRef}
      />
      <div style={{ fontSize: 11, color: C.muted }}>{t('atlas.hint.gestures', lang)} {t('atlas.local', lang)}</div>
      {message ? <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{message}</div> : null}

      <div style={card} aria-live="polite">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{t('atlas.selected', lang)}</div>
        {selected ? (
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{partName(selected, lang)}</div>
            <div style={{ fontSize: 13, color: C.muted, direction: other === 'ar' ? 'rtl' : 'ltr' }}>{partName(selected, other)}</div>
            <p style={{ margin: '8px 0 4px', lineHeight: 1.7, fontSize: 14 }}>{pick(selected.desc, lang)}</p>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 12, color: C.muted, direction: other === 'ar' ? 'rtl' : 'ltr' }}>{pick(selected.desc, other)}</p>
          </div>
        ) : <div style={{ fontSize: 13, color: C.muted }}>{t('atlas.select.hint', lang)}</div>}
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{t('atlas.parts', lang)}</div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
          {plate.parts.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => setSelectedId(p.id)} aria-pressed={p.id === selectedId} style={{ ...btn(p.id === selectedId), width: '100%', textAlign: 'start', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: '#1f2937', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                <span>{partName(p, lang)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {onDrawingsChange && !privateStorageEnabled() ? <div role="note" style={{ fontSize: 12, color: C.gold }}>{t('atlas.exam.needPrivate', lang)}</div> : null}
      {onDrawingsChange && privateStorageEnabled() && canApproveDrawing(role) ? (
        <Suspense fallback={null}>
          <AttachDrawing lang={lang} plate={plate} annotations={annotations} renderBlobs={renderBlobs} user={user} role={role} patient={context && context.patient} exam={context && context.exam} drawings={drawings} onChange={onDrawingsChange} />
        </Suspense>
      ) : null}

      <div style={{ ...card, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
        <div><b>{t('atlas.source', lang)}:</b> {plateAttribution(plate)}</div>
        <div><b>{t('atlas.refs', lang)}:</b> {plate.references.join(' · ')}</div>
      </div>
    </div>
  );
}
