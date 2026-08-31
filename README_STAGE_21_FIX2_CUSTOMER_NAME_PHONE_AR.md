# Admin Stage 21 FIX2 — أسماء وأرقام العملاء

هذا الإصلاح يعالج الحسابات القديمة التي لا تحتوي `full_name` أو `contact_phone` داخل Auth metadata.

ترتيب مصادر البيانات أصبح:
1. `partner_profiles` إن وجد.
2. Auth `raw_user_meta_data` (`full_name/name/display_name` و `contact_phone/phone/mobile`).
3. رقم Auth المباشر.
4. آخر طلب للعميل (`orders.customer_name` و `orders.customer_phone`) كحل للحسابات القديمة.

شغّل `admin_stage21_category_user_notification_fix.sql` مرة واحدة في Supabase SQL Editor.
لا يتم حذف أي مستخدم أو طلب أو بيانات.
