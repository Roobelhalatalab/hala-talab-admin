# Hala Talab Admin Stage 21 FIX1 — SQL Function Return Type Fix

هذا الإصلاح يعالج خطأ Supabase/PostgreSQL:

`42P13: cannot change return type of existing function`

السبب: Stage 21 غيّر أعمدة الإرجاع للدالة `public.admin_list_users()`، وPostgreSQL لا يسمح بتغيير `RETURNS TABLE` عبر `CREATE OR REPLACE` مباشرة.

## ما الذي تم تغييره؟
تمت إضافة السطر التالي قبل إنشاء الدالة الجديدة:

```sql
drop function if exists public.admin_list_users();
```

هذا يحذف **تعريف الدالة القديمة فقط** ثم يعيد إنشائها بالشكل الجديد. لا يحذف حسابات العملاء ولا بياناتهم ولا أي جدول.

## التشغيل
شغّل الملف:
`admin_stage21_category_user_notification_fix.sql`

مرة واحدة في Supabase SQL Editor. إذا سبق أن فشلت المحاولة القديمة، يمكنك تشغيل النسخة المصححة مباشرة.
