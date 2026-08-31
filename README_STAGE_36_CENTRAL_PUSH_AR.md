# هلا طلب — Stage 36 FINAL: Central Admin Push

هذه النسخة تلغي فكرة الربط المنفصل لكل شاشة. المسار النهائي واحد:

حدث مهم في Supabase -> `admin_push_events` -> Dispatcher واحد -> `admin-onesignal-push` -> OneSignal -> iPhone/iPad/Android.

## ما الذي يغطيه؟
- استرجاع PIN للعميل.
- استرجاع PIN للمتجر أو السائق.
- تسجيل متجر جديد.
- تسجيل سائق جديد.
- نفس Push للأجهزة المشتركة على iOS/iPadOS/Android.

## مهم قبل التشغيل
1. `ONESIGNAL_APP_ID` و`ONESIGNAL_REST_API_KEY` يبقيان كما هما في Edge Function Secrets.
2. استبدل كود Edge Function `admin-onesignal-push` بالملف `admin-onesignal-push-index.ts` الموجود هنا.
3. من Settings للدالة اجعل **Verify JWT = OFF** لأن الدالة محمية بسر مشترك خاص بين قاعدة البيانات والدالة، وليس JWT مستخدم.
4. شغّل `admin_stage36_central_admin_push.sql` مرة واحدة في SQL Editor.
5. نتيجة SQL تعرض `secret_value`. انسخه مباشرة إلى Edge Function Secrets باسم `ADMIN_PUSH_WEBHOOK_SECRET` ثم احذف/أغلق نتيجة SQL. لا ترسله بالمحادثة ولا ترفعه إلى GitHub.
6. Deploy/Save للدالة بعد إضافة السر.

## لماذا هذه النسخة ليست ترقيعًا؟
- جدول مركزي واحد للأحداث.
- Dispatcher واحد فقط.
- Edge Function واحدة فقط.
- Trigger functions تقرأ الصف كـ JSONB لتتحمل اختلاف أسماء الأعمدة الشائعة بدل الاعتماد على أعمدة ثابتة.
- التثبيت idempotent ويمكن إعادة تشغيل SQL بأمان.
- لا يوجد مفتاح OneSignal أو secret داخل ملفات الويب العامة.

## ملفات الويب
لا تحتاج لإعادة تثبيت OneSignal أو حذف أيقونة PWA. ملفات الويب الحالية تبقى صالحة. لا ترفع ملفات SQL/Edge Function إلى GitHub العام.
