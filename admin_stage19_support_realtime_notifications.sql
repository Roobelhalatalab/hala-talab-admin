-- Hala Talab Admin — Stage 19 Support Realtime + Client/Store/Driver notifications
-- Safe/re-runnable. Run once after Stage 18 FIX1.

begin;

-- Make all support sources realtime so the admin list and open chat update without reopening.
do $$
begin
  if to_regclass('public.customer_support_conversations') is not null and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_support_conversations'
  ) then alter publication supabase_realtime add table public.customer_support_conversations; end if;
  if to_regclass('public.customer_support_messages') is not null and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_support_messages'
  ) then alter publication supabase_realtime add table public.customer_support_messages; end if;
  if to_regclass('public.partner_support_tickets') is not null and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='partner_support_tickets'
  ) then alter publication supabase_realtime add table public.partner_support_tickets; end if;
  if to_regclass('public.partner_support_messages') is not null and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='partner_support_messages'
  ) then alter publication supabase_realtime add table public.partner_support_messages; end if;
end $$;

-- Customer: one atomic read action clears both message flags and badge count.
create or replace function public.customer_mark_support_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.customer_support_conversations c where c.id=p_conversation_id and c.customer_id=auth.uid()) then
    raise exception 'Conversation not found or not owned by current customer';
  end if;
  update public.customer_support_messages set is_read=true
  where conversation_id=p_conversation_id and sender_type<>'customer' and is_read=false;
  update public.customer_support_conversations set unread_count=0 where id=p_conversation_id;
end; $$;
revoke all on function public.customer_mark_support_conversation_read(uuid) from public;
grant execute on function public.customer_mark_support_conversation_read(uuid) to authenticated;

-- Customer: bridge admin/support replies into the existing notification/push pipeline.
create or replace function public.notify_customer_support_reply()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_customer uuid; v_subject text;
begin
  if new.sender_type='customer' then return new; end if;
  select customer_id,coalesce(nullif(subject_ar,''),'الدعم') into v_customer,v_subject
  from public.customer_support_conversations where id=new.conversation_id;
  if v_customer is null then return new; end if;
  insert into public.customer_notifications(customer_id,order_id,type,title,body,data,is_read)
  values(v_customer,null,'support_reply','رد جديد من دعم هلا طلب',left(new.message,220),
    jsonb_build_object('conversation_id',new.conversation_id,'support_message_id',new.id,'subject',v_subject),false);
  return new;
end; $$;
drop trigger if exists customer_support_reply_notification on public.customer_support_messages;
create trigger customer_support_reply_notification after insert on public.customer_support_messages
for each row execute function public.notify_customer_support_reply();

-- Partner support history: partner can read message history belonging to own tickets.
drop policy if exists "partner read own support messages" on public.partner_support_messages;
create policy "partner read own support messages" on public.partner_support_messages
for select to authenticated using (exists(
  select 1 from public.partner_support_tickets t where t.id=ticket_id and t.user_id=auth.uid()
));

grant select on public.partner_support_messages to authenticated;

-- Admin replies to Store/Driver support become regular partner notifications,
-- therefore the existing Stage 165 FCM router handles closed-app push too.
create or replace function public.notify_partner_support_reply()
returns trigger language plpgsql security definer set search_path=public as $$
declare t public.partner_support_tickets%rowtype;
begin
  if new.sender_role <> 'admin' then return new; end if;
  select * into t from public.partner_support_tickets where id=new.ticket_id;
  if not found then return new; end if;

  if lower(coalesce(t.category,'')) like 'driver_%' then
    if to_regclass('public.driver_notifications') is not null then
      insert into public.driver_notifications(driver_id,order_id,order_number,event_type,is_read)
      values(t.user_id,null,null,'support_reply',false);
    end if;
  elsif t.store_id is not null and to_regclass('public.store_notifications') is not null then
    insert into public.store_notifications(store_id,type,title,body,data,is_read)
    values(t.store_id,'support_reply','رد جديد من دعم هلا طلب',left(new.message,220),
      jsonb_build_object('support_ticket_id',t.id,'support_message_id',new.id),false);
  end if;
  return new;
end; $$;
drop trigger if exists partner_support_reply_notification on public.partner_support_messages;
create trigger partner_support_reply_notification after insert on public.partner_support_messages
for each row execute function public.notify_partner_support_reply();

commit;
notify pgrst, 'reload schema';
