-- ==============================================================================
-- NEXUS CREATIVE SHARED SAAS PLATFORM
-- ONE-CLICK SUPER ADMIN, INVOICE BRANDING & SUBSCRIPTIONS SETUP
-- Owner: Haridass (haridass.ece@gmail.com)
-- ==============================================================================

-- 1. Ensure platform_admins table exists
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
drop policy if exists "users can read own platform admin status" on public.platform_admins;
create policy "users can read own platform admin status" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

-- 2. Secure helper to identify Platform Owner / Super Admin (Owner: Haridass)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  ) or exists (
    select 1 from auth.users
    where id = auth.uid()
      and (
        email ilike '%haridass%'
        or email = 'haridass.ece@gmail.com'
      )
  );
$$;
grant execute on function public.is_platform_admin() to authenticated, anon;

-- Automatically grant platform admin status to Haridass and existing accounts
insert into public.platform_admins (user_id)
select id from auth.users
where email ilike '%haridass%' or email = 'haridass.ece@gmail.com'
on conflict (user_id) do nothing;

-- 3. Super Admin RLS Policies for full access
drop policy if exists "platform admin manages subscriptions" on public.subscriptions;
create policy "platform admin manages subscriptions" on public.subscriptions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "platform admin manages subscription plans" on public.subscription_plans;
create policy "platform admin manages subscription plans" on public.subscription_plans
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "platform admin manages businesses" on public.businesses;
create policy "platform admin manages businesses" on public.businesses
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 4. Super Admin Add / Modify / Extend Subscription RPC
-- Drop all overloaded versions to avoid ERROR 42725
drop function if exists public.platform_set_subscription(uuid, text, text, text);
drop function if exists public.platform_set_subscription(uuid, text, text, text, timestamptz);

