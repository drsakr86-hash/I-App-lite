// Ready-made replies for the secretary inbox. Tapping one puts the text in the reply box; the secretary can edit it before sending.
// Clinic facts here come from the clinic owner (2026-10-22). Opening hours are intentionally NOT included until the schedule is confirmed.
export const QUICK_REPLIES = [
  { id: 'welcome', label: 'ترحيب', text: 'أهلًا بحضرتك في عيادات صقر للعيون. نسعد بخدمتكم، تحب نساعدك في إيه؟' },
  { id: 'book', label: 'حجز', text: 'تحب تحجز في أنهي فرع (دمنهور / الرحمانية / مركز دمنهور للعيون)؟ وفي أنهي يوم؟' },
  { id: 'address', label: 'العناوين', text: 'الرحمانية: شارع أحمد محمود بجوار فرع we.\nدمنهور: برج المنتزه بجوار حديقة الجمهورية، أمام بنك مصر.\nمركز دمنهور للعيون: شارع عبدالسلام الشاذلي بجوار مدرسة الصفوة.' },
  { id: 'prices', label: 'الأسعار', text: 'الرحمانية: الكشف 150 جنيهًا والإعادة 50.\nدمنهور: الكشف 300 جنيه والإعادة 100.\nمركز دمنهور للعيون: الكشف 280 جنيهًا.' },
  { id: 'urgent', label: 'طوارئ', text: 'لإصابات العين الطارئة تواصل على رقم الطوارئ على واتساب: 01007818980. وإن كانت الحالة شديدة توجّه لأقرب طوارئ.' },
  { id: 'soon', label: 'سنتواصل', text: 'سنتواصل معكم قريبًا.' },
  { id: 'thanks', label: 'ختام', text: 'نسعد بخدمتكم.' }
];

// Adds a ready reply to what is already typed (on a new line), never exceeding the box limit.
export function applyQuickReply(draft, text, max = 4000) {
  const cur = String(draft || '').trimEnd();
  const out = cur ? cur + '\n' + text : text;
  return out.length > max ? cur : out;
}
