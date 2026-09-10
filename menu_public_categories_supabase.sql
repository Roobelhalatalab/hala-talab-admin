-- Hala Talab public menu categories — Stage 46
-- Run once ONLY if the public menu still cannot see the store-created categories.
-- This grants read-only access to menu category tables; it does not allow insert/update/delete.

do $$
declare
  t text;
  expr text;
begin
  foreach t in array array['product_categories','store_categories'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('grant select on public.%I to anon, authenticated', t);

      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t and column_name='is_active'
      ) then
        expr := 'coalesce(is_active, true) = true';
      elsif exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t and column_name='active'
      ) then
        expr := 'coalesce(active, true) = true';
      else
        expr := 'true';
      end if;

      execute format('drop policy if exists "public menu read categories" on public.%I', t);
      execute format('create policy "public menu read categories" on public.%I for select to anon, authenticated using (%s)', t, expr);
    end if;
  end loop;
end $$;
