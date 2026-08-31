# Hala Talab Admin — Stage 18 FIX1

سبب الخطأ الظاهر عند إرسال رد للعميل كان أن جدول `customer_support_messages` يقبل في `sender_type` القيم:
`customer`, `support`, `restaurant`, `driver`, `system`.

النسخة السابقة كانت ترسل `admin`، لذلك Supabase رفض الصف بسبب CHECK constraint.

## ما تم إصلاحه
- لوحة الإدارة ترسل رد العميل بقيمة `sender_type = support`.
- واجهة لوحة الإدارة ما زالت تعرض هذا النوع باسم **الإدارة**.
- تم تحديث RLS ليسمح للإدارة بإضافة رسائل `support`.
- لا تغيير على رسائل المتجر والسائق في `partner_support_messages`.

## إذا كنت شغلت SQL الخاص بـ Stage 18 سابقًا
شغّل فقط:
`admin_stage18_support_replies_fix1.sql`

مرة واحدة في Supabase SQL Editor.

## إذا لم تكن شغلت Stage 18 أصلًا
يكفي تشغيل `admin_stage18_support_replies.sql` الموجود في هذه النسخة، لأنه تم تصحيحه أيضًا.
