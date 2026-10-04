# تدقيق المستودع — مرحلة التحسين السريري (Phase 1)

تاريخ التدقيق: 2026-10-04 · المصدر: `I-App-lite-latest.zip` (نفس شجرة `I-App-lite-source-20261002`) · المدقِّق: Claude

> هذا الملف كُتب **قبل** أي تعديل على الكود. عمود «الحالة» يُحدَّث في نهاية المرحلة،
> والنتيجة النهائية الكاملة في `PHASE-CLINICAL-REFINEMENT-FINAL.md`.
> المفردات: ✅ IMPLEMENTED · 🧪 VERIFIED · ⚠️ REQUIRES LIVE VERIFICATION · 🔴 BLOCKED · 💡 RECOMMENDED

## 0. خط الأساس (نُفِّذ فعليًا قبل أي تعديل)

| الأمر | النتيجة |
|---|---|
| `npm install` | نجح (36 حزمة) |
| `npm test` | 620 اختبارًا: 620 ناجح، 0 فاشل |
| `npm run build` | نجح — حزمة JS واحدة **831.80 kB** (gzip 224.94 kB)، تحذير Vite بتجاوز 500 kB |
| `npm run test:smoke` | نجح — 9 تبويبات + 4 نوافذ |

حجم الكود: 10,561 سطرًا في `src/**/*.jsx`+`*.js` الرئيسية، **1,417** موضع `style={{`، 54 عنصر `div/span` قابل للنقر، 20 `role=` و5 `aria-label` فقط.

## 1. ما فُحص فعليًا

الكود: `src/screens/PatientFile*.jsx` و`patient-file/*`، `modules/patient-file/*` (normalize, hook, request-workflow, exam-core-sync)، `modules/sync/*` (engine, flush, wiring, store-io)، `modules/auth/*`، `services/*`، `app/permissions.js`، `components/common.jsx`، `modules/theme`، `public/sw.js`، `screens/PatientApp.jsx`، وثائق `docs/*`.

قاعدة البيانات الحيّة (مشروع `mofdveiwlaymlabvsypu`) — **قراءة فقط، بيانات وصفية فقط، لم تُقرأ أي سجلات مرضى ولم يُعدَّل شيء**:
`pg_policies`، `pg_class.relrowsecurity`، صلاحيات `anon/authenticated` على الدوال والجداول، تعريف `iapp_is_staff/iapp_is_admin` و`iapp_get_patient_360_timeline`، أعمدة جداول Core، وتقرير `get_advisors(security)`.

## 2. النتائج

### P0 — يجب إصلاحه قبل الإنتاج

