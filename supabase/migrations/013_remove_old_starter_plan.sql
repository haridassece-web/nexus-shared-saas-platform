-- ==============================================================================
-- MIGRATION 013: REMOVE OLD STARTER PLAN / UPDATE PLANS CATALOGUE
-- ==============================================================================
-- Execute in Supabase SQL Editor to remove the old Starter (₹149/mo) plan row:

DELETE FROM public.subscription_plans WHERE code = 'starter';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

