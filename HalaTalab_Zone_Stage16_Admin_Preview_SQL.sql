-- Stage 16: admin preview of coverage after origin zone changes.
-- Coverage choices remain as set by store owners; no automatic deletion/activation.
-- Requires public.hala_is_admin(), hala_zones, hala_zone_areas, hala_store_delivery_coverage.
BEGIN;
CREATE OR REPLACE FUNCTION public.hala_admin_preview_store_zone_coverage_v1(p_store_id uuid,p_target_zone_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_origin uuid; v_origin_name text; v_target_name text; v_areas jsonb; v_fingerprint text;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN
  RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
 END IF;
 SELECT s.zone_id,z.name INTO v_origin,v_origin_name
 FROM public.stores s LEFT JOIN public.hala_zones z ON z.id=s.zone_id
 WHERE s.id=p_store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found'; END IF;
 SELECT name INTO v_target_name FROM public.hala_zones WHERE id=p_target_zone_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target zone not active'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'area_id',a.id,'area_name',a.name,'zone_name',z.name,
  'is_enabled',c.is_enabled,'delivery_fee',c.delivery_fee,
  'will_be_external',a.zone_id<>p_target_zone_id
 ) ORDER BY z.name,a.name),'[]'::jsonb) INTO v_areas
 FROM public.hala_store_delivery_coverage c
 JOIN public.hala_zone_areas a ON a.id=c.area_id
 JOIN public.hala_zones z ON z.id=a.zone_id
 WHERE c.store_id=p_store_id AND c.is_enabled AND a.is_active AND z.is_active;
 SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(c.area_id,c.is_enabled,c.delivery_fee) ORDER BY c.area_id)::text,'[]')) INTO v_fingerprint FROM public.hala_store_delivery_coverage c WHERE c.store_id=p_store_id;
 RETURN jsonb_build_object('coverage_fingerprint',v_fingerprint,'store_id',p_store_id,'origin_zone_id',v_origin,
  'origin_zone_name',v_origin_name,'target_zone_id',p_target_zone_id,
  'target_zone_name',v_target_name,'enabled_areas',v_areas,
  'warning','Existing coverage stays enabled after move. Review prices and disable unwanted areas manually.');
END;$$;
REVOKE ALL ON FUNCTION public.hala_admin_preview_store_zone_coverage_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_preview_store_zone_coverage_v1(uuid,uuid) TO authenticated;
COMMIT;
