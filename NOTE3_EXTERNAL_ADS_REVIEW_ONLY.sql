-- Hala Talab / Note 3: external link advertisements
-- REVIEW ONLY. Do not execute before confirming RLS and admin authentication integration.
-- This is additive and does not modify orders, zones, offers, or discounts.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hala_external_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text,
  image_url text NOT NULL CHECK (image_url ~* '^https://'),
  destination_url text NOT NULL CHECK (destination_url ~* '^https?://'),
  destination_type text NOT NULL CHECK (destination_type IN
    ('facebook','instagram','website','event','registration','tickets')),
  event_name text,
  event_at timestamptz,
  event_location text,
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hala_external_ads_dates_valid CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);
CREATE INDEX IF NOT EXISTS hala_external_ads_active_order_idx
  ON public.hala_external_ads (is_active, display_order, created_at DESC);
ALTER TABLE public.hala_external_ads ENABLE ROW LEVEL SECURITY;
-- Only active in-date ads can be read by public clients.
DROP POLICY IF EXISTS hala_external_ads_public_read ON public.hala_external_ads;
CREATE POLICY hala_external_ads_public_read ON public.hala_external_ads
  FOR SELECT TO anon, authenticated USING (
    is_active = true AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );
-- Admin rights use the same server-side RPC as the dashboard login.
-- Requires public.hala_is_admin() to exist and return boolean for auth.uid().
DROP POLICY IF EXISTS hala_external_ads_admin_all ON public.hala_external_ads;
CREATE POLICY hala_external_ads_admin_all ON public.hala_external_ads
  FOR ALL TO authenticated
  USING ((SELECT public.hala_is_admin()))
  WITH CHECK ((SELECT public.hala_is_admin()));
GRANT SELECT ON public.hala_external_ads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hala_external_ads TO authenticated;
COMMIT;
