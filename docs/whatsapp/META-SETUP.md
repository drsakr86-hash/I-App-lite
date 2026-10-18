# إعداد Meta وWebhook (تعليمات — لم يُنفَّذ أي منها)

> لا تفصل/تهاجر/تغيّر الرقم الحالي قبل إتمام البنود 1–3. كل الأسرار تُدخل في **Supabase secrets** فقط (`supabase secrets set NAME=value`) — لا تُكتب في GitHub ولا في المتصفح.

## 1) التحقق من أهلية الرقم (قبل أي شيء)
* الرقم يعمل حالياً على **تطبيق WhatsApp Business**. الربط الرسمي مع بقاء التطبيق شغّالاً يتم بـ **Coexistence** عبر *Embedded Signup*، ويتطلب (حسب وثائق Meta وقت الكتابة): إصدار التطبيق ≥ 2.24.17، وأن تكون الدولة مدعومة، وحساب Business مفعّل. **تأكد من لوحة Meta نفسها أن رقم مصر الخاص بكم مؤهل** — لم نجد تأكيداً رسمياً لمصر.
* التبعات: الرسائل التي يكتبها الموظف من التطبيق تصل لنظامنا كـ *echo* (نخزنها ونوقف المساعد تلقائياً)؛ سرعة الإرسال محدودة؛ بعض مزايا التطبيق (مثل بعض إعدادات الاتصال) قد تتغير؛ تاريخ المحادثات قد يُزامن لفترة محدودة فقط.
* **البديل الآمن** إن لم يكن الرقم مؤهلاً: رقم جديد مخصص للمساعد (يُعلن للمرضى) بدل ترحيل الرقم الحالي.

## 2) إنشاء التطبيق
1. developers.facebook.com ← Create App ← نوع **Business**.
2. إضافة منتج **WhatsApp**، وربطه بحساب WhatsApp Business (WABA) الخاص بالعيادة.
3. إنشاء **System User** دائم (Business Settings ← System Users) بصلاحيتين: `whatsapp_business_messaging` و`whatsapp_business_management`، وتوليد **Access Token دائم** → `META_ACCESS_TOKEN`.
4. من Settings ← Basic: **App Secret** → `META_APP_SECRET`.
5. من WhatsApp ← API Setup: **Phone number ID** → `META_PHONE_NUMBER_ID` (ويكرَّر في جدول `wa_config.phone_number_id`).
6. للتجربة: استخدم **رقم الاختبار** الذي توفره Meta أولاً، وأضف أرقام الموظفين كمستلمين مسموحين.

## 3) الـ Webhook
* Callback URL: `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`
* Verify token: قيمة عشوائية طويلة من عندك → `META_VERIFY_TOKEN` (نفسها تُكتب في Meta).
* الحقول المطلوبة (Subscribe): `messages` + `smb_message_echoes` (للتعايش) + `account_update` + `message_template_status_update` + `phone_number_quality_update`.
* Meta توقّع كل طلب بالرأس `X-Hub-Signature-256` والوظيفة ترفض أي طلب بتوقيع خاطئ (401). Meta تعيد المحاولة حتى 7 أيام لذلك المعالجة idempotent.

## 4) قالب التذكير (Utility)
* الاسم: `apt_reminder` (يطابق `wa_config.reminder_template`)، اللغة: `ar`، الفئة: **Utility**.
* مثال نص (3 متغيرات: تاريخ، وقت، عيادة): «تذكير من عيادات صقر للعيون: موعدك يوم {{1}} الساعة {{2}} في {{3}}. للإلغاء أو التعديل رد على هذه الرسالة. لإيقاف التذكيرات أرسل: إيقاف».
* لا تضف أي معلومة طبية. يجب اعتماد القالب من Meta قبل التشغيل.

## 5) ضبط الوظائف (بعد موافقتك)
```
supabase secrets set META_APP_SECRET=… META_VERIFY_TOKEN=… META_ACCESS_TOKEN=… META_PHONE_NUMBER_ID=… ANTHROPIC_API_KEY=… WORKER_SECRET=…
supabase functions deploy whatsapp-webhook whatsapp-worker whatsapp-send
```
ثم جدولة العامل بـ `docs/sql/whatsapp-cron.sql` (السر يُخزَّن في Vault).

## 6) مفاتيح التشغيل (كلها مغلقة افتراضياً في `wa_config`)
`enabled=false`، `ai_enabled=false`، `reminders_enabled=false`، `booking_mode='request'`. التفعيل تدريجي (انظر `DEPLOYMENT.md`).
