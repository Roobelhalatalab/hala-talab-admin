-- Hala Talab Admin — Stage 18 Support Replies
-- Run ONCE in Supabase SQL Editor.

begin;

-- Partner support: keep a conversation history and also mirror the latest admin reply on the ticket.
alter table if exists public.partner_support_tickets
  add column if not exists admin_reply text,
  add column if not exists admin_replied_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.partner_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.partner_support_tickets(id) on delete cascade,
  sender_id uuid null references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('admin','business','store','driver','partner')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists partner_support_messages_ticket_created_idx
  on public.partner_support_messages(ticket_id, created_at);

alter table public.partner_support_messages enable row level security;

-- Reuse the existing admin_users table used by the dashboard. Policies are idempotent.
drop policy if exists "admin read partner support messages" on public.partner_support_messages;
create policy "admin read partner support messages" on public.partner_support_messages
for select to authenticated
using (public.is_admin());

drop policy if exists "admin insert partner support messages" on public.partner_support_messages;
create policy "admin insert partner support messages" on public.partner_support_messages
for insert to authenticated
with check (sender_role='admin' and public.is_admin());

-- Allow admins to update partner ticket status/latest reply.
drop policy if exists "admin update partner support tickets" on public.partner_support_tickets;
create policy "admin update partner support tickets" on public.partner_support_tickets
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Customer support: admin must be able to insert replies and update conversation state.
alter table if exists public.customer_support_messages enable row level security;
drop policy if exists "admin insert customer support replies" on public.customer_support_messages;
create policy "admin insert customer support replies" on public.customer_support_messages
for insert to authenticated
with check (
  lower(coalesce(sender_type, ''))='support'
  and public.is_admin()
);

drop policy if exists "admin read customer support messages" on public.customer_support_messages;
create policy "admin read customer support messages" on public.customer_support_messages
for select to authenticated
using (public.is_admin());

drop policy if exists "admin update customer support conversations" on public.customer_support_conversations;
create policy "admin update customer support conversations" on public.customer_support_conversations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());


grant select, insert on public.partner_support_messages to authenticated;
grant select, update on public.partner_support_tickets to authenticated;
grant select, insert on public.customer_support_messages to authenticated;
grant select, update on public.customer_support_conversations to authenticated;

commit;