| # | النتيجة | الدليل | الحالة |
|---|---|---|---|
| P0-1 | **لا فصل صلاحيات في الخادم للبيانات السريرية.** `iapp_store` و`iapp_visits` و`iapp_appointments` سياستها `iapp_is_staff()` لـ ALL، أما جداول Core فسياستها `authenticated_full_access_*` أي **أي مستخدم مُصادَق** (أوسع من staff؛ 🧪 `pg_policies` أُعيد فحصه في نهاية المرحلة). السكرتارية (3 حسابات) تستطيع قراءة/كتابة الفحوص والوصفات والتشخيصات مباشرة عبر PostgREST. الفصل الوحيد في الخادم: `iapp_expenses`, `iapp_recurring_expenses` ومفتاحا `iapp_expenses/iapp_recurring_expenses` في `iapp_store` (admin فقط). | 🧪 `pg_policies` الحيّ | 🔴 BLOCKED BY BACKEND — SQL جاهز **غير مطبَّق** في `docs/sql/NOT-APPLIED-role-rls.sql` |
| P0-2 | **الدور في المتصفح يُقرأ من سجل قابل للكتابة.** `resolveProfile` يقرأ الدور من `iapp_users` (مفتاح في `iapp_store` يكتبه أي موظف). يمكن لسكرتير رفع نفسه إلى admin من واجهة المتصفح. | الكود + سياسة `staff_write` | ✅ تخفيف جزئي: عند الدور المحلي `admin` يُتحقَّق من `iapp_is_admin()` في الخادم (دالة موجودة ومؤكدة) ويُخفَّض الدور عند الرفض الصريح. الحماية الكاملة تحتاج P0-1 |
| P0-3 | **ترقية تلقائية إلى admin عند فشل قراءة المستخدمين.** `noAccounts = !users.some(email)` حتى لو فشلت/انتهت مهلة `pullUsers` (5 ث). أي موظف يسجّل دخوله في تلك اللحظة يصبح admin محليًا. | `staff-login.js` `resolveProfile` | ✅ يُسمح بإنشاء أول مدير فقط إذا نجحت قراءة الخادم وكانت فارغة فعلًا |
| P0-4 | **بيانات المرضى (PHI) تبقى في `localStorage` بعد تسجيل الخروج** (`iapp_patients`, `iapp_visits`, `iapp_exams`, `iapp_prescriptions`, `iapp_appointments`, `iapp_imgmeta_*` …). `sbSignOut` يحذف التوكن فقط. جهاز مشترك = تسرّب. | `staff-login.js`, `UnifiedRouter.logout` | ✅ تنظيف عند الخروج لكل ما ليس «dirty» (لا يُفقد أي تغيير غير متزامن) + اختبار |
| P0-5 | **رسالة «تم الحفظ» رغم عدم وصول الكتابة للخادم.** `saveExam/saveVisit/saveRx` ترجع `legacyResult` (false = بقي محليًا) لكن `coreMessage` يتجاهله، و`handlePatientSave` يعرض «تم حفظ بيانات المريض» دائمًا ولا ينتظر نتيجة الكتابة، و`coreMessage` يعتبر أي نتيجة غير كائن نجاحًا. | `use-patient-file.js`, `patients-orchestration.js` | ✅ حالات الحفظ الخمس + اختبارات |
| P0-6 | **بوابة المريض (`PatientApp`) تُحمِّل جداول كاملة** (`iapp_appointments/prescriptions/exams/visits`) في متصفح المريض وتفلتر في العميل. معطّلة حاليًا لأن `KIOSK_EMAIL=''` (لا جلسة)، لكن تفعيلها بوضعها الحالي = تسريب لكل المرضى. | `PatientApp.jsx:124`, `unified-login-view` | 🔴 BLOCKED — لا تُفعَّل قبل RPC مخصّص بنطاق المريض (موثّق). تحسين الشاشة نفسها اقتصر على دالة عرض نقية مختبَرة |

### P1 — مهم