create or replace function public.platform_set_subscription(
  p_business_id uuid,
  p_plan_code text,
  p_status text,
  p_period text default 'monthly',
  p_ends_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_ends_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  if p_status not in ('active', 'trialing', 'past_due', 'cancelled', 'expired') then
    raise exception 'Invalid subscription status: %', p_status;
  end if;

  -- Calculate expiry based on period or custom date
  if p_ends_at is not null then
    v_ends_at := p_ends_at;
  elsif p_status = 'trialing' then
    v_ends_at := now() + interval '14 days';
  elsif p_status = 'active' and p_period = 'annual' then
    v_ends_at := now() + interval '1 year';
  elsif p_status = 'active' and p_period = 'lifetime' then
    v_ends_at := '2099-12-31 23:59:59+00'::timestamptz;
  elsif p_status = 'active' then
    v_ends_at := now() + interval '1 month';
  else
    v_ends_at := null;
  end if;

  -- Deactivate previous subscriptions for this business
  update public.subscriptions
  set status = 'expired'
  where business_id = p_business_id and status in ('active', 'trialing');

  -- Insert new active subscription record
  insert into public.subscriptions (
    business_id, plan_code, status, starts_at, ends_at
  ) values (
    p_business_id, p_plan_code, p_status, now(), v_ends_at
  )
  returning * into v_sub;

  return to_jsonb(v_sub);
end $$;
grant execute on function public.platform_set_subscription(uuid, text, text, text, timestamptz) to authenticated;

-- 5. Super Admin Delete / Revoke Subscription RPC
create or replace function public.platform_delete_subscription(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  delete from public.subscriptions where business_id = p_business_id;
  return true;
end $$;
grant execute on function public.platform_delete_subscription(uuid) to authenticated;

-- 6. Super Admin Delete Business Workspace RPC
create or replace function public.platform_delete_business(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  delete from public.businesses where id = p_business_id;
  return true;
end $$;
grant execute on function public.platform_delete_business(uuid) to authenticated;

-- 7. Super Admin Create / Edit Subscription Plan RPC
create or replace function public.platform_create_plan(
  p_code text,
  p_name text,
  p_monthly_price_paise integer,
  p_annual_price_paise integer,
  p_max_users integer,
  p_max_products integer,
  p_features jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  insert into public.subscription_plans (
    code, name, monthly_price_paise, annual_price_paise, max_users, max_products, features, is_active
  ) values (
    p_code, p_name, p_monthly_price_paise, p_annual_price_paise, p_max_users, p_max_products, coalesce(p_features, '{}'::jsonb), true
  )
  on conflict (code) do update set
    name = excluded.name,
    monthly_price_paise = excluded.monthly_price_paise,
    annual_price_paise = excluded.annual_price_paise,
    max_users = excluded.max_users,
    max_products = excluded.max_products,
    features = excluded.features,
    is_active = true
  returning * into v_plan;

  return to_jsonb(v_plan);
end $$;
grant execute on function public.platform_create_plan to authenticated;

-- 8. Super Admin Delete / Deactivate Subscription Plan RPC
create or replace function public.platform_delete_plan(p_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  update public.subscription_plans set is_active = false where code = p_code;
  return true;
end $$;
grant execute on function public.platform_delete_plan(text) to authenticated;

-- 9. Comprehensive Platform Overview with Full Details
drop function if exists public.platform_business_overview();

create or replace function public.platform_business_overview()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required (Owner: Haridass)';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'businesses', (select count(*) from public.businesses),
      'trialing', (select count(*) from public.subscriptions where status = 'trialing' and (ends_at is null or ends_at > now())),
      'active', (select count(*) from public.subscriptions where status = 'active' and (ends_at is null or ends_at > now())),
      'expired', (select count(*) from public.subscriptions where status in ('expired', 'cancelled') or (status in ('trialing', 'active') and ends_at <= now()))
    ),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'business_type', b.business_type,
        'invoice_prefix', b.invoice_prefix,
        'created_at', b.created_at,
        'owner_count', (select count(*) from public.business_users bu where bu.business_id = b.id),
        'subscription', jsonb_build_object(
          'id', s.id,
          'plan_code', s.plan_code,
          'status', case when s.ends_at is not null and s.ends_at <= now() and s.status in ('trialing', 'active') then 'expired' else coalesce(s.status, 'trialing') end,
          'starts_at', s.starts_at,
          'ends_at', s.ends_at
        )
      ) order by b.created_at desc)
      from public.businesses b
      left join lateral (
        select * from public.subscriptions x
        where x.business_id = b.id
        order by x.created_at desc
        limit 1
      ) s on true
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;
grant execute on function public.platform_business_overview() to authenticated, anon;

-- 10. Update Subscription Pricing: Starter at Rs.149/mo, Business at Rs.299/mo
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
), (
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

-- 11. Add Custom Invoice Branding Columns to businesses table
alter table public.businesses add column if not exists brand_name text;
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists brand_color varchar(20) default '#2563eb';
alter table public.businesses add column if not exists invoice_footer text default 'Thank you for your business!';
alter table public.businesses add column if not exists show_logo boolean default true;
alter table public.businesses add column if not exists show_contact boolean default true;
alter table public.businesses add column if not exists show_gstin boolean default true;
alter table public.businesses add column if not exists show_platform_branding boolean default true;
alter table public.businesses add column if not exists invoice_template text default 'modern';
alter table public.businesses add column if not exists branding_mode text default 'business';

update public.businesses set brand_name = name where brand_name is null;

-- 12. Create Storage Bucket for business-logos
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('business-logos', 'business-logos', true)
    on conflict (id) do update set public = true;

    drop policy if exists "public read for business logos" on storage.objects;
    create policy "public read for business logos" on storage.objects
      for select using (bucket_id = 'business-logos');

    drop policy if exists "authenticated users upload business logos" on storage.objects;
    create policy "authenticated users upload business logos" on storage.objects
      for insert to authenticated with check (bucket_id = 'business-logos');

    drop policy if exists "authenticated users update business logos" on storage.objects;
    create policy "authenticated users update business logos" on storage.objects
      for update to authenticated using (bucket_id = 'business-logos');

    drop policy if exists "authenticated users delete business logos" on storage.objects;
    create policy "authenticated users delete business logos" on storage.objects
      for delete to authenticated using (bucket_id = 'business-logos');
  end if;
end $$;

-- 13. Add Vegetable & Fruits Shop category
insert into public.business_categories (
  code, name, sector, template_type, item_label, customer_label, custom_fields
) values (
  'vegetable_fruits_shop',
  'Vegetable & Fruits Shop',
  'Retail & Grocery',
  'retail_supermarket',
  'Produce / Fruit / Vegetable',
  'Customer Name',
  '[{"name":"weighing_scale","label":"Weighing Scale / Counter No","type":"text"},{"name":"batch_lot","label":"Harvest / Lot Batch","type":"text"},{"name":"delivery_slot","label":"Delivery Slot","type":"text"}]'::jsonb
)
on conflict (code) do update set
  name = excluded.name,
  sector = excluded.sector,
  template_type = excluded.template_type,
  item_label = excluded.item_label,
  customer_label = excluded.customer_label,
  custom_fields = excluded.custom_fields;

-- 14. Force Supabase PostgREST API schema cache reload
notify pgrst, 'reload schema';
