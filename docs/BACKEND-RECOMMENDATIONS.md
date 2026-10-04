# توصيات الواجهة الخلفية — غير مطبَّقة

كل ما هنا 💡 RECOMMENDED. لم يُنفَّذ شيء منه على Supabase.

## 1. دراسات تصويرية متعددة الملفات (P1-1b)
`iapp_create_imaging_study` يبحث عن دراسة بنفس `order_id` ويُرجعها دون إدراج، فتضيع الصورة الثانية في Core (تبقى في بيانات الصور المحلية). المطلوب: دالة `iapp_add_imaging_study_file(p_study_id, p_file)` أو تمرير كل الملفات في استدعاء واحد (`p_files`). حتى يحدث ذلك الواجهة تعرض كل الصور المحلية المرتبطة بالطلب، ولا تعتمد على Core وحده.

## 2. بوابة المريض (P0-6)
لا تُفعَّل (`KIOSK_EMAIL=''`) قبل دالة `SECURITY DEFINER` تُرجع بيانات **مريض واحد فقط** يُستنتج من هوية الجلسة (لا من معامل يرسله العميل)، مع حدّ معدّل للطلبات. دالة العرض `patient-facing.js` جاهزة ولا تكشف أي بيانات سريرية داخلية.

## 3. الأدوار والـ RLS (P0-1/P0-2) → `sql/NOT-APPLIED-role-rls.sql`
## 4. أعمدة منظّمة للفحص → `sql/NOT-APPLIED-structured-ophthalmology.sql`
## 5. إعدادات لوحة التحكم: تفعيل Leaked-password protection؛ مراجعة View `iapp_slots_taken` (SECURITY DEFINER).
## 6. `iapp_staff`: سحب INSERT/UPDATE/DELETE من `authenticated` (موجود معلّقًا في ملف الأدوار).
