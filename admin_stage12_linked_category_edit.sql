-- Hala Talab Admin Stage 12
-- Safe linked editing for system_categories.
-- Editing keeps the same UUID so Store + Client links remain intact.

create or replace function public.admin_update_system_category(
  p_id uuid,
  p_name_ar text,
  p_name_ku text default null,
  p_name_en text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color_hex text default '#FF7A00',
  p_sort_order integer default 0,
  p_is_active boolean default true
) returns public.system_categories
language plpgsql security definer set search_path=public
as $$
declare r public.system_categories;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if p_id is null then raise exception 'category id is required'; end if;
  if nullif(trim(p_name_ar),'') is null then raise exception 'category name is required'; end if;

  update public.system_categories
  set name_ar=trim(p_name_ar),
      name_ku=nullif(trim(p_name_ku),''),
      name_en=nullif(trim(p_name_en),''),
      icon=nullif(trim(p_icon),''),
      image_url=nullif(trim(p_image_url),''),
      color_hex=coalesce(nullif(trim(p_color_hex),''),'#FF7A00'),
      sort_order=coalesce(p_sort_order,0),
      is_active=coalesce(p_is_active,true),
      updated_at=now()
  where id=p_id
  returning * into r;

  if r.id is null then raise exception 'category not found'; end if;
  return r;
end $$;

revoke all on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) from public;
grant execute on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;

-- Verification only: editing must never replace/recreate the UUID.
select 'linked_category_edit_ready' as check_name,
       to_regprocedure('public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean)') is not null as ok;
