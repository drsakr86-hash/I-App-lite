import React, { useState } from 'react';
import {
  DEFAULT_TESTS, EYE_SHORT, buildAllTests, buildCats, isSelected, getEye,
  toggleSelection, cycleEyeValue, selectAllInCategory, addCustomTest, removeCustomTest,
  filterVisibleTests, filterPatientResults, buildRequestedTests, buildExamRecord
} from '../modules/radiology/model.js';
import { Btn } from '../components/common.jsx';
import { t, useLang, dirOf } from '../modules/i18n/index.js';
import { tv } from '../modules/i18n/tv.js';
import { C } from '../modules/theme/index.js';
import { Field, inp } from '../modules/ui/atoms.jsx';
import { sbGet } from '../modules/sync/wiring.js';
import { localISO } from '../modules/constants/misc.js';
import { getRadiologyHTML, printDoc } from '../modules/print/index.js';

export default function Radiology({ patients, customTests, setCustomTests, setExams, primary, clinic }) {
  const lang = useLang();
  const CAT_COLORS = {
    'شبكية': C.accent,
    'جلوكوما': C.teal,
    'قرنية': C.gold,
    'جراحة': C.purple,
    'أخرى': C.muted,
    'مخصص': C.success
  };
  const EYE_COLOR = { OU: C.teal, OD: C.accent, OS: C.gold };

  const allTests = buildAllTests(customTests);
  const cats = buildCats(allTests);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientList, setShowPatientList] = useState(false);
  const [selected, setSelected] = useState({});
  const [notes, setNotes] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newTest, setNewTest] = useState({ name: '', name_ar: '' });
  const [printed, setPrinted] = useState(false);
  const [filterCat, setFilterCat] = useState('الكل');
  const [search, setSearch] = useState('');
  const selectedIds = Object.keys(selected);

  const toggle = id => setSelected(s => toggleSelection(s, id));
  const cycleEye = (e, id) => { e.stopPropagation(); setSelected(s => cycleEyeValue(s, id)); };
  const selectAll = cat => setSelected(s => selectAllInCategory(s, allTests, cat));
  const addCustom = () => {
    const result = addCustomTest(customTests, newTest);
    if (!result) return;
    setCustomTests(result.customTests);
    setSelected(s => ({ ...s, [result.test.id]: 'OU' }));
    setNewTest({ name: '', name_ar: '' });
    setAddModal(false);
  };
  const delCustom = id => {
    const result = removeCustomTest(customTests, selected, id);
    setCustomTests(result.customTests);
    setSelected(result.selected);
  };

  const saveRequest = async () => {
    if (selectedIds.length === 0) {
      alert(t('g6.rad.pickOne', lang));
      return;
    }
    if (!selectedPatient) {
      alert(t('g6.rad.pickPatient', lang));
      return;
    }
    const tests = buildRequestedTests(allTests, selected);
    const remote = await sbGet('iapp_exams');
    const base = Array.isArray(remote) ? remote : [];
    const rec = buildExamRecord({
      selectedPatient,
      tests,
      doctorName: primary && primary.name || '',
      notes,
      now: Date.now(),
      timeStr: { date: localISO(), time: new Date().toTimeString().slice(0, 5) }
    });
    await setExams([...base, rec]);
    setPrinted(true);
    setTimeout(() => setPrinted(false), 3000);
  };

  const doPrint = () => {
    if (selectedIds.length === 0) return;
    const html = getRadiologyHTML(selected, selectedPatient, notes, primary, allTests, clinic);
    printDoc(html);
  };

  const visibleTests = filterVisibleTests(allTests, { filterCat, search });
  const patientResults = filterPatientResults(patients, patientSearch);

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{t('g6.rad.title', lang)}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('g6.rad.selectedCount', lang, { n: selectedIds.length })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small color={C.purple} onClick={() => setAddModal(true)}>{t('g6.rad.add', lang)}</Btn>
          <Btn small color={C.accent} onClick={saveRequest}>{t('g6.rad.saveRequest', lang)}</Btn>
          <Btn small color={C.success} onClick={doPrint}>{t('g6.rad.print', lang)}</Btn>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14, position: 'relative' }}>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{t('g6.rad.patientOptional', lang)}</div>
        {selectedPatient ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: C.accent + '22', border: `1px solid ${C.accent}`, borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{selectedPatient.name}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>{selectedPatient.patientCode} · {selectedPatient.phone}</div>
            </div>
            <div onClick={() => { setSelectedPatient(null); setPatientSearch(''); }} style={{ color: C.danger, fontSize: 20, cursor: 'pointer', padding: '0 6px' }}>×</div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={patientSearch}
              onChange={e => { setPatientSearch(e.target.value); setShowPatientList(true); }}
              onFocus={() => setShowPatientList(true)}
              onBlur={() => setTimeout(() => setShowPatientList(false), 200)}
              placeholder={t('g6.rad.searchPatientPh', lang)}
              style={{ ...inp(), paddingInlineEnd: 36 }}
            />
            <span style={{ position: 'absolute', insetInlineEnd: 10, top: '50%', transform: 'translateY(-50%)', color: C.accent, fontSize: 14 }}>🔍</span>
            {showPatientList && (
              <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, zIndex: 200, maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                {patientResults.map(p => (
                  <div
                    key={p.id}
                    onMouseDown={() => { setSelectedPatient(p); setPatientSearch(''); setShowPatientList(false); }}
                    style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}33`, cursor: 'pointer' }}
                  >
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{p.patientCode} · {p.phone}</div>
                  </div>
                ))}
                {patientResults.length === 0 && (
                  <div style={{ color: C.muted, fontSize: 12, padding: '10px 14px', textAlign: 'center' }}>{t('g6.rad.noResults', lang)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['OU', C.teal], ['OD', C.accent], ['OS', C.gold]].map(([k, col]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, background: col + '15', border: `1px solid ${col}44`, borderRadius: 8, padding: '4px 10px' }}>
            <div style={{ width: 22, height: 18, borderRadius: 5, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{k}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: C.accent }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('g6.rad.searchTestPh', lang)}
          style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, flex: 1, direction: dirOf(lang), fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {['الكل', ...cats].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            style={{
              background: filterCat === cat ? `linear-gradient(135deg,${CAT_COLORS[cat] || C.accent},${C.teal})` : C.card,
              border: `1px solid ${filterCat === cat ? 'transparent' : C.border}`,
              borderRadius: 20,
              padding: '5px 14px',
              color: filterCat === cat ? C.bg : C.muted,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit'
            }}
          >{cat === 'الكل' ? t('g6.rad.all', lang) : tv(cat)}</button>
        ))}
      </div>

      {(filterCat === 'الكل' ? cats : [filterCat]).map(cat => {
        const testsInCat = visibleTests.filter(t => t.cat === cat);
        if (testsInCat.length === 0) return null;
        const catColor = CAT_COLORS[cat] || C.accent;
        const allCatSel = testsInCat.every(t => isSelected(selected, t.id));
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: catColor }} />
                <span style={{ color: catColor, fontWeight: 700, fontSize: 13 }}>{tv(cat)}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>({testsInCat.filter(t => isSelected(selected, t.id)).length}/{testsInCat.length})</span>
              </div>
              <div
                onClick={() => selectAll(cat)}
                style={{ color: catColor, fontSize: 11, cursor: 'pointer', background: catColor + '22', borderRadius: 8, padding: '3px 10px', fontWeight: 600 }}
              >{allCatSel ? t('g6.rad.deselectAll', lang) : t('g6.rad.selectAll', lang)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {testsInCat.map(t => {
                const sel = isSelected(selected, t.id);
                const eye = getEye(selected, t.id);
                return (
                  <div
                    key={t.id}
                    style={{
                      background: sel ? catColor + '15' : C.card,
                      border: `2px solid ${sel ? catColor : C.border}`,
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.15s'
                    }}
                  >
                    <div
                      onClick={() => toggle(t.id)}
                      style={{
                        width: 26, height: 26, borderRadius: 8,
                        background: sel ? catColor : 'transparent',
                        border: `2px solid ${sel ? catColor : C.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      {sel && <span style={{ color: C.bg, fontSize: 14, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggle(t.id)}>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }} dir="auto">{lang === 'ar' ? t.name_ar : tv(t.name_ar)}</div>
                    </div>
                    {sel && (
                      <div
                        onClick={e => cycleEye(e, t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: EYE_COLOR[eye] + '22', border: `1.5px solid ${EYE_COLOR[eye]}`, borderRadius: 10, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <div style={{ background: EYE_COLOR[eye], color: '#fff', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>{EYE_SHORT[eye] || eye}</div>
                        <span style={{ color: EYE_COLOR[eye], fontSize: 10, opacity: 0.7 }}>↻</span>
                      </div>
                    )}
                    {t.cat === 'مخصص' && (
                      <div
                        onClick={e => { e.stopPropagation(); delCustom(t.id); }}
                        style={{ color: C.danger, fontSize: 18, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}
                      >×</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 4 }}>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{t('g6.rad.orderNotes', lang)}</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder={t('g6.rad.notesPh', lang)}
          style={{ ...inp(), resize: 'none' }}
        />
      </div>

      {selectedIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 70, insetInlineStart: 0, insetInlineEnd: 0, maxWidth: 480, margin: '0 auto',
          background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 16px', zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{t('g6.rad.selectedCount', lang, { n: selectedIds.length })}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
              {selectedIds.map(id => {
                const t = allTests.find(t => t.id === id);
                return t ? `${t.name}·${selected[id] || 'OU'}` : '';
              }).filter(Boolean).join('  ')}
            </div>
          </div>
          <Btn small onClick={() => setSelected({})}>{t('g6.rad.clear', lang)}</Btn>
        </div>
      )}

      {printed && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: C.success, color: C.bg, borderRadius: 12, padding: '10px 20px',
          fontWeight: 700, fontSize: 13, zIndex: 500
        }}>{t('g6.rad.printOpened', lang)}</div>
      )}

      {addModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setAddModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: C.surface, borderRadius: '20px 20px 0 0', padding: '20px 16px 40px', width: '100%', maxWidth: 480, border: `1px solid ${C.border}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{t('g6.rad.addCustomTitle', lang)}</span>
              <span onClick={() => setAddModal(false)} style={{ color: C.muted, fontSize: 26, cursor: 'pointer' }}>×</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label={t('g6.rad.testNameLabel', lang)}>
                <input
                  style={inp()}
                  value={newTest.name}
                  onChange={e => setNewTest(v => ({ ...v, name: e.target.value }))}
                  placeholder={t('g6.rad.testNamePh', lang)}
                />
              </Field>
              <Field label={t('g6.rad.nameArLabel', lang)}>
                <input
                  style={inp()}
                  value={newTest.name_ar}
                  onChange={e => setNewTest(v => ({ ...v, name_ar: e.target.value }))}
                  placeholder={t('g6.rad.nameArPh', lang)}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Btn outline full onClick={() => setAddModal(false)}>{t('g6.common.cancel', lang)}</Btn>
                <Btn full onClick={addCustom}>{t('g6.rad.addAndSelect', lang)}</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
