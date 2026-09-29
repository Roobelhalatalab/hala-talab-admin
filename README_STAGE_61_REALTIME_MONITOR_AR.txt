هلا طلب — Stage 61 — مراقبة اتصالات Supabase Realtime

تمت إضافة صفحة جديدة في لوحة الإدارة:
مراقبة الاتصالات

ما تعرضه الصفحة:
- المتصلون الآن من Supabase Realtime.
- الحد الحالي للاتصالات.
- نسبة الاستخدام من الحد.
- أعلى قراءة أثناء جلسة فتح لوحة المراقبة.
- حالة الحمل: طبيعي / مراقبة / تحذير / قريب جدًا من الحد.
- تحديث تلقائي كل 60 ثانية + زر تحديث يدوي.

الأمان:
- لا يوجد service_role ولا Management Token داخل app.js أو config.js.
- الواجهة ترسل JWT الخاص بحساب الإدارة فقط.
- Edge Function تتحقق أن المستخدم Admin.
- HALATALAB_MANAGEMENT_TOKEN يبقى Secret داخل Supabase فقط.

الملفات المضافة/المعدلة:
- app.js
- styles.css
- index.html
- service-worker.js
- config.js
- supabase/functions/admin-realtime-monitor/index.ts
- README_STAGE_61_REALTIME_MONITOR_AR.txt

إعداد مرة واحدة في Supabase:
1) أنشئ Scoped Personal Access Token من إعدادات حساب Supabase، وحدده على مشروع هلا طلب فقط، وأعطه صلاحية Analytics/Logs Read المطلوبة للـ Metrics endpoint (analytics_logs_read). انسخ التوكن مرة واحدة ولا تضعه داخل GitHub أو كود الموقع.
2) أضف Secrets للـ Edge Function من Dashboard > Edge Functions > Secrets:
   HALATALAB_MANAGEMENT_TOKEN = التوكن السري
   REALTIME_CONNECTION_LIMIT = 200   (Free)
   ADMIN_ALLOWED_ORIGIN = https://roobelhalatalab.github.io
   HALATALAB_PROJECT_REF = czoqxshblhgwanwsrudk   (اختياري؛ الدالة تستخرجه من SUPABASE_URL تلقائيًا)

مهم: لا تستخدم أسماء Secret تبدأ بـ SUPABASE_ لأنها محجوزة من Supabase للمتغيرات المدمجة.
3) Deploy للدالة باسم:
   admin-realtime-monitor

عند الانتقال لاحقًا إلى Pro:
- غيّر REALTIME_CONNECTION_LIMIT من 200 إلى 500 في Supabase Secrets.
- لا تحتاج تعديل أو إعادة رفع لوحة الإدارة.

ملاحظة تقنية مهمة:
الدالة تستخدم Supabase Management Metrics API الرسمي. إذا حساب/مشروع Supabase لم يرجع مقياس Realtime Connected Clients عبر هذا endpoint، الصفحة ستظهر رسالة واضحة بدل عرض رقم تخميني. لا يتم اختراع رقم أو حسابه من عدد المستخدمين المسجلين.
في هذه الحالة البديل الأدق هو إضافة Presence/heartbeat خاص بمنظومة هلا طلب إلى تطبيقات العميل والمتجر والسائق في تحديث لاحق، أو الاعتماد على تقرير Realtime الرسمي داخل Supabase Studio.
