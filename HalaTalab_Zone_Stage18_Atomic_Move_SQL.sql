-- Stage 18. Execute AFTER Stage 16 preview SQL (the bundled Stage 16 version includes fingerprint).
-- Atomic confirmation: refuses move if store origin or coverage changed since preview.
-- Does not delete/alter coverage. Admin-only. Transaction is automatic per RPC.
CREATE OR REPLACE FUNCTION public.hala_admin_confirm_store_zone_move_v2(
 p_store_id uuid, p_target_zone_id uuid, p_expected_origin_zone_id uuid,
 p_expected_coverage_fingerprint text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_origin uuid; v_fingerprint text;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN
  RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
 END IF;
 -- Shared per-store transaction lock also taken by partner coverage saves.
 -- Prevents a new coverage row from being inserted during the move.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 19017));
 SELECT zone_id INTO v_origin FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found'; END IF;
 IF v_origin IS DISTINCT FROM p_expected_origin_zone_id THEN
  RAISE EXCEPTION 'Store origin changed since preview. Refresh and retry';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.hala_zones WHERE id=p_target_zone_id AND is_active) THEN
  RAISE EXCEPTION 'Target zone inactive or missing';
 END IF;
 -- Serialize concurrent saves for existing coverage rows before comparing snapshot.
 PERFORM 1 FROM public.hala_store_delivery_coverage WHERE store_id=p_store_id FOR UPDATE;
 SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(c.area_id,c.is_enabled,c.delivery_fee)
  ORDER BY c.area_id)::text,'[]')) INTO v_fingerprint
 FROM public.hala_store_delivery_coverage c WHERE c.store_id=p_store_id;
 IF v_fingerprint IS DISTINCT FROM p_expected_coverage_fingerprint THEN
  RAISE EXCEPTION 'Delivery coverage changed since preview. Refresh and retry';
 END IF;
 UPDATE public.stores SET zone_id=p_target_zone_id WHERE id=p_store_id;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_confirm_store_zone_move_v2(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_confirm_store_zone_move_v2(uuid,uuid,uuid,text) TO authenticated;
