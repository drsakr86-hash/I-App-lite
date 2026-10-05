import React from 'react';
import { C } from '../../modules/theme/index.js';
import { Field, XRAY_ICON, inp } from '../../modules/ui/atoms.jsx';
import { t, useLang } from '../../modules/i18n/index.js';
import { tv } from '../../modules/i18n/tv.js';

// Patient file — "images" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function ImagesTab({ ctx }) {
  const { aiAnalysis, analyzeImage, delImage, handleImgUpload, imageEye, imageFilter, imageOrderId, imageType, images, imagingOrders, editImgNotesLocal, setImageOrderId, imgError, imgLoading, setAiAnalysis, setImageEye, setImageFilter, setImageType, setImgError, setViewImg, updateImgNotes, uploadProgress, investigationLinks } = ctx;
  const lang = useLang();
  const chainOfImage = img => (investigationLinks ? investigationLinks.chains.find(c => c.images.some(i => i.id === img.id)) : null);
  return (
    <div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label={t("g1.img.type", lang)}>
            <select style={inp()} value={imageType} onChange={e => setImageType(e.target.value)}>
              {["OCT", "OCTA", "Fundus Photography", "FFA", "Optos UWF", "Visual Field", "Pentacam", "B-Scan", "UBM", "Other"].map(x => (<option key={x}>{x}</option>))}
            </select>
          </Field>
          <Field label={t("g1.cmp.eye", lang)}>
            <select style={inp()} value={imageEye} onChange={e => setImageEye(e.target.value)}>
              <option value="OU">OU — {t("g1.img.both", lang)}</option>
              <option value="OD">OD — {t("g1.img.right", lang)}</option>
              <option value="OS">OS — {t("g1.img.left", lang)}</option>
            </select>
          </Field>
        </div>
        <Field label={t("g1.img.linkOrder", lang)}>
          <select style={inp()} value={imageOrderId} onChange={e => setImageOrderId(e.target.value)}>
            <option value="">{t("g1.img.noLink", lang)}</option>
            {(imagingOrders || []).map(o => (
              <option key={o.id} value={o.id}>{o.date} · {(o.tests || []).map(tt => tv(tt.name)).join(" + ") || o.id}</option>
            ))}
          </select>
        </Field>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 6 }}>
          {["الكل", "OCT", "OCTA", "Fundus Photography", "FFA", "Optos UWF", "Visual Field", "Pentacam", "B-Scan", "UBM", "Other"].map(x => (
            <button
              key={x}
              onClick={() => setImageFilter(x)}
              style={{
                whiteSpace: "nowrap",
                background: imageFilter === x ? C.accent + "22" : "transparent",
                border: `1px solid ${imageFilter === x ? C.accent : C.border}`,
                borderRadius: 8,
                padding: "5px 8px",
                color: imageFilter === x ? C.accent : C.muted,
                fontSize: 10,
                cursor: "pointer"
              }}
            >
              {x === "الكل" ? t("g1.common.all", lang) : x}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{t("g1.img.title", lang)} ({images.length})</span>
        <label
          style={{
            background: uploadProgress ? C.muted : `linear-gradient(135deg,${C.accent},${C.teal})`,
            borderRadius: 10,
            padding: "7px 14px",
            color: C.bg,
            fontSize: 12,
            fontWeight: 700,
            cursor: uploadProgress ? "not-allowed" : "pointer",
            pointerEvents: uploadProgress ? "none" : "auto"
          }}
        >
          📎 {t("g1.img.upload", lang)}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImgUpload}
            style={{ display: "none" }}
            disabled={!!uploadProgress}
          />
        </label>
      </div>
      {uploadProgress && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.accent}44`,
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>⬆ {t("g1.img.uploading", lang)}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{uploadProgress.name.slice(0, 25)}</span>
          </div>
          <div style={{ background: C.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
            <div
              style={{
                background: `linear-gradient(90deg,${C.accent},${C.teal})`,
                width: uploadProgress.pct + "%",
                height: "100%",
                borderRadius: 99,
                transition: "width 0.3s"
              }}
            />
          </div>
        </div>
      )}
      {imgError && (
        <div
          style={{
            background: C.danger + "11",
            border: `1px solid ${C.danger}44`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ color: C.danger, fontSize: 12 }}>{"⚠ "}{imgError}</span>
          <span role="button" tabIndex={0} aria-label={t("g1.common.close", lang)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setImgError(null); } }} onClick={() => setImgError(null)} style={{ color: C.danger, cursor: "pointer", fontSize: 18 }}>×</span>
        </div>
      )}
      {imgLoading && images.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <div style={{ color: C.muted, fontSize: 13 }}>{t("g1.img.loading", lang)}</div>
        </div>
      )}
      {!imgLoading && images.length === 0 && !uploadProgress && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <img src={XRAY_ICON} alt="" style={{ width: 72, height: 72, margin: "0 auto 12px", display: "block", opacity: 0.7 }}/>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>{t("g1.img.none", lang)}</div>
          <div style={{ color: C.border, fontSize: 11 }}>{t("g1.img.noneHint", lang)}</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {images.filter(img => imageFilter === "الكل" || img.type === imageFilter).map(img => (
          <div
            key={img.id}
            data-rec={String(img.id)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}
          >
            {img.src ? (
              <div onClick={() => setViewImg(img)} style={{ cursor: "pointer", position: "relative" }}>
                <img
                  src={img.src}
                  alt={img.name}
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    insetInlineEnd: 8,
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: 8,
                    padding: "3px 10px",
                    color: "#fff",
                    fontSize: 10
                  }}
                >
                  🔍 {t("g1.img.fullView", lang)}
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    insetInlineStart: 8,
                    background: C.accent + "cc",
                    borderRadius: 8,
                    padding: "3px 10px",
                    color: C.bg,
                    fontSize: 10,
                    fontWeight: 700
                  }}
                >
                  {img.date}
                </div>
              </div>
            ) : (
              <div
                style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: C.border + "33" }}
              >
                <span style={{ color: C.muted, fontSize: 11 }}>{"🩻 "}{img.name}</span>
              </div>
            )}
            <div style={{ padding: "10px 12px" }}>
              <div
                style={{
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {img.name}
              </div>
              {(() => {
                const ch = chainOfImage(img);
                if (ch) return (<div style={{ color: C.muted, fontSize: 10, marginBottom: 6 }}>{"🔗 " + t("g1.img.order", lang) + ": "}{ch.tests.map(x => tv(x)).join(lang === "en" ? ", " : "، ")}{ch.orderedDate ? " · " + ch.orderedDate : ""}{ch.visit ? " · " + t("g1.evt.visit", lang) + " " + ch.visit.date : ""}</div>);
                if (img.orderId) return (<div style={{ color: C.muted, fontSize: 10, marginBottom: 6 }}>{"🔗 " + t("g1.img.linkedTo", lang) + " "}{img.orderId}</div>);
                return (<div style={{ color: C.gold, fontSize: 10, marginBottom: 6 }}>{t("g1.img.unlinked", lang)}</div>);
              })()}
              <textarea
                value={img.notes || ""}
                onChange={e => editImgNotesLocal(img.id, e.target.value)}
                onBlur={e => updateImgNotes(img.id, e.target.value)}
                placeholder={t("g1.img.notesPh", lang)}
                rows={2}
                style={{ ...inp(), resize: "none", fontSize: 11, marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                {img.src && (
                  <div
                    onClick={() => setViewImg(img)}
                    style={{
                      flex: 1,
                      background: C.teal + "22",
                      borderRadius: 8,
                      padding: "7px 0",
                      color: C.teal,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    🔍 {t("g1.img.view", lang)}
                  </div>
                )}
                {img.src && (
                  <div
                    onClick={() => analyzeImage(img)}
                    style={{
                      flex: 1,
                      background: C.purple + "22",
                      borderRadius: 8,
                      padding: "7px 0",
                      color: C.purple,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    {aiAnalysis[img.id]?.loading ? "⏳ " + t("g1.img.analyzing", lang) : "🤖 " + t("g1.img.analyze", lang)}
                  </div>
                )}
                <div
                  onClick={() => {
                    if (window.confirm(t("g1.img.delConfirm", lang))) delImage(img.id);
                  }}
                  style={{
                    flex: img.src ? 0 : 1,
                    background: C.danger + "22",
                    borderRadius: 8,
                    padding: "7px 12px",
                    color: C.danger,
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  🗑 {t("g1.common.delete", lang)}
                </div>
              </div>
              {aiAnalysis[img.id]?.result && (
                <div
                  style={{
                    marginTop: 10,
                    background: `linear-gradient(135deg,${C.purple}15,${C.accent}10)`,
                    border: `1px solid ${C.purple}44`,
                    borderRadius: 12,
                    padding: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: `linear-gradient(135deg,${C.purple},${C.accent})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11
                      }}
                    >
                      🤖
                    </div>
                    <span style={{ color: C.purple, fontWeight: 700, fontSize: 12 }}>{t("g1.img.aiTitle", lang)}</span>
                    <span
                      style={{
                        marginInlineStart: "auto",
                        background: C.purple + "22",
                        color: C.purple,
                        borderRadius: 6,
                        padding: "1px 7px",
                        fontSize: 9,
                        fontWeight: 700
                      }}
                    >
                      {t("g1.img.aiAssist", lang)}
                    </span>
                  </div>
                  <div style={{ color: C.text, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {aiAnalysis[img.id].result}
                  </div>
                  <div
                    onClick={() => setAiAnalysis(prev => ({
                      ...prev,
                      [img.id]: null
                    }))}
                    style={{ marginTop: 8, color: C.muted, fontSize: 10, cursor: "pointer", textAlign: "end" }}
                  >
                    ✕ {t("g1.img.closeAnalysis", lang)}
                  </div>
                </div>
              )}
              {aiAnalysis[img.id]?.error && (
                <div
                  style={{
                    marginTop: 8,
                    background: C.danger + "11",
                    border: `1px solid ${C.danger}33`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    color: C.danger,
                    fontSize: 11
                  }}
                >
                  {aiAnalysis[img.id].error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {images.length > 0 && (
        <div
          style={{
            background: C.accent + "11",
            border: `1px solid ${C.accent}22`,
            borderRadius: 10,
            padding: "10px 14px",
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ color: C.muted, fontSize: 11 }}>☁ {t("g1.img.cloud", lang)}</span>
          <span style={{ color: C.accent, fontSize: 11, fontWeight: 700 }}>{images.length}{" " + t("g1.img.unitImage", lang)}</span>
        </div>
      )}
    </div>
  );
}