| # | النتيجة | الحالة |
|---|---|---|
| P1-1 | **ربط الدراسة التصويرية بالطلب مكسور في طبقة التطبيع.** `mapCoreImages` يقرأ `st.investigation_order_id` بينما العمود الفعلي في `iapp_imaging_studies_core` اسمه `order_id`، وتعريف `iapp_create_imaging_study` الحيّ يخزّن فيه **رقم طلب الفحص** (`o.id` من `iapp_investigation_orders_core`). فيبقى `coreOrderId = null` دائمًا ولا تظهر الصور تحت طلبها. | ✅ يُصحَّح + بناء سلسلة الربط الصريحة (Phase 6) |
| P1-1b | **Core يتجاهل صامتًا أي دراسة ثانية لنفس الطلب.** `iapp_create_imaging_study` يبحث عن دراسة موجودة بنفس `order_id` ويُرجع رقمها دون إدراج جديد (🧪 من تعريف الدالة الحيّ). رفع صورتين لنفس الطلب = صورة واحدة فقط في Core (الباقي يبقى في بيانات الصور المحلية فقط). | 🔴 BLOCKED BY BACKEND — الحل: إرسال كل الملفات في استدعاء واحد عبر `p_files` أو دالة تُضيف ملفات لدراسة قائمة؛ موثّق في SQL غير مطبَّق |
| P1-2 | **الملف الطبي بلا بنية سريرية:** الفحص نصوص حرة (`anteriorSegment`, `posteriorSegment`, VA/IOP نص). لا UCVA/BCVA/PH، لا CMT، لا C/D، لا MD. جدول Core `iapp_examinations_core` لا يملك هذه الأعمدة (يملك فقط `refraction_od/os jsonb`). | ✅ عقد بيانات واجهة اختياري `exam.ophth` متوافق عكسيًا، 💡 ترحيل Core موصى به وغير مطبَّق |
| P1-3 | **PatientFile مقيّد بعرض 480px** على كل الشاشات، ولا ملخص سريري يغطي OD/OS، العلاج، المتابعة، التنبيهات. | ✅ |
| P1-4 | **المقارنة:** جدول VA/IOP خام فقط؛ لا اتجاه ولا رسم ولا حقن ولا CMT/VF/C-D. | ✅ |
| P1-5 | **`catch {}` فارغة: 82 موضعًا.** معظمها حرّاس `localStorage`/`removeChannel`، لكن ~12 تُخفي فشلًا حقيقيًا (قبول طلب حجز دون تحديث حالته → قد يُقبل مرتين، فشل قراءة الطلبات/المواعيد المحجوزة، إنهاء الطابور، بثّ النداء، تسجيل الخروج). | ✅ |
| P1-6 | **`Modal` بلا `role="dialog"`/Escape/حبس تركيز/عودة تركيز**، زر الإغلاق `<span>`، و54 عنصرًا قابلًا للنقر ليس زرًّا. | ✅ جزئي: `Modal` المشترك (يغطي كل النوافذ)، تبويبات PatientFile وExamForm أزرار ARIA. ⚠️ بقية العناصر القابلة للنقر في الشاشات الأخرى لم تُراجَع كلها |
| P1-7 | **لا code-splitting:** حزمة واحدة 832 kB، كل الشاشات تُستورد ثابتًا (`App.jsx` و`main.jsx`). | ✅ |
| P1-8 | **حالة الاتصال/الحفظ موزّعة** (شارة مزامنة عامة + `StatusBar` بأربعة أنواع مختلفة). لا مؤشر موحّد بالحالات الخمس المطلوبة. | ✅ |
| P1-9 | `iapp_staff`: `authenticated` يملك INSERT/UPDATE/DELETE على مستوى الصلاحيات، والحماية الوحيدة RLS بلا سياسات (رفض افتراضي). سليم الآن لكنه عمق دفاعي ضعيف. | 💡 `NOT-APPLIED` revoke |

### P2 — تحسينات

- P2-1 ‎1,417 `style={{` مضمَّنة؛ لا رموز تصميم. ⇒ ✅ طبقة رموز CSS + فئات لـ PatientFile والمكوّنات المشتركة (لا إعادة كتابة شاملة).
- P2-2 `useMemo` مستخدم جيدًا في hook الملف؛ `allRequestTests` يُعاد بناؤه كل رسم (مستقر وزهيد).
- P2-3 `sbGet('iapp_imaging_orders')` يقرأ جدول كل المرضى ثم يفلتر في العميل (يعمل، لكنه يحمّل أوامر الجميع لكل فتح ملف). ⚠️ يحتاج استعلامًا بنطاق المريض (يحتاج تأكيد مخطط الجدول الحيّ — `iapp_imaging_orders` غير موجود بين جداول `public` الحيّة؛ هو مفتاح داخل `iapp_store`).
- P2-4 `sw.js` يخزّن صور Cloudinary العامة (حتى 150) في الكاش — صور سريرية على الجهاز بعد الخروج. 💡 تنظيف كاش الصور عند الخروج (رسالة إلى الـ SW).
- P2-5 `index.html` `theme-color` ثابت `#07131c` (يُحدَّث ديناميكيًا لاحقًا).

### P3 — شكلي

- أسماء تبويبات إنجليزية/عربية مختلطة (`Overview`, `Examination`, `My Investigations`).
- أنيميشن غير مستعملة في `legacy.css` (`glow`, `float`, `orb`) وتوهّج `boxShadow` في `Toast` — ✅ أُزيلت. أسماء التبويبات صارت عربية.
- Gradients على رأس الملف وتبويباته.

