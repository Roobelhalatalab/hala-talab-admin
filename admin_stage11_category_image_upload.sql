-- Hala Talab Admin Stage 11 — System category image upload
-- ينشئ bucket عام لصور تصنيفات واجهة العميل ويقصر الرفع/التعديل/الحذف على الإدارة فقط.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'system-category-images',
  'system-category-images',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

-- القراءة عامة لأن الصور تظهر في تطبيق العميل.
drop policy if exists system_category_images_public_read on storage.objects;
create policy system_category_images_public_read
on storage.objects for select
to public
using (bucket_id = 'system-category-images');

-- الرفع للإدارة فقط.
drop policy if exists system_category_images_admin_insert on storage.objects;
create policy system_category_images_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'system-category-images'
  and public.is_hala_admin()
);

drop policy if exists system_category_images_admin_update on storage.objects;
create policy system_category_images_admin_update
on storage.objects for update
to authenticated
using (bucket_id = 'system-category-images' and public.is_hala_admin())
with check (bucket_id = 'system-category-images' and public.is_hala_admin());

drop policy if exists system_category_images_admin_delete on storage.objects;
create policy system_category_images_admin_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'system-category-images' and public.is_hala_admin());

select
  'system_category_images_ready' as check_name,
  exists(select 1 from storage.buckets where id='system-category-images' and public=true) as ok;
