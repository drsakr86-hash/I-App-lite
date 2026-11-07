// The blank canvas: an empty plate for free drawing (pen, arrow, text) and for drawing over an image the doctor adds
// from outside (see background.js). It has no anatomy and nothing to approve, so it carries no clinical content.
export default {
  id: 'blank-canvas',
  blank: true,
  title: { ar: 'لوحة فارغة', en: 'Blank canvas' },
  subtitle: { ar: 'رسم حر أو فوق صورة تضيفها', en: 'Free drawing, or over an image you add' },
  viewBox: [0, 0, 1200, 800],
  status: 'approved',
  source: { type: 'original', author: 'Sakr Eye Clinic / I-App-lite', license: 'Original project artwork (all rights reserved by the clinic)' },
  references: ['Empty canvas: no anatomical content'],
  decor: [],
  parts: []
};
