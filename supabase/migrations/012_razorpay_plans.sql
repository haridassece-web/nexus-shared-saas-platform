-- Migration 012: Link Razorpay Online Payment & Subscription Plans
-- Payment Link: https://rzp.io/rzp/kXDafwpr
-- Starter Plan: plan_Tw2uea5q2C97dI (₹299/mo)
-- Business Plan: plan_Tw2vdOPvPKxnSZ (₹499/mo)

-- 1. Update Starter Plan with Razorpay Plan ID and Payment Gateway Link
update public.subscription_plans
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'razorpay_plan_id', 'plan_Tw2uea5q2C97dI',
  'payment_link', 'https://rzp.io/rzp/kXDafwpr'
)
where code = 'starter';

-- 2. Update Business Plan with Razorpay Plan ID and Payment Gateway Link
update public.subscription_plans
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'razorpay_plan_id', 'plan_Tw2vdOPvPKxnSZ',
  'payment_link', 'https://rzp.io/rzp/kXDafwpr'
)
where code = 'business';

-- 3. In case plans need upserting
insert into public.subscription_plans (
  code, name, monthly_price_paise, annual_price_paise, max_users, max_products, features, is_active
) values (
  'starter',
  'Starter',
  29900,
  299000,
  2,
  1000,
  '{"description":"Small shops","target_audience":"Small shops","gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"thermal_print":true,"barcode_scanner":true,"reports":true,"razorpay_plan_id":"plan_Tw2uea5q2C97dI","payment_link":"https://rzp.io/rzp/kXDafwpr"}'::jsonb,
  true
), (
  'business',
  'Business',
  49900,
  499000,
  10,
  10000,
  '{"description":"Retail and service businesses","target_audience":"Retail and service businesses","gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"thermal_print":true,"barcode_scanner":true,"reports":true,"advanced_reports":true,"custom_branding":true,"white_label":true,"priority_support":true,"razorpay_plan_id":"plan_Tw2vdOPvPKxnSZ","payment_link":"https://rzp.io/rzp/kXDafwpr"}'::jsonb,
  true
)
on conflict (code) do update set
  features = excluded.features,
  monthly_price_paise = excluded.monthly_price_paise,
  annual_price_paise = excluded.annual_price_paise,
  is_active = true;

-- Reload schema cache
notify pgrst, 'reload schema';
