-- Allow the photo resolver to read only the existing place ID for public plans.
-- Row visibility continues to be governed by the existing plans RLS policy.
grant select (place_id) on table public.plans to anon, authenticated;
