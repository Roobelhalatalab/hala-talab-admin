# Stage 35 — OneSignal Web Push

هذه المرحلة تربط لوحة إدارة هلا طلب بخدمة OneSignal Web Push على Android وiPhone/iPad.

## ما تم
- إضافة OneSignal Web SDK v16 باستخدام App ID الخاص بالمشروع.
- إضافة OneSignalSDKWorker.js بمسار GitHub Pages نفسه.
- عزل OneSignal Service Worker في scope مستقل حتى لا يتعارض مع PWA Service Worker.
- إصلاح PWA service-worker القديم ليتوافق مع الملفات المسطحة الحالية.
- إضافة زر 📣 في شريط الإدارة لتفعيل إشعارات هذا الجهاز بضغط المستخدم.
- ربط اشتراك OneSignal بحساب الإدارة (Supabase user id) بعد تسجيل الدخول.
- دعم iOS/iPadOS عندما تكون اللوحة مضافة إلى Home Screen، ودعم Android Web Push.

## بعد الرفع إلى GitHub
1. افتح لوحة الإدارة من أيقونة Home Screen على iPhone/iPad أو من Chrome على Android.
2. سجل الدخول.
3. اضغط زر 📣 ووافق على Allow Notifications.
4. تحقق أن النقطة على زر 📣 أصبحت خضراء.
5. من OneSignal أرسل Test Push للتأكد من وصول Push والجهاز/التطبيق مغلق.

## مهم
هذه المرحلة تكمل اشتراك الجهاز واستقبال Push. الإرسال التلقائي من Supabase عند (نسيت PIN / تسجيل متجر / تسجيل سائق) يحتاج ربط OneSignal REST API بالمخدم بمفتاح API سري، ولا يجب وضع هذا المفتاح داخل ملفات GitHub العامة. يتم عمله في خطوة Backend منفصلة وآمنة.
