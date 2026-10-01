// Pure HTML-document builders for printing (daily report, patient file,
// prescriptions, glasses Rx, radiology request, accounting report).
// Extracted verbatim from the legacy runtime's _get*HTMLRaw functions —
// same markup, same styles, same Arabic strings, same pre-existing quirks
// (e.g. unused parameters/constants below are kept exactly as they were,
// not "cleaned up"). Callers apply safeTemplate() (see escape.js) before
// calling these, exactly as the legacy runtime did.

export function getDailyReportHTMLRaw(date, patients, visits, appointments, primary, clinic) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "";
  const phone = cl.phone || "";
  const dayVisits = visits.filter(v => v.date === date);
  const dayApts = appointments;
  const totalRev = dayVisits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const unpaid = dayVisits.filter(v => !v.paid).length;
  const dateAr = new Date(date).toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>تقرير يومي</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .date{font-size:12px;color:#555;margin-top:3px;}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
  .stat{background:#f0f9ff;border:1px solid #cce;border-radius:8px;padding:10px;text-align:center;}
  .stat-val{font-size:22px;font-weight:800;color:#00C2FF;}
  .stat-lbl{font-size:10px;color:#555;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  th{background:#00C2FF;color:#fff;padding:7px 10px;font-size:11px;text-align:right;}
  td{border:1px solid #ddd;padding:7px 10px;font-size:11px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .paid{color:#00aa66;font-weight:700;}
  .unpaid{color:#cc3300;font-weight:700;}
  .footer{margin-top:14px;border-top:2px solid #00C2FF;padding-top:10px;font-size:10px;color:#555;display:flex;justify-content:space-between;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div class="date">${dateAr}</div></div>
    <div style="text-align:left;font-size:11px;color:#555;">تقرير يومي</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${dayVisits.length}</div><div class="stat-lbl">إجمالي الزيارات</div></div>
    <div class="stat"><div class="stat-val" style="color:#00aa66;">${totalRev.toLocaleString()}</div><div class="stat-lbl">الإيرادات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:#cc3300;">${unpaid}</div><div class="stat-lbl">غير مدفوع</div></div>
    <div class="stat"><div class="stat-val">${dayApts.length}</div><div class="stat-lbl">المواعيد</div></div>
  </div>
  ${dayVisits.length > 0 ? `<h3>سجل الزيارات</h3>
  <table><tr><th>#</th><th>المريض</th><th>النوع</th><th>الطبيب</th><th>التكلفة</th><th>الدفع</th></tr>
  ${dayVisits.map((v, i) => {
    const p = patients.find(p => p.id === v.patientId);
    return `<tr><td>${i + 1}</td><td>${p && p.name || "-"}</td><td>${v.type}</td><td>${v.doctor}</td><td>${Number(v.cost || 0).toLocaleString()} ج.م</td><td class="${v.paid ? "paid" : "unpaid"}">${v.paid ? "✓ مدفوع" : "✗ لم يُدفع"}</td></tr>`;
  }).join("")}</table>` : "<p style='color:#aaa;font-size:11px;margin-bottom:14px;'>لا توجد زيارات مسجلة لهذا اليوم</p>"}
  <div class="footer">
    <div>${address ? `📍 ${address}` : ""}<br>${phone ? `📞 ${phone}` : ""}</div>
    <div>I App · إجمالي الإيرادات: ${totalRev.toLocaleString()} ج.م</div>
  </div>
</div></body></html>`;
}

export function getPatientFileHTMLRaw(patient, visits, exams, prescriptions, primary, clinic) {
  const p = patient || {};
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "";
  const phone = cl.phone || "";
  // Dates can be missing on legacy rows: never call string methods on undefined.
  const byDateDesc = (x, y) => String(y.date || "").localeCompare(String(x.date || ""));
  const pVisits = (visits || []).filter(v => v.patientId === p.id).sort(byDateDesc);
  const totalPaid = pVisits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  // Investigation requests live in the same list as examinations; they are not clinical examinations.
  const isRequest = e => e.status === "requested" || (Array.isArray(e.requestedTests) && e.requestedTests.length > 0);
  const pExams = (exams || []).filter(e => e.patientId === p.id && !isRequest(e)).sort(byDateDesc);
  const lastExam = pExams[0];
  const pRx = (prescriptions || []).filter(r => r.patientId === p.id).sort(byDateDesc);
  const date = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>ملف المريض</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;}
  .clinic{font-size:16px;font-weight:800;color:#00C2FF;}
  .patient-card{background:#f0f9ff;border:2px solid #00C2FF;border-radius:10px;padding:14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
  .info{font-size:10px;color:#888;text-align:center;border:1px solid #d0eaff;border-radius:6px;padding:8px 4px;background:#fff;}
  .info span{display:block;margin-bottom:4px;}
  .info b{display:block;color:#111;font-size:13px;font-weight:700;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;margin-top:14px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;}
  th{background:#00C2FF;color:#fff;padding:6px 8px;font-size:10px;text-align:right;}
  td{border:1px solid #ddd;padding:6px 8px;font-size:10px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;}
  .footer{margin-top:14px;border-top:1px solid #ddd;padding-top:8px;font-size:9px;color:#888;display:flex;justify-content:space-between;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div style="font-size:10px;color:#555;margin-top:2px;">ملف المريض · ${date}</div></div>
    <div style="font-size:11px;color:#00C2FF;font-weight:700;">${p.patientCode || ""}</div>
  </div>
  <div class="patient-card">
    <div class="info"><span>الاسم</span><b>${p.name}</b></div>
    <div class="info"><span>العمر</span><b>${p.age ? p.age + " سنة" : "—"}</b></div>
    <div class="info"><span>الجنس</span><b>${p.gender}</b></div>
    <div class="info"><span>الهاتف</span><b>${p.phone || "—"}</b></div>
    <div class="info"><span>فصيلة الدم</span><b>${p.bloodType || "—"}</b></div>
    <div class="info"><span>التشخيص</span><b>${p.condition || "—"}</b></div>
    <div class="info"><span>التاريخ المرضي</span><b>${p.history || "—"}</b></div>
    <div class="info"><span>الحساسية</span><b>${p.allergies || "—"}</b></div>
    <div class="info"><span>إجمالي المدفوع</span><b>${totalPaid.toLocaleString()} ج.م</b></div>
  </div>
  ${lastExam ? `<h3>آخر فحص سريري (${lastExam.date})${lastExam.doctor ? " · " + lastExam.doctor : ""}</h3>
  <table><tr><th>حدة الإبصار</th><th>ضغط العين</th><th>التشخيص</th></tr>
  <tr><td>يمنى: ${lastExam.visualAcuityR || "—"} · يسرى: ${lastExam.visualAcuityL || "—"}</td><td>يمنى: ${lastExam.iopR || "—"} · يسرى: ${lastExam.iopL || "—"}</td><td>${lastExam.diagnosis || "—"}</td></tr></table>` : ""}
  ${pExams.length > 1 ? `<h3>سجل الفحوصات (${pExams.length})</h3>
  <table><tr><th>التاريخ</th><th>الطبيب</th><th>حدة الإبصار (ي / ش)</th><th>ضغط العين (ي / ش)</th><th>التشخيص</th><th>خطة العلاج</th><th>المتابعة</th></tr>
  ${pExams.map(e => `<tr><td>${e.date || "—"}</td><td>${e.doctor || "—"}</td><td>${e.visualAcuityR || "—"} / ${e.visualAcuityL || "—"}</td><td>${e.iopR || "—"} / ${e.iopL || "—"}</td><td>${e.diagnosis || "—"}</td><td>${e.treatmentPlan || "—"}</td><td>${e.followUp || "—"}</td></tr>`).join("")}</table>` : ""}
  ${pRx.length > 0 ? `<h3>الوصفات (${pRx.length})</h3>
  <table><tr><th>التاريخ</th><th>الطبيب</th><th>الأدوية / النظارة</th></tr>
  ${pRx.map(r => `<tr><td>${r.date || "—"}</td><td>${r.doctor || "—"}</td><td>${typeof r.medicines === "string" ? r.medicines : (Array.isArray(r.medicines) ? r.medicines.map(m => (m && m.name) || m || "").join("، ") : "") || r.notes || "—"}</td></tr>`).join("")}</table>` : ""}
  ${pVisits.length > 0 ? `<h3>سجل الزيارات (${pVisits.length})</h3>
  <table><tr><th>التاريخ</th><th>النوع</th><th>الطبيب</th><th>النتيجة</th><th>التكلفة</th><th>الدفع</th></tr>
  ${pVisits.map(v => `<tr><td>${v.date || "—"}</td><td>${v.type || "—"}</td><td>${v.doctor || "—"}</td><td>${v.result || "—"}</td><td>${Number(v.cost || 0).toLocaleString()} ج.م</td><td>${v.paid ? "✓" : "✗"}</td></tr>`).join("")}</table>` : ""}
  <div class="footer">
    <div>${address ? `📍 ${address}` : ""} ${phone ? `· 📞 ${phone}` : ""}</div>
    <div>I App · تقرير بتاريخ ${date}</div>
  </div>
</div></body></html>`;
}

// Rx prescription letterhead — pre-filled with the clinic owner's official
// signature block (RX_PAD) when no other doctor name is recognized, and
// with the two SAKR_LOGO_* image constants for the seal/watermark. Neither
// window.SAKR_LOGO_FULL nor window.SAKR_LOGO_MARK is set anywhere in this
// codebase today, so both are always "" in practice — a pre-existing quirk,
// preserved exactly (read at call time here instead of cached at module
// load like the legacy top-level consts were, which is equivalent since
// the value never changes).
const RX_PAD = {
  doctor: "د/ عبد الستار سالم صقر",
  lines: ["عضو الجمعية الرمدية المصرية", "إستشاري طب وجراحة العيون"],
  branches: [{
    name: "دمنهور",
    addr: "شارع الجمهورية برج المنتزة بجوار حديقة الجمهورية",
    hours: "يومياً من ٨ م : ١٠ م",
    phone: "01096806570"
  }, {
    name: "الرحمانية",
    addr: "شارع أحمد محمود أمام مسجد الربيعي",
    hours: "السبت والإثنين والأربعاء ٤ م إلى ٦ م",
    phone: "01111480137"
  }],
  extraPhones: ["045 3333313", "01007818980"]
};

export function getRxHTMLRaw(rx, patient, docName, clinic) {
  const p = patient || {};
  const cl = clinic || {};
  const isOwner = !docName || /عبد\s?الستار/.test(docName);
  const doctor = isOwner ? RX_PAD.doctor : docName;
  const lines = isOwner ? RX_PAD.lines : ["طب وجراحة العيون"];
  const d = rx.date ? new Date(rx.date) : null;
  const dateTxt = d && !isNaN(d) ? d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }) : "";
  const meds = (rx.medicines || "").split("\n").map(s => s.trim()).filter(Boolean);
  const SAKR_LOGO_FULL = (typeof window !== "undefined" && window.SAKR_LOGO_FULL) || "";
  const SAKR_LOGO_MARK = (typeof window !== "undefined" && window.SAKR_LOGO_MARK) || "";
  const custom = cl.logo && /^data:image\//.test(cl.logo) ? cl.logo : "";
  const sealLogo = custom || SAKR_LOGO_FULL;
  const wmLogo = custom || SAKR_LOGO_MARK;
  const medRows = meds.map((line, i) => {
    const parts = line.split(/\s[-–—]\s?|[-–—](?=\s*[؀-ۿ\d])/);
    const name = (parts[0] || "").trim();
    const dose = parts.slice(1).join(" - ").trim();
    return `<div class="med"><div class="nm"><span class="i">${i + 1}.</span>${name}</div>${dose ? `<div class="ds" dir="rtl">${dose}</div>` : ""}</div>`;
  }).join("");
  const pin = `<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#2f6fa8" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5Z"/></svg>`;
  const clock = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#2f6fa8" stroke-width="2.2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M4 5l3-2M20 5l-3-2"/></svg>`;
  const tel = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#2c4458" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8.5 7.5c.5-.5 1.2-.4 1.5.1l1 1.6c.3.5.2 1-.2 1.4l-.6.5c.5 1.2 1.4 2.1 2.6 2.6l.5-.6c.4-.4 1-.5 1.4-.2l1.6 1c.5.3.6 1 .1 1.5l-.7.7c-.7.7-1.8.9-2.7.4-2.3-1.1-4.1-2.9-5.2-5.2-.4-.9-.3-2 .4-2.7Z"/></svg>`;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>روشتة — ${p.name || rx.patient || ""}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=block">
<style>
  /* No page size is forced: the prescription is printed at its real A5 size (148×210mm),
     anchored to the TOP-LEFT corner of whatever paper is selected, never scaled or centered.
     So pre-cut A5 sheets fed against the left guide print correctly. */
  @page{margin:0}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{background:#fff;direction:ltr;margin:0;padding:0}
  /* Andalus when installed (Windows), otherwise Amiri — the closest free Arabic face */
  body{font-family:'Andalus','Amiri',Tahoma,serif;color:#2c4458}
  .page{direction:rtl;width:148mm;min-height:209mm;margin:0;padding:7mm 7mm 6mm;display:flex;flex-direction:column;position:relative;overflow:hidden}

  .top{position:relative;height:40mm}
  .band{position:absolute;top:0;right:0;left:22mm;height:24mm;background:#3d5569;border-radius:1mm;color:#fff;padding:4mm 7mm 0 0}
  .band .dn{font-size:25px;font-weight:700;line-height:1.3}
  .band .ln{font-size:14px;margin-top:1mm;opacity:.95;line-height:1.35}
  .band .ln+.ln{margin-top:0}
  .seal{position:absolute;left:0;top:-2mm;width:36mm;height:36mm;border-radius:50%;background:#fff;padding:2.2mm}
  .seal .in{width:100%;height:100%;border-radius:50%;background:#b8d3ea;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
  .seal .in img{width:76%;height:76%;object-fit:contain;margin-top:1mm}
  .seal .t1{font-size:8.5px;font-weight:800;color:#3d5569;letter-spacing:.4px;margin-top:1mm;font-family:Arial,sans-serif}
  .seal .t2{font-size:4.6px;font-weight:700;color:#3d5569;font-family:Arial,sans-serif}
  .arc{position:absolute;left:1mm;top:2mm;width:34mm;height:36.5mm;border-radius:50%;border-bottom:1.2mm solid #3d5569;opacity:.85}

  .fields{margin:-12mm 0 0 40mm;padding-right:6mm;font-size:17px;font-weight:700;color:#2c4458}
  .fields .row{display:flex;align-items:baseline;gap:2mm;margin-bottom:3mm}
  .fields .v{flex:1;border-bottom:1.5px dotted #6b7f90;font-weight:700;font-size:16px;min-height:5mm;padding:0 1mm}

  .rx{font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;color:#3d5569;direction:ltr;text-align:left;margin:4mm 0 2mm 3mm;line-height:1}
  .rx span{font-size:18px}
  .meds{direction:ltr;text-align:left;flex:1;padding:0 4mm;position:relative;z-index:1}
  .med{padding:2.4mm 0;page-break-inside:avoid}
  .med .nm{font-family:Arial,'Segoe UI',sans-serif;font-size:15px;font-weight:700;color:#1b2b3a}
  .med .i{font-family:Arial,sans-serif;color:#6b7f90;font-weight:700;margin-right:2mm;font-size:13px}
  .med .ds{font-size:15px;color:#3f5263;margin-top:1.2mm;padding-left:6mm;text-align:left}
  .notes{position:relative;z-index:1;margin:2mm 4mm 3mm;font-size:15px;line-height:1.8;white-space:pre-line;color:#2c4458}

  .wm{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);width:82mm;height:82mm;opacity:.09;pointer-events:none;z-index:0}
  .wm img{width:100%;height:100%;object-fit:contain;filter:grayscale(.6);mix-blend-mode:multiply}

  .foot{position:relative;z-index:1;background:#b8d3ea;border-radius:9mm;padding:3mm 8mm 2.6mm;font-size:14.5px;font-weight:700;color:#2c4458;line-height:1.55}
  .foot .l{display:flex;align-items:center;gap:1.6mm;white-space:nowrap;line-height:1.45}
  .foot .l b{color:#2f6fa8}
  .foot .r2{display:flex;justify-content:space-between;align-items:center;margin-bottom:1mm}
  .foot .ph{display:flex;align-items:center;gap:1.4mm;font-family:Arial,sans-serif;font-weight:800;letter-spacing:.3px}
  .foot .ex{display:flex;justify-content:center;gap:14mm;font-family:Arial,sans-serif;font-weight:800;margin-top:.6mm;letter-spacing:.3px}
  @media screen{body{background:#e9eef2;padding:10px}.page{background:#fff;box-shadow:0 2px 12px #0002}}
  @media print{html,body{width:auto;height:auto}.page{break-after:avoid}}
</style></head>
<body data-fonts="Amiri">
<div class="page">
  <div class="wm"><img src="${wmLogo}" alt=""></div>

  <div class="top">
    <div class="band">
      <div class="dn">${doctor}</div>
      ${lines.map(l => `<div class="ln">${l}</div>`).join("")}
    </div>
    <div class="arc"></div>
    <div class="seal"><div class="in"><img src="${sealLogo}" alt=""></div></div>
  </div>

  <div class="fields">
    <div class="row"><span>الاسم :</span><span class="v">${p.name || rx.patient || ""}</span></div>
    <div class="row"><span>التاريخ :</span><span class="v">${dateTxt}</span>${p.age ? `<span style="margin-right:3mm">السن :</span><span class="v" style="flex:0 0 14mm">${p.age}</span>` : ""}</div>
  </div>

  <div class="rx">R<span>x</span></div>
  <div class="meds">${medRows}</div>
  ${rx.notes ? `<div class="notes">${rx.notes}</div>` : ""}

  <div class="foot">
    ${RX_PAD.branches.map(b => `
      <div class="l">${pin}<b>${b.name} :</b> ${b.addr}</div>
      <div class="r2"><div class="l">${clock}${b.hours}</div><div class="ph">${tel}<span dir="ltr">${b.phone}</span></div></div>`).join("")}
    <div class="ex">${RX_PAD.extraPhones.map(x => `<span dir="ltr">${x}</span>`).join("")}</div>
  </div>
</div></body></html>`;
}

export function getGlassesHTMLRaw(rx, patient, docName, clinic) {
  const p = patient || {};
  const cl = clinic || {};
  const SEED_CLINIC = {
    address: "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we",
    phone: "دمنهور: 0453333313 | الرحمانية: 01111480137"
  };
  const address = cl.address || SEED_CLINIC.address;
  const phone = cl.phone || SEED_CLINIC.phone;
  const date = new Date(rx.date).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Glasses Prescription</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;background:#fff;color:#111;overflow-x:hidden;}
  .page{width:100%;max-width:200mm;margin:0 auto;padding:4mm 3mm;}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00C2FF;padding-bottom:6px;margin-bottom:8px;flex-wrap:wrap;gap:4px;}
  .clinic{font-size:12px;font-weight:800;color:#00C2FF;direction:rtl;}
  .sub{font-size:8px;color:#666;margin-top:2px;direction:rtl;}
  .badge{background:#00C2FF;color:#fff;padding:3px 8px;border-radius:12px;font-size:9px;font-weight:700;white-space:nowrap;}
  .patient-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;direction:rtl;}
  .pinfo{font-size:9px;color:#555;}
  .pinfo b{color:#111;}
  .tbl-wrap{border:1.5px solid #aaa;border-radius:8px;overflow:hidden;margin-bottom:8px;}
  table{width:100%;border-collapse:collapse;table-layout:fixed;direction:ltr;}
  th,td{border:1px solid #aaa;text-align:center;padding:0;overflow:hidden;}
  .th-group{background:#fff;color:#111;font-weight:700;font-size:11px;padding:4px 2px;}
  .th-sub{background:#fff;color:#111;font-weight:400;font-size:9px;padding:3px 2px;}
  .th-ipd{background:#fff;color:#111;font-weight:700;font-size:10px;padding:4px 2px;vertical-align:middle;}
  .td-label{background:#f5f5f5;font-weight:600;font-size:9px;color:#333;padding:6px 4px;text-align:left;width:50px;}
  .td-val{font-size:10px;font-weight:600;padding:6px 2px;height:28px;}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:6px;border-top:1px solid #ddd;direction:rtl;flex-wrap:wrap;gap:4px;}
  .sig-line{width:100px;border-top:1px solid #333;text-align:center;padding-top:3px;font-size:8px;color:#555;}
  @media print{.page{margin:0;width:100%;}}




</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div>
      <div class="clinic">&#128065; عيادة ${docName}</div>
      <div class="sub">استشاري طب وجراحة العيون والليزر</div>
    </div>
    <div class="badge">Glasses Prescription</div>
  </div>

  <div class="patient-row">
    <div class="pinfo">المريض: <b>${p.name || rx.patient || "—"}</b></div>
    <div class="pinfo">رقم الملف: <b>${p.patientCode || "—"}</b></div>
    <div class="pinfo">العمر: <b>${p.age ? p.age + " سنة" : "—"}</b></div>
    <div class="pinfo">Date: <b>${date}</b></div>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <td class="td-label" rowspan="2" style="border:1px solid #aaa;background:#f5f5f5;"></td>
          <th class="th-group" colspan="3" style="border-bottom:1px solid #aaa;">OD · Right</th>
          <th class="th-group" colspan="3" style="border-bottom:1px solid #aaa;">OS · Left</th>
          <th class="th-ipd" rowspan="2" style="width:52px;">I.P.D</th>
        </tr>
        <tr>
          <th class="th-sub">SPH.</th>
          <th class="th-sub">CYL.</th>
          <th class="th-sub">AX.</th>
          <th class="th-sub">SPH.</th>
          <th class="th-sub">CYL.</th>
          <th class="th-sub">AX.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="td-label">Distance</td>
          <td class="td-val">${rx.sphR || ""}</td>
          <td class="td-val">${rx.cylR || ""}</td>
          <td class="td-val">${rx.axisR || ""}</td>
          <td class="td-val">${rx.sphL || ""}</td>
          <td class="td-val">${rx.cylL || ""}</td>
          <td class="td-val">${rx.axisL || ""}</td>
          <td class="td-val" rowspan="2">${rx.ipd || ""}</td>
        </tr>
        <tr>
          <td class="td-label">Reading</td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${rx.add ? `<div style="font-size:11px;color:#333;margin-bottom:8px;direction:rtl;">ADD: <b>${rx.add}</b></div>` : ""}
  ${rx.notes ? `<div style="font-size:10px;color:#444;background:#f8f8f8;border-radius:5px;padding:6px 8px;margin-bottom:8px;direction:rtl;">&#128221; ${rx.notes}</div>` : ""}

  <div class="footer">
    <div style="font-size:9px;color:#555;line-height:1.8;direction:rtl;">
      ${address ? `<div>&#128205; ${address}</div>` : ""}
      ${phone ? `<div>&#128222; ${phone}</div>` : ""}
    </div>
    <div class="sig-line">${docName}</div>
  </div>
</div></body></html>`;
}

export function getRadiologyHTMLRaw(selected, patient, notes, primary, allTests, clinic) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we";
  const phone = cl.phone || "دمنهور: 0453333313 | الرحمانية: 01111480137";
  const date = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const EYE_AR = {
    OU: "كلتا العينين",
    OD: "العين اليمنى",
    OS: "العين اليسرى"
  };
  const EYE_EN = {
    OU: "OU",
    OD: "OD",
    OS: "OS"
  };
  const grouped = {};
  Object.keys(selected).forEach(id => {
    const t = allTests.find(x => x.id === id);
    if (!t) return;
    if (!grouped[t.cat]) grouped[t.cat] = [];
    grouped[t.cat].push({
      ...t,
      eye: selected[id]
    });
  });
  const p = patient || {};
  const totalCount = Object.keys(selected).length;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>طلب فحوصات</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;}
  .page{width:210mm;min-height:160mm;margin:0 auto;padding:14mm 15mm;}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00C2FF;padding-bottom:12px;margin-bottom:16px;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .sub{font-size:11px;color:#555;margin-top:3px;}
  .badge{background:#00C2FF;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;}
  .patient-row{display:flex;gap:20px;margin-bottom:14px;padding:10px 14px;background:#f0f9ff;border-radius:8px;flex-wrap:wrap;}
  .pinfo{font-size:11px;color:#555;}
  .pinfo span{font-weight:700;color:#111;margin-right:4px;}
  .section{margin-bottom:12px;}
  .cat-title{font-size:12px;font-weight:700;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  .tests-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .test-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1.5px solid #d0eaff;border-radius:8px;background:#f8fbff;}
  .checkbox{width:18px;height:18px;border:2px solid #00C2FF;border-radius:4px;background:#00C2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .check{color:#fff;font-size:12px;font-weight:800;}
  .test-name{font-size:13px;font-weight:700;color:#111;}
  .test-ar{font-size:10px;color:#555;margin-top:1px;}
  .eye-badge{margin-right:auto;background:#e8f4ff;border:1px solid #b0d8ff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:#0066aa;direction:ltr;}
  .notes-box{background:#fffbf0;border:1.5px solid #FFB830;border-radius:8px;padding:10px 14px;margin-top:14px;}
  .notes-title{font-size:11px;font-weight:700;color:#c07800;margin-bottom:4px;}
  .footer{margin-top:16px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;padding-top:12px;}
  .sig{text-align:center;}
  .sig-line{border-top:1px solid #333;width:140px;margin:0 auto 4px;}
  .sig-name{font-size:11px;color:#444;}
  .total-badge{background:#00C2FF22;border:1px solid #00C2FF44;border-radius:10px;padding:6px 14px;font-size:12px;color:#00C2FF;font-weight:700;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div>
      <div class="clinic">👁 عيادة ${docName}</div>
      <div class="sub">استشاري طب وجراحة العيون والليزر</div>
    </div>
    <div class="badge">🩻 طلب فحوصات وإشعاعات</div>
  </div>
  <div class="patient-row">
    <div class="pinfo">المريض: <span>${p.name || "—"}</span></div>
    <div class="pinfo">رقم الملف: <span>${p.patientCode || "—"}</span></div>
    <div class="pinfo">العمر: <span>${p.age ? p.age + " سنة" : "—"}</span></div>
    <div class="pinfo">التاريخ: <span>${date}</span></div>
    ${p.phone ? `<div class="pinfo">الهاتف: <span>${p.phone}</span></div>` : ""}
  </div>
  ${Object.entries(grouped).map(([cat, tests]) => `
  <div class="section">
    <div class="cat-title">${cat}</div>
    <div class="tests-grid">
      ${tests.map(t => `
      <div class="test-item">
        <div class="checkbox"><div class="check">✓</div></div>
        <div style="flex:1">
          <div class="test-name">${t.name}</div>
          <div class="test-ar">${t.name_ar}</div>
        </div>
        <div class="eye-badge">${EYE_EN[t.eye] || t.eye || "OU"}</div>
      </div>`).join("")}
    </div>
  </div>`).join("")}
  ${notes ? `<div class="notes-box"><div class="notes-title">📝 ملاحظات وتعليمات:</div><div style="font-size:12px;color:#333;line-height:1.7">${notes}</div></div>` : ""}
  <div class="footer">
    <div class="total-badge">Total investigations ordered: ${totalCount}</div>
    <div style="font-size:9px;color:#555;text-align:right;line-height:1.8;">
      ${address ? `<div>📍 ${address}</div>` : ""}
      ${phone ? `<div>📞 ${phone}</div>` : ""}
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-name">${docName}</div>
    </div>
  </div>
</div></body></html>`;
}

export function getAccountingReportHTMLRaw(fromDate, toDate, label, revenue, expenseList, clinic, primary) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const totalExp = expenseList.reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = revenue - totalExp;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>تقرير محاسبي</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .date{font-size:12px;color:#555;margin-top:3px;}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
  .stat{background:#f0f9ff;border:1px solid #cce;border-radius:8px;padding:10px;text-align:center;}
  .stat-val{font-size:22px;font-weight:800;color:#00C2FF;}
  .stat-lbl{font-size:10px;color:#555;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  th{background:#00C2FF;color:#fff;padding:7px 10px;font-size:11px;text-align:right;}
  td{border:1px solid #ddd;padding:7px 10px;font-size:11px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .footer{margin-top:14px;border-top:2px solid #00C2FF;padding-top:10px;font-size:10px;color:#555;display:flex;justify-content:space-between;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div class="date">${label}</div></div>
    <div style="text-align:left;font-size:11px;color:#555;">تقرير محاسبي</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val" style="color:#00aa66;">${revenue.toLocaleString()}</div><div class="stat-lbl">الإيرادات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:#cc3300;">${totalExp.toLocaleString()}</div><div class="stat-lbl">المصروفات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:${net >= 0 ? '#00aa66' : '#cc3300'};">${net.toLocaleString()}</div><div class="stat-lbl">صافي الربح (ج.م)</div></div>
  </div>
  ${expenseList.length > 0 ? `<h3>سجل المصروفات</h3>
  <table><tr><th>#</th><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>ملاحظات</th></tr>
  ${expenseList.map((e, i) => `<tr><td>${i + 1}</td><td>${e.date}</td><td>${e.category}</td><td>${Number(e.amount || 0).toLocaleString()} ج.م</td><td>${e.notes || "—"}</td></tr>`).join("")}
  </table>` : `<div style="color:#777;text-align:center;padding:20px;">لا توجد مصروفات مسجلة في هذه الفترة</div>`}
  <div class="footer"><div>I App · تقرير محاسبي مبدئي</div><div>تم الإنشاء: ${new Date().toLocaleString("ar-EG")}</div></div>
</div>
</body></html>`;
}
