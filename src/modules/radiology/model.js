// Pure logic for the Radiology (Investigations & Imaging) screen.
// Kept free of DOM/React/Supabase so it can be unit tested directly.

export const DEFAULT_TESTS = [
  { id: 'oct', name: 'OCT', name_ar: 'تصوير الشبكية المقطعي', cat: 'شبكية' },
  { id: 'ffa', name: 'FFA', name_ar: 'تصوير الأوعية بالفلوريسين', cat: 'شبكية' },
  { id: 'optos', name: 'Optos', name_ar: 'تصوير قاع العين الواسع', cat: 'شبكية' },
  { id: 'octa', name: 'OCT Angio', name_ar: 'أنجيوغرافيا OCT', cat: 'شبكية' },
  { id: 'vf', name: 'Visual Field', name_ar: 'مجال الإبصار', cat: 'جلوكوما' },
  { id: 'penta', name: 'Pentacam', name_ar: 'خريطة القرنية', cat: 'قرنية' },
  { id: 'topo', name: 'Topography', name_ar: 'طبوغرافيا القرنية', cat: 'قرنية' },
  { id: 'pachy', name: 'Pachymetry', name_ar: 'قياس سماكة القرنية', cat: 'قرنية' },
  { id: 'bio', name: 'Biometry', name_ar: 'قياسات ما قبل الجراحة', cat: 'جراحة' },
  { id: 'echo', name: 'B-Scan', name_ar: 'سونار العين', cat: 'أخرى' },
  { id: 'erg', name: 'ERG', name_ar: 'كهربية الشبكية', cat: 'أخرى' },
  { id: 'ep', name: 'VEP', name_ar: 'استجابة القشرة البصرية', cat: 'أخرى' }
];

export const EYE_LABEL = { OU: 'كلتا العينين', OD: 'العين اليمنى', OS: 'العين اليسرى' };
export const EYE_SHORT = { OU: 'OU', OD: 'OD', OS: 'OS' };
export const EYE_CYCLE = { OU: 'OD', OD: 'OS', OS: 'OU' };

export function buildAllTests(customTests) {
  return [...DEFAULT_TESTS, ...(customTests || []).map(t => ({ ...t, cat: 'مخصص' }))];
}

export function buildCats(allTests) {
  return [...new Set(allTests.map(t => t.cat))];
}

export function isSelected(selected, id) {
  return id in selected;
}

export function getEye(selected, id) {
  return selected[id] || 'OU';
}

export function toggleSelection(selected, id) {
  if (id in selected) {
    const n = { ...selected };
    delete n[id];
    return n;
  }
  return { ...selected, [id]: 'OU' };
}

export function cycleEyeValue(selected, id) {
  if (!(id in selected)) return selected;
  const next = EYE_CYCLE[selected[id]] || 'OU';
  return { ...selected, [id]: next };
}

export function selectAllInCategory(selected, allTests, cat) {
  const ids = allTests.filter(t => t.cat === cat).map(t => t.id);
  const allIn = ids.every(id => isSelected(selected, id));
  const n = { ...selected };
  if (allIn) {
    ids.forEach(id => delete n[id]);
  } else {
    ids.forEach(id => {
      if (!(id in n)) n[id] = 'OU';
    });
  }
  return n;
}

export function addCustomTest(customTests, newTest) {
  if (!newTest.name) return null;
  const t = {
    id: 'custom_' + Date.now(),
    name: newTest.name,
    name_ar: newTest.name_ar || newTest.name
  };
  return { customTests: [...customTests, t], test: t };
}

export function removeCustomTest(customTests, selected, id) {
  const n = { ...selected };
  delete n[id];
  return { customTests: customTests.filter(t => t.id !== id), selected: n };
}

export function filterVisibleTests(allTests, { filterCat, search }) {
  const q = (search || '').toLowerCase();
  return allTests.filter(t => (filterCat === 'الكل' || t.cat === filterCat) &&
    (t.name.toLowerCase().includes(q) || t.name_ar.includes(search || '')));
}

export function filterPatientResults(patients, patientSearch) {
  return (patients || []).filter(p => !patientSearch ||
    (p.name || '').includes(patientSearch) ||
    (p.patientCode || '').includes(patientSearch) ||
    (p.phone || '').includes(patientSearch)
  ).slice(0, 8);
}

export function buildRequestedTests(allTests, selected) {
  return Object.keys(selected).map(id => {
    const t = allTests.find(x => x.id === id);
    return t ? {
      id: t.id,
      name: t.name,
      name_ar: t.name_ar,
      category: t.cat,
      eye: selected[id] || 'OU'
    } : null;
  }).filter(Boolean);
}

export function buildExamRecord({ selectedPatient, tests, doctorName, notes, now, timeStr }) {
  return {
    id: now,
    patientId: selectedPatient.id,
    patient: selectedPatient.name,
    date: timeStr.date,
    time: timeStr.time,
    doctor: doctorName || '',
    testType: 'طلب فحوصات',
    requestedTests: tests,
    notes: notes || '',
    status: 'requested'
  };
}
