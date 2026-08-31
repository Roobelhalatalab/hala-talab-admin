-- Hala Talab Admin — Final Pending Notes
-- Run once in Supabase SQL Editor to allow admins to manage coupons/promotions from the admin UI.

do $$
declare t text; p text;
begin
  foreach t in array array['coupons','store_promotions','promotions'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists admin_polish4_manage on public.%I',t);
      execute format('create policy admin_polish4_manage on public.%I for all to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin())',t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
