import React from 'react';

const L = () => globalThis.IAppLegacy;

// Patient file — "images" tab. Presentational port of the legacy PatientFile JSX;
// all state and handlers come from the legacy function through ctx.
export default function ImagesTab({ ctx }) {
  const { C, Field, XRAY_ICON, inp } = L();
  const { aiAnalysis, analyzeImage, delImage, handleImgUpload, imageEye, imageFilter, imageType, images, imgError, imgLoading, setAiAnalysis, setImageEye, setImageFilter, setImageType, setImgError, setViewImg, updateImgNotes, uploadProgress } = ctx;
  return (
    <div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="نوع الصورة">
            <select style={inp()} value={imageType} onChange={e => setImageType(e.target.value)}>
              {["OCT", "OCTA", "Fundus Photography", "FFA", "Optos UWF", "Visual Field", "Pentacam", "B-Scan", "UBM", "Other"].map(x => (<option key={x}>{x}</option>))}
            </select>
          </Field>
          <Field label="العين">
            <select style={inp()} value={imageEye} onChange={e => setImageEye(e.target.value)}>
              <option value="OU">OU — كلتا العينين</option>
              <option value="OD">OD — اليمنى</option>
              <option value="OS">OS — اليسرى</option>
            </select>
          </Field>
        </div>
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
              {x}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>الإشعاعات والصور ({images.length})</span>
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
          📎 رفع صورة
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
            <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>⬆ جاري الرفع...</span>
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
          <span onClick={() => setImgError(null)} style={{ color: C.danger, cursor: "pointer", fontSize: 18 }}>×</span>
        </div>
      )}
      {imgLoading && images.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <div style={{ color: C.muted, fontSize: 13 }}>جاري التحميل من السيرفر...</div>
        </div>
      )}
      {!imgLoading && images.length === 0 && !uploadProgress && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <img src={XRAY_ICON} style={{ width: 72, height: 72, margin: "0 auto 12px", display: "block", opacity: 0.7 }}/>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>لا توجد إشعاعات مرفوعة بعد</div>
          <div style={{ color: C.border, fontSize: 11 }}>اضغط "رفع صورة" لإضافة إشعاعات أو صور الفحص</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {images.filter(img => imageFilter === "الكل" || img.type === imageFilter).map(img => (
          <div
            key={img.id}
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
                    left: 8,
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: 8,
                    padding: "3px 10px",
                    color: "#fff",
                    fontSize: 10
                  }}
                >
                  🔍 عرض كامل
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
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
              <textarea
                value={img.notes || ""}
                onChange={e => updateImgNotes(img.id, e.target.value)}
                onBlur={e => updateImgNotes(img.id, e.target.value)}
                placeholder="ملاحظات (نوع الفحص، النتيجة...)"
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
                    🔍 عرض
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
                    {aiAnalysis[img.id]?.loading ? "⏳ جاري التحليل..." : "🤖 تحليل AI"}
                  </div>
                )}
                <div
                  onClick={() => {
                    if (window.confirm("حذف الصورة من القائمة؟")) delImage(img.id);
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
                  🗑 حذف
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
                    <span style={{ color: C.purple, fontWeight: 700, fontSize: 12 }}>تحليل الذكاء الاصطناعي</span>
                    <span
                      style={{
                        marginRight: "auto",
                        background: C.purple + "22",
                        color: C.purple,
                        borderRadius: 6,
                        padding: "1px 7px",
                        fontSize: 9,
                        fontWeight: 700
                      }}
                    >
                      للمساعدة فقط
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
                    style={{ marginTop: 8, color: C.muted, fontSize: 10, cursor: "pointer", textAlign: "left" }}
                  >
                    ✕ إغلاق التحليل
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
          <span style={{ color: C.muted, fontSize: 11 }}>☁ محفوظة على Cloudinary</span>
          <span style={{ color: C.accent, fontSize: 11, fontWeight: 700 }}>{images.length}{" صورة"}</span>
        </div>
      )}
    </div>
  );
}
