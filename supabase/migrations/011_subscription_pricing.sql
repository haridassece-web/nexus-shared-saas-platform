-- Migration 011: Update Subscription Pricing
-- Starter: ₹149/month (Small shops)
-- Business: ₹299/month (Retail and service businesses)

-- 1. Upsert Starter Plan (₹149/month · Small shops)
insert into public.subscription_plans (
  code, name, monthly_price_paise, annual_price_paise, max_users, max_products, features, is_active
) values (
  'starter',
  'Starter',
  14900,
  149000,
  2,
  1000,
  '{"description":"Small shops","target_audience":"Small shops","gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"thermal_print":true,"barcode_scanner":true,"reports":true}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_paise = excluded.monthly_price_paise,
  annual_price_paise = excluded.annual_price_paise,
  max_users = excluded.max_users,
  max_products = excluded.max_products,
  features = excluded.features,
  is_active = true;

-- 2. Upsert Business Plan (₹299/month · Retail and service businesses)
insert into public.subscription_plans (
  code, name, monthly_price_paise, annual_price_paise, max_users, max_products, features, is_active
) values (
  'business',
  'Business',
  29900,
  299000,
  10,
  10000,
  '{"description":"Retail and service businesses","target_audience":"Retail and service businesses","gst_billing":true,"inventory":true,"pdf_invoice":true,"whatsapp_share":true,"thermal_print":true,"barcode_scanner":true,"reports":true,"advanced_reports":true,"custom_branding":true,"white_label":true,"priority_support":true}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_paise = excluded.monthly_price_paise,
  annual_price_paise = excluded.annual_price_paise,
  max_users = excluded.max_users,
  max_products = excluded.max_products,
  features = excluded.features,
  is_active = true;
