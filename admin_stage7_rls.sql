-- Hala Talab Admin Stage 7
-- لا تنشئ هذه المرحلة جداول جديدة ولا تعدّل بيانات الإنتاج.
-- التقارير تعتمد على صلاحيات القراءة التي فُعّلت في المراحل السابقة لـ orders / stores / partner_profiles.
-- هذا الفحص فقط للتأكد أن حساب الإدارة الحالي موجود ومفعّل.

select id, role, is_active, created_at
from public.admin_users
where id = auth.uid();
