import React from 'react';
import { Btn } from '../../components/common.jsx';
import { C } from '../../modules/theme/index.js';
import { Tag, inp } from '../../modules/ui/atoms.jsx';
import { IMAGING_ORDER_STATUSES } from '../../modules/constants/index.js';
import { getRadiologyHTML, printDoc } from '../../modules/print/index.js';
import { GAP_LABEL, BASIS_LABEL } from '../../modules/patient-file/investigation-links.js';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

const GROUP_LABEL = { pending: ['ds-badge--warn', 'status.pending'], done: ['ds-badge--ok', 'status.done'], cancelled: ['ds-badge--mute', 'status.cancelled'], other: ['ds-badge--info', 'status.other'] };

const IO_KEYS = { requested: 'g1.io.requested', scheduled: 'g1.io.scheduled', in_progress: 'g1.io.inProgress', completed: 'g1.io.completed', reported: 'g1.io.reported', cancelled: 'g1.io.cancelled' };

// Why / when / which visit / who ordered / where the images and the report are.
// Anything that cannot be established from stable identifiers is listed as a gap, never guessed.
function ChainDetails({ chain }) {
  const lang = useLang();
  if (!chain) return null;
  const g = GROUP_LABEL[chain.statusGroup] || GROUP_LABEL.other;
  const row = (k, v) => (
    <div style={{ display: 'flex', gap: 6, fontSize: 11 }}><span style={{ color: C.muted, minWidth: 74 }}>{k}</span><span style={{ color: C.text, overflowWrap: 'anywhere' }}>{v || <span style={{ color: C.muted }}>{t('common.notRecorded', lang)}</span>}</span></div>
  );
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div><span className={'ds-badge ' + g[0]}>{t(g[1], lang)}</span>{chain.pendingDays != null && chain.pendingDays > 0 && <span className="ds-sub"> · {t('g1.req.sinceDays', lang, { n: chain.pendingDays })}</span>}</div>
      {row(t('g1.req.why', lang), tv(chain.why))}
      {row(t('g1.req.orderedBy', lang), chain.orderedBy)}
      {row(t('g1.evt.visit', lang), chain.visit ? [chain.visit.date, tv(chain.visit.type)].filter(Boolean).join(' · ') : (chain.visitRef ? t('g1.req.linkedVisit', lang, { ref: chain.visitRef }) : ''))}
      {row(t('g1.req.performedDate', lang), chain.performedDate)}
      {row(t('g1.req.images', lang), chain.images.length ? t('g1.req.imagesTab', lang, { n: chain.images.length }) : '')}
      {row(t('g1.req.report', lang), chain.report ? chain.report.text : '')}
      {chain.result && row(t('g1.req.result', lang), chain.result)}
      {chain.images.length > 0 && <div className="ds-sub">{t('g1.req.imageLinkBasis', lang)}: {[...new Set(chain.images.flatMap(i => i._linkBasis || []))].map(b => BASIS_LABEL[b] || b).join(lang === 'en' ? ', ' : '، ')}</div>}
      {chain.gaps.length > 0 && <div className="ds-sub" style={{ color: C.gold }}>{chain.gaps.map(x => GAP_LABEL[x] || x).join(' · ')}</div>}
    </div>
  );
}

