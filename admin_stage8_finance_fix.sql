-- Hala Talab Admin Stage 8 — Commissions & Subscriptions Fix
-- آمن لإعادة التشغيل. يضيف الملاحظات فقط ويحافظ على الجداول والبيانات الحالية.

create or replace function public.is_hala_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_users a where a.id=auth.uid() and a.role='admin' and coalesce(a.is_active,true)=true);
$$;
revoke all on function public.is_hala_admin() from public;
grant execute on function public.is_hala_admin() to authenticated;

alter table if exists public.admin_commission_rules add column if not exists note text;
alter table if exists public.admin_subscriptions add column if not exists note text;

-- ضمان RLS للإدارة فقط على الجداول الإدارية.
do $$
declare t text; p text;
begin
  foreach t in array array['admin_commission_rules','admin_subscriptions','admin_audit_log'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t and policyname='admin_stage8_finance_full' loop
        execute format('drop policy if exists %I on public.%I',p,t);
      end loop;
      execute format('create policy admin_stage8_finance_full on public.%I for all to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin())',t);
    end if;
  end loop;
end $$;
