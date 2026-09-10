-- Hala Talab public menu ratings - Stage 45
-- Run this file once in Supabase SQL Editor.
-- Uses text IDs intentionally so it works whether your store/product IDs are uuid or another type.

create extension if not exists pgcrypto;

create table if not exists public.store_ratings (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  visitor_id text not null,
  rating smallint not null check (rating between 1 and 5),
  reviewer_name text null check (reviewer_name is null or char_length(reviewer_name) <= 60),
  comment text null check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, visitor_id)
);

create table if not exists public.product_ratings (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  product_id text not null,
  visitor_id text not null,
  rating smallint not null check (rating between 1 and 5),
  reviewer_name text null check (reviewer_name is null or char_length(reviewer_name) <= 60),
  comment text null check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, visitor_id)
);

create index if not exists idx_store_ratings_store_id on public.store_ratings(store_id);
create index if not exists idx_product_ratings_store_id on public.product_ratings(store_id);
create index if not exists idx_product_ratings_product_id on public.product_ratings(product_id);

alter table public.store_ratings enable row level security;
alter table public.product_ratings enable row level security;

drop policy if exists "public read store ratings" on public.store_ratings;
create policy "public read store ratings" on public.store_ratings for select to anon, authenticated using (true);

drop policy if exists "public insert store ratings" on public.store_ratings;
create policy "public insert store ratings" on public.store_ratings for insert to anon, authenticated with check (
  rating between 1 and 5 and char_length(visitor_id) between 8 and 100 and char_length(store_id) between 1 and 100
);

drop policy if exists "public read product ratings" on public.product_ratings;
create policy "public read product ratings" on public.product_ratings for select to anon, authenticated using (true);

drop policy if exists "public insert product ratings" on public.product_ratings;
create policy "public insert product ratings" on public.product_ratings for insert to anon, authenticated with check (
  rating between 1 and 5 and char_length(visitor_id) between 8 and 100 and char_length(store_id) between 1 and 100 and char_length(product_id) between 1 and 100
);

grant select, insert on public.store_ratings to anon, authenticated;
grant select, insert on public.product_ratings to anon, authenticated;
