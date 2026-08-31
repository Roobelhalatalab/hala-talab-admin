-- Hala Talab Admin Stage 2 Final Fix
-- Run once in Supabase SQL Editor.
-- Gives authenticated admin users SELECT access through RLS to the real dashboard tables.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and coalesce(au.is_active, true) = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'orders',
    'stores',
    'customer_support_conversations',
    'customer_support_messages',
    'partner_support_tickets',
    'partner_profiles'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on table public.%I to authenticated', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'admin_dashboard_read', t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_admin())',
        'admin_dashboard_read', t
      );
    end if;
  end loop;
end $$;
