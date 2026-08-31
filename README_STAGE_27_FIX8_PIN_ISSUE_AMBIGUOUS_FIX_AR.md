# Stage 27 FIX8 — إصلاح إصدار رمز PIN

يعالج الخطأ: `column reference request_id is ambiguous` عند الضغط على زر إصدار الرمز.

السبب كان تعارض اسم عمود `request_id` مع اسم عمود الإرجاع في دالة PostgreSQL.

## التشغيل
شغّل مرة واحدة فقط:
`admin_stage27_fix8_pin_issue_ambiguous_fix.sql`

بعدها جرّب إصدار الرمز من لوحة الإدارة. يجب أن يظهر الرمز، وإذا رجعت لنفس الطلب خلال 30 دقيقة يظهر نفس الرمز.