## 3. أمان — ملخص التحقق الحيّ

| البند | النتيجة | الحالة |
|---|---|---|
| RLS مفعّل على كل جداول `public` (26/26) | نعم | 🧪 |
| `anon` على جداول سريرية | غير مسموح؛ فقط: INSERT في `iapp_booking_requests` (بقيود طول/تاريخ/status)، SELECT على `iapp_queue_public_cache` | 🧪 |
| `anon` يملك EXECUTE على أي دالة `iapp_*` | لا (0 من 36) | 🧪 |
| تسجيل عام | معطّل (مذكور في الذاكرة/README) — لم يُتحقَّق من إعداد Auth نفسه | ⚠️ |
| `iapp_staff` | 4 صفوف: admin×1، secretary×3؛ RLS مفعّل بلا سياسات | 🧪 |
| دور `doctor` في الخادم | **غير موجود** (`iapp_staff.role` ∈ admin/secretary فقط) | 🧪 |
| `iapp_slots_taken` | View بـ SECURITY DEFINER (تحذير ERROR من Supabase) — مقصود لحجز المواعيد العام لكنه يحتاج مراجعة أنه لا يكشف بيانات مرضى | ⚠️ |
| Leaked-password protection | معطّل | 🔴 إعداد لوحة تحكم Supabase Auth |
| دوال `iapp_create_*`/`iapp_sync_*` | `SECURITY INVOKER` وتخضع لـ RLS، قابلة للتنفيذ من أي موظف | 🧪 |
| idempotency: `iapp_create_investigation_workflow_order` | **مضمون من الخادم** على `(patient, p_source_exam_legacy_id)` عبر advisory lock + بحث مسبق ويُرجع `reused:true` | 🧪 من تعريف الدالة (قراءة فقط، لم يُنفَّذ استدعاء) |
| idempotency: `iapp_create_imaging_study` | دراسة واحدة لكل طلب (تُرجع القديمة)، لا تكرار لكنها تُسقط الإضافات | 🧪 من تعريف الدالة |
| idempotency: `iapp_create_diagnosis_core` (visit+نص+laterality)، `iapp_create_treatment_core` (visit+نص+eye)، `iapp_create_followup_core` (patient+visit+تاريخ+سبب)، `iapp_create_prescription_core` (`legacy_id`)، `iapp_create_clinical_visit` (advisory lock + موعد/تاريخ/طبيب) | **مضمونة من الخادم بمفاتيح طبيعية**؛ علامات `_coreSync` في العميل طبقة أولى فقط | 🧪 من تعريفاتها الحيّة (قراءة فقط) |

## 4. خطة الإصلاح (نُفِّذت في هذه الجلسة — راجع FINAL)

1. أمان: P0-2..P0-5، تنظيف PHI، تحقق الدور من الخادم، وثيقتا SQL/Checklist.
2. نموذج بيانات: `exam.ophth` + `clinical-summary` + `longitudinal` + `investigation-links`.
3. واجهة: رموز تصميم، PatientFile متجاوب، ملخص سريري، Compare جديد، ربط الصور.
4. أخطاء/مزامنة: `logger`، حالات الحفظ الخمس، إزالة الـ catch الصامتة.
5. أداء/وصولية: تقسيم الكود، Modal، تبويبات ARIA.
6. اختبارات: ملفات جديدة تغطي البنود العشرة المطلوبة + تشغيل كل الأوامر.

## 5. ما لا يمكن إصلاحه من المستودع

P0-1 (RLS بالأدوار)، P0-6 (RPC بوابة المريض)، Leaked-password، عدم وجود أعمدة سريرية منظّمة في Core، تجاهل Core للدراسة الثانية (P1-1b). التفاصيل في `SECURITY-RELEASE-CHECKLIST.md` و`docs/sql/NOT-APPLIED-*.sql`.
