# Admin Stage 23 — Account Suspension Enforcement
- زر «إيقاف الحساب مؤقتًا» الموجود في لوحة الإدارة صار له Enforcement مركزي في Supabase.
- أي عميل يتم تعليقه إداريًا يتوقف عن إنشاء الطلبات والعمليات الحساسة فورًا.
- نفس الحماية تشمل السائقين وأصحاب المتاجر، مع احترام Store lifecycle paused/archived.
- لا تُحذف الحسابات أو الطلبات أو السجلات عند التعليق.
- شغّل `admin_stage23_account_suspension_enforcement.sql` مرة واحدة فقط (لا تشغل نسخة SQL من Client/Partners بعدها لأنها نفسها).
