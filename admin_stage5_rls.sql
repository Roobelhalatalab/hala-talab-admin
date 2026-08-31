-- Hala Talab Admin Stage 5
-- Driver administrative review + documents, isolated from partner app tables.

create table if not exists public.admin_driver_reviews (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','suspended')),
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_number text,
  file_url text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_driver_reviews enable row level security;
alter table public.admin_driver_documents enable row level security;

create or replace function public.is_hala_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.id = auth.uid() and au.role = 'admin' and coalesce(au.is_active,true)=true
  );
$$;

grant execute on function public.is_hala_admin() to authenticated;

-- Read source data needed by the admin drivers page.
drop policy if exists "hala admin read partner profiles" on public.partner_profiles;
create policy "hala admin read partner profiles" on public.partner_profiles for select to authenticated using (public.is_hala_admin());

drop policy if exists "hala admin read orders stage5" on public.orders;
create policy "hala admin read orders stage5" on public.orders for select to authenticated using (public.is_hala_admin());

-- Admin-only reviews.
drop policy if exists "hala admin read driver reviews" on public.admin_driver_reviews;
create policy "hala admin read driver reviews" on public.admin_driver_reviews for select to authenticated using (public.is_hala_admin());
drop policy if exists "hala admin insert driver reviews" on public.admin_driver_reviews;
create policy "hala admin insert driver reviews" on public.admin_driver_reviews for insert to authenticated with check (public.is_hala_admin());
drop policy if exists "hala admin update driver reviews" on public.admin_driver_reviews;
create policy "hala admin update driver reviews" on public.admin_driver_reviews for update to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());

-- Admin-only document registry. It is ready for future driver-upload integration.
drop policy if exists "hala admin read driver docs" on public.admin_driver_documents;
create policy "hala admin read driver docs" on public.admin_driver_documents for select to authenticated using (public.is_hala_admin());
drop policy if exists "hala admin insert driver docs" on public.admin_driver_documents;
create policy "hala admin insert driver docs" on public.admin_driver_documents for insert to authenticated with check (public.is_hala_admin());
drop policy if exists "hala admin update driver docs" on public.admin_driver_documents;
create policy "hala admin update driver docs" on public.admin_driver_documents for update to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());
