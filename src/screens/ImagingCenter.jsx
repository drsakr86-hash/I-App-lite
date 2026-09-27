import React, { useState, useEffect, useCallback } from "react";
import {
  filterImagingPatients, filterStudies, pendingOrdersForPatient, findImagingType, buildTypeFilters,
  resolveStudyTarget, buildStudyRecord, buildImageMeta, buildImagingExamRecord
} from "../modules/imaging/model.js";

const L = () => globalThis.IAppLegacy;

export default function ImagingCenter({ patients, primary, clinic }) {
  const {
    C, Btn, Modal, Field, inp, SecHead, Tag, printDoc,
    sbGet, sbSet, getSB, iappRpc, offlineNow, trashPut, logAudit,
    localDateStr, localTimeStr,
    IMAGING_TYPES, IMAGING_EYES, IMAGING_REPORT_TEMPLATES, IMAGING_ORDER_STATUSES,
    imagingTypeName, imagingStudyRpcParams, imagingSingleOrderParams
  } = L();
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [type, setType] = useState("oct");
  const [eye, setEye] = useState("OU");
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState(IMAGING_REPORT_TEMPLATES.oct);
  const [files, setFiles] = useState([]);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderTest, setSelectedOrderTest] = useState(null);
  // Phase 33 fix (H2): if iapp_create_investigation_workflow_order succeeds but the
  // following iapp_create_imaging_study fails, remember the order it already created
  // so a retry reuses it instead of creating a duplicate Core investigation/imaging order.
  const [pendingCoreOrder, setPendingCoreOrder] = useState(() => {
    try {
      const raw = localStorage.getItem("iapp_pending_core_imaging_order");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });
  const loadStudies = useCallback(async () => {
    setLoading(true);
    const remote = await sbGet("iapp_imaging_studies");
    const legacy = await sbGet("iapp_imaging");
    const list = Array.isArray(remote) ? remote : Array.isArray(legacy) ? legacy : [];
    setStudies(list);
    const ord = await sbGet("iapp_imaging_orders");
    setOrders(Array.isArray(ord) ? ord : []);
    setLoading(false);
  }, []);
  const advanceOrder = async (order, nextStatus) => {
    const remote = await sbGet("iapp_imaging_orders");
    const base = Array.isArray(remote) ? remote : orders;
    const next = base.map(o => o.id === order.id ? {
      ...o,
      status: nextStatus,
      lastUpdatedAt: new Date().toISOString()
    } : o);
    await sbSet("iapp_imaging_orders", next);
    setOrders(next);
    if (selectedOrder?.id === order.id) setSelectedOrder({
      ...order,
      status: nextStatus
    });
  };
  useEffect(() => {
    loadStudies();
    const sb = getSB();
    let ch = null;
    try {
      ch = sb.channel("iapp_imaging_center").on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "iapp_store",
        filter: "key=eq.iapp_imaging"
      }, p => {
        if (Array.isArray(p?.new?.value)) setStudies(p.new.value);
      }).subscribe();
    } catch {}
    return () => {
      if (ch) {
        try {
          sb.removeChannel(ch);
        } catch {}
      }
    };
  }, [loadStudies]);
  useEffect(() => {
    setReport(IMAGING_REPORT_TEMPLATES[type] || "");
  }, [type]);
  const patientResults = filterImagingPatients(patients, patientSearch);
  const uploadFile = async (file, studyId) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", "iapp_clinic");
    form.append("folder", "iapp/patient_" + (selectedPatient?.id || "unassigned") + "/imaging");
    setProgress({
      name: file.name,
      pct: 20
    });
    const resource = file.type === "application/pdf" ? "raw/upload" : file.type.startsWith("video/") ? "video/upload" : "image/upload";
    const res = await fetch("https://api.cloudinary.com/v1_1/daihhusnc/" + resource, {
      method: "POST",
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
    setProgress({
      name: file.name,
      pct: 100
    });
    return {
      id: data.public_id || studyId + "-" + Date.now(),
      public_id: data.public_id || "",
      name: file.name,
      src: data.secure_url || "",
      resource_type: data.resource_type || "image"
    };
  };
  const saveStudy = async () => {
    if (!selectedPatient) {
      alert("اختر المريض أولاً");
      return;
    }
    if (!files.length && !report.trim() && !notes.trim()) {
      alert("أضف صورة/ملف أو تقريراً أو ملاحظات");
      return;
    }
    setUploading(true);
    setProgress(null);
    try {
      const id = "IMG-" + Date.now();
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadFile(f, id));
      const now = {
        date: localDateStr(),
        time: localTimeStr()
      };
      const { chosenTest, finalType, finalEye } = resolveStudyTarget({ selectedOrder, selectedOrderTest, type, eye, imagingTypes: IMAGING_TYPES });
      let coreWorkflow = null;
      let coreStudyId = null;
      let coreVisitId = null;
      let coreSyncError = null;
      try {
        const sb = getSB();
        if (sb && !offlineNow()) {
          const selectedCoreOrderId = selectedOrder?.coreInvestigationOrderId || selectedOrder?.investigationOrderId || null;
          if (selectedCoreOrderId) {
            coreVisitId = selectedOrder?.coreVisitId || null;
            const { data, error } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: selectedCoreOrderId, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, order_id: selectedOrder?.id || null } }));
            if (error) throw error;
            coreStudyId = data || null;
          } else if (pendingCoreOrder && pendingCoreOrder.patientId === selectedPatient.id) {
            // Phase 33 fix (H2): a previous attempt already created the Core
            // investigation/imaging order but failed before the study was recorded —
            // reuse it instead of creating a duplicate order on retry.
            coreWorkflow = pendingCoreOrder.coreWorkflow;
            coreVisitId = pendingCoreOrder.coreVisitId;
            const { data: studyId, error: studyError } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: pendingCoreOrder.investigationOrderId, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, legacy_imaging_id: id } }));
            if (studyError) throw studyError;
            coreStudyId = studyId || null;
          } else {
            const { data, error } = await iappRpc(sb, "iapp_create_investigation_workflow_order", imagingSingleOrderParams({ patientId: selectedPatient.id, typeName: imagingTypeName(finalType), type: finalType, eye: finalEye, doctorName: primary?.name, notes, sourceLegacyId: id }));
            if (error) throw error;
            coreWorkflow = data || null;
            coreVisitId = data?.visit_id || null;
            // Phase 33 fix (H2): remember the order we just created BEFORE attempting
            // the study write, so a failure below doesn't leave it invisible to a retry
            // (which would otherwise create yet another duplicate order).
            const nextPendingCoreOrder = {
              patientId: selectedPatient.id,
              investigationOrderId: data?.investigation_order_id || null,
              coreWorkflow: data || null,
              coreVisitId: data?.visit_id || null
            };
            setPendingCoreOrder(nextPendingCoreOrder);
            try {
              localStorage.setItem("iapp_pending_core_imaging_order", JSON.stringify(nextPendingCoreOrder));
            } catch (_) {}
            const { data: studyId, error: studyError } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: data?.investigation_order_id, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, legacy_imaging_id: id } }));
            if (studyError) throw studyError;
            coreStudyId = studyId || null;
          }
        } else {
          coreSyncError = "offline";
        }
      } catch (e) {
        coreSyncError = e?.message || String(e);
        console.warn("[core imaging sync]", e);
      }
      const rec = buildStudyRecord({ id, selectedPatient, now, primary, finalType, typeName: imagingTypeName(finalType), finalEye, uploaded, notes, report, selectedOrder, chosenTest, coreVisitId, coreWorkflow, coreStudyId, coreSyncError, createdAt: new Date().toISOString() });
      const remoteStudies = await sbGet("iapp_imaging_studies");
      const studyBase = Array.isArray(remoteStudies) ? remoteStudies : [];
      await sbSet("iapp_imaging_studies", [rec, ...studyBase]);
      const old = await sbGet("iapp_imaging");
      await sbSet("iapp_imaging", [rec, ...(Array.isArray(old) ? old : [])]);
      const metaKey = "iapp_imgmeta_" + selectedPatient.id;
      const oldMeta = await sbGet(metaKey);
      const metaBase = Array.isArray(oldMeta) ? oldMeta : [];
      const newMeta = buildImageMeta({ uploaded, now, notes, typeName: imagingTypeName(finalType), finalEye, examId: id });
      await sbSet(metaKey, [...newMeta, ...metaBase]);
      const remoteExams = await sbGet("iapp_exams");
      const examBase = Array.isArray(remoteExams) ? remoteExams : [];
      const examRec = buildImagingExamRecord({ id, selectedPatient, now, primary, typeName: imagingTypeName(finalType), finalEye, report, notes, selectedOrder, uploaded });
      await sbSet("iapp_exams", [examRec, ...examBase]);
      if (selectedOrder) {
        const remoteOrders = await sbGet("iapp_imaging_orders");
        const orderBase = Array.isArray(remoteOrders) ? remoteOrders : orders;
        const nextOrders = orderBase.map(o => o.id === selectedOrder.id ? {
          ...o,
          status: report.trim() ? "reported" : "completed",
          completedAt: new Date().toISOString(),
          completedStudyId: id
        } : o);
        await sbSet("iapp_imaging_orders", nextOrders);
        setOrders(nextOrders);
      }
      setStudies(prev => [rec, ...prev]);
      setSelectedOrder(null);
      setSelectedOrderTest(null);
      setFiles([]);
      setNotes("");
      setReport(IMAGING_REPORT_TEMPLATES[type] || "");
      setProgress(null);
      // Phase 34 hardening: keep the Core order retry guard when Core sync failed.
      // The guard is persisted so a page refresh cannot cause a duplicate workflow order.
      if (!coreSyncError) {
        setPendingCoreOrder(null);
        try { localStorage.removeItem("iapp_pending_core_imaging_order"); } catch (_) {}
      }
      if (coreSyncError && coreSyncError !== "offline") {
        alert("✓ تم حفظ الفحص محليًا وربطه بملف المريض، لكن مزامنته مع Core فشلت (" + coreSyncError + "). سيتم عرضه في السجل المحلي، ويُنصح بمراجعته لاحقًا.");
      } else if (coreSyncError === "offline") {
        alert("✓ تم حفظ الفحص محليًا. الجهاز غير متصل حاليًا، وستتم مزامنته مع Core عند توفر الاتصال.");
      } else {
        alert("✓ تم تنفيذ الفحص وربطه بطلب الأشعة وملف المريض");
      }
    } catch (e) {
      alert("فشل حفظ الفحص: " + e.message);
    } finally {
      setUploading(false);
    }
  };
  const deleteStudy = async id => {
    if (!confirm("حذف سجل الفحص من التطبيق؟ سيتم الاحتفاظ بالملفات على Cloudinary حتى يتم حذفها من الخادم بشكل آمن.")) return;
    const remote = await sbGet("iapp_imaging_studies");
    const base = Array.isArray(remote) ? remote : studies;
    const target = base.find(x => x.id === id);
    const next = base.filter(x => x.id !== id);
    await trashPut("iapp_imaging_studies", target, "فحص صور");
    logAudit("حذف فحص صور", target && (target.patient || "") + " · " + (target.type || "") || id);
    await sbSet("iapp_imaging_studies", next);
    const old = await sbGet("iapp_imaging");
    if (Array.isArray(old)) await sbSet("iapp_imaging", old.filter(x => x.id !== id));
    if (target?.orderId) {
      const ord = await sbGet("iapp_imaging_orders");
      if (Array.isArray(ord)) await sbSet("iapp_imaging_orders", ord.map(o => o.id === target.orderId ? {
        ...o,
        status: "cancelled",
        cancelledAt: new Date().toISOString()
      } : o));
    }
    setStudies(next);
    setView(null);
    loadStudies();
  };
  const filtered = filterStudies(studies, { filter, search });
  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>🖼️ Imaging Center</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>
            OCT · OCTA · FFA · Fundus · Pentacam · ERG · VF · Optos
          </div>
        </div>
        <span
          style={{
            background: C.accent + "22",
            color: C.accent,
            borderRadius: 9,
            padding: "5px 8px",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {studies.length}
          {" سجل"}
        </span>
      </div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 14 }}
      >
        <SecHead icon="👤" label="اختيار المريض" />
        {selectedPatient ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                background: C.accent + "11",
                border: `1px solid ${C.accent}55`,
                borderRadius: 10,
                padding: "9px 12px",
              }}
            >
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{selectedPatient.name}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>
                {selectedPatient.patientCode}
                {" · "}
                {selectedPatient.phone}
              </div>
            </div>
            <button
              onClick={() => setSelectedPatient(null)}
              style={{
                background: C.danger + "22",
                border: "none",
                borderRadius: 8,
                color: C.danger,
                fontSize: 18,
                padding: "6px 10px",
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الملف..."
              style={inp()}
            />
            {patientSearch && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 20,
                  left: 0,
                  right: 0,
                  top: 48,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {patientResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatientSearch("");
                    }}
                    style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}33`, cursor: "pointer" }}
                  >
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>
                      {p.patientCode || "—"}
                      {" · "}
                      {p.phone || ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {selectedPatient && pendingOrdersForPatient(orders, selectedPatient.id).length > 0 && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.gold}44`,
            borderRadius: 16,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <SecHead icon="🩻" label="طلبات معلقة لهذا المريض" />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {pendingOrdersForPatient(orders, selectedPatient.id).map((o) => (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${selectedOrder?.id === o.id ? C.accent : C.border}`,
                  background: selectedOrder?.id === o.id ? C.accent + "12" : C.bg,
                  borderRadius: 10,
                  padding: 9,
                }}
              >
                <div
                  onClick={() => {
                    setSelectedOrder(o);
                    setSelectedOrderTest(o.tests?.[0]?.id || null);
                    const first = o.tests?.[0];
                    if (first) {
                      const t = findImagingType(IMAGING_TYPES, first);
                      if (t) setType(t.id);
                      setEye(first.eye || "OU");
                    }
                    setNotes(o.notes || "");
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{o.id}</span>
                    <Tag
                      label={IMAGING_ORDER_STATUSES[o.status] || o.status}
                      color={o.status === "requested" ? C.gold : C.teal}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                    {(o.tests || []).map((t) => (
                      <button
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrder(o);
                          setSelectedOrderTest(t.id);
                          const tt = findImagingType(IMAGING_TYPES, t);
                          if (tt) setType(tt.id);
                          setEye(t.eye || "OU");
                          setNotes(o.notes || "");
                        }}
                        style={{
                          background: selectedOrderTest === t.id && selectedOrder?.id === o.id ? C.accent + "22" : C.bg,
                          border: `1px solid ${selectedOrderTest === t.id && selectedOrder?.id === o.id ? C.accent : C.border}`,
                          borderRadius: 6,
                          color: C.muted,
                          fontSize: 9,
                          padding: "3px 6px",
                        }}
                      >
                        {t.name}
                        {" · "}
                        {t.eye || "OU"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
                  {o.status === "requested" && (
                    <button
                      onClick={() => advanceOrder(o, "scheduled")}
                      style={{
                        flex: 1,
                        background: C.gold + "18",
                        border: `1px solid ${C.gold}44`,
                        borderRadius: 7,
                        color: C.gold,
                        fontSize: 9,
                        padding: 5,
                      }}
                    >
                      📅 جدولة
                    </button>
                  )}
                  {o.status === "scheduled" && (
                    <button
                      onClick={() => advanceOrder(o, "in_progress")}
                      style={{
                        flex: 1,
                        background: C.teal + "18",
                        border: `1px solid ${C.teal}44`,
                        borderRadius: 7,
                        color: C.teal,
                        fontSize: 9,
                        padding: 5,
                      }}
                    >
                      ▶ بدء التنفيذ
                    </button>
                  )}
                  {o.status === "in_progress" && (
                    <span style={{ flex: 1, textAlign: "center", color: C.teal, fontSize: 9, padding: 5 }}>
                      جارٍ التنفيذ — احفظ النتيجة بعد الانتهاء
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 14 }}
      >
        <SecHead icon="🔬" label="نوع الفحص" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {IMAGING_TYPES.map((t) => (
            <div
              key={t.id}
              onClick={() => setType(t.id)}
              style={{
                border: `1px solid ${type === t.id ? C.accent : C.border}`,
                background: type === t.id ? C.accent + "15" : C.bg,
                borderRadius: 10,
                padding: "9px 10px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span>{t.icon}</span>
                <span style={{ color: type === t.id ? C.accent : C.text, fontWeight: 700, fontSize: 12 }}>{t.name}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 9, marginTop: 3 }}>{t.hint}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <Field label="العين">
            <select style={inp()} value={eye} onChange={(e) => setEye(e.target.value)}>
              {IMAGING_EYES.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="التاريخ">
            <input style={inp()} type="date" value={localDateStr()} readOnly />
          </Field>
        </div>
      </div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 14 }}
      >
        <SecHead icon="☁️" label="رفع الصور / الملفات" />
        <label
          style={{
            display: "block",
            border: `1px dashed ${C.accent}66`,
            borderRadius: 12,
            padding: 18,
            textAlign: "center",
            cursor: "pointer",
            background: C.accent + "08",
          }}
        >
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <div style={{ fontSize: 25 }}>📤</div>
          <div style={{ color: C.accent, fontWeight: 700, fontSize: 12 }}>اختيار صور / ملفات الفحص</div>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>يمكن اختيار أكثر من ملف</div>
        </label>
        {files.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: C.bg,
                  borderRadius: 8,
                  padding: "7px 9px",
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    color: C.text,
                    fontSize: 10,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <span style={{ color: C.muted, fontSize: 9 }}>
                  {Math.round(f.size / 1024)}
                  {" KB"}
                </span>
              </div>
            ))}
          </div>
        )}
        {progress && (
          <div style={{ marginTop: 8, color: C.accent, fontSize: 10 }}>
            {"⏫ "}
            {progress.name}
            {" · "}
            {progress.pct}%
          </div>
        )}
      </div>
      <div
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 14 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <SecHead icon="📝" label="التقرير" />
          <button
            onClick={() => setReport(IMAGING_REPORT_TEMPLATES[type] || "")}
            style={{
              background: C.purple + "22",
              border: `1px solid ${C.purple}33`,
              borderRadius: 8,
              color: C.purple,
              fontSize: 10,
              padding: "5px 8px",
            }}
          >
            ↻ قالب
          </button>
        </div>
        <textarea
          value={report}
          onChange={(e) => setReport(e.target.value)}
          rows={9}
          style={{ ...inp(), resize: "vertical", direction: "ltr", textAlign: "left", lineHeight: 1.7 }}
        />
        <Field label="ملاحظات إضافية">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inp(), resize: "none" }}
            placeholder="ملاحظات الطبيب أو الفني..."
          />
        </Field>
        <Btn full onClick={saveStudy}>
          {uploading ? "⏳ جاري الرفع والحفظ..." : "💾 حفظ الفحص والتقرير"}
        </Btn>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <SecHead icon="🗂️" label="السجل" />
          <button
            onClick={loadStudies}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.muted,
              padding: "5px 8px",
            }}
          >
            🔄
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في السجل..."
          style={{ ...inp(), marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 5, overflowX: "auto", marginBottom: 10 }}>
          {buildTypeFilters(IMAGING_TYPES).map((x) => (
            <button
              key={x.id}
              onClick={() => setFilter(x.id)}
              style={{
                background: filter === x.id ? C.accent + "22" : "transparent",
                border: `1px solid ${filter === x.id ? C.accent : C.border}`,
                borderRadius: 8,
                color: filter === x.id ? C.accent : C.muted,
                padding: "5px 8px",
                fontSize: 9,
                whiteSpace: "nowrap",
              }}
            >
              {x.l}
            </button>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 25, textAlign: "center", color: C.muted }}>⏳ جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 25, textAlign: "center", color: C.muted }}>No investigations saved</div>
        ) : (
          filtered.slice(0, 30).map((x) => (
            <div
              key={x.id}
              onClick={() => setView(x)}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 11,
                padding: 10,
                marginBottom: 7,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{x.patient}</span>
                  <span style={{ color: C.muted, fontSize: 9 }}>
                    {" · "}
                    {x.patientCode}
                  </span>
                </div>
                <Tag
                  label={x.status === "reported" ? "تم التقرير" : "بدون تقرير"}
                  color={x.status === "reported" ? C.success : C.gold}
                />
              </div>
              <div style={{ color: C.accent, fontSize: 10, marginTop: 4 }}>
                {x.typeName}
                {" · "}
                {x.eye}
                {" · "}
                {x.date} {x.time}
              </div>
              <div style={{ color: C.muted, fontSize: 9, marginTop: 3 }}>
                {x.files?.length || 0}
                {" ملف · "}
                {x.doctor || ""}
              </div>
            </div>
          ))
        )}
      </div>
      {view && (
        <Modal title={"📄 " + view.typeName + " — " + view.patient} onClose={() => setView(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: C.bg, borderRadius: 10, padding: 10, color: C.muted, fontSize: 11 }}>
              {view.date} {view.time}
              {" · "}
              {view.eye}
              {" · "}
              {view.doctor}
            </div>
            {view.files?.map((f, i) => (
              <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 8 }}>
                {f.src && f.resource_type !== "raw" && f.resource_type !== "video" ? (
                  <img
                    src={f.src}
                    style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#000", borderRadius: 8 }}
                  />
                ) : (
                  <a
                    href={f.src}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      padding: 18,
                      textAlign: "center",
                      background: C.bg,
                      borderRadius: 8,
                      color: C.accent,
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  >
                    📄 فتح الملف
                  </a>
                )}
                <div style={{ color: C.text, fontSize: 10, marginTop: 5 }}>{f.name}</div>
              </div>
            ))}
            {view.report && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
                <div style={{ color: C.gold, fontWeight: 700, fontSize: 11, marginBottom: 6 }}>التقرير</div>
                <div
                  style={{
                    color: C.text,
                    fontSize: 11,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    direction: "ltr",
                    textAlign: "left",
                  }}
                >
                  {view.report}
                </div>
              </div>
            )}
            {view.notes && (
              <div style={{ color: C.muted, fontSize: 11, whiteSpace: "pre-wrap" }}>
                {"📝 "}
                {view.notes}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                outline
                full
                onClick={() =>
                  printDoc(
                    `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${view.typeName}</title><style>body{font-family:Arial;padding:20px}img{max-width:100%;max-height:500px}pre{white-space:pre-wrap;line-height:1.7}</style></head><body><h2>${view.typeName}</h2><p>${view.patient} · ${view.patientCode || ""} · ${view.date}</p>${(view.files || []).map((f) => (f.src && f.resource_type !== "raw" ? `<img src="${f.src}"/>` : f.src ? `<p><a href="${f.src}">فتح الملف: ${f.name || "file"}</a></p>` : "")).join("")}<h3>Report</h3><pre>${view.report || ""}</pre><p>${view.notes || ""}</p></body></html>`,
                  )
                }
              >
                🖨️ طباعة
              </Btn>
              <Btn danger full onClick={() => deleteStudy(view.id)}>
                🗑 حذف السجل
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
