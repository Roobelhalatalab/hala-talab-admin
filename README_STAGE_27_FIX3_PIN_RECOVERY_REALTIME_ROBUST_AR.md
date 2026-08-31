# Hala Talab Admin — Stage 27 FIX3 — PIN Recovery Realtime Robust

ما تغير:
- Realtime لطلبات استرجاع PIN يبقى فعالًا في كل صفحات لوحة الإدارة.
- عند INSERT أو UPDATE على phone_pin_reset_requests يتم تحديث الصفحة والعداد والجرس تلقائيًا.
- إعادة اتصال تلقائية إذا انقطع WebSocket أو الإنترنت مؤقتًا.
- عند رجوع المتصفح من الخلفية أو رجوع الإنترنت يتم تحديث البيانات فورًا.
- Safety refresh كل 12 ثانية فقط كخطة احتياطية إذا انقطع Realtime؛ لا يحتاج المستخدم ضغط Refresh.

قبل الاختبار:
1. شغّل `admin_stage27_fix3_pin_recovery_realtime_robust.sql` في Supabase SQL Editor مرة واحدة.
2. افتح لوحة الإدارة.
3. من تطبيق العميل أو الشركاء اطلب استرجاع PIN.
4. يجب أن يظهر الطلب تلقائيًا في صفحة الاسترجاع ويزيد جرس الإدارة بدون Refresh يدوي.
