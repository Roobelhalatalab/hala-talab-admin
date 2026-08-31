-- Hala Talab Admin — Stage 20 Support Alerts Final
-- Run once after Admin Stage 19 / Partners Stage 171 SQL.

begin;

alter table if exists public.partner_support_messages
  add column if not exists is_read boolean not null default false;

create index if not exists partner_support_messages_unread_idx
  on public.partner_support_messages(ticket_id,is_read,created_at desc);

-- Admin marks incoming customer/partner messages as read when opening the chat.
create or replace function public.admin_mark_support_ticket_read_v1(p_source text,p_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;

  if lower(coalesce(p_source,''))='partner' then
    update public.partner_support_messages
    set is_read=true
    where ticket_id=p_id
      and lower(coalesce(sender_role,'')) not in ('admin','support','management')
      and is_read=false;
  else
    -- Customer tables already use is_read in the current project.
    update public.customer_support_messages
    set is_read=true
    where conversation_id=p_id
      and lower(coalesce(sender_type,'')) in ('customer','client','user')
      and is_read=false;
  end if;
end;
$$;
revoke all on function public.admin_mark_support_ticket_read_v1(text,uuid) from public;
grant execute on function public.admin_mark_support_ticket_read_v1(text,uuid) to authenticated;

-- Touch partner ticket on every new message so Admin and Partner lists reorder instantly.
create or replace function public.partner_support_message_touch_ticket_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.partner_support_tickets
  set updated_at=now(), status=case when lower(coalesce(new.sender_role,'')) in ('admin','support','management') then 'in_progress' else coalesce(status,'open') end
  where id=new.ticket_id;
  return new;
end;
$$;
drop trigger if exists partner_support_message_touch_ticket_v1 on public.partner_support_messages;
create trigger partner_support_message_touch_ticket_v1
after insert on public.partner_support_messages
for each row execute function public.partner_support_message_touch_ticket_v1();

-- Realtime makes the bell/list update even while Admin is on another page.
do $$
begin
  if to_regclass('public.partner_support_tickets') is not null and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='partner_support_tickets'
  ) then alter publication supabase_realtime add table public.partner_support_tickets; end if;
  if to_regclass('public.partner_support_messages') is not null and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='partner_support_messages'
  ) then alter publication supabase_realtime add table public.partner_support_messages; end if;
end $$;

commit;
notify pgrst,'reload schema';
