// Rule-based differential diagnosis and work-up for the special-case sheets.
// Decision support only: it lists what to consider from the findings already ticked; the
// clinician decides. Pure module (no React / DOM), unit-testable.
//
// suggest(caseId, values) -> { ddx: string[], workup: string[] } (empty until a finding is filled).

import { normalizeCase, caseIsEmpty } from './model.js';
import { asciiDigits } from '../patient-file/ophth.js';

const has = v => typeof v === 'string' && v.trim() !== '';
// Free-text fields typed as a normal / negative finding ("Full", "normal", "nil", "طبيعي", "لا يوجد", Ishihara "17/17")
// must not trigger a differential: only an abnormal entry counts.
const NORMAL_WORDS = /^(normal|nl|full|free|full and free|ortho|orthophoria|none|nil|no|not present|absent|ok|n\/?a|-+|—|طبيعي|طبيعى|سليم|سليمة|كامل|كاملة|كاملة وحرة|حرة|لا|لا يوجد|لايوجد|لا شيء|لا شئ)$/i;
export const isNormalText = v => {
  const s = asciiDigits(v == null ? '' : v).trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  if (!s || NORMAL_WORDS.test(s)) return true;
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s); // full plate score, e.g. Ishihara 17/17 or 21/21
  return !!frac && Number(frac[2]) > 0 && frac[1] === frac[2];
};
const abnormal = v => has(v) && !isNormalText(v);
const eyesOf = v => [v.od, v.os].filter(has);
const anyEye = (v, ...vals) => eyesOf(v).some(x => vals.includes(x));
const bothEyes = (v, ...vals) => vals.includes(v.od) && vals.includes(v.os);
const num = s => { const m = asciiDigits(s || '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : NaN; }; // Arabic digits accepted

function uveitis(v) {
  const ddx = []; const w = [];
  const granulomatous = anyEye(v.kp, 'Mutton-fat');
  if (v.location === 'Anterior') {
    if (granulomatous) ddx.push('Sarcoidosis', 'Tuberculosis', 'Syphilis', 'HSV / VZV anterior uveitis', 'VKH (early)');
    else ddx.push('HLA-B27 associated AAU (ankylosing spondylitis, reactive arthritis, IBD, psoriasis)', 'Idiopathic anterior uveitis', 'HSV / VZV anterior uveitis');
    if (v.course === 'Chronic') ddx.push('JIA-associated uveitis (children)', 'Fuchs uveitis syndrome');
    w.push('HLA-B27');
    if (v.course === 'Chronic') w.push('ANA (children / JIA)');
  }
  if (v.location === 'Intermediate') {
    ddx.push('Pars planitis (idiopathic)', 'Multiple sclerosis', 'Sarcoidosis', 'Tuberculosis', 'Syphilis', 'Intraocular lymphoma (age > 50)');
    w.push('MRI brain (demyelination)', 'Serum ACE + lysozyme');
  }
  if (v.location === 'Posterior') {
    ddx.push('Toxoplasma retinochoroiditis', 'Tuberculosis', 'Syphilis', 'Sarcoidosis', 'VKH', 'Behçet disease', 'Viral retinitis (ARN / CMV)', 'White dot syndromes');
    w.push('Toxoplasma IgG / IgM', 'HIV serology', 'FFA ± ICGA', 'OCT macula');
  }
  if (v.location === 'Panuveitis') {
    ddx.push('VKH', 'Behçet disease', 'Sarcoidosis', 'Tuberculosis', 'Syphilis', 'Sympathetic ophthalmia', 'Endophthalmitis');
    w.push('FFA ± ICGA', 'HIV serology', 'HLA-B51');
  }
  if (anyEye(v.kp, 'Stellate')) ddx.push('Fuchs uveitis syndrome', 'HSV / VZV / CMV anterior uveitis', 'Toxoplasmosis');
  if (granulomatous) w.push('Serum ACE + lysozyme', 'Chest CT if chest X-ray normal and sarcoid suspected');
  if (anyEye(v.hypopyon, 'Present')) {
    ddx.push('HLA-B27 associated AAU', 'Behçet disease', 'Infective endophthalmitis', 'Masquerade (lymphoma / retinoblastoma)');
    w.push('HLA-B51', 'Vitreous tap + culture if post-operative or trauma');
  }
  if (v.laterality === 'Bilateral' && v.location === 'Anterior') ddx.push('Sarcoidosis', 'TINU syndrome', 'JIA');
  if (anyEye(v.cme, 'Present')) w.push('OCT macula', 'FFA');
  if (anyEye(v.vitreousHaze, '3+', '4+')) w.push('B-scan ultrasound (no fundus view)');
  // Baseline for every uveitis work-up.
  w.unshift('CBC', 'ESR / CRP', 'Syphilis serology (VDRL + TPHA)', 'QuantiFERON-TB Gold', 'Chest X-ray');
  return { ddx, workup: w };
}

function neuro(v) {
  const ddx = []; const w = [];
  const rapd = anyEye(v.rapd, '1+', '2+', '3+', '4+');
  if (bothEyes(v.disc, 'Swollen', 'Hyperaemic')) {
    ddx.push('Papilloedema (raised ICP: IIH, mass, venous sinus thrombosis)', 'Malignant hypertension', 'Bilateral optic neuritis');
    w.push('Blood pressure (urgent)', 'Urgent MRI brain + MR venography', 'Lumbar puncture with opening pressure (after imaging)');
  } else if (anyEye(v.disc, 'Swollen', 'Hyperaemic')) {
    ddx.push('Optic neuritis (papillitis)', 'NAION', 'Arteritic AION (giant cell arteritis, age > 50)', 'Compressive / infiltrative optic neuropathy', 'Diabetic papillopathy');
    w.push('MRI brain + orbits with contrast', 'ESR / CRP + platelets (GCA if > 50)', 'Blood pressure, blood sugar, lipids', 'AQP4 + MOG antibodies');
  }
  if (rapd && (!eyesOf(v.disc).length || anyEye(v.disc, 'Normal'))) {
    ddx.push('Retrobulbar optic neuritis', 'Compressive optic neuropathy', 'Traumatic optic neuropathy');
    w.push('MRI brain + orbits with contrast');
  }
  if (anyEye(v.disc, 'Pale', 'Temporal pallor')) {
    ddx.push('Previous optic neuritis', 'Compressive optic neuropathy', 'Toxic / nutritional optic neuropathy', 'Hereditary optic neuropathy (LHON / DOA)');
    w.push('MRI brain + orbits with contrast', 'Vitamin B12 + folate', 'LHON mtDNA testing (young, bilateral, sequential)');
  }
  if (anyEye(v.field, 'Hemianopia', 'Quadrantanopia')) {
    ddx.push('Chiasmal lesion (pituitary adenoma, craniopharyngioma, meningioma)', 'Retrochiasmal lesion (stroke, tumour)');
    w.push('MRI brain with contrast (sella + visual pathway)', 'Pituitary hormone profile if bitemporal');
  }
  if (anyEye(v.field, 'Central scotoma')) { ddx.push('Optic neuritis', 'Toxic / nutritional optic neuropathy', 'LHON', 'Maculopathy'); w.push('OCT macula + GCL'); }
  if (anyEye(v.field, 'Altitudinal')) { ddx.push('NAION', 'Branch retinal artery occlusion'); w.push('ESR / CRP (GCA)', 'Carotid Doppler'); }
  if (anyEye(v.field, 'Enlarged blind spot')) ddx.push('Papilloedema', 'MEWDS / AZOOR');
  if (anyEye(v.field, 'Constricted')) ddx.push('Advanced glaucoma', 'Retinitis pigmentosa', 'Functional visual loss');
  const ptosis = anyEye(v.ptosis, 'Mild', 'Moderate', 'Severe');
  if (anyEye(v.pupil, 'Fixed dilated')) {
    ddx.push(ptosis ? 'Third nerve palsy (compressive: posterior communicating aneurysm)' : 'Pharmacological mydriasis', 'Adie tonic pupil');
    if (ptosis) w.push('URGENT CT angiography / MR angiography');
    else w.push('Pilocarpine 0.1% / 1% test');
  }
  if (anyEye(v.pupil, 'Miotic') && ptosis) {
    ddx.push('Horner syndrome (carotid dissection, apical lung tumour)');
    w.push('Apraclonidine test', 'MRI / MRA head + neck', 'Chest CT (lung apex)');
  }
  if (ptosis && !anyEye(v.pupil, 'Fixed dilated', 'Miotic')) {
    ddx.push('Ocular myasthenia gravis', 'Aponeurotic (involutional) ptosis');
    w.push('Ice-pack test', 'AChR + anti-MuSK antibodies', 'CT chest (thymoma)');
  }
  if (abnormal(v.motility)) {
    ddx.push('Cranial nerve palsy (III / IV / VI)', 'Thyroid eye disease', 'Myasthenia gravis', 'Orbital lesion');
    w.push('Blood pressure + blood sugar', 'Thyroid function + TRAb', 'MRI if young, multiple nerves, or pupil involved');
  }
  if (has(v.nystagmus) && v.nystagmus !== 'None') {
    ddx.push(v.nystagmus === 'Vertical' ? 'Brainstem / cerebellar lesion (vertical nystagmus)' : 'Congenital / infantile nystagmus', 'Vestibular disease', 'Drug toxicity');
    w.push('MRI brain (posterior fossa)', 'Neurology referral');
  }
  if ([v.color.od, v.color.os].some(abnormal) && !ddx.length) ddx.push('Optic nerve dysfunction', 'Congenital colour vision defect');
  if (ddx.length) w.push('Formal perimetry (24-2)', 'OCT RNFL + GCL');
  return { ddx, workup: w };
}

function squint(v) {
  const ddx = []; const w = [];
  const byType = {
    Esotropia: ['Refractive accommodative esotropia', 'High AC/A (non-refractive accommodative)', 'Infantile esotropia', 'Sixth nerve palsy', 'Duane retraction syndrome'],
    Exotropia: ['Intermittent exotropia', 'Sensory exotropia (poor-vision eye)', 'Convergence insufficiency', 'Third nerve palsy'],
    Hypertropia: ['Fourth nerve palsy', 'Thyroid eye disease', 'Skew deviation', 'Brown syndrome', 'Orbital floor fracture'],
    Hypotropia: ['Thyroid eye disease (inferior rectus)', 'Orbital floor fracture', 'Double elevator palsy', 'Contralateral fourth nerve palsy'],
    Esophoria: ['Decompensating esophoria', 'Divergence insufficiency'],
    Exophoria: ['Decompensating exophoria', 'Convergence insufficiency']
  };
  if (byType[v.type]) ddx.push(...byType[v.type]);
  if (v.type === 'Esotropia') w.push('AC/A ratio');
  if (v.type === 'Exotropia' || v.type === 'Exophoria') w.push('Near point of convergence', 'Fusional vergence (prism bar)');
  if (v.type === 'Hypertropia' || v.type === 'Hypotropia') w.push('Parks-Bielschowsky 3-step test', 'Hess / Lees screen', 'Thyroid function + TRAb', 'CT orbits if trauma');
  if (v.pattern === 'A pattern' || v.pattern === 'V pattern') ddx.push('Oblique muscle dysfunction (' + v.pattern + ')');
  if (has(v.amblyopia) && v.amblyopia !== 'None') { ddx.push('Strabismic / refractive / deprivation amblyopia'); w.push('Media + fundus check (exclude deprivation)'); }
  if (abnormal(v.headPosture)) { ddx.push('Ocular torticollis (incomitant strabismus / nystagmus null point)'); w.push('Bielschowsky head-tilt test'); }
  if (v.constancy === 'Constant' && (v.type === 'Esotropia' || v.type === 'Exotropia') && v.amblyopia && v.amblyopia !== 'None') ddx.push('Sensory strabismus (check retinoblastoma / cataract in a child)');
  if (ddx.length || has(v.pdNear) || has(v.pdDistance)) {
    w.unshift('Alternate prism cover test (near + distance)', 'Cycloplegic refraction', 'Dilated fundus examination');
    w.push('Adult acquired: blood pressure, blood sugar, MRI if neurological signs');
  }
  return { ddx, workup: w };
}

function glaucoma(v) {
  const ddx = []; const w = [];
  const byType = {
    POAG: ['Normal-tension glaucoma', 'Ocular hypertension', 'Pseudoexfoliation glaucoma', 'Pigmentary glaucoma', 'Steroid-induced glaucoma'],
    PACG: ['Pupil-block angle closure', 'Plateau iris', 'Phacomorphic glaucoma', 'Malignant glaucoma (post-op)'],
    'PAC / PACS': ['Pupil-block angle closure', 'Plateau iris configuration'],
    NTG: ['Compressive optic neuropathy', 'Previous ischaemic optic neuropathy', 'Undetected high IOP (diurnal peaks, thin CCT)'],
    Secondary: ['Pseudoexfoliation', 'Pigment dispersion', 'Neovascular glaucoma', 'Uveitic glaucoma', 'Steroid-induced', 'Angle recession (trauma)'],
    Suspect: ['Physiological large cup', 'Early POAG', 'Tilted / myopic disc'],
    'Ocular hypertension': ['Thick cornea (overestimated IOP)', 'Early POAG', 'Steroid response']
  };
  if (byType[v.type]) ddx.push(...byType[v.type]);
  const narrow = anyEye(v.gonio, 'Shaffer 0', 'Shaffer 1');
  if (narrow || v.type === 'PACG' || v.type === 'PAC / PACS') w.push('Indentation gonioscopy', 'AS-OCT / UBM', 'Biometry (axial length, lens thickness)', 'Laser peripheral iridotomy assessment');
  const cds = eyesOf(v.cd).map(Number).filter(Number.isFinite);
  if (cds.some(x => x >= 0.7) || (cds.length === 2 && Math.round(Math.abs(cds[0] - cds[1]) * 100) / 100 > 0.2)) ddx.push('Glaucomatous optic neuropathy (C/D ≥ 0.7 or asymmetry > 0.2)');
  if (anyEye(v.discHaem, 'Present')) ddx.push('Progressing glaucoma (disc haemorrhage)');
  if (v.type === 'NTG') w.push('MRI brain / orbits if atypical (pallor, young, field not matching disc)', '24-hour blood pressure', 'Vitamin B12');
  if (eyesOf(v.cct).some(x => num(x) < 500)) ddx.push('IOP underestimated (thin cornea)');
  if (ddx.length || v.type) {
    w.unshift('Diurnal IOP phasing', 'Gonioscopy', 'Central corneal thickness', 'Visual field 24-2 (+ 10-2 if central)', 'OCT RNFL + GCC', 'Optic disc photographs');
  }
  return { ddx, workup: w };
}

function dr(v) {
  const ddx = []; const w = [];
  const pdr = anyEye(v.grade, 'PDR', 'High-risk PDR');
  const dme = anyEye(v.dme, 'Non-centre', 'Centre-involving');
  if (eyesOf(v.grade).some(x => x !== 'No DR') || dme) {
    ddx.push('Hypertensive retinopathy', 'Retinal vein occlusion (CRVO / BRVO)', 'Ocular ischaemic syndrome (asymmetric)', 'Radiation retinopathy');
    if (pdr) ddx.push('Sickle-cell retinopathy', 'Retinal vasculitis (Eales disease)');
    if (dme) ddx.push('Post-operative CME (Irvine-Gass)', 'Uveitic CME', 'Epiretinal membrane / vitreomacular traction');
    w.push('HbA1c', 'Blood pressure', 'Lipid profile', 'Renal function (creatinine, eGFR, urine albumin)', 'OCT macula');
  }
  if (pdr || dme) w.push('FFA (ischaemia, leakage, NV)');
  if (pdr) w.push('Gonioscopy (NVA)', 'B-scan if vitreous haemorrhage', 'Wide-field FFA / OCT-A if available');
  if (anyEye(v.dme, 'Centre-involving')) w.push('Baseline CMT for anti-VEGF follow-up');
  if (bothEyes(v.grade, 'No DR') && !dme) w.push('HbA1c', 'Annual dilated fundus examination');
  return { ddx, workup: w };
}

const RULES = { uveitis, neuro, squint, glaucoma, dr };
const uniq = list => [...new Set(list)];

export function suggest(caseId, values) {
  const rule = RULES[caseId];
  if (!rule || caseIsEmpty(caseId, values)) return { ddx: [], workup: [] };
  const v = normalizeCase(caseId, values);
  const { ddx, workup } = rule(v);
  return { ddx: uniq(ddx), workup: uniq(workup) };
}

// Line appended to the treatment plan by the form's button (idempotent).
export const workupLine = list => (list.length ? 'Work-up: ' + list.join(', ') : '');
export function appendWorkup(plan, list) {
  const line = workupLine(list);
  const cur = plan == null ? '' : String(plan);
  if (!line || cur.includes(line)) return cur;
  return cur.trim() ? cur.replace(/\s+$/, '') + '\n' + line : line;
}
