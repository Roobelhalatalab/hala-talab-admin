-- Hala Talab Admin Stage 8 — Finance Fix 2
-- يصلح خطأ: Could not find the 'note' column ... in the schema cache
-- آمن لإعادة التشغيل ولا يحذف أي بيانات.

begin;

alter table if exists public.admin_commission_rules
  add column if not exists note text;

alter table if exists public.admin_subscriptions
  add column if not exists note text;

commit;

-- اطلب من PostgREST/Supabase إعادة تحميل مخطط الجداول مباشرة.
notify pgrst, 'reload schema';

-- فحص اختياري: يجب أن يعيد صفين باسم note إذا تم كل شيء بنجاح.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('admin_commission_rules','admin_subscriptions')
  and column_name = 'note'
order by table_name;
