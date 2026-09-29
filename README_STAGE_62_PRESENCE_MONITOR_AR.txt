هلا طلب — Stage 62 — مراقبة Presence المباشرة

تم تحويل صفحة مراقبة الاتصالات من Edge Function / Management Metrics إلى Supabase Presence المباشر.

المصدر:
- القناة: hala_online_users
- التطبيقات تسجل role = customer / business / driver
- الصفحة تعرض: الإجمالي، العملاء، المتاجر، السائقين، وأعلى قراءة خلال جلسة الإدارة.
- التحديث يحدث مباشرة عند sync/join/leave مع فحص احتياطي كل 60 ثانية.

ملفات التعديل:
- app.js
- styles.css
- index.html
- service-worker.js

مهم:
- Edge Function admin-realtime-monitor القديمة لم تعد مستخدمة في صفحة المراقبة ويمكن إبقاؤها بدون تأثير أو حذفها لاحقًا.
- الرقم المعروض هو عدد جلسات التطبيقات المفتوحة عبر Presence، وليس مقياس WebSocket connections الخام الخاص بحدود خطة Supabase.
- إذا نفس الحساب مفتوح على جهازين يظهر جلستين.
