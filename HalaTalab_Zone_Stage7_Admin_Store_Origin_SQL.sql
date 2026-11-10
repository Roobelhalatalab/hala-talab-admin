-- Stage 7: admin-only original store zone update.
-- Review and back up before executing in Supabase SQL Editor.
-- Does not touch existing orders, pricing, triggers, or delivery coverage.
CREATE OR REPLACE FUNCTION public.hala_admin_set_store_origin_zone_v1(
  p_store_id uuid, p_zone_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(), false) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hala_zones WHERE id=p_zone_id AND is_active=true) THEN
    RAISE EXCEPTION 'Target zone does not exist or is inactive';
  END IF;
  UPDATE public.stores SET zone_id=p_zone_id WHERE id=p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Store not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.hala_admin_set_store_origin_zone_v1(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_set_store_origin_zone_v1(uuid,uuid) TO authenticated;
