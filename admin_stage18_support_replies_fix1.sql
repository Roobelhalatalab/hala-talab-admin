-- Hala Talab Admin — Stage 18 FIX1
-- Fix customer support admin replies.
-- Run ONCE after the original Stage 18 SQL if you already ran it.

begin;

-- customer_support_messages has a CHECK constraint that accepts:
-- customer, support, restaurant, driver, system
-- Therefore dashboard replies must use sender_type='support', not 'admin'.

drop policy if exists "admin insert customer support replies" on public.customer_support_messages;
create policy "admin insert customer support replies" on public.customer_support_messages
for insert to authenticated
with check (
  lower(coalesce(sender_type, ''))='support'
  and public.is_admin()
);

grant select, insert on public.customer_support_messages to authenticated;

commit;
