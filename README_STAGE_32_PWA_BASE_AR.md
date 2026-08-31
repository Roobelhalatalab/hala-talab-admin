# Stage 32 — PWA Base

هذه المرحلة تضيف فقط أساس تثبيت لوحة إدارة هلا طلب كتطبيق ويب PWA، بدون تغيير منطق الإدارة أو PIN أو Supabase أو Realtime.

المضاف:
- manifest.webmanifest
- service-worker.js
- أيقونات 192 / 512 / Apple Touch
- ربط الـManifest والـService Worker داخل index.html
- display: standalone حتى تفتح اللوحة كتطبيق مستقل بعد تثبيتها

مهم:
- التثبيت الدائم على الهاتف يحتاج استضافة HTTPS (أو localhost للاختبار على الكمبيوتر).
- Push Notifications ليست ضمن Stage 32؛ سيتم تجهيزها في المرحلة التالية بعد تثبيت PWA base.
- الـService Worker يستخدم Network First حتى لا تبقى نسخة قديمة من لوحة الإدارة عالقة بعد التحديث.
