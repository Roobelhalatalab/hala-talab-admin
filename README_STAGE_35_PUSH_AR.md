# Stage 35 — OneSignal Web Push

هذه المرحلة تربط لوحة الإدارة بخدمة OneSignal Web Push لاستقبال الإشعارات على Android و iPhone/iPad PWA.

## ما تم
- ربط OneSignal App ID.
- دمج OneSignal مع Service Worker الحالي بدل إنشاء عامل خدمة متعارض.
- إضافة زر 📲 في أعلى لوحة الإدارة لتفعيل إذن الإشعارات من تفاعل المستخدم.
- ربط اشتراك الجهاز بهوية مدير Supabase (External ID = user.id) وإضافة tag باسم role=admin.
- دعم iPhone/iPad عند تشغيل اللوحة من أيقونة Home Screen.
- تحديث كاش PWA إلى v35 وتصحيح مسارات الملفات المسطحة.

## مهم
هذه المرحلة تجعل الجهاز يشترك ويستقبل Push ويمكن اختبار الإرسال من لوحة OneSignal.
الإرسال التلقائي عند إنشاء طلب PIN أو تسجيل متجر/سائق يحتاج خطوة Backend إضافية تربط Supabase بـ OneSignal REST API باستخدام مفتاح سري محفوظ على الخادم، وليس داخل ملفات GitHub العامة.
