-- Stage 10. Review and back up before applying. No order/pricing changes.
CREATE OR REPLACE FUNCTION public.hala_admin_create_zone_v1(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Invalid zone name'; END IF;
 IF EXISTS(SELECT 1 FROM public.hala_zones WHERE lower(name)=lower(btrim(p_name))) THEN RAISE EXCEPTION 'Zone name already exists'; END IF;
 INSERT INTO public.hala_zones(name,is_active) VALUES(btrim(p_name),false) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_create_zone_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_create_zone_v1(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hala_admin_create_area_v1(p_zone_id uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Invalid area name'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hala_zones WHERE id=p_zone_id) THEN RAISE EXCEPTION 'Zone not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.hala_zone_areas WHERE zone_id=p_zone_id AND lower(name)=lower(btrim(p_name))) THEN RAISE EXCEPTION 'Area name already exists'; END IF;
 INSERT INTO public.hala_zone_areas(zone_id,name,is_active,boundary) VALUES(p_zone_id,btrim(p_name),false,NULL) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_create_area_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_create_area_v1(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hala_admin_set_area_active_v1(p_area_id uuid,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_area public.hala_zone_areas%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_area FROM public.hala_zone_areas WHERE id=p_area_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Area not found'; END IF;
 IF p_active AND (v_area.boundary IS NULL OR NOT EXISTS(SELECT 1 FROM public.hala_zones WHERE id=v_area.zone_id AND is_active)) THEN
  RAISE EXCEPTION 'Draw boundary and activate parent zone first';
 END IF;
 UPDATE public.hala_zone_areas SET is_active=p_active WHERE id=p_area_id;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_set_area_active_v1(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_set_area_active_v1(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.hala_admin_set_zone_active_v1(p_zone_id uuid,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hala_zones WHERE id=p_zone_id) THEN RAISE EXCEPTION 'Zone not found'; END IF;
 IF p_active AND NOT EXISTS(SELECT 1 FROM public.hala_zone_areas WHERE zone_id=p_zone_id AND boundary IS NOT NULL) THEN
  RAISE EXCEPTION 'Draw at least one area boundary first';
 END IF;
 UPDATE public.hala_zones SET is_active=p_active WHERE id=p_zone_id;
 IF NOT p_active THEN UPDATE public.hala_zone_areas SET is_active=false WHERE zone_id=p_zone_id; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_set_zone_active_v1(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_set_zone_active_v1(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.hala_admin_list_zone_management_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('zones',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active) ORDER BY name) FROM public.hala_zones),'[]'::jsonb),
 'areas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'zone_id',zone_id,'name',name,'is_active',is_active,'has_boundary',boundary IS NOT NULL) ORDER BY name) FROM public.hala_zone_areas),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_list_zone_management_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_list_zone_management_v1() TO authenticated;
