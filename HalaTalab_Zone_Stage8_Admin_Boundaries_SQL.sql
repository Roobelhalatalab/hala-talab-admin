-- Stage 8: Run only after a verified database backup.
-- Read RPC for the admin map editor. Existing tables and order logic are unchanged.
CREATE OR REPLACE FUNCTION public.hala_admin_list_delivery_areas_v1()
RETURNS TABLE(area_id uuid, area_name text, zone_id uuid, zone_name text, boundary jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT a.id,a.name::text,z.id,z.name::text,a.boundary
  FROM public.hala_zone_areas a JOIN public.hala_zones z ON z.id=a.zone_id
  ORDER BY z.name,a.name;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_list_delivery_areas_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_list_delivery_areas_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.hala_admin_update_area_boundary_v1(p_area_id uuid,p_boundary jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g extensions.geometry; other_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.hala_is_admin(),false) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hala_zone_areas WHERE id=p_area_id) THEN
    RAISE EXCEPTION 'Area not found';
  END IF;
  IF p_boundary IS NULL OR p_boundary->>'type'<>'Polygon' THEN
    RAISE EXCEPTION 'Only Polygon geometry is allowed';
  END IF;
  IF jsonb_array_length(p_boundary->'coordinates')<>1 THEN
    RAISE EXCEPTION 'Polygon must have one exterior ring without holes';
  END IF;
  IF jsonb_array_length(p_boundary->'coordinates'->0)<4 OR jsonb_array_length(p_boundary->'coordinates'->0)>501 THEN
    RAISE EXCEPTION 'Polygon must contain 3 to 500 points';
  END IF;
  g:=extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_boundary::text),4326);
  IF NOT extensions.ST_IsValid(g) OR extensions.ST_IsEmpty(g)
     OR extensions.ST_Area(g::extensions.geography)<100 THEN
    RAISE EXCEPTION 'Invalid or too small polygon';
  END IF;
  IF extensions.ST_XMin(g)<42 OR extensions.ST_XMax(g)>45
     OR extensions.ST_YMin(g)<35 OR extensions.ST_YMax(g)>38 THEN
    RAISE EXCEPTION 'Boundary must remain inside Nineveh region';
  END IF;
  -- Serialize all boundary edits to avoid concurrent overlapping saves.
  PERFORM pg_advisory_xact_lock(734219, 8001);
  -- Interior/interior intersection catches containment as well as partial overlap.
  SELECT a.id INTO other_id FROM public.hala_zone_areas a
  WHERE a.id<>p_area_id AND a.is_active=true AND a.boundary IS NOT NULL
    AND extensions.ST_Relate(g,extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
      CASE WHEN a.boundary->>'type'='Feature' THEN (a.boundary->'geometry')::text ELSE a.boundary::text END),4326),'T********')
  LIMIT 1;
  IF other_id IS NOT NULL THEN
    RAISE EXCEPTION 'Boundary overlaps another active area (%)',other_id;
  END IF;
  UPDATE public.hala_zone_areas SET boundary=p_boundary WHERE id=p_area_id;
END; $$;
REVOKE ALL ON FUNCTION public.hala_admin_update_area_boundary_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hala_admin_update_area_boundary_v1(uuid,jsonb) TO authenticated;
