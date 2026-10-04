// Explicit clinical chain for investigations (pure: no React/DOM/Supabase):
//
//   Visit -> Investigation request -> Imaging order -> Imaging study -> Image(s) -> Report / result
//
// so the file can answer WHY it was ordered, WHEN it was done, WHICH visit, WHO ordered it,
// WHERE the images and the report are, and WHAT the result says.
//
// Linking rules (stable identifiers only -- never patient name, test name or "same date"):
//   request  <-> legacy order   : request.imagingOrderId === order.id   OR order.sourceExamId === request.id
//   request  <-> image (legacy) : image.orderId is one of the request's legacy order ids
//   request  <-> image (Core)   : image.coreOrderId === request.coreInvestigationOrderId
//                                 (study.order_id carries the investigation order id)
//   request  <-> visit          : request.visitId / coreVisitId === visit._coreId / visit.id
// Every link records its `basis`, so the UI can show how it was established. Anything that
// cannot be established is listed in `gaps` rather than guessed.

const str = v => (v == null ? '' : String(v));
const present = v => v !== undefined && v !== null && String(v) !== '';
const day = v => str(v).slice(0, 10);
const sameId = (a, b) => present(a) && present(b) && String(a) === String(b);

export const PENDING_STATUSES = Object.freeze(['requested', 'pending', 'ordered', 'scheduled', 'in_progress', 'new', 'waiting']);
export const DONE_STATUSES = Object.freeze(['completed', 'reported', 'done', 'available', 'finished']);
export const CANCELLED_STATUSES = Object.freeze(['cancelled', 'canceled', 'rejected']);

export function statusGroup(status) {
  const s = str(status).trim().toLowerCase();
  if (DONE_STATUSES.includes(s)) return 'done';
  if (CANCELLED_STATUSES.includes(s)) return 'cancelled';
  if (!s || PENDING_STATUSES.includes(s)) return 'pending';
  return 'other';
}

function testNames(req) {
  const t = Array.isArray(req.requestedTests) ? req.requestedTests : [];
  const names = t.map(x => str(x && (x.name || x.name_ar || x.id))).filter(Boolean);
  return names.length ? names : [str(req.testType) || 'Investigation'];
}

function findVisit(req, visits) {
  const ids = [req.visitId, req.coreVisitId, req._coreVisitId].filter(present);
  if (!ids.length) return null;
  for (const v of Array.isArray(visits) ? visits : []) {
    if (ids.some(id => sameId(id, v._coreId) || sameId(id, v.id))) return v;
  }
  return null;
}

export function buildInvestigationLinks({ requests = [], images = [], imagingOrders = [], visits = [], today = '' } = {}) {
  const orders = Array.isArray(imagingOrders) ? imagingOrders : [];
  const imgs = Array.isArray(images) ? images : [];
  const claimed = new Set();

  // The same request id can arrive twice (legacy + Core copies); the chain is built once per id.
  const seenReq = new Set();
  const uniqueRequests = (Array.isArray(requests) ? requests : []).filter(r => {
    if (!r || typeof r !== 'object') return false;
    if (!present(r.id)) return true;
    const k = String(r.id);
    if (seenReq.has(k)) return false;
    seenReq.add(k);
    return true;
  });

  const chains = uniqueRequests.map(req => {
    // ---- legacy order ids that belong to this request
    const legacyOrders = orders.filter(o => sameId(o.sourceExamId, req.id) || sameId(o.id, req.imagingOrderId) ||
      (present(req.coreImagingOrderId) && sameId(o.coreImagingOrderId, req.coreImagingOrderId)));
    const legacyIds = new Set([req.imagingOrderId, ...legacyOrders.map(o => o.id)].filter(present).map(String));

    // ---- images
    const linked = [];
    imgs.forEach((img, idx) => {
      const basis = [];
      if (present(img.orderId) && legacyIds.has(String(img.orderId))) basis.push('legacy-order');
      if (present(img.coreOrderId) && sameId(img.coreOrderId, req.coreInvestigationOrderId)) basis.push('core-investigation-order');
      if (basis.length) { linked.push({ image: img, basis }); claimed.add(idx); }
    });

    const visit = findVisit(req, visits);
    const reports = linked.filter(l => present(l.image.report) && str(l.image.report).trim()).map(l => ({
      text: str(l.image.report).trim(), imageId: l.image.id, studyId: l.image.coreStudyId || null, date: day(l.image.date)
    }));
    const result = str(req.resultSummary).trim();

    const dates = linked.map(l => day(l.image.date)).filter(Boolean).sort();
    const performedDate = dates[0] || day(req.completedAt) || '';
    const group = statusGroup(req.status);
    const done = group === 'done' || linked.length > 0;

    const gaps = [];
    if (!str(req.notes).trim()) gaps.push('no-reason');
    if (!str(req.doctor).trim()) gaps.push('no-orderer');
    if (!visit) gaps.push(present(req.visitId) || present(req.coreVisitId) ? 'visit-not-in-file' : 'no-visit');
    if (done && !linked.length) gaps.push('no-images');
    if (done && !reports.length && !result) gaps.push('no-report');
    if (req.coreSyncError) gaps.push('core-sync-pending');

    return {
      key: 'req:' + str(req.id),
      requestId: req.id,
      tests: testNames(req),
      eyes: [...new Set((Array.isArray(req.requestedTests) ? req.requestedTests : []).map(t => str(t && t.eye)).filter(Boolean))],
      status: str(req.status) || 'requested',
      statusGroup: done && group === 'pending' ? 'done' : group,
      why: str(req.notes).trim(),
      orderedDate: day(req.date),
      orderedTime: str(req.time),
      orderedBy: str(req.doctor).trim(),
      visit: visit ? { id: visit.id, coreId: visit._coreId || null, date: day(visit.date), type: str(visit.type), doctor: str(visit.doctor) } : null,
      visitRef: present(req.visitId) ? String(req.visitId) : (present(req.coreVisitId) ? String(req.coreVisitId) : null),
      performedDate,
      images: linked.map(l => ({ ...l.image, _linkBasis: l.basis })),
      report: reports[0] || null,
      reports,
      result: result || null,
      pendingDays: !done && group === 'pending' && day(req.date) && today ? daysBetween(day(req.date), today) : null,
      sources: Array.isArray(req._sources) ? req._sources : [],
      gaps
    };
  });

  const orphanImages = imgs.filter((_, idx) => !claimed.has(idx));
  return { chains, orphanImages };
}

function daysBetween(a, b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const n = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
  return n(b) - n(a);
}

export const GAP_LABEL = Object.freeze({
  'no-reason': 'سبب الطلب غير مسجل',
  'no-orderer': 'الطبيب الطالب غير مسجل',
  'no-visit': 'غير مرتبط بزيارة',
  'visit-not-in-file': 'الزيارة المرتبطة غير ظاهرة في الملف',
  'no-images': 'لا توجد صور مرتبطة بالطلب',
  'no-report': 'لا يوجد تقرير أو نتيجة مسجلة',
  'core-sync-pending': 'لم يُزامَن مع السجل المركزي بعد'
});

export const BASIS_LABEL = Object.freeze({
  'legacy-order': 'رقم طلب التصوير المحلي',
  'core-investigation-order': 'رقم الطلب في السجل المركزي'
});