// Patient file — "requests" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function RequestsTab({ ctx }) {
  const { allRequestTests, clinic, curPatient, cycleRequestEye, imagingOrders, primaryDoctor, requestEye, requestNotes, requestResult, requestSaving, requestTests, requests, resyncRequest, savePatientRadiologyRequest, setRequestEye, setRequestNotes, toggleRequestTest, investigationLinks } = ctx;
  const lang = useLang();
  const chainOf = id => (investigationLinks ? investigationLinks.chains.find(c => String(c.requestId) === String(id)) : null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>🧪 {t('g1.req.orderTitle', lang)}</div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{t('g1.req.createHint', lang)}</div>
        </div>
        {requests.length > 0 && (
          <span
            style={{
              background: C.gold + "22",
              color: C.gold,
              borderRadius: 8,
              padding: "4px 9px",
              fontSize: 10,
              fontWeight: 700
            }}
          >
            {requests.length}
            {" " + t("g1.req.unitRequest", lang)}
          </span>
        )}
      </div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 14 }}
      >
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: C.muted, fontSize: 11 }}>{t("g1.req.defaultEye", lang)}</span>
          {[["OU", t("g1.img.both", lang)], ["OD", t("g1.img.right", lang)], ["OS", t("g1.img.left", lang)]].map(([v, l]) => (
            <button
              type="button"
              key={v}
              aria-pressed={requestEye === v}
              title={l}
              aria-label={v + " — " + l}
              onClick={() => setRequestEye(v)}
              style={{
                background: requestEye === v ? C.accent + "22" : "transparent",
                border: `1px solid ${requestEye === v ? C.accent : C.border}`,
                borderRadius: 8,
                padding: "5px 9px",
                color: requestEye === v ? C.accent : C.muted,
                fontSize: 10,
                fontWeight: 700
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {allRequestTests.map(tt => {
            const on = !!requestTests[tt.id];
            const eye = requestTests[tt.id] || requestEye;
            return (
              <div
                key={tt.id}
                role="checkbox"
                aria-checked={on}
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRequestTest(tt.id); } }}
                onClick={() => toggleRequestTest(tt.id)}
                style={{
                  background: on ? C.accent + "12" : C.bg,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  borderRadius: 10,
                  padding: "9px 10px",
                  cursor: "pointer",
                  position: "relative"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `2px solid ${on ? C.accent : C.border}`,
                      background: on ? C.accent : "transparent",
                      color: C.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 900
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 11 }}>{tt.name}</span>
                </div>
                {lang !== 'en' && <div style={{ color: C.muted, fontSize: 9, marginTop: 3, paddingInlineStart: 25 }}>{tt.name_ar}</div>}
                {on && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      cycleRequestEye(tt.id);
                    }}
                    style={{
                      position: "absolute",
                      insetInlineEnd: 7,
                      bottom: 7,
                      background: C.teal + "22",
                      border: `1px solid ${C.teal}44`,
                      borderRadius: 6,
                      color: C.teal,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 6px"
                    }}
                  >
                    {eye}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <textarea
          value={requestNotes}
          onChange={e => setRequestNotes(e.target.value)}
          rows={3}
          placeholder={t("g1.req.notesPh", lang)}
          style={{ ...inp(), resize: "none", marginTop: 12, fontSize: 11 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn full onClick={requestSaving ? () => {} : savePatientRadiologyRequest}>{requestSaving ? "⏳ " + t("g1.req.saving", lang) : "🧪 " + t("g1.req.saveOrder", lang)}</Btn>
          <Btn
            outline
            onClick={() => {
              const html = getRadiologyHTML(requestTests, curPatient, requestNotes, primaryDoctor, allRequestTests, clinic);
              if (Object.keys(requestTests).length) printDoc(html);else alert(t("g1.req.pickFirst", lang));
            }}
          >
            🖨️ {t("common.print", lang)}
          </Btn>
        </div>
        {requestResult && (() => {
          const ok = requestResult.status === "saved";
          const bad = requestResult.status === "failed";
          const color = ok ? C.success : bad ? C.danger : C.gold;
          return (
            <div
              role={bad ? "alert" : "status"}
              style={{
                marginTop: 9,
                background: color + "11",
                border: `1px solid ${color}33`,
                borderRadius: 9,
                padding: 8,
                color,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              {ok ? "✓ " : bad ? "✕ " : "⚠ "}{requestResult.message}
            </div>
          );
        })()}
      </div>
      {requests.length > 0 && (
        <div>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{t("g1.req.previous", lang)}</div>
          {requests.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map(r => (
            <div
              key={r.id}
              data-rec={String(r.id)}
              style={{ background: C.card, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: 11, marginBottom: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: C.gold, fontWeight: 800, fontSize: 12 }}>🧪 {t('g1.req.orderTitle', lang)}</div>
                <span style={{ color: C.muted, fontSize: 10 }}>{r.date}{" · "}{r.time || ""}</span>
              </div>
              <div style={{ color: C.text, fontSize: 11, lineHeight: 1.8, marginTop: 6 }}>
                {(r.requestedTests || []).map(tt => (
                  <span
                    key={tt.id}
                    style={{
                      display: "inline-block",
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 7,
                      padding: "3px 7px",
                      margin: "2px 3px"
                    }}
                  >
                    {tt.name}
                    {" · "}
                    {tt.eye || "OU"}
                  </span>
                ))}
              </div>
              <ChainDetails chain={chainOf(r.id)} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                {r.coreSyncError ? (
                  <span style={{ color: C.gold, fontSize: 10 }}>
                    {"⚠ " + t("g1.req.localNotSynced", lang) + " "}
                    <button type="button" onClick={() => resyncRequest(r)} style={{ background: C.gold + "22", border: "none", borderRadius: 6, color: C.gold, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>{t("g1.req.resync", lang)}</button>
                  </span>
                ) : (
                  <span style={{ color: C.teal, fontSize: 10 }}>
                    {r._sources && r._sources.includes("core") ? "✓ " + t("g1.req.inCore", lang) : "✓ " + t("g1.req.inFile", lang)}
                  </span>
                )}
                <button
                  onClick={() => printDoc(getRadiologyHTML(Object.fromEntries((r.requestedTests || []).map(tt => [tt.id, tt.eye || "OU"])), curPatient, r.notes, primaryDoctor, allRequestTests, clinic))}
                  style={{
                    background: C.accent + "22",
                    border: "none",
                    borderRadius: 7,
                    padding: "5px 9px",
                    color: C.accent,
                    fontSize: 10,
                    fontWeight: 700
                  }}
                >
                  🖨️ {t("g1.req.reprint", lang)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {requests.length === 0 && (
        <div style={{ color: C.muted, textAlign: "center", padding: 20, fontSize: 11 }}>
          {t("g1.req.noPrevious", lang)}
        </div>
      )}
      {imagingOrders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{t("g1.req.execStatus", lang)}</div>
          {imagingOrders.slice().sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time))).map(o => (
            <div
              key={o.id}
              style={{
                background: C.card,
                border: `1px solid ${o.status === "reported" ? C.success : C.border}`,
                borderRadius: 12,
                padding: 11,
                marginBottom: 8
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 11 }}>{"🩻 "}{o.id}</div>
                <Tag
                  label={IO_KEYS[o.status] ? t(IO_KEYS[o.status], lang) : (IMAGING_ORDER_STATUSES[o.status] || o.status)}
                  color={o.status === "reported" ? C.success : o.status === "completed" ? C.teal : o.status === "cancelled" ? C.danger : C.gold}
                />
              </div>
              <div style={{ color: C.text, fontSize: 10, lineHeight: 1.7, marginTop: 5 }}>
                {(o.tests || []).map(tt => (
                  <span
                    key={tt.id}
                    style={{
                      display: "inline-block",
                      margin: "2px 3px",
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: "2px 6px"
                    }}
                  >
                    {tt.name}
                    {" · "}
                    {tt.eye || "OU"}
                  </span>
                ))}
              </div>
              <div style={{ color: C.muted, fontSize: 9, marginTop: 4 }}>{o.date}{" · "}{tv(o.doctor) || ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
