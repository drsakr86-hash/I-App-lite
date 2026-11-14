// Drug names that appear in the clinic's "Rx in a minute" guide (src/modules/rx-guide/data.js), grouped for the
// prescription drug picker. Names are written as the guide writes them (brand + strength); eye drops carry the
// same " ED" and eye ointments the same " EO" suffix as the original list (DEFAULT_DRUGS). Systemic drugs keep the
// guide's own strength text and no form suffix. Intravitreal injections (Avastin, Lucentis, Eylea, Vabysmo, Ozurdex)
// are left out on purpose: they belong to the injections section, not to a take-home prescription.
// Drugs only the guide *mentions as a warning* (e.g. Cyclophrine) are not listed.
export const GUIDE_DRUG_GROUPS = Object.freeze([
  { key: 'drops', labelKey: 'g17.drugs.drops', drugs: [
    'Vigamox ED', 'Zymar ED', 'Oflox ED', 'Ciloxan ED', 'Levoxin ED', 'Tobrex ED', 'Tobradex ED',
    'Pred Forte 1% ED', 'FML Liquifilm ED', 'Loteranol 0.5% ED', 'Loteranol comp ED', 'Maxitrol ED',
    'Plegica 1% ED', 'Cyclopentolate 1% ED', 'Atropine 1% ED', 'Phenylephrine 2.5% ED', 'Isopto Carpine 1% ED',
    'Acular LS 0.4% ED', 'Nevanac ED',
    'Alomide ED', 'Patanol ED', 'Lastacaft ED', 'Zaditen ED', 'Azelast ED', 'Relestat ED', 'Livostin ED',
    'Timolol 0.5% ED', 'Timolol 0.25% ED', 'Brimonidine 0.2% ED', 'Alphagan P ED', 'Trusopt ED', 'Azopt ED',
    'Cosopt ED', 'Combigan ED', 'Latanoswix ED', 'Latanoswix plus ED', 'Xalatan ED', 'Lumigan ED', 'Travatan ED', 'Saflutan SDU ED',
    'Tears Guard SDU ED', 'GenTeal gel', 'Systane gel', 'Azithrochidia 1% SDU ED', 'Natamycin 5% ED', 'Benox ED'
  ] },
  { key: 'ointments', labelKey: 'g17.drugs.ointments', drugs: [
    'Tobrex EO', 'Ciprocin EO', 'Terramycin EO', 'Zovirax 3% EO', 'Maxitrol EO', 'Epiphenicol EO', 'Protopic 0.03% ointment'
  ] },
  { key: 'oral', labelKey: 'g17.drugs.oral', drugs: [
    'Augmentin 1 g', 'Amoxil 500', 'Ceporex 500', 'Zinnat 500', 'Orelox', 'Omnicef', 'Ciprocin 500', 'Avalox 400',
    'Doxymycin 100', 'Doxycost 50', 'Vibramycin 100', 'Zithromax 500', 'Klacid 500', 'Erythrocin 250', 'Dalacin C 300',
    'Sutrim Forte', 'Septrin DS', 'Valtrex 500', 'Zovirax 400', 'Acyclovir 800 Stada', 'Itranox 100', 'Diflucan', 'Vfend 200',
    'Hostacortin 5 mg', 'Imuran 50', 'Dapsone 50', 'Plaquenil 200', 'Valcyte 450',
    'Cidamex 250', 'Panadol', 'Omez 20', 'Omez 40', 'Controloc 40', 'Panadol 500', 'Naprosyn 500', 'Brufen 400', 'Froben 100', 'Indocid 25',
    'Mestinon 60', 'Inderal 10', 'Claritine 10', 'Osteocare', 'Vitacid C 1 g', 'Neurovit', 'Selenium 200 mcg', 'A-Viton 50,000'
  ] },
  { key: 'syrup', labelKey: 'g17.drugs.syrup', drugs: [
    'Augmentin syrup', 'Erythrocin 200 mg/5 ml syrup', 'Zithromax 200 mg/5 ml syrup'
  ] },
  { key: 'iv', labelKey: 'g17.drugs.iv', drugs: [
    'Zinol 1 g vial', 'Fortum 1 g vial', 'Cefaxone 1 g vial', 'Cefaxone 2 g vial', 'Unasyn 3 g vial', 'Tazocin 4.5 g vial',
    'Vancomycine Viatris 1 g vial', 'Gentamicin 80 mg/2 ml amp', 'Amikin amp', 'Moxiflox 400 mg infusion', 'Flagyl 0.5% infusion',
    'Solu-Medrol 500 vial', 'Solu-Medrol 1 g vial', 'Zovirax 500 mg IV vial', 'Cymevene 500 vial', 'Mannitol 20% infusion',
    'AmBisome vial', 'Fungizone vial', 'Kenacort-A amp', 'Epidron 4 mg/ml amp', 'Depovit B amp', 'Zofran'
  ] },
  { key: 'other', labelKey: 'g17.drugs.other', drugs: [
    'Afrin 0.05% nasal', 'Nasonex nasal', 'Skinoren cream', 'Licid lotion'
  ] }
]);

export const GUIDE_DRUGS = Object.freeze(GUIDE_DRUG_GROUPS.flatMap(g => g.drugs));
