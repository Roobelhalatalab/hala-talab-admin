هلا طلب — إعادة بناء نظام إشعارات الإدارة

الفكرة النهائية:
1) كل جهاز إدارة يسجل OneSignal Subscription ID الخاص به تلقائياً بعد تسجيل دخول المدير والسماح بالإشعارات.
2) Subscription ID يُحفظ في جدول خاص admin_push_devices من خلال Edge Function بعد التحقق من حساب الإدارة.
3) كل حدث إداري يدخل جدول admin_push_events المركزي.
4) Dispatcher واحد يستدعي admin-onesignal-push.
5) Edge Function تجلب أجهزة الإدارة المسجلة وترسل OneSignal مباشرة باستخدام include_subscription_ids.

لا توجد Segments في مسار الإرسال.
لا يوجد External ID مشترك بين الأجهزة.
لا يوجد أي Secret داخل ملفات الويب.

ملفات الويب التي ترفع إلى GitHub:
index.html
app.js
styles.css
supabase.js
config.js
service-worker.js
manifest.webmanifest
icon-192.png
icon-512.png
apple-touch-icon.png
.nojekyll
.gitignore

ملفات إعداد Stage 38 التي لا تحتاجها الواجهة أثناء التشغيل:
_setup/STAGE_38_COUPON_OFFER_SEPARATION.sql
README_AR.txt
README_STAGE_38_AR.txt

الإعدادات الحالية التي تبقى كما هي:
ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY
ADMIN_PUSH_WEBHOOK_SECRET
Verify JWT = OFF للدالة admin-onesignal-push لأن الدالة تتحقق يدوياً من JWT عند تسجيل الجهاز، وتتحقق من Secret مستقل عند استدعاء قاعدة البيانات.
