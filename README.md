# I-App-lite

نظام إدارة عيادة العيون (عيادات سقر). واجهة عربية RTL، قاعدة بيانات Supabase، تعمل أوفلاين.

## التشغيل والنشر
- التطوير: `npm ci && npm run dev`
- الاختبارات: `npm test`
- البناء: `npm run build` (الناتج في `dist/`)
- النشر: أي push على `main` يشغّل GitHub Actions (اختبارات ثم بناء ثم GitHub Pages).
  الرابط: https://drsakr86-hash.github.io/I-App-lite/

## هيكل المشروع
- `src/main.jsx`: نقطة الدخول. تجهّز `globalThis.IAppModules` (الجسر بين الكود القديم والوحدات الجديدة) ثم تحمّل الواجهة القديمة.
- `src/services/`: عميل Supabase المشترك، استدعاءات RPC (مهلة، إعادة محاولة، منع التكرار)، حماية الجلسة `auth.js`، التخزين.
- `src/modules/`: patients, visits, examinations, prescriptions, investigations, imaging, appointments (تحويل الصفوف، فروق التعديل، إنهاء الطابور بعد الكشف).
- `src/app/permissions.js`: مصفوفة الصلاحيات حسب الدور.
- `public/legacy/app-runtime.js`: الواجهة الأصلية (~20 ألف سطر)، يُنقل منها تدريجيًا إلى `src/`.
- `public/sw.js`: Service Worker للعمل بدون إنترنت.
- `public/queue-display.html`: شاشة نداء المرضى (تقرأ الطابور العام بدون تسجيل دخول).
- `tests/`: اختبارات `node --test`.
- `docs/`: ملاحظات المراحل السابقة.

## الأمان (قاعدة البيانات)
- الدخول بحسابات Supabase Auth فقط، والتسجيل العام مقفول.
- الوصول للجداول مقصور على الحسابات المسجلة في `iapp_staff` (الدالة `iapp_is_staff()`).
- الزوار (anon) يستطيعون فقط: إضافة طلب حجز، قراءة طابور اليوم، قراءة المواعيد المحجوزة (دون بيانات مرضى).

## الرجوع للنسخة القديمة
الوسم `old-main` يشير لآخر نسخة قبل ترحيل Vite (الملف الواحد الأصلي داخل تاريخ git).
